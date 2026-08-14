# Contexto para IA — patito-lsp-server

## Qué es

Puente WebSocket ↔ stdio entre Monaco (editor del IDE) y servidores de
lenguaje (LSP) reales. Es un servicio Node.js independiente, sin base de
datos ni dependencia de la API. Su único consumidor conocido en el workspace
es `patito-ide`.

Soporta seis lenguajes, cada uno con su propio servidor LSP instalado en la
imagen Docker: Java (Eclipse JDTLS), C++ (clangd), Python (Pyright),
JavaScript/TypeScript (typescript-language-server), Rust (rust-analyzer) y Go
(gopls).

## Arquitectura

```
Monaco (browser) --WS--> patito-ide/server.mjs (agrega token) --WS--> patito-lsp-server --stdio--> proceso LSP real
```

Por cada conexión WebSocket entrante se crea un **proceso hijo nuevo** del
servidor de lenguaje correspondiente (`child_process.spawn`). Los mensajes
JSON-RPC que llegan por WebSocket se codifican como frames LSP
(`Content-Length: N\r\n\r\n<json>`) y se escriben al stdin del proceso; lo que
el proceso escribe en stdout se parsea (`parseLspFrames`) y se reenvía tal
cual por el WebSocket. Al cerrarse el socket, el proceso recibe `SIGTERM` y,
si no muere en `LSP_PROCESS_EXIT_GRACE_MS` (default 1500 ms), `SIGKILL`.

Java usa un workspace separado (`JDTLS_WORKSPACE`, default
`/tmp/jdtls-workspace`) distinto del resto (`LSP_WORKSPACE`, default
`/workspace`) — mezclarlos rompe el autocompletado de Java.

Archivo principal: `server/server.mjs` (~220 líneas, todo el bridge vive ahí).

## Endpoints que expone

| Ruta | Protocolo | Auth | Descripción |
| --- | --- | --- | --- |
| `GET /healthz` | HTTP | No | Devuelve `{ ok: true, languages: [...] }` con los 6 lenguajes soportados. Usado por `docker compose` como healthcheck antes de levantar el IDE. |
| `WS /lsp/java` | WebSocket | Sí | Bridge a Eclipse JDTLS |
| `WS /lsp/cpp` | WebSocket | Sí | Bridge a clangd |
| `WS /lsp/python` | WebSocket | Sí | Bridge a Pyright |
| `WS /lsp/js` | WebSocket | Sí | Bridge a typescript-language-server |
| `WS /lsp/rust` | WebSocket | Sí | Bridge a rust-analyzer |
| `WS /lsp/go` | WebSocket | Sí | Bridge a gopls |

Cualquier otra ruta HTTP devuelve `404 { "error": "not_found" }`. Cualquier
ruta WS que no matchee `/lsp/(java|cpp|python|js|rust|go)` cierra el socket
con código `1008`.

## Autenticación

Cada conexión WebSocket se autentica con `LSP_AUTH_TOKEN`, enviado como
query param `?token=` **o** como header `Authorization: Bearer <token>`. La
comparación es realmente constant-time (`crypto.timingSafeEqual`, con chequeo
previo de longitud igual). Si `LSP_AUTH_TOKEN` no está configurado, el
proceso se niega a arrancar (`process.exit(1)`) — no hay modo "sin auth".

`patito-ide` es quien agrega el token en su proxy (`server.mjs` de ese repo);
el navegador nunca debería recibir `LSP_AUTH_TOKEN` directamente (por eso el
README advierte explícitamente: no publicarlo como `NEXT_PUBLIC_LSP_AUTH_TOKEN`).

## Variables de entorno

| Variable | Uso | Default |
| --- | --- | --- |
| `PORT` | puerto interno | `3001` |
| `HOST` | interfaz de escucha | `0.0.0.0` |
| `LSP_AUTH_TOKEN` | token compartido con patito-ide | **requerido, sin default** |
| `LSP_WORKSPACE` | carpeta de archivos abiertos (todos los lenguajes salvo Java) | `/workspace` |
| `JDTLS_WORKSPACE` | workspace interno de Java | `/tmp/jdtls-workspace` |
| `LSP_<LANG>_COMMAND` / `LSP_<LANG>_ARGS` | override de ejecutable/args por lenguaje (`JAVA`, `CPP`, `PYTHON`, `JAVASCRIPT`, `RUST`, `GO`) | según Dockerfile |
| `LSP_PROCESS_EXIT_GRACE_MS` | espera antes de `SIGKILL` tras `SIGTERM` | `1500` |

## Riesgos/brechas observadas

- **`LSP_WORKSPACE` es un único directorio global, no por sesión/usuario.**
  `ensureWorkspace()` siempre apunta al mismo `/workspace` (o
  `/tmp/jdtls-workspace` para Java) para *cualquier* conexión que llegue.
  Si dos usuarios abren el IDE al mismo tiempo, sus procesos LSP comparten
  `cwd` y los mismos archivos en disco — no hay aislamiento por conexión
  visible en este repo. Si el aislamiento por usuario se resuelve en otra
  capa (por ejemplo, un volumen distinto por contenedor en producción), no
  quedó evidencia de eso en este código; si no, es una condición de carrera /
  fuga de archivos entre sesiones concurrentes.
- El token de auth puede viajar en la query string (`?token=`), lo que puede
  quedar registrado en logs de acceso o proxies intermedios — riesgo menor,
  común en bridges WS, pero vale la pena tenerlo presente si se agrega
  logging de requests en el futuro.
- No hay límite de procesos concurrentes ni de CPU/memoria por proceso LSP
  hijo — un pico de conexiones simultáneas podría agotar recursos del
  contenedor (no se ve un semáforo ni rate limit en `server.mjs`).
