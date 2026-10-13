# Plan: Structured Logging (Pino) + Health Check Endpoint

## Problem
Current logging uses `console.log`/`console.error` - no levels, no structured output, no request correlation. No health check endpoint for monitoring/load balancers.

## Solution
Replace with Pino logger with levels, pretty printing in dev, JSON in prod. Add `/health` endpoint.

## Spec

### Logger (`services/logger.js`)
```javascript
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
  } : undefined,
  base: { service: 'rss-news-hub' },
});

// Child loggers for modules
export function createModuleLogger(module) {
  return logger.child({ module });
}
```

### Usage
```javascript
import { logger, createModuleLogger } from './services/logger.js';
const log = createModuleLogger('ai.service');
log.info({ provider, model }, 'AI request started');
log.error({ err: error.message }, 'AI request failed');
```

### Request ID Middleware
- Generate `x-request-id` header (or use incoming)
- Add to logger context for request correlation
- Include in all log lines during request

### Health Check Endpoint
`GET /health` → 200 OK with:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "checks": {
    "database": "ok",      // data/news.json readable
    "telegram": "ok",      // bot token configured
    "ai": "ok",            // at least one provider configured
    "scheduler": "running" // or "stopped"
  }
}
```
- Returns 503 if critical checks fail (news.json unreadable)
- Lightweight - no external calls

### Tests
- Logger outputs correct levels
- Child logger includes module name
- Request ID propagates through logs
- `/health` returns 200 with all checks "ok" when healthy
- `/health` returns 503 when news.json unreadable
- `/health` includes all check fields