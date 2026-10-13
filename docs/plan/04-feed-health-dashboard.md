# Plan: Feed Health Dashboard

## Problem
No visibility into feed reliability. Users don't know which feeds fail silently, have high latency, or return duplicates.

## Solution
Per-feed metrics displayed in Feed Manager modal + new `/api/feeds/health` endpoint.

## Spec

### Metrics Tracked (per feed)
| Metric | Description |
|--------|-------------|
| `totalFetches` | Lifetime fetch attempts |
| `successfulFetches` | HTTP 200 + valid XML |
| `failedFetches` | Network error, HTTP error, parse error |
| `lastFetch` | Timestamp of last attempt |
| `lastSuccess` | Timestamp of last successful fetch |
| `lastError` | Error message from last failure |
| `avgLatencyMs` | Rolling average (last 10) |
| `itemsFetched` | Total items extracted lifetime |
| `itemsNew` | Items not already in news.json |
| `itemsDuplicate` | Items skipped (already exist) |
| `etagHits` | 304 Not Modified responses |
| `successRate` | `successfulFetches / totalFetches` |

### Storage
- Extend `services/stats.service.js` - add `feedStats` map persisted to `data/feed-stats.json`
- Update on every `fetchFeedByUrl` call in `fetch.service.js`

### API
`GET /api/feeds/health` → `{ ok: true, data: FeedHealth[] }`

```typescript
interface FeedHealth {
  feedId: string;
  name: string;
  url: string;
  enabled: boolean;
  totalFetches: number;
  successfulFetches: number;
  failedFetches: number;
  lastFetch: number | null;
  lastSuccess: number | null;
  lastError: string | null;
  avgLatencyMs: number;
  itemsFetched: number;
  itemsNew: number;
  itemsDuplicate: number;
  etagHits: number;
  successRate: number; // 0-1
  status: 'healthy' | 'degraded' | 'failing' | 'unknown';
}
```

Status thresholds:
- `healthy`: successRate >= 0.9 && lastSuccess < 2h ago
- `degraded`: successRate >= 0.5 || lastSuccess < 24h ago
- `failing`: successRate < 0.5 || lastFetch failed 3+ times in row
- `unknown`: no fetches yet

### Frontend
- Feed Manager modal: add "Health" tab with table
- Color-coded status badges
- Sort by success rate, latency, last error
- "Test feed" button triggers fetch + shows result
- Expand row → show last 5 fetch logs (timestamp, status, latency, items, error)

### Tests
- Stats persist across restarts
- Success rate calculates correctly
- Status transitions work
- Latency rolling average works
- Duplicate detection works
- ETag hits tracked