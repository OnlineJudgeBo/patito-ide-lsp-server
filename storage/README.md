# LSP runtime storage

Put pre-downloaded runtime archives here to make `docker compose build` from `vibe-lsp-server/` or the top-level `vibe-lsp-server` service build much faster and less dependent on network downloads.

Expected filenames for the default build args on linux/amd64:

- `go1.25.10.linux-amd64.tar.gz`
- `temurin-21-linux-x64.tar.gz`
- `jdt-language-server.tar.gz`

For linux/arm64 use:

- `go1.25.10.linux-arm64.tar.gz`
- `temurin-21-linux-aarch64.tar.gz`
- `jdt-language-server.tar.gz`

Generate these files with the cache script when available in the checkout, or place archives manually using the filenames below.

Docker named volumes are available only when a container is running; they are not available during `docker build`. That is why this folder lives inside the Docker build context. If an archive is missing, the Dockerfile falls back to downloading it.
