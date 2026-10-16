# AGENTS.md - RSS News Hub

## Project
RSS scraper + AI content generator + Telegram distributor with an auth system
and a plugin system. Node.js ESM. Plain-JS HTTP server (`server.js`, no
framework) plus a TypeScript layer (`src/`: SQLite/drizzle DB, plugins, CLI).
React/Vite frontend in `frontend/`, built to `public/`.

## Commands
```bash
npm install                # install deps (tsx, drizzle-orm, better-sqlite3, ...)
npm start                  # server on PORT (default 3000) -> node --import tsx server.js
npm test                   # full suite: node --import tsx --test (402 tests / 118 suites)
npm run typecheck          # tsc --noEmit over src/**/*.ts (strict, 0 errors)
npm run fetch              # pull all RSS feeds -> data/news.json (legacy JSON export)
npm run cli -- plugin:list # plugin management CLI (list/install/enable/create/remove/status)
npm run build:frontend     # vite build -> public/
docker compose up --build  # full stack incl. SQLite database (named volume)
```

## Architecture
- `server.js` — HTTP server, no framework. Parses JSON bodies, dispatches
  `/api/auth/*` to `routes/auth.routes.js`, serves `public/` and the API.
  Exports `handleRequest`; only listens when run directly (tests import it).
- `routes/auth.routes.js` — register / login / refresh / me / api-key routes.
- `middleware/auth.js` — `authenticateRequest`, `requireUser/Viewer/Admin`
  (Bearer JWT or API key; role hierarchy admin > user > viewer).
- `services/*.js` — business logic in plain ESM JS: `ai` (SenseNova → DeepSeek
  → OpenAI fallback), `fetch` (regex-based RSS), `telegram` (queue + worker),
  `auth`, `jwt`, `templates`, `stats`, `scheduler`, `validation` (zod).
- `src/db/` — drizzle + better-sqlite3. DB file `data/rss-news-hub.db`.
  Migrations in `src/db/migrations/` are **applied automatically at boot**
  (`getDb()`); `test/setup.ts` uses an in-memory DB with the same migrations.
- `src/plugins/` — plugin system: registry, loader, discovery, config-loader,
  config-watcher (watches the config dir; atomic saves/rename safe),
  JSON-Schema config validation, `builtin/` (10 plugins:
  openai/deepseek/sensenova, rss-fetcher, telegram/discord/slack,
  pii-redactor/summarizer/translator).
- `src/cli/index.ts` — `plugin:*` commands; reads/writes `config/plugins.yaml`.
- `config/plugins.yaml` — plugin enable/disable + settings; **hot reloaded** by
  the watcher `server.js` starts at boot (see `docs/plugin-sdk.md`).
- `plugins/` — user plugins directory; `example-wordcount` (transformer) and
  `example-webhook-output` (output) serve as references.
- `frontend/` — React + Vite; `npm run build` outputs to `public/`
  (served by `server.js`).
- `test/*.test.ts` — node:test suites (run all: `npm test`; single file:
  `node --import tsx --test test/<name>.test.ts`).
- `server.config.js` — loads `.env`, exports PORT/telegram/feeds config.

## Config
Copy `.env.example` to `.env` and fill in:
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- At least one AI key: `SENSENOVA_API_KEY`, `DEEPSEEK_API_KEY`, or `OPENAI_API_KEY`
- `PORT` (default 3000)
- `JWT_SECRET` — **mandatory in production**: the app refuses to boot when
  `NODE_ENV=production` and no secret is set (`resolveJwtSecret()` in
  `services/jwt.service.js`). Dev keeps a warned fallback.

## Key conventions
- ESM (`"type": "module"`). Use `import`/`export`, not `require`.
- The runtime needs `tsx` because `server.js` (JS) imports TypeScript modules
  from `src/` via `.js` specifiers. `tsx` is a production dependency — keep it
  in `dependencies`, not `devDependencies`.
- SQLite is the source of truth: `/api/news` reads the DB through
  repositories (`src/db/repositories/`). `npm run fetch` still writes the
  legacy `data/news.json` as an export only.
- Auth: roles `admin`/`user`/`viewer`; protected routes return 401 JSON when
  anonymous. Write new auth-sensitive endpoints with the `requireX()` wrappers.
  The refresh token lives in an HttpOnly cookie (`refresh_token`, path
  `/api/auth`) set by login/register/refresh; `POST /api/auth/logout` clears it.
  Outside production the token is also returned in the JSON body for API/CLI
  clients and tests.
- Plugins: 4 types (`ai-provider`, `fetcher`, `output`, `transformer`);
  enabled/disabled state and settings live in `config/plugins.yaml`.
- Auth endpoints are rate limited per IP (register 5/min, login 10/min,
  refresh 30/min) — limiters run BEFORE body validation, so invalid payloads
  still consume budget.
- `npm run typecheck` covers `src/**/*.ts` only (strict). Test files are
  transpiled by tsx and validated by execution, not tsc.
- AI provider order is hardcoded: SenseNova → DeepSeek → OpenAI; override
  per-request via the `provider` field in `/api/ai/generate`.
- Docker: Alpine runtime, `npm ci --omit=dev --ignore-scripts` (better-sqlite3
  loads prebuilt musl binaries — no native toolchain needed).

## Gotchas
- Adding a SQL migration = create `src/db/migrations/NNNN_name.sql` **and** add
  an entry to `src/db/migrations/meta/_journal.json` (drizzle decides what is
  pending by the journal's `when` timestamps, not by file names).
- Databases created outside the journal (e.g. old `drizzle-kit push`) are
  repaired by `recordOutOfBandMigrations()` in `src/db/index.ts` — don't remove
  it or legacy DBs crash with "table already exists".
- The original n8n workflow JSON (`flux twitter...json`) is legacy — it is not
  used by this project. Ignore it.
- `test.txt` is a leftover probe file, ignore.
- RSS parsing is regex-based (no xml2js dependency). Some feeds (Atom,
  content:encoded) are handled but edge cases may silently drop items.
- Auth routes must be dispatched **after** the JSON body parser and after
  `authenticateRequest` — both live at the top of `handleRequest` in
  `server.js`; keep that order when refactoring.
