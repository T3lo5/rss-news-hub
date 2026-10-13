# Plan: Auto-Fetch Scheduler with ETag Caching

## Objective
Implement automatic periodic RSS fetching with HTTP conditional requests (ETag/If-None-Match, Last-Modified/If-Modified-Since) to:
- Keep news fresh without manual intervention
- Minimize bandwidth and server load
- Provide observable metrics

## Value
**High impact, low effort** - Eliminates manual fetch, reduces 90%+ of redundant downloads, runs autonomously.

---

## Phase 1: ETag/Last-Modified Support in Fetch Service ✅ DONE

### 1.1 Extend feed config with cache fields ✅
- Add `etag` and `lastModified` to feed objects in memory
- Persist cache to `data/rss-cache.json`

### 1.2 Modify `fetchFeed` to send conditional headers ✅
- Send `If-None-Match: <etag>` when available
- Send `If-Modified-Since: <lastModified>` when available
- Handle `304 Not Modified` - skip parsing, return empty items

### 1.3 Update cache on successful fetch ✅
- Store `etag` from response headers
- Store `last-modified` from response headers
- Write cache after each feed (not just at end)

### 1.4 Tests (TDD) ✅
```
test/fetch-cache.test.js
- fetchFeed sends If-None-Match when etag cached
- fetchFeed sends If-Modified-Since when lastModified cached
- fetchFeed returns empty items on 304
- fetchFeed updates cache on 200
- cache persists across restarts
```

---

## Phase 2: Background Scheduler ✅ DONE

### 2.1 Create `services/scheduler.service.js` ✅
- `start(intervalMs, fetchFn)` - starts periodic fetch
- `stop()` - stops scheduler
- `getStatus()` - returns { running, nextRun, lastRun, lastResult }
- Handle overlapping runs (skip if previous still running)
- Graceful shutdown on SIGTERM/SIGINT

### 2.2 Integrate in `server.js` ✅
- Start scheduler on server startup (default 30 min interval)
- Expose `GET /api/scheduler/status`
- Expose `POST /api/scheduler/trigger` - manual trigger
- Expose `POST /api/scheduler/config` - update interval

### 2.3 Tests (TDD) ✅
```
test/scheduler.test.js
- start calls fetchFn at interval
- stop prevents further calls
- getStatus returns correct state
- overlapping runs are skipped
- manual trigger works independently
- config update changes interval
```

---

## Phase 3: Metrics/Stats Endpoint ✅ DONE

### 3.1 Extend fetch service to track metrics ✅
- Per-feed: lastFetch, lastStatus, lastError, itemsFetched, etagHits
- Global: totalFetches, totalItems, totalErrors, lastFullFetch

### 3.2 `GET /api/stats` endpoint ✅
```json
{
  "scheduler": { "running": true, "intervalMs": 1800000, "nextRun": "..." },
  "feeds": [
    { "name": "OpenAI Blog", "lastFetch": "...", "status": "ok", "items": 5, "etagHits": 12 },
    { "name": "Hacker News", "lastFetch": "...", "status": "error", "error": "timeout" }
  ],
  "totals": { "fetches": 48, "items": 105, "errors": 2 }
}
```

### 3.3 Tests (TDD) ✅
```
test/stats.test.js
- stats returns scheduler state
- stats includes per-feed metrics
- stats aggregates totals correctly
```

---

## Phase 4: Frontend Integration

### 4.1 Add scheduler status to Header
- Show "Auto: ON/OFF" badge
- Show next fetch countdown
- Button to trigger manual fetch

### 4.2 Add Stats page/modal
- Table with feed health
- Last fetch times
- Error visibility

---

## File Structure
```
services/
  fetch.service.js      # extended with cache
  scheduler.service.js  # new
  stats.service.js      # new
server.js               # updated with endpoints
test/
  fetch-cache.test.js
  scheduler.test.js
  stats.test.js
data/
  rss-cache.json        # persisted cache
docs/
  plan.md               # this file
```

---

## Acceptance Criteria
- [x] Server starts scheduler automatically
- [x] Feeds return 304 when unchanged (verify in logs)
- [x] Cache persists across restarts
- [x] `GET /api/stats` shows meaningful metrics
- [x] Manual trigger works via API and UI
- [x] All tests pass (TDD)
- [x] No breaking changes to existing endpoints
- [ ] Frontend shows scheduler status badge
- [ ] Frontend shows next fetch countdown
- [ ] Frontend has Stats page/modal