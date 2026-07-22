# Servidor LSP de Patito IDE

[English](README.md) · Español

Puente entre Monaco y los servidores de lenguaje. Recibe mensajes por WebSocket y los pasa al proceso LSP por entrada y salida estándar.

Incluye soporte para Java, C++, Python, JavaScript, Rust y Go.

## Levantarlo

Se usa Docker porque la imagen ya trae los runtimes y servidores necesarios.

Crea la configuración local:

```bash
cp .env.example .env
```

Como mínimo cambia el token:

```env
LSP_AUTH_TOKEN=una-clave-local
LSP_PORT=3001
```

Luego:

```bash
docker compose up --build
curl http://localhost:3001/healthz
```

`/healthz` devuelve la lista de lenguajes disponibles.

## Dependencias

Este servicio puede arrancar solo. No necesita la base de datos ni la API.

Quien lo consume es `patito-ide`: ambos deben compartir `LSP_AUTH_TOKEN`. Sin este contenedor el IDE sigue abriendo, pero no muestra autocompletado ni diagnósticos del lenguaje.

Para levantarlo junto al IDE y al resto de Patito, ejecuta desde la raíz:

```bash
docker compose up -d --build
```

Compose revisa `/healthz` antes de iniciar el IDE.

## Variables de entorno

| Variable | Uso | Valor habitual |
| --- | --- | --- |
| `PORT` | puerto dentro del contenedor | `3001` |
| `HOST` | interfaz donde escucha Node | `0.0.0.0` |
| `LSP_PORT` | puerto publicado en el host | `3001` |
| `LSP_AUTH_TOKEN` | token compartido con Patito IDE | sin valor por defecto seguro |
| `LSP_WORKSPACE` | carpeta de los archivos abiertos | `/workspace` |
| `JDTLS_WORKSPACE` | workspace interno de Java | `/tmp/jdtls-workspace` |
| `LSP_<LANG>_COMMAND` | reemplaza el ejecutable de un lenguaje | depende de la imagen |
| `LSP_<LANG>_ARGS` | reemplaza sus argumentos | depende del lenguaje |
| `LSP_PROCESS_EXIT_GRACE_MS` | espera antes de forzar el cierre del proceso | opcional |
| `LSP_IMAGE_NAME` | nombre de la imagen construida | opcional |
| `LSP_IMAGE_BRANCH` | etiqueta usada por el compose | `local` |

`<LANG>` puede ser `JAVA`, `CPP`, `PYTHON`, `JAVASCRIPT`, `RUST` o `GO`.

## Cómo se conecta

El navegador abre `/api/lsp/<lenguaje>` en Patito IDE. El servidor de Next.js agrega el token y recién ahí se conecta a este servicio.

```text
Monaco -> /api/lsp/:lenguaje -> puente LSP -> servidor del lenguaje
```

El IDE y este contenedor deben usar el mismo `LSP_AUTH_TOKEN`. No lo publiques como `NEXT_PUBLIC_LSP_AUTH_TOKEN`.

| Ruta | Servidor |
| --- | --- |
| `/lsp/java` | Eclipse JDTLS |
| `/lsp/cpp` | clangd |
| `/lsp/python` | Pyright |
| `/lsp/js` | TypeScript Language Server |
| `/lsp/rust` | rust-analyzer |
| `/lsp/go` | gopls |

## Estructura del proyecto

```text
.
├── integrations/          configuración por lenguaje
├── server/
│   ├── scripts/           instalación de JDTLS
│   ├── workspace/         archivos que ve el LSP
│   ├── package.json
│   └── server.mjs         puente WebSocket/stdio
├── storage/              caché opcional del build
├── browser-client.ts     cliente WebSocket
├── monaco-adapter.ts     conexión con Monaco
├── protocol.ts           mensajes LSP
├── .env.example         variables para Docker
├── Dockerfile            runtimes y servidores
└── docker-compose.yml    servicio local
```

JDTLS usa `/tmp/jdtls-workspace`. No lo cambies a `/workspace`: Java deja de completar correctamente cuando ambos espacios se mezclan.

## Cambiar comandos

Cada servidor se puede reemplazar con variables de entorno. Por ejemplo:

```env
LSP_CPP_COMMAND=clangd
LSP_CPP_ARGS=--background-index --clang-tidy
LSP_JAVA_ARGS=-data /tmp/jdtls-workspace
```

El mismo formato se usa con `JAVA`, `CPP`, `PYTHON`, `JAVASCRIPT`, `RUST` y `GO`.

## Revisar el servidor Node

```bash
cd server
npm ci
npm run check
```

Los archivos opcionales para acelerar la construcción están explicados en [`storage/README.md`](storage/README.md).
