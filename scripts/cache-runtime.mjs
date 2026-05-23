import { createWriteStream, mkdirSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { get } from 'node:https';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = new URL('..', import.meta.url).pathname;
const storage = join(root, 'storage');
const goVersion = process.env.GO_VERSION ?? '1.24.10';
const javaVersion = process.env.JAVA_VERSION ?? '21';

const arch = process.env.TARGETARCH ?? (process.arch === 'arm64' ? 'arm64' : 'amd64');
const goArch = arch === 'arm64' ? 'arm64' : 'amd64';
const adoptiumArch = arch === 'arm64' ? 'aarch64' : 'x64';

mkdirSync(storage, { recursive: true });

const jdtlsUrl = process.env.JDTLS_URL ?? await latestJdtlsUrl().catch(() => 'https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz');

const downloads = [
  {
    name: `go${goVersion}.linux-${goArch}.tar.gz`,
    url: `https://go.dev/dl/go${goVersion}.linux-${goArch}.tar.gz`,
  },
  {
    name: `temurin-${javaVersion}-linux-${adoptiumArch}.tar.gz`,
    url: `https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/linux/${adoptiumArch}/jre/hotspot/normal/eclipse?project=jdk`,
  },
  {
    name: 'jdt-language-server.tar.gz',
    url: jdtlsUrl,
  },
];

for (const item of downloads) {
  const target = join(storage, item.name);
  if (await exists(target)) {
    console.log(`Already cached ${item.name}`);
    continue;
  }
  console.log(`Downloading ${item.name}`);
  console.log(`  ${item.url}`);
  await download(item.url, target);
}

console.log(`LSP runtime cache ready in ${storage}`);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function latestJdtlsUrl() {
  const release = await json('https://api.github.com/repos/eclipse-jdtls/eclipse.jdt.ls/releases/latest');
  const asset = release.assets?.find((item) => /jdt-language-server-.*\.tar\.gz$/.test(item.name));
  if (!asset?.browser_download_url) throw new Error('No jdtls tar.gz asset found in latest GitHub release.');
  return asset.browser_download_url;
}

async function json(url) {
  const chunks = [];
  await request(url, (response) => {
    response.on('data', (chunk) => chunks.push(chunk));
  });
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function download(url, target) {
  await request(url, (response) => pipeline(response, createWriteStream(target)));
}

async function request(url, handleResponse, redirects = 0) {
  await new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'user-agent': 'vibe-ide-lsp-cache' } }, async (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        if (redirects > 5) return reject(new Error('Too many redirects.'));
        try {
          await request(new URL(response.headers.location, url).toString(), handleResponse, redirects + 1);
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }

      if ((response.statusCode ?? 500) >= 400) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      try {
        await handleResponse(response);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
