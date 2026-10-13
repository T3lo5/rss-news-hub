# Plan: Streaming AI Responses (SSE)

## Problem
Long blog posts (1500-3000 words) take 10-30s to generate. User sees blank loading state, may think it failed.

## Solution
Server-Sent Events (SSE) streaming from `/api/ai/generate/stream`. Frontend renders tokens as they arrive.

## Spec

### Endpoint
`POST /api/ai/generate/stream` - same request body as `/api/ai/generate`

### Response
- Content-Type: `text/event-stream`
- Each chunk: `data: {"token": "...", "done": false}\n\n`
- Final: `data: {"token": "", "done": true}\n\n`
- Error: `data: {"error": "...", "done": true}\n\n`

### Backend Changes
- `services/ai.service.js` - add `chatStream(systemPrompt, userContent, provider, onToken)` using OpenAI SDK streaming
- `server.js` - new handler for `/api/ai/generate/stream` that:
  1. Validates request (reuse validation)
  2. Sets SSE headers
  3. Calls `chatStream` with callback writing SSE chunks
  4. Handles client disconnect (abort generation)

### Frontend Changes
- `services/api.ts` - add `generateContentStream(request, onToken)` using `EventSource` or `fetch` + `ReadableStream`
- `hooks/useAI.ts` - add `generateStream` returning async generator or callback-based
- `ShareModal.tsx` - toggle "Stream" mode, render incremental markdown

### Fallback
- Non-streaming endpoint remains for Telegram sending (needs full text)
- Frontend auto-falls back if SSE fails

### Tests
- Stream emits tokens incrementally
- Final `done: true` received
- Client disconnect aborts generation
- Error during generation sends error event
- Works with all providers (SenseNova, DeepSeek, OpenAI)