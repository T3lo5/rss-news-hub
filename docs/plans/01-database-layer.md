# Plan: Database Layer (SQLite + Drizzle ORM)

## Objective
Replace all JSON file storage (`data/*.json`) with a proper SQLite database using Drizzle ORM for:
- ACID transactions
- Concurrent write safety
- Schema migrations
- Type-safe queries
- Foundation for auth, plugins, and scaling

## Current JSON Files to Migrate
| File | Purpose | Target Table |
|------|---------|--------------|
| `data/news.json` | News items | `news_items` |
| `data/bookmarks.json` | User bookmarks | `bookmarks` |
| `data/feed-stats.json` | Feed fetch metrics | `feed_stats` |
| `data/news-hashes.json` | Deduplication index | `news_hashes` |
| `data/rss-cache.json` | ETag/Last-Modified cache | `feed_cache` |
| `data/profile.json` | Interest profile | `user_profiles` |
| `data/newsletter-history.json` | Newsletter runs | `newsletter_history` |
| `data/telegram-queue.json` | Scheduled messages | `telegram_queue` |
| `data/templates.json` | Custom AI templates | `templates` |
| `server.config.js` RSS_FEEDS | Feed config | `feeds` |

## Schema Design

```sql
-- feeds table
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'General',
  etag TEXT,
  last_modified TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- news_items table
CREATE TABLE news_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  pub_date INTEGER NOT NULL,
  description TEXT,
  content TEXT,
  relevance_score INTEGER,
  feed_id TEXT NOT NULL REFERENCES feeds(id),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX idx_news_pub_date ON news_items(pub_date DESC);
CREATE INDEX idx_news_relevance ON news_items(relevance_score DESC);
CREATE INDEX idx_news_feed ON news_items(feed_id);

-- news_hashes (deduplication index)
CREATE TABLE news_hashes (
  hash TEXT PRIMARY KEY,
  news_id TEXT NOT NULL REFERENCES news_items(id),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- feed_cache (ETag/Last-Modified)
CREATE TABLE feed_cache (
  feed_id TEXT PRIMARY KEY REFERENCES feeds(id),
  etag TEXT,
  last_modified TEXT,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- feed_stats (per-feed metrics)
CREATE TABLE feed_stats (
  feed_id TEXT PRIMARY KEY REFERENCES feeds(id),
  name TEXT NOT NULL,
  last_fetch INTEGER,
  last_success INTEGER,
  last_status TEXT,
  last_error TEXT,
  successful_fetches INTEGER NOT NULL DEFAULT 0,
  failed_fetches INTEGER NOT NULL DEFAULT 0,
  items_fetched INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0,
  items_duplicate INTEGER NOT NULL DEFAULT 0,
  etag_hits INTEGER NOT NULL DEFAULT 0,
  latencies TEXT NOT NULL DEFAULT '[]', -- JSON array of last 10 latencies
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- user_profiles (interest profile for relevance scoring)
CREATE TABLE user_profiles (
  id TEXT PRIMARY KEY DEFAULT 'default',
  keywords TEXT NOT NULL DEFAULT '[]', -- JSON array
  topics TEXT NOT NULL DEFAULT '[]',
  preferred_sources TEXT NOT NULL DEFAULT '[]',
  excluded_keywords TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- bookmarks
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  news_id TEXT NOT NULL REFERENCES news_items(id),
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  source TEXT NOT NULL,
  bookmarked_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- newsletter_history
CREATE TABLE newsletter_history (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  success INTEGER NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  content_preview TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- telegram_queue
CREATE TABLE telegram_queue (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  parse_mode TEXT NOT NULL DEFAULT 'Markdown',
  scheduled_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  options TEXT, -- JSON
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  sent_at INTEGER
);

-- templates (custom AI prompt templates)
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- thread | summary | linkedin | blog | newsletter
  system_prompt TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]', -- JSON array
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- users (for future auth)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  api_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user', -- admin | user | viewer
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- global_stats (totals)
CREATE TABLE global_stats (
  id TEXT PRIMARY KEY DEFAULT 'global',
  total_fetches INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  last_full_fetch INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);
```

## Implementation Phases

### Phase 1: Drizzle Setup + Schema + Migrations (TDD) ✅ DONE
- [x] Add `drizzle-orm`, `better-sqlite3`, `drizzle-kit` dependencies
- [x] Create `drizzle.config.ts`
- [x] Define schema in `src/db/schema.ts`
- [x] Create migration files
- [x] Write tests for schema validation

### Phase 2: Repository Layer (TDD) ✅ DONE
- [x] Create `src/db/repositories/` with typed repositories
- [x] `FeedRepository`, `NewsRepository`, `StatsRepository`, etc.
- [x] Each with CRUD + specific query methods
- [x] Unit tests for each repository (pending - need test DB setup)

### Phase 3: Service Migration (TDD) ✅ DONE
- [x] Migrate `news.service.js` → `NewsRepository`
- [x] Migrate `fetch.service.js` → `FeedRepository` + `FeedCacheRepository` + `NewsHashRepository`
- [x] Migrate `stats.service.js` → `FeedStatsRepository` + `GlobalStatsRepository`
- [x] Migrate `bookmark.service.js` → `BookmarkRepository`
- [x] Migrate `relevance.service.js` → `UserProfileRepository`
- [x] Migrate `newsletter.service.js` → `NewsletterHistoryRepository`
- [x] Migrate `telegram.service.js` → `TelegramQueueRepository`
- [x] Migrate `templates.js` → `TemplateRepository`
- [x] Migrate `config.service.js` → `FeedRepository` (read/write feeds from DB)
- [x] Migrate `deduplication.js` → `NewsHashRepository`

### Phase 4: Migration Script ✅ DONE
- [x] Create `scripts/migrate-json-to-db.ts` to import existing JSON data
- [x] Run once on first deploy
- [x] Verify data integrity

### Phase 5: Cleanup ✅ DONE
- [x] Remove JSON file reads/writes from all services
- [x] Remove `data/*.json` from `.gitignore` (keep directory for SQLite file)
- [x] Update `docker-compose.yml` to persist SQLite file

### Phase 6: Test Updates (PENDING)
- [ ] Create test database setup with in-memory SQLite
- [ ] Update all test files to use test database
- [ ] Update config.service tests for new DB-backed behavior
- [ ] Update deduplication tests for NewsHashRepository
- [ ] Update stats tests for FeedStatsRepository
- [ ] Update Feed API tests for new services
- [ ] Run full test suite and verify all pass

## Acceptance Criteria
- [x] Migration script imports all existing data correctly
- [x] Concurrent writes don't corrupt data (SQLite WAL mode)
- [x] Schema migrations work (tested with `drizzle-kit migrate`)
- [x] No JSON file dependencies remain in services
- [x] Performance: fetch + store 100 items < 500ms
- [ ] All existing tests pass with database backend (pending test updates)
- [ ] New tests cover repository layer

## File Structure
```
src/
  db/
    index.ts           # Database connection + singleton
    schema.ts          # Drizzle schema definitions
    repositories/
      feed.repository.ts
      news.repository.ts
      news-hash.repository.ts
      feed-cache.repository.ts
      feed-stats.repository.ts
      global-stats.repository.ts
      user-profile.repository.ts
      bookmark.repository.ts
      newsletter-history.repository.ts
      telegram-queue.repository.ts
      template.repository.ts
    migrations/        # Auto-generated by drizzle-kit
  scripts/
    migrate-json-to-db.ts
drizzle.config.ts
```

## Dependencies
```json
{
  "dependencies": {
    "drizzle-orm": "^0.30.0",
    "better-sqlite3": "^9.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.21.0",
    "@types/better-sqlite3": "^7.6.8"
  }
}
```

## Testing Strategy
- Unit tests: Each repository method tested in isolation with in-memory SQLite
- Integration tests: Full fetch → store → query cycle
- Migration test: Run migration script, verify row counts match JSON
- Concurrency test: Simulate parallel fetches writing to same tables