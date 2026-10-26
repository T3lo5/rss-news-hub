# Plan: Feed Management UI

## Objective
Add a Feed Management interface to the frontend allowing users to:
- View all configured RSS feeds with status
- Add new RSS feeds
- Edit existing feeds
- Toggle feeds active/inactive
- Test a feed before saving
- Delete feeds
- Persist changes to `server.config.js` (via API)

---

## Phase 1: Backend API Endpoints

### 1.1 GET /api/feeds
- Returns array of feed configs from `server.config.js`
- Each feed: `{ id, name, url, enabled, category, lastFetch, lastError, itemCount }`
- Includes runtime stats from `stats.service.js`

### 1.2 POST /api/feeds
- Add new feed
- Body: `{ name, url, enabled?, category? }`
- Validates URL format, tests fetch (optional)
- Appends to `RSS_FEEDS` in `server.config.js`
- Returns created feed with assigned ID

### 1.3 PUT /api/feeds/:id
- Update feed
- Body: `{ name?, url?, enabled?, category? }`
- Validates URL if changed
- Updates `server.config.js`

### 1.4 DELETE /api/feeds/:id
- Remove feed from `RSS_FEEDS`
- Returns success

### 1.5 POST /api/feeds/:id/test
- Test fetch a single feed
- Returns `{ success: boolean, itemCount: number, error?: string, preview: NewsItem[] }`
- Uses `fetch.service.js` with cache bypass

### 1.6 POST /api/feeds/reload
- Reload config from disk (for multi-instance sync)
- Returns updated feed list

---

## Phase 2: Frontend Components

### 2.1 FeedManagerModal
- Full-screen or large modal
- Table/list of feeds with columns: Status, Name, URL, Category, Last Fetch, Items, Actions
- Toolbar: Search, Filter (all/active/inactive), Add button
- Row actions: Toggle, Edit, Test, Delete

### 2.2 FeedFormModal (shared for Add/Edit)
- Fields: Name (required), URL (required, validation), Category (select + custom), Enabled (toggle)
- Test button: calls test endpoint, shows preview
- Submit: calls POST/PUT, closes on success

### 2.3 FeedRow / FeedTable
- Display feed with status badge (green/red/gray)
- Inline toggle switch for enabled
- Click row → expand with details/preview
- Hover actions: Edit, Test, Delete

### 2.4 Hooks
- `useFeeds()` - fetch, add, update, delete, test, toggle
- Optimistic updates for toggle

### 2.5 Integration
- Add "Feeds" button to Header (next to Stats)
- Keyboard shortcut: `f` to open Feed Manager

---

## Phase 3: server.config.js Persistence

### 3.1 Config File Format
```js
export const RSS_FEEDS = [
  { id: 'techcrunch', name: 'TechCrunch', url: '...', enabled: true, category: 'Tech' },
  ...
];
```

### 3.2 Read/Write Utilities
- `readFeedsConfig()` - parse `server.config.js`, extract `RSS_FEEDS`
- `writeFeedsConfig(feeds)` - rewrite `server.config.js` with updated array
- Preserve other exports (AI_CONFIG, TELEGRAM_CONFIG, etc.)
- Use regex or AST (babel) for safe modification

### 3.3 ID Generation
- Slugify name: `TechCrunch AI` → `techcrunch-ai`
- Ensure uniqueness with suffix: `techcrunch-ai-2`

---

## Phase 4: Tests (TDD)

### 4.1 Backend Tests (`test/feeds-api.test.js`)
```
GET /api/feeds
  ✔ returns all feeds with stats
  ✔ includes runtime metrics from stats.service

POST /api/feeds
  ✔ creates feed with valid data
  ✔ returns 400 for missing name
  ✔ returns 400 for invalid URL
  ✔ returns 400 for duplicate ID
  ✔ assigns generated ID
  ✔ persists to server.config.js

PUT /api/feeds/:id
  ✔ updates feed fields
  ✔ returns 404 for unknown ID
  ✔ validates URL on change

DELETE /api/feeds/:id
  ✔ removes feed
  ✔ returns 404 for unknown ID

POST /api/feeds/:id/test
  ✔ returns success with item count
  ✔ returns error for invalid feed
  ✔ returns preview items

POST /api/feeds/reload
  ✔ reloads config from disk
```

### 4.2 Config Persistence Tests (`test/config-persistence.test.js`)
```
readFeedsConfig
  ✔ parses RSS_FEEDS array
  ✔ preserves other exports

writeFeedsConfig
  ✔ updates RSS_FEEDS in place
  ✔ preserves other exports
  ✔ formats array consistently

generateFeedId
  ✔ slugifies name
  ✔ handles duplicates
  ✔ handles special characters
```

### 4.3 Frontend Tests (manual verification)
- FeedManagerModal opens/closes
- Add feed form validates
- Edit feed pre-fills data
- Toggle updates immediately
- Test feed shows preview
- Delete confirms

---

## File Structure
```
server.js                    # Add feed endpoints
services/config.service.js   # New: read/write server.config.js
test/feeds-api.test.js       # Backend API tests
test/config-persistence.test.js # Config read/write tests
frontend/src/
  components/
    FeedManagerModal.tsx
    FeedFormModal.tsx
    FeedTable.tsx
    FeedRow.tsx
  hooks/
    useFeeds.ts
  services/
    api.ts (add feed endpoints)
  styles/
    global.css (add feed management styles)
docs/
  plan.md (updated)
```

---

## Acceptance Criteria
- [ ] All backend tests pass
- [ ] Config persistence works (survives server restart)
- [ ] Feed Manager opens from header button
- [ ] Can add valid feed, appears in list
- [ ] Can toggle feed enabled/disabled
- [ ] Can test feed, sees preview
- [ ] Can edit feed
- [ ] Can delete feed (with confirmation)
- [ ] Search/filter works
- [ ] Keyboard shortcut `f` opens manager
- [ ] Scheduler respects `enabled` flag (already implemented)
- [ ] All 89 existing tests still pass