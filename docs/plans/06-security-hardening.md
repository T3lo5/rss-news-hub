# Plan 06: Security Hardening

**Status:** ✅ COMPLETE
**Date:** 2026-10-12
**Goal:** Close the two production risks left open by plan 05: the JWT dev-secret
fallback and the total absence of rate limiting on credential endpoints.

## Requirements

1. **`JWT_SECRET` is mandatory in production.** No silent fallback to the
   hardcoded dev secret when `NODE_ENV=production`. Fail fast at startup with
   an actionable message. Development/test keep a fallback (with a warning)
   so the local workflow is unchanged.
2. **Rate limit `register` / `login` / `refresh`.** Brute-force protection
   keyed by client IP (`x-forwarded-for` honored, same as the existing
   telegram/AI limiters). Credential endpoints must be limited *before*
   validation so rejected payloads still consume budget.

## Design decisions

| Decision | Rationale |
|---|---|
| Throw at module load in `services/jwt.service.js` when secret missing in production | The container dies at boot with a clear error instead of signing tokens with a public fallback. |
| Warn (don't throw) on short secrets / missing dev secret | Keeps `npm start` and the test suite working with zero config. |
| Per-endpoint limiters: register 5/min, login 10/min, refresh 30/min | Register is rare and high-value; login is the brute-force target; refresh is called routinely by clients. |
| Limiters live in `routes/auth.routes.js`, applied before `validateBody` | Route-level concern stays with the route; blocking before validation is cheaper and counts invalid attempts. |
| Tests inject a unique `x-forwarded-for` per request | `getClientIp` honors the header, so suites are isolated from the in-memory stores and no global reset hook is needed. |

## Implementation checklist

- [x] `test/jwt-secret.test.ts` — spawned-process tests: production without
  secret fails with `JWT_SECRET is required`, with secret loads, dev loads
  with warning
- [x] `test/auth-rate-limit.test.ts` — 429 after budget, `Retry-After` and
  `X-RateLimit-*` headers, fresh IP unaffected, limiter runs before validation
- [x] `resolveJwtSecret()` in `services/jwt.service.js`
- [x] `registerLimiter` / `loginLimiter` / `refreshLimiter` in auth routes
- [x] Test harness sends unique `x-forwarded-for` per request (isolation)
- [x] `.env.example` documents `JWT_SECRET`; local `.env` gets a real secret
  (the Docker container runs `NODE_ENV=production` and would otherwise fail)
- [x] Docker image rebuilt and auth smoke flow re-verified

## Acceptance criteria

- [x] `NODE_ENV=production` without `JWT_SECRET` → process exits with a clear error
- [x] Production with `JWT_SECRET` set → boots normally
- [x] 11th login attempt from one IP in a minute → 429 with `Retry-After`
- [x] Different IP unaffected (per-key isolation)
- [x] Full suite green (363 + new tests)
- [x] Container healthy with the secret from `.env`

## Verification (recorded 2026-10-12)

```bash
npm test                              # 402/402 green (typecheck + new suites)
npm run typecheck                     # tsc --noEmit: 0 erros
NODE_ENV=production node --import tsx -e "await import('./services/jwt.service.js')"  # fails fast ✓
docker compose up --build && node /tmp/e2e-auth.mjs   # 8/8 OK, container healthy
```

Extras found by the new tests (fixed, see plan 07):
- template endpoints were missing `await` (serialized promises as `{}`)
- `POST /api/news` crashed: `feed_id NOT NULL` + FK fed into a "manual" item:
  migration `0005_feed_id_nullable.sql` (table rebuild) + schema change
- `services/templates.js` bound an array into a `text` column ("Too many
  parameter values") — `JSON.stringify`
- `TemplateRepository.ensureInitialized` flag survived test resets — added
  `reset()` test helper
