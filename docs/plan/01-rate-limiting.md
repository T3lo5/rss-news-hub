# Plan: Rate Limiting on AI & Telegram Endpoints

## Problem
No protection against abuse on `/api/ai/generate` and `/api/telegram/send`. Users can spam requests, exhausting API quotas and budget.

## Solution
In-memory sliding window rate limiter per IP + optional per-user (if auth added later).

## Spec

### Limits
| Endpoint | Requests | Window |
|----------|----------|--------|
| `/api/ai/generate` | 10 | 1 minute |
| `/api/telegram/send` | 5 | 1 minute |
| `/api/fetch` | 2 | 1 minute |

### Response on limit exceeded
- Status: `429 Too Many Requests`
- Headers: `Retry-After` (seconds), `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Body: `{ ok: false, error: "Rate limit exceeded. Try again in X seconds." }`

### Implementation
- `services/rate-limiter.ts` - generic sliding window implementation
- Applied via middleware in `server.js` before handler
- Key: IP address (from `req.headers['x-forwarded-for']` || `req.socket.remoteAddress`)
- Store: `Map<string, number[]>` (timestamps), cleanup expired entries periodically

### Tests
- Request under limit → 200 OK
- Request at limit → 200 OK
- Request over limit → 429 with correct headers
- After window expires → 200 OK again
- Different IPs have independent limits