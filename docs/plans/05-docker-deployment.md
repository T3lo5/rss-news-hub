# Plan 05: Docker Deployment (app + database)

**Status:** ✅ COMPLETE
**Date:** 2026-10-12
**Goal:** `docker compose up --build` brings up the entire system — HTTP
server, feed scheduler, Telegram queue worker, React frontend and the
SQLite database — with data that survives restarts and rebuilds.

## Requirements

- Single command to run the full system including the database
- Database persists across `docker compose down` / image rebuilds
- Container works from a **completely empty database** (fresh volume)
- Unprivileged runtime user, healthcheck, production-only dependencies

## Design decisions

| Decision | Rationale |
|---|---|
| SQLite file on a named volume (`/app/data`) instead of a separate DB container | The app is hard-wired to `better-sqlite3` + drizzle; a second DB engine would mean rewriting every repository. The named volume gives real persistence, which is what "including the database" requires here. |
| Multi-stage build (builder → runtime) | Frontend (`vite build` → `public/`) is only needed as build output; runtime image stays lean. |
| Run with `node --import tsx server.js` | `server.js` (JS) imports the TypeScript layer (`src/db`, `src/plugins`). `tsx` is therefore a **production** dependency — previously it only arrived transitively via `drizzle-kit` (a devDependency), which would break `npm ci --omit=dev`. |
| `npm ci --omit=dev --ignore-scripts` | `better-sqlite3` ships prebuilt binaries (incl. `linuxmusl-x64`) loaded from `prebuilds/` at require time. Without `--ignore-scripts`, npm's default `node-gyp rebuild` (triggered by `binding.gyp`) fails on Alpine, which has no native toolchain. |
| Auto-migrate on boot in `src/db/index.ts` | There was no migration runner outside the test harness: a fresh DB file got an empty schema and every query failed. `migrate()` is idempotent (drizzle records applied migrations), so running it on every boot is safe. |
| Complete `_journal.json` + `recordOutOfBandMigrations()` | SQL files `0003` (api_keys, users rebuild) and `0004` (sessions) existed but were missing from the migration journal, so drizzle never applied them. The local dev database already had those tables (created out of band, e.g. via `drizzle-kit push`) — re-running them would hit "table already exists" and roll the whole batch back. The repair helper records such migrations as applied when every table they create already exists, while fresh databases run them normally. |
| Named volumes for `/app/data` and `/app/config` | Image dirs are chown'd to the `node` user before the volume is first mounted, so ownership carries over and the container can write. |

## Implementation checklist

- [x] `Dockerfile` — multi-stage: frontend build → slim runtime (node:24-alpine)
- [x] `docker-compose.yml` — app service, named volumes for DB + plugin config, optional `.env`, restart policy
- [x] `.dockerignore` — excludes `node_modules`, `data/`, `config/`, `dist/`, tests, env files
- [x] `tsx` promoted to production dependency; `npm start` uses `node --import tsx server.js`
- [x] Auto-migration + data-dir creation on boot (`src/db/index.ts`)
- [x] Migration journal completed (0003, 0004) + out-of-band repair helper
- [x] Pre-existing blockers fixed so the server boots at all:
  - missing `})` in `/api/telegram/send` (server.js syntax error)
  - wrong import paths (`routes/auth.routes.js` → `../middleware/auth.js`, `middleware/auth.js` → `../services/*.js`, `src/plugins/*` → `./types.js`)
  - `/api/auth/*` dispatched **before** the JSON body parser → every payload failed validation with `expected object, received undefined`
  - `authenticateRequest` never ran for `/api/auth/*` → `req.user` was always unset (`GET /api/auth/me` permanently 401)
  - 401 guards for handlers reading `req.user.id` (`PUT /me`, `change-password`, api-key routes)

## Tests

- `test/auth-api.test.ts` — 8 HTTP-level tests driving the real request
  pipeline (body parsing → auth middleware → route dispatch) with mock
  req/res: register, login, me, refresh (sessions table), API keys
  (api_keys table), anonymous 401s. Written first (6 red), then fixed.

## Acceptance criteria

- [x] `docker compose up --build` starts the full stack (`healthy` status)
- [x] `GET /` serves the built React frontend; static assets return 200
- [x] Fresh volume → all 15 tables created automatically on first boot
- [x] Auth flow works inside the container (register → login → me → api-key → refresh)
- [x] Data survives `docker compose down` + `up` (SQLite volume)
- [x] CLI usable in the container (`docker compose exec app npm run cli -- plugin:list`)
- [x] Full test suite green: **363 tests / 112 suites**

## Verification

```bash
docker compose up --build          # stack + database
docker compose ps                  # STATUS should become "(healthy)"
node /tmp/e2e-auth.mjs             # auth smoke flow (or curl)
docker compose exec app npm run cli -- plugin:list
docker compose down                # volumes are kept
docker compose up -d               # data still there
npm test                           # 363 tests
```

## Follow-ups (optional)

- ~~Set `JWT_SECRET` in production `.env`~~ ✅ done (plan 06): mandatory in
  production, fail-fast at boot; `.env.example` documents it
- Bind-mount a custom `config/plugins.yaml` for plugin config instead of
  the named volume if config should be editable from the host
- Add a CI job that builds the image and runs the suite inside it
