# Plan 10: Daily/Weekly Digest View

## Objective
Add a timeline/digest view that groups news by date (daily or weekly) for easier reading.

## Requirements
- Toggle between "List" (current grid) and "Digest" (grouped by date) views
- Daily grouping: group by day, show date headers
- Weekly grouping: group by week, show week range headers
- Keyboard shortcut: `d` to toggle digest view, `D` (Shift+d) to cycle grouping (daily/weekly/none)
- Persist view preference in localStorage

## Backend
- No new API needed - uses existing `/api/news` endpoint
- Optional: Add `groupBy` query param to `/api/news` for server-side grouping (but client-side is fine for now)

## Frontend

### Types
```typescript
type DigestGrouping = 'none' | 'daily' | 'weekly';
```

### State
- `digestGrouping: DigestGrouping` - current grouping mode
- `digestView: boolean` - whether digest view is active

### Components
- `DigestView.tsx` - renders grouped news timeline
- `DateHeader` - shows date/week header with count
- `DigestItem` - compact card for digest view

### UI Integration
- Toolbar: view toggle button (grid/list icons) + grouping selector
- Keyboard: `d` toggle, `D` cycle grouping
- localStorage: persist `digestGrouping`

## Acceptance Criteria
- Toggle between grid and digest view
- Daily mode: groups by day, sorted newest first
- Weekly mode: groups by ISO week, sorted newest first
- Each group shows date/week header with item count
- Compact card layout in digest mode
- Keyboard shortcuts work
- Preference persists across sessions
- All tests pass