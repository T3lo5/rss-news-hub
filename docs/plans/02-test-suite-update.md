# Plan: Test Suite Update for Database Layer

## Objective
Update all existing tests to work with the new SQLite + Drizzle ORM database layer, ensuring all features are validated.

## Current State
- 24 test files in `test/` directory
- Tests expect JSON file-based storage
- Need test database infrastructure with in-memory SQLite

## Test Infrastructure Requirements

### 1. Test Database Setup (`test/setup.ts`)
- In-memory SQLite database for fast, isolated tests
- Schema creation before each test suite
- Cleanup after each test
- Helper functions for test data creation

### 2. Repository Test Helpers
- Factory functions for creating test entities
- Shared test fixtures (feeds, news items, etc.)
- Mock external services (fetch, AI, Telegram)

### 3. Test File Updates Needed

| Test File | Services Affected | Priority |
|-----------|-------------------|----------|
| `test/config.service.test.js` | config.service.js (DB-backed) | High |
| `test/deduplication.test.js` | deduplication.js (NewsHashRepository) | High |
| `test/stats.test.js` | stats.service.js (FeedStatsRepository) | High |
| `test/feed-health.test.js` | stats.service.js (getFeedHealth) | High |
| `test/feeds-api.test.js` | Full API + config.service | High |
| `test/fetch.test.js` | fetch.service.js | High |
| `test/fetch-cache.test.js` | fetch.service.js + FeedCacheRepository | High |
| `test/news.service.test.js` | news.service.js | Medium |
| `test/bookmark.service.test.js` | bookmark.service.js | Medium |
| `test/relevance.test.js` | relevance.service.js | Medium |
| `test/newsletter.test.js` | newsletter.service.js | Medium |
| `test/telegram.test.js` | telegram.service.js | Medium |
| `test/telegram-enhancements.test.js` | telegram.service.js | Medium |
| `test/telegram-worker.test.js` | telegram-worker.js | Medium |
| `test/templates.test.js` | templates.js | Medium |
| `test/templates-api.test.js` | templates.js + API | Medium |
| `test/ai.service.test.js` | ai.service.js | Low (no DB) |
| `test/validation.test.js` | validation.js | Low (no DB) |
| `test/rate-limiter.test.js` | rate-limiter.js | Low (no DB) |
| `test/scheduler.test.js` | scheduler.service.js | Low |
| `test/logger.test.js` | logger.js | Low (no DB) |
| `test/opml.test.js` | opml.service.js | Low |
| `test/shortcuts.test.js` | Frontend only | Low |
| `test/navigation.test.js` | Frontend only | Low |

## Implementation Phases

### Phase 1: Test Infrastructure ✅ DONE
- [x] Create `test/setup.ts` with in-memory DB
- [x] Create `test/helpers.ts` with factory functions
- [x] Update `package.json` test scripts for tsx
- [x] Validate test infrastructure with `test/setup.test.ts` (13/13 passing)

### Phase 2: Core Service Tests (High Priority)
- [ ] `test/config.service.test.js` - Feed CRUD with DB
- [ ] `test/deduplication.test.js` - NewsHashRepository
- [ ] `test/stats.test.js` - FeedStatsRepository + GlobalStatsRepository
- [ ] `test/feed-health.test.js` - Health status calculation
- [ ] `test/fetch.test.js` - Full fetch cycle with DB
- [ ] `test/fetch-cache.test.js` - ETag/Last-Modified caching

### Phase 3: API Integration Tests (High Priority)
- [ ] `test/feeds-api.test.js` - REST endpoints for feeds
- [ ] `test/server.test.js` - Main server endpoints

### Phase 4: Feature Service Tests (Medium Priority)
- [ ] `test/news.service.test.js`
- [ ] `test/bookmark.service.test.js`
- [ ] `test/relevance.test.js`
- [ ] `test/newsletter.test.js`
- [ ] `test/telegram.test.js`
- [ ] `test/telegram-enhancements.test.js`
- [ ] `test/telegram-worker.test.js`
- [ ] `test/templates.test.js`
- [ ] `test/templates-api.test.js`

### Phase 5: Utility Tests (Low Priority)
- [ ] `test/ai.service.test.js` (mock AI calls)
- [ ] `test/validation.test.js`
- [ ] `test/rate-limiter.test.js`
- [ ] `test/scheduler.test.js`
- [ ] `test/logger.test.js`
- [ ] `test/opml.test.js`

## Acceptance Criteria
- [ ] All 24 test files pass
- [ ] Tests run in < 30 seconds
- [ ] Tests are isolated (no cross-test pollution)
- [ ] Coverage > 80% for repository layer
- [ ] CI/CD ready (no flaky tests)

## File Structure
```
test/
  setup.ts              # Test database setup/teardown
  helpers.ts            # Factory functions, mocks
  fixtures/
    feeds.json          # Test feed data
    news.json           # Test news data
  setup.test.ts         # Verify test infrastructure works
  config.service.test.ts
  deduplication.test.ts
  stats.test.ts
  feed-health.test.ts
  fetch.test.ts
  fetch-cache.test.ts
  feeds-api.test.ts
  server.test.ts
  news.service.test.ts
  bookmark.service.test.ts
  relevance.test.ts
  newsletter.test.ts
  telegram.service.test.ts
  telegram-enhancements.test.ts
  telegram-worker.test.ts
  templates.test.ts
  templates-api.test.ts
  ai.service.test.ts
  validation.test.ts
  rate-limiter.test.ts
  scheduler.test.ts
  logger.test.ts
  opml.test.ts
```

## Dependencies
- Already have: `node --test` (native)
- Need: Convert `.js` tests to `.ts` for type safety
- Use `tsx` for TypeScript execution