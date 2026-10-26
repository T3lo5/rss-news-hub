# Plan 11: AI Relevance Scoring

## Objective
Automatically rank articles by relevance/interest using AI scoring, allowing users to see the most relevant content first.

## Requirements
- Score articles using AI (1-100 relevance score)
- Configurable interest profile (keywords, topics, sources)
- Background scoring job for new articles
- Sort by relevance in UI
- Show relevance badge on cards
- Keyboard shortcut: `R` to toggle relevance sort

## Backend

### Data Model
Add `relevanceScore` (0-100) and `scoredAt` to NewsItem in `data/news.json`

### API Endpoints
- `POST /api/ai/score` - Score a batch of news items (body: { items: NewsItem[], profile?: string })
- `GET /api/ai/profile` - Get current interest profile
- `PUT /api/ai/profile` - Update interest profile

### Service
`services/relevance.service.js` - AI scoring logic, profile management

### Scheduler Integration
- Score new articles after each RSS fetch
- Configurable batch size and frequency

## Frontend

### Types
```typescript
interface InterestProfile {
  keywords: string[];
  topics: string[];
  preferredSources: string[];
  excludedKeywords: string[];
}

interface ScoredNewsItem extends NewsItem {
  relevanceScore?: number;
  scoredAt?: number;
}
```

### Hooks
`useRelevance.ts` - score, get/set profile

### Components
- `RelevanceBadge` - shows score with color coding
- `InterestProfileModal` - configure profile
- Update `NewsGrid`/`DigestView` to show badges and sort by relevance

### UI Integration
- Toolbar: sort option "Relevance" + profile button
- Keyboard: `R` toggle relevance sort, `Shift+R` open profile

## Acceptance Criteria
- AI scores articles 0-100 based on interest profile
- New articles scored automatically on fetch
- Sort by relevance works in both grid and digest views
- Visual badge (green/yellow/red) on each card
- Interest profile editable in modal
- Profile persists across sessions
- All tests pass