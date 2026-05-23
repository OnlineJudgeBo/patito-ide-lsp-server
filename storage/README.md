# LSP Runtime Storage

This directory is an optional Docker build cache for large runtime archives. Put pre-downloaded archives here when you want `docker compose build` or `docker compose up --build` to be faster and less dependent on network downloads.

If an archive is missing, the Dockerfile downloads it during the build.

## Expected Filenames

Default build args for `linux/amd64`:

- `go1.24.10.linux-amd64.tar.gz`
- `temurin-21-linux-x64.tar.gz`
- `jdt-language-server.tar.gz`

Default build args for `linux/arm64`:

- `go1.24.10.linux-arm64.tar.gz`
- `temurin-21-linux-aarch64.tar.gz`
- `jdt-language-server.tar.gz`

## Populate the Cache

From the repository root:

```bash
node scripts/cache-runtime.mjs
```

If this repository is nested as `lsp/` inside the main IDE repository, the parent project may expose the shortcut:

```bash
npm run lsp:cache
```

You can override versions/architecture while generating the cache:

```bash
GO_VERSION=1.24.10 JAVA_VERSION=21 TARGETARCH=arm64 node scripts/cache-runtime.mjs
```

## Why This Directory Exists

Docker named volumes are available only when a container is running. They are not available during `docker build`, so build-time archives need to live inside the Docker build context. This `storage/` directory is copied into the image build context and mounted read-only at runtime by `docker-compose.yml`.

Large archives should usually stay out of git unless the project explicitly decides to version them.
