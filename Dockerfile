# syntax=docker/dockerfile:1
# Multi-stage build for RSS News Hub: React frontend + Node backend + SQLite.
#
#   docker compose up --build     # full stack (see docker-compose.yml)
#
# Notes:
#   * tsx is a production dependency: server.js imports the TypeScript layer
#     (src/db, src/plugins), so the container runs `node --import tsx`.
#   * better-sqlite3 ships prebuilt binaries (incl. linuxmusl), so no native
#     toolchain is needed on Alpine.

##
## Stage 1 - builder: compile the React frontend to /app/public
##
FROM node:24-alpine AS builder

WORKDIR /app

# Install frontend deps first so this layer stays cached between code changes
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

# Build outputs to ../public (vite --outDir), i.e. /app/public
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

##
## Stage 2 - runtime: app + production dependencies
##
FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Production dependencies only (tsx included - required at runtime).
# --ignore-scripts: better-sqlite3 ships prebuilt binaries (incl. musl) and
# loads them from prebuilds/ at require time; without this flag npm tries a
# default node-gyp rebuild, which Alpine cannot do (no native toolchain).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Application source
COPY server.js server.config.js ./
COPY routes/ ./routes/
COPY middleware/ ./middleware/
COPY services/ ./services/
COPY scripts/ ./scripts/
COPY src/ ./src/

# Plugin defaults: the YAML config (hot-reloaded) and the example plugins.
# The named volume at /app/config seeds from this content on first run.
COPY config/ ./config/
COPY plugins/ ./plugins/

# Static frontend built in stage 1 (served by server.js at /)
COPY --from=builder /app/public ./public/

# SQLite lives in data/ and plugin config in config/. Both are written at
# runtime, so create them ahead of time owned by the unprivileged node user
# (named volumes inherit this ownership on first use).
RUN mkdir -p data config && chown -R node:node /app
USER node

# The database and plugin config are externalized so `docker compose down`
# and image rebuilds never lose them.
VOLUME ["/app/data", "/app/config"]

EXPOSE 3000

# server.js runs the HTTP server, feed scheduler and Telegram queue worker.
# node runs as PID 1 so SIGTERM/SIGINT reach it directly for clean shutdown.
CMD ["node", "--import", "tsx", "server.js"]

# busybox wget ships with Alpine. Shell form so ${PORT} is expanded.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1
