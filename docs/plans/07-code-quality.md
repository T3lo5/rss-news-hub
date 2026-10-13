# Plan 07 — Code Quality (typecheck, missing tests, README)

**Status:** ✅ COMPLETE (recorded 2026-10-12)

## Objective

Make the repository self-explanatory for a new contributor:

- a root **tsconfig** + `npm run typecheck` that passes cleanly;
- tests for the template/API and core server endpoints that had none;
- a real **README.md** (the repo had none).

## Implementation (SDD → verified)

### 1. Root `tsconfig.json` + `typecheck`

- New `tsconfig.json`: `target ES2022`, `module/moduleResolution NodeNext`
  (matches how `server.js` imports `src/*.ts` via `.js` specifiers under tsx),
  `strict`, `noEmit`, `skipLibCheck`.
- Added `@types/node` dev dependency (the TS layer uses `node:fs`, `process`).
- `npm run typecheck` = `tsc --noEmit`.

**Scope decision:** the project compiles `src/**/*.ts` cleanly under `strict`.
`test/**/*.ts` is intentionally excluded: those files are transpiled by tsx
and include 86 pre-existing errors (mostly implicit `any` from JS-service
imports and legacy mock typing). They are validated by execution (396 tests),
not by tsc. Fixing them is churn with no behavioral value.

### 27 → 0 type errors in `src/`

| Cause | Fix |
| --- | --- |
| plugin manifests declared `PluginManifest` but interfaces require `PluginManifest & { type: ... }` | narrow the declarations in the 6 builtin plugins |
| `FetcherPlugin.parse` signature didn't match the implementation | aligned interface to `parse(xml, sourceName): RawFeedItem[]` (only called internally) |
| `OutputOptions.embed` missing (used by webhook outputs) | added to `types.ts` |
| `sql`raw with array arg → "Too many parameter values" (bookmarks) | `inArray(newsId, ids)` |
| `Date` vs `number` (feed-stats `timestamp_ms` columns) | `.getTime()` conversions |
| drizzle `.limit()/.offset()` reassignment variance | `as typeof query` casts |
| `for (const type of [...] as PluginType[])` (singular type for plural section keys) | `ConfigSection` type derived from the YAML shape |
| `loadPluginFromConfig` inferred `Promise<null>` → `never` narrowing in config-watcher | `Promise<Plugin \| null>` |
| duplicate `enabled` key / duplicate `const plugin` | cleanup |

### 2. New test files (+24 tests, 372 → 396; +6 more with plan 04's watcher E2E → 402)

- `test/templates.test.ts` — service + repository CRUD, duplicate ids,
  builtin protection, `{{variable}}` interpolation, default-template fallback.
- `test/templates-api.test.ts` — `GET/POST/PUT/DELETE /api/templates`,
  `POST /api/templates/:id/test`, 404/400 paths.
- `test/server.test.ts` — `GET /health`, `GET /` (frontend), `/api/news`
  auth + validation + manual add.

The new tests immediately found **four real bugs**, all fixed (TDD paying for
itself):

1. **Template endpoints missing `await`** (`server.js`): `loadTemplates()`,
   `createTemplate()`, `updateTemplate()`, `deleteTemplate()`,
   `getTemplateSystemPrompt()` are async; the handlers serialized promises
   (`{"ok":true,"data":{}}`) and deleted before responding.
2. **`POST /api/news` crashed** with `NOT NULL constraint failed:
   news_items.feed_id` — manual items have no feed. Fixed with migration
   `src/db/migrations/0005_feed_id_nullable.sql` (table rebuild, indexes
   recreated) + `schema.ts` (`feedId` no longer `notNull`).
3. **`services/templates.js`** passed the `variables` **array** into a `text`
   column → better-sqlite3 "Too many parameter values were provided".
   Now `JSON.stringify`.
4. **`TemplateRepository.ensureInitialized`** set a one-shot `initialized`
   flag that survived `resetTestDb()`, so builtin templates never came back
   after a test reset. Added a public `reset()` test helper.

### 3. `README.md`

Written from scratch: features, quick start (local + Docker), scripts table,
architecture map, auth model + rate limits, plugin system, API reference,
configuration, testing, project status.

## Verification (recorded 2026-10-12)

```bash
npm run typecheck     # 0 errors
npm test              # 402/402 green
# local DB: 6 migrations applied, news_items.feed_id nullable
# docker: healthy, e2e auth 8/8, POST /api/news (migration 0005) OK in container
# plugins: hot reload verified live (sed -i atomic saves, local + container)
```

## Follow-ups (optional)

- Add `test/**/*.ts` to a **second** tsconfig (`tsconfig.test.json`) and fix
  the 86 test-level errors incrementally.
- Cover `bookmarks`, `relevance`, `newsletter` endpoints with tests.
