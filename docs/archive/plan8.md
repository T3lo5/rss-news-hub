# Plan 8: Read Later / Bookmarks

## Objective
Allow users to save articles for later reading with a bookmark system.

## Requirements
- Bookmark/unbookmark articles from the news grid
- View bookmarked articles in a dedicated view
- Persist bookmarks to disk (`data/bookmarks.json`)
- Keyboard shortcut: `b` to toggle bookmark, `B` (Shift+b) to open bookmarks view
- Visual indicator on bookmarked cards

## Backend

### Data Model
```json
// data/bookmarks.json
[
  {
    "newsId": "uuid",
    "title": "Article title",
    "link": "https://...",
    "source": "Source name",
    "bookmarkedAt": 1234567890
  }
]
```

### API Endpoints
- `GET /api/bookmarks` - List all bookmarks
- `POST /api/bookmarks` - Add bookmark (body: newsId)
- `DELETE /api/bookmarks/:newsId` - Remove bookmark

### Service
`services/bookmark.service.js` - read/write bookmarks, add/remove/check

## Frontend

### Types
```typescript
interface Bookmark {
  newsId: string;
  title: string;
  link: string;
  source: string;
  bookmarkedAt: number;
}
```

### Hooks
`useBookmarks.ts` - fetch, add, remove bookmarks

### Components
- `BookmarkButton` - toggle button for NewsGrid cards
- `BookmarksModal` - view/manage bookmarked articles

### UI Integration
- NewsGrid: show bookmark icon per card, filled when bookmarked
- Toolbar: bookmark count badge, click to open BookmarksModal
- Keyboard: `b` toggle, `B` open modal

## Acceptance Criteria
- Click bookmark icon on card → adds to bookmarks, icon fills
- Click again → removes, icon unfilled
- BookmarksModal shows list with title, source, date bookmarked
- Click bookmark in modal → opens original article
- Remove button in modal → removes bookmark
- Data persists across server restarts
- All tests pass