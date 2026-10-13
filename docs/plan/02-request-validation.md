# Plan: Request Validation with Zod

## Problem
Endpoints accept arbitrary JSON with no validation. Missing/invalid fields cause cryptic errors or silent failures.

## Solution
Zod schemas for all POST/PUT request bodies. Validation middleware returns 400 with field-level errors.

## Spec

### Schemas
```typescript
// POST /api/news
z.object({
  title: z.string().min(1).max(500),
  link: z.string().url(),
  source: z.string().max(100).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  pubDate: z.string().datetime().optional(),
  id: z.string().optional(),
})

// POST /api/ai/generate
z.object({
  news: z.union([NewsItemSchema, z.array(NewsItemSchema)]),
  type: z.enum(['thread', 'summary', 'linkedin', 'blog', 'newsletter']),
  language: z.enum(['en', 'pt']).optional(),
  provider: z.enum(['auto', 'sensenova', 'deepseek', 'openai']).optional(),
})

// POST /api/telegram/send
z.object({
  text: z.string().min(1).max(4096),
  parseMode: z.enum(['Markdown', 'HTML', 'MarkdownV2']).optional(),
})

// PUT /api/feeds/:id
z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
  category: z.string().max(50).optional(),
})

// POST /api/feeds
z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  enabled: z.boolean().optional(),
  category: z.string().max(50).optional(),
})

// PUT /api/newsletter/config
z.object({
  enabled: z.boolean().optional(),
  cron: z.string().optional(), // cron regex validation
  lookbackDays: z.number().int().min(1).max(30).optional(),
  sources: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  language: z.enum(['en', 'pt']).optional(),
  provider: z.enum(['auto', 'sensenova', 'deepseek', 'openai']).optional(),
  telegramEnabled: z.boolean().optional(),
})

// PUT /api/ai/profile
z.object({
  keywords: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  preferredSources: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
})
```

### Error Response Format
```json
{
  "ok": false,
  "error": "Validation failed",
  "details": [
    { "field": "title", "message": "Title is required" },
    { "field": "link", "message": "Invalid URL" }
  ]
}
```

### Implementation
- `services/validation.ts` - all schemas + `validateBody(schema)` middleware
- Applied in `server.js` before route handlers
- Reuses existing `sendJSON` for error responses

### Tests
- Valid body → passes through
- Missing required field → 400 with field error
- Invalid type (string vs number) → 400 with field error
- Invalid enum value → 400 with field error
- Extra fields → stripped or rejected (strict mode)
- Invalid URL format → 400