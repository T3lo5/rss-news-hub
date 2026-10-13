# Plan: Scheduled Newsletter (Auto-Digest)

## Objective
Allow users to configure automated newsletter generation and delivery:
- **Schedule**: Cron expression (daily, weekly, custom)
- **Selection**: All items from last N days, or specific sources/categories
- **Output**: HTML newsletter sent via Telegram
- **Management**: Enable/disable, view history, manual trigger

## Value
**High impact** - "Set and forget" weekly digest. Core automation feature.

---

## Phase 1: Backend - Newsletter Scheduler Config

### 1.1 Extend server.config.js
```javascript
export const newsletterConfig = {
  enabled: false,
  cron: '0 9 * * 1',  // Monday 9am
  lookbackDays: 7,
  sources: [],  // empty = all
  categories: [],  // empty = all
  language: 'pt',
  provider: 'auto',
  telegramEnabled: true,
};
```

### 1.2 Add API endpoints
- `GET /api/newsletter/config` - Get config
- `PUT /api/newsletter/config` - Update config
- `POST /api/newsletter/trigger` - Manual run
- `GET /api/newsletter/history` - Last 10 runs

### 1.3 Scheduler integration
- New `newsletter.service.js` with `generateAndSend()`
- Register job in `scheduler.service.js` when enabled
- Use existing `fetchAllFeeds` + filter by date/source + AI generate + Telegram send

---

## Phase 2: Frontend - Newsletter Config Modal

### 2.1 New component: `NewsletterConfigModal.tsx`
- Form with:
  - Enable checkbox
  - Cron expression input (with presets: daily, weekly, Mon-Fri)
  - Lookback days (number)
  - Source multi-select (from feeds)
  - Category multi-select
  - Language dropdown
  - Provider dropdown
  - Telegram enabled checkbox
  - "Test Now" button
  - Save button

### 2.2 Toolbar: Add "⚙️ Newsletter" button
- Opens config modal

### 2.3 Reuse existing:
- `useAI` hook for generation
- `useTelegram` hook for sending
- Feed list from `useFeeds`

---

## Phase 3: Newsletter Generation Logic

### 3.1 `services/newsletter.service.js`
```javascript
async function generateAndSend(config) {
  // 1. Fetch all news from data/news.json
  // 2. Filter by pubDate >= now - lookbackDays
  // 3. Filter by sources/categories if specified
  // 4. Call AI with type='newsletter' + filtered items
  // 5. Convert markdown to HTML
  // 6. Send via Telegram if enabled
  // 7. Log result to history file
}
```

### 3.2 History persistence
- `data/newsletter-history.json` - array of { timestamp, success, itemCount, error, contentPreview }

---

## Acceptance Criteria
- [ ] Config modal opens from toolbar
- [ ] Cron with presets (Daily, Weekly Mon, Mon-Fri, Custom)
- [ ] Source/category filters work
- [ ] "Test Now" generates and sends immediately
- [ ] Scheduled run works via cron
- [ ] History shows last 10 runs with status
- [ ] All 121 tests pass

---

## File Changes
```
server.config.js                    # Add newsletterConfig
services/newsletter.service.js      # NEW - generation + send logic
services/scheduler.service.js       # Register newsletter job
server.js                           # New API endpoints
frontend/src/components/NewsletterConfigModal.tsx  # NEW
frontend/src/components/Toolbar.tsx   # Add button
frontend/src/hooks/useNewsletter.ts   # NEW - API calls
frontend/src/services/api.ts          # Add newsletter endpoints
```

---

## Test Plan
```javascript
test/newsletter-scheduler.test.js:
- Config CRUD
- Generate filters by date correctly
- Generate filters by source correctly
- Manual trigger works
- Scheduled job registers/unregisters on config change
- History persists
```