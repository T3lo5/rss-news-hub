# Plan: Full Feed Deduplication

## Problem
Currently tracks `itemsNew`/`itemsDuplicate` in stats but still stores duplicates in `data/news.json`. Need to skip items already in news.json by link hash during fetch.

## Solution
Enhance `fetchAllFeeds` to check against existing news before adding. Use link hash as deduplication key.

## Spec

### Deduplication Logic
- Key: SHA-256 hash of normalized link (strip tracking params, lowercase)
- Normalize: remove `utm_*`, `fbclid`, `gclid`, `ref`, `source` params
- Check against existing news in memory (fast) + persist hash index

### Implementation
1. **Add hash index** in `data/news-hashes.json`:
   ```json
   { "sha256_hash1": "news_id1", "sha256_hash2": "news_id2" }
   ```

2. **Update `fetch.service.js`**:
   - Load hash index on startup
   - Before adding item, check if hash exists
   - If exists: increment `itemsDuplicate`, skip
   - If new: add to news, add to hash index
   - Save hash index periodically (every N items or on fetch complete)

3. **Update `stats.service.js`**:
   - Track `itemsSkipped` (deduplicated before fetch)
   - Expose in feed health

### Hash Function
```javascript
import { createHash } from 'node:crypto';

function normalizeUrl(url) {
  const u = new URL(url);
  const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid'];
  for (const param of trackingParams) u.searchParams.delete(param);
  return u.toString().toLowerCase();
}

function linkHash(url) {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex').slice(0, 16);
}
```

### Tests
- Normalize strips tracking params
- Same link with different tracking params → same hash
- Duplicate detection works across fetches
- Hash index persists across restarts
- Stats show correct `itemsNew`/`itemsDuplicate`/`itemsSkipped`
- Memory usage bounded (hash index only, not full content)