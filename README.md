# Patito IDE LSP Server

English · [Español](README.es.md)

This service is the bridge between Monaco and the language servers. It receives LSP messages over WebSocket and forwards them to each language process through standard input and output.

Java, C++, Python, JavaScript, Rust, and Go are supported.

## Running the server

Docker is the recommended option because the image already includes the required runtimes and language servers.

Create the local configuration:

```bash
cp .env.example .env
```

At minimum, replace the token:

```env
LSP_AUTH_TOKEN=replace-with-a-local-secret
LSP_PORT=3001
```

Then run:

```bash
docker compose up --build
curl http://localhost:3001/healthz
```

`/healthz` returns the list of available languages.

## Dependencies

The LSP server can run by itself. It does not need the database or the Patito API.

`patito-ide` is its client, and both services must use the same `LSP_AUTH_TOKEN`. The IDE still opens without this container, but completion and language diagnostics will not work.

To start it with the rest of Patito, run this command from the workspace root:

```bash
docker compose up -d --build
```

Compose checks `/healthz` before starting the IDE.

## Environment variables

| Variable | Purpose | Usual value |
| --- | --- | --- |
| `PORT` | port used inside the container | `3001` |
| `HOST` | interface where Node listens | `0.0.0.0` |
| `LSP_PORT` | port published on the host | `3001` |
| `LSP_AUTH_TOKEN` | token shared with Patito IDE | no safe default |
| `LSP_WORKSPACE` | directory containing opened files | `/workspace` |
| `JDTLS_WORKSPACE` | internal Java workspace | `/tmp/jdtls-workspace` |
| `LSP_<LANG>_COMMAND` | replaces a language server executable | image dependent |
| `LSP_<LANG>_ARGS` | replaces its arguments | language dependent |
| `LSP_PROCESS_EXIT_GRACE_MS` | wait before forcing a process to stop | optional |
| `LSP_IMAGE_NAME` | name assigned to the built image | optional |
| `LSP_IMAGE_BRANCH` | tag used by Compose | `local` |

`<LANG>` can be `JAVA`, `CPP`, `PYTHON`, `JAVASCRIPT`, `RUST`, or `GO`.

## Connection flow

The browser opens `/api/lsp/<language>` on Patito IDE. The Next.js server adds the private token before connecting to this service.

```text
Monaco -> /api/lsp/:language -> LSP bridge -> language server
```

The IDE and this container must share `LSP_AUTH_TOKEN`. Do not expose it as `NEXT_PUBLIC_LSP_AUTH_TOKEN`.

| Route | Language server |
| --- | --- |
| `/lsp/java` | Eclipse JDTLS |
| `/lsp/cpp` | clangd |
| `/lsp/python` | Pyright |
| `/lsp/js` | TypeScript Language Server |
| `/lsp/rust` | rust-analyzer |
| `/lsp/go` | gopls |

## Project structure

```text
.
├── integrations/          per-language configuration
├── server/
│   ├── scripts/           JDTLS installation
│   ├── workspace/         files visible to the LSP server
│   ├── package.json
│   └── server.mjs         WebSocket/stdio bridge
├── storage/              optional build cache
├── browser-client.ts     WebSocket client
├── monaco-adapter.ts     Monaco integration
├── protocol.ts           LSP message types
├── .env.example         Docker variables
├── Dockerfile            runtimes and language servers
└── docker-compose.yml    local service
```

JDTLS uses `/tmp/jdtls-workspace`. Do not move it to `/workspace`: Java completion stops working correctly when both workspaces are mixed.

## Overriding language commands

Each language server command can be replaced through environment variables. For example:

```env
LSP_CPP_COMMAND=clangd
LSP_CPP_ARGS=--background-index --clang-tidy
LSP_JAVA_ARGS=-data /tmp/jdtls-workspace
```

The same pattern works with `JAVA`, `CPP`, `PYTHON`, `JAVASCRIPT`, `RUST`, and `GO`.

## Checking the Node server

```bash
cd server
npm ci
npm run check
```

Optional archives used to speed up image builds are documented in [`storage/README.md`](storage/README.md).
