import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const WORKSPACE = process.env.LSP_WORKSPACE ?? '/workspace';
const JDTLS_WORKSPACE = process.env.JDTLS_WORKSPACE ?? '/tmp/jdtls-workspace';
const REQUEST_TIMEOUT_MS = Number(process.env.LSP_PROCESS_EXIT_GRACE_MS ?? 1500);
const LSP_AUTH_TOKEN = process.env.LSP_AUTH_TOKEN?.trim();

if (!LSP_AUTH_TOKEN) {
  console.error('LSP_AUTH_TOKEN is required. Refusing to start an unauthenticated LSP bridge.');
  process.exit(1);
}

const languageServers = {
  java: {
    label: 'Eclipse JDT Language Server',
    command: process.env.LSP_JAVA_COMMAND ?? 'jdtls',
    args: splitArgs(process.env.LSP_JAVA_ARGS) ?? ['-data', JDTLS_WORKSPACE],
  },
  cpp: {
    label: 'clangd',
    command: process.env.LSP_CPP_COMMAND ?? 'clangd',
    args: splitArgs(process.env.LSP_CPP_ARGS) ?? ['--background-index', '--query-driver=/usr/bin/g++'],
  },
  python: {
    label: 'Pyright',
    command: process.env.LSP_PYTHON_COMMAND ?? 'pyright-langserver',
    args: splitArgs(process.env.LSP_PYTHON_ARGS) ?? ['--stdio'],
  },
  js: {
    label: 'typescript-language-server',
    command: process.env.LSP_JAVASCRIPT_COMMAND ?? 'typescript-language-server',
    args: splitArgs(process.env.LSP_JAVASCRIPT_ARGS) ?? ['--stdio'],
  },
  rust: {
    label: 'rust-analyzer',
    command: process.env.LSP_RUST_COMMAND ?? 'rust-analyzer',
    args: splitArgs(process.env.LSP_RUST_ARGS) ?? [],
  },
  go: {
    label: 'gopls',
    command: process.env.LSP_GO_COMMAND ?? 'gopls',
    args: splitArgs(process.env.LSP_GO_ARGS) ?? ['serve'],
  },
};

const server = createServer((request, response) => {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, languages: Object.keys(languageServers) }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
  const language = languageFromPath(request.url ?? '');
  const config = language ? languageServers[language] : undefined;

  if (!isAuthorized(request)) {
    socket.close(1008, 'Unauthorized LSP connection.');
    return;
  }

  if (!config) {
    socket.close(1008, 'Unsupported LSP route. Use /lsp/java, /lsp/cpp, /lsp/python, /lsp/js, /lsp/rust, or /lsp/go.');
    return;
  }

  ensureWorkspace(language);
  const child = spawn(config.command, config.args, {
    cwd: WORKSPACE,
    env: { ...process.env, HOME: process.env.HOME ?? '/tmp' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const prefix = `[${language}:${config.label}]`;
  console.log(`${prefix} started: ${config.command} ${config.args.join(' ')}`);

  let stdoutBuffer = Buffer.alloc(0);

  child.stdout.on('data', (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    const parsed = parseLspFrames(stdoutBuffer);
    stdoutBuffer = parsed.remainder;

    for (const body of parsed.messages) {
      if (socket.readyState === socket.OPEN) socket.send(body);
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.error(`${prefix} ${text}`);
  });

  child.on('error', (error) => {
    console.error(`${prefix} failed to start:`, error);
    if (socket.readyState === socket.OPEN) socket.close(1011, `${config.label} failed to start: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    console.log(`${prefix} exited`, { code, signal });
    if (socket.readyState === socket.OPEN) socket.close(1011, `${config.label} exited.`);
  });

  socket.on('message', (raw) => {
    if (!child.stdin.writable) return;

    const body = Buffer.isBuffer(raw) ? raw.toString() : raw.toString();
    child.stdin.write(encodeLspFrame(body));
  });

  socket.on('close', () => {
    child.stdin.end();
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, REQUEST_TIMEOUT_MS).unref();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`LSP WebSocket bridge listening on ws://${HOST}:${PORT}`);
  console.log('Routes: /lsp/java /lsp/cpp /lsp/python /lsp/js /lsp/rust /lsp/go');
  console.log(`Token auth: ${LSP_AUTH_TOKEN ? 'enabled' : 'disabled'}`);
});

function languageFromPath(url) {
  const path = new URL(url, 'ws://localhost').pathname;
  const match = path.match(/^\/lsp\/(java|cpp|python|js|rust|go)$/);
  return match?.[1];
}

function isAuthorized(request) {
  const url = new URL(request.url ?? '', 'ws://localhost');
  const token = url.searchParams.get('token') ?? bearerToken(request.headers.authorization);
  return tokensMatch(token, LSP_AUTH_TOKEN);
}

function bearerToken(header) {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function tokensMatch(candidate, expected) {
  if (!candidate) return false;

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function splitArgs(value) {
  if (!value?.trim()) return undefined;
  return value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? [];
}

function encodeLspFrame(body) {
  const payload = Buffer.from(body, 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, 'ascii'), payload]);
}

function parseLspFrames(buffer) {
  const messages = [];
  let offset = 0;

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n', offset, 'ascii');
    if (headerEnd === -1) break;

    const header = buffer.subarray(offset, headerEnd).toString('ascii');
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      throw new Error(`Invalid LSP frame header: ${header}`);
    }

    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + contentLength;
    if (buffer.length < bodyEnd) break;

    messages.push(buffer.subarray(bodyStart, bodyEnd).toString('utf8'));
    offset = bodyEnd;
  }

  return { messages, remainder: buffer.subarray(offset) };
}

function ensureWorkspace(language) {
  const paths = [WORKSPACE, `${WORKSPACE}/.cache`, `${WORKSPACE}/.config`, `${WORKSPACE}/.local`];
  if (language === 'java') paths.push(JDTLS_WORKSPACE);
  for (const path of paths) {
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }

  if (language === 'cpp') ensureCppCompileFlags();
}

function ensureCppCompileFlags() {
  const compileFlagsPath = `${WORKSPACE}/compile_flags.txt`;
  if (existsSync(compileFlagsPath)) return;

  writeFileSync(
    compileFlagsPath,
    ['-std=c++17', '-Wall', '-Wextra', '-xc++', ''].join('\n'),
    'utf8',
  );
}
