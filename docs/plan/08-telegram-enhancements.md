# Plan: Telegram Inline Keyboard + Scheduled Sends

## Problem
Telegram sends plain text only. No "Read original" button, no scheduling, no thread support.

## Solution
Enhance `telegramSend` with inline keyboard, add scheduled send queue, support message threads.

## Spec

### Inline Keyboard
Add "Read original" button linking to article:
```javascript
const keyboard = {
  inline_keyboard: [[
    { text: "🔗 Read original", url: news.link }
  ]]
};
```
- Only for single-item sends (not newsletter/blog)
- Configurable: `includeLinkButton: true`

### Scheduled Sends
Queue posts for optimal engagement times.

**Queue storage**: `data/telegram-queue.json`
```json
{
  "queue": [
    {
      "id": "uuid",
      "text": "Post content...",
      "parseMode": "Markdown",
      "scheduledAt": 1705320000000,
      "status": "pending", // pending | sent | failed
      "retryCount": 0,
      "createdAt": 1705233600000
    }
  ]
}
```

**API Endpoints**:
- `POST /api/telegram/schedule` - schedule a send
  ```json
  { "text": "...", "scheduledAt": 1705320000000, "parseMode": "Markdown" }
  ```
- `GET /api/telegram/queue` - list scheduled/pending
- `DELETE /api/telegram/queue/:id` - cancel scheduled
- `POST /api/telegram/queue/process` - manual trigger processing

**Background Worker**:
- Runs every minute (or configurable)
- Sends due messages
- Retries failed (exponential backoff, max 3)
- Updates status

### Thread Support
- `POST /api/telegram/send` accepts optional `messageThreadId`
- For forums/supergroups with topics
- Replies to existing thread if `replyToMessageId` provided

### Enhanced Send API
```javascript
telegramSend({
  text: "...",
  parseMode: "Markdown",
  inlineKeyboard: [...],      // custom keyboard
  linkButton: true,           // auto-add "Read original"
  messageThreadId: 123,       // for forum topics
  replyToMessageId: 456,      // reply to specific message
  scheduleAt: 1705320000000   // if provided, queues instead of sending
});
```

### Tests
- Inline keyboard renders correctly
- Link button opens article URL
- Scheduled send queues and processes on time
- Queue persists across restarts
- Retry logic with backoff works
- Thread ID and reply-to work
- Cancellation removes from queue
- Rate limiting applies to scheduled sends too