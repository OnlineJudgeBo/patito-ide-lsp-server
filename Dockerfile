FROM node:22-bookworm-slim

ARG TARGETARCH
ARG GO_VERSION=1.24.10
ARG GOPLS_VERSION=v0.21.1
ARG JAVA_VERSION=21

ENV DEBIAN_FRONTEND=noninteractive \
    PORT=3001 \
    HOST=0.0.0.0 \
    LSP_WORKSPACE=/workspace \
    GOPATH=/opt/go \
    JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:/opt/go/bin:/usr/local/go/bin:/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

COPY storage/ /storage/

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    clangd \
    curl \
    git \
    python3 \
    tar \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
  case "${TARGETARCH:-amd64}" in \
    amd64) GO_ARCH="amd64"; ADOPTIUM_ARCH="x64" ;; \
    arm64) GO_ARCH="arm64"; ADOPTIUM_ARCH="aarch64" ;; \
    *) echo "Unsupported Docker TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  GO_ARCHIVE="/storage/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz"; \
  JAVA_ARCHIVE="/storage/temurin-${JAVA_VERSION}-linux-${ADOPTIUM_ARCH}.tar.gz"; \
  if [ -f "${GO_ARCHIVE}" ]; then \
    echo "Using cached Go archive ${GO_ARCHIVE}"; \
    cp "${GO_ARCHIVE}" /tmp/go.tgz; \
  else \
    curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" -o /tmp/go.tgz; \
  fi; \
  rm -rf /usr/local/go; \
  tar -C /usr/local -xzf /tmp/go.tgz; \
  rm /tmp/go.tgz; \
  go version; \
  mkdir -p /opt/java; \
  if [ -f "${JAVA_ARCHIVE}" ]; then \
    echo "Using cached Java archive ${JAVA_ARCHIVE}"; \
    cp "${JAVA_ARCHIVE}" /tmp/java.tgz; \
  else \
    curl -fsSL "https://api.adoptium.net/v3/binary/latest/${JAVA_VERSION}/ga/linux/${ADOPTIUM_ARCH}/jre/hotspot/normal/eclipse?project=jdk" -o /tmp/java.tgz; \
  fi; \
  rm -rf /opt/java/openjdk; \
  mkdir -p /opt/java/openjdk; \
  tar -xzf /tmp/java.tgz -C /opt/java/openjdk --strip-components=1; \
  rm /tmp/java.tgz; \
  java -version

RUN npm install -g pyright typescript typescript-language-server \
  && go install golang.org/x/tools/gopls@${GOPLS_VERSION} \
  && curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal \
  && rustup component add rust-analyzer

WORKDIR /app/lsp-server
COPY server/package.json ./package.json
RUN npm install --omit=dev
COPY server/ ./
RUN node scripts/install-jdtls.mjs \
  && npm cache clean --force \
  && mkdir -p /workspace

EXPOSE 3001
CMD ["npm", "start"]
