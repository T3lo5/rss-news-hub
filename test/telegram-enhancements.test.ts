import assert from 'node:assert';
import { beforeEach, describe, mock, test } from 'node:test';
import {
  cancelTelegramMessage,
  getTelegramQueue,
  processTelegramQueue,
  queueTelegramMessage,
  splitMessage,
  telegramSend,
} from '../services/telegram.service.js';
import { getTestDb, insertTestFeed, resetTestDb, testFixtures } from './setup.js';

describe('Telegram Enhancements (DB-backed)', () => {
  beforeEach(async () => {
    resetTestDb();
    // Insert test feed for FK constraints
    const db = getTestDb();
    await insertTestFeed(db, testFixtures.feed({ id: 'test-feed', url: 'https://test.com/feed' }));
  });

  describe('splitMessage', () => {
    test('returns a single part for short text', () => {
      assert.deepStrictEqual(splitMessage('short text'), ['short text']);
    });

    test('splits long text into parts within the safe limit', () => {
      const text = Array.from({ length: 500 }, (_, i) => `linha ${i} com algum conteudo`).join(
        '\n\n'
      );
      const parts = splitMessage(text);
      assert.ok(parts.length > 1);
      for (const part of parts) {
        assert.ok(part.length <= 4000, `part too long: ${part.length}`);
      }
    });

    test('handles text without any break characters', () => {
      const text = 'x'.repeat(9000);
      const parts = splitMessage(text);
      assert.ok(parts.length >= 3);
      for (const part of parts) {
        assert.ok(part.length <= 4000);
      }
    });
  });

  describe('Long Message Splitting', () => {
    test('telegramSend sends multiple messages for long text', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };
      const text = Array.from({ length: 400 }, (_, i) => `paragrafo numero ${i}`).join('\n\n');
      await telegramSend(text, 'Markdown', config);

      assert.ok(mockFetch.mock.callCount() > 1);
      const firstBody = JSON.parse(mockFetch.mock.calls[0].arguments[1].body);
      assert.match(firstBody.text, /^\(1\//);
    });
  });

  describe('Markdown entity fallback', () => {
    test('retries without parse_mode when Telegram rejects entities', async () => {
      let callCount = 0;
      const mockFetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            json: async () => ({
              ok: false,
              description: "Bad Request: can't parse entities",
            }),
          };
        }
        return { ok: true, json: async () => ({ ok: true, result: { message_id: 2 } }) };
      });
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };
      await telegramSend('**bold** message', 'Markdown', config);

      assert.strictEqual(callCount, 2);
      const retryBody = JSON.parse(mockFetch.mock.calls[1].arguments[1].body);
      assert.strictEqual(retryBody.parse_mode, undefined);
    });
  });

  describe('Inline Keyboard', () => {
    test('telegramSend includes inline keyboard with link button', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };
      await telegramSend('Test message', 'Markdown', config, {
        linkButton: true,
        linkUrl: 'https://example.com/article',
      });

      assert.strictEqual(mockFetch.mock.callCount(), 1);
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call.arguments[1].body);

      assert.ok(body.reply_markup);
      assert.ok(body.reply_markup.inline_keyboard);
      assert.strictEqual(body.reply_markup.inline_keyboard[0][0].text, '🔗 Read original');
      assert.strictEqual(
        body.reply_markup.inline_keyboard[0][0].url,
        'https://example.com/article'
      );
    });

    test('telegramSend includes custom inline keyboard', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };
      await telegramSend('Test message', 'Markdown', config, {
        inlineKeyboard: [[{ text: 'Custom', url: 'https://custom.com' }]],
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call.arguments[1].body);
      assert.ok(body.reply_markup);
      assert.strictEqual(body.reply_markup.inline_keyboard[0][0].text, 'Custom');
    });
  });

  describe('Thread Support', () => {
    test('telegramSend includes message_thread_id', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };
      await telegramSend('Test message', 'Markdown', config, {
        messageThreadId: 456,
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call.arguments[1].body);
      assert.strictEqual(body.message_thread_id, 456);
    });

    test('telegramSend includes reply_to_message_id', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };
      await telegramSend('Test message', 'Markdown', config, {
        replyToMessageId: 789,
      });

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call.arguments[1].body);
      assert.strictEqual(body.reply_parameters.message_id, 789);
    });
  });

  describe('Scheduled Sends (DB-backed)', () => {
    test('queueTelegramMessage adds to database queue', async () => {
      const msg = await queueTelegramMessage({
        text: 'Scheduled message',
        scheduledAt: new Date(Date.now() + 60000),
      });

      assert.ok(msg.id);
      assert.strictEqual(msg.text, 'Scheduled message');
      assert.strictEqual(msg.status, 'pending');
    });

    test('getTelegramQueue returns queued messages from database', async () => {
      await queueTelegramMessage({ text: 'Msg 1', scheduledAt: new Date(Date.now() + 1000) });
      await queueTelegramMessage({ text: 'Msg 2', scheduledAt: new Date(Date.now() + 2000) });

      const queue = await getTelegramQueue();
      assert.strictEqual(queue.length, 2);
    });

    test('cancelTelegramMessage removes from database queue', async () => {
      const msg = await queueTelegramMessage({
        text: 'To cancel',
        scheduledAt: new Date(Date.now() + 1000),
      });
      const cancelled = await cancelTelegramMessage(msg.id);

      assert.ok(cancelled);
      const queue = await getTelegramQueue();
      assert.strictEqual(queue.length, 0);
    });

    test('cancelTelegramMessage returns false for unknown ID', async () => {
      const cancelled = await cancelTelegramMessage('unknown-id');
      assert.strictEqual(cancelled, false);
    });
  });

  describe('Queue Processing (DB-backed)', () => {
    test('processTelegramQueue sends due messages', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };

      // Queue a message due now
      await queueTelegramMessage({
        text: 'Due now',
        scheduledAt: new Date(Date.now() - 1000),
      });

      await processTelegramQueue(config);

      assert.strictEqual(mockFetch.mock.callCount(), 1);

      const queue = await getTelegramQueue();
      assert.strictEqual(queue[0].status, 'sent');
    });

    test('processTelegramQueue skips future messages', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };

      // Queue a message due in future
      await queueTelegramMessage({
        text: 'Future',
        scheduledAt: new Date(Date.now() + 60000),
      });

      await processTelegramQueue(config);

      assert.strictEqual(mockFetch.mock.callCount(), 0);

      const queue = await getTelegramQueue();
      assert.strictEqual(queue[0].status, 'pending');
    });

    test('processTelegramQueue retries failed messages', async () => {
      let callCount = 0;
      const mockFetch = mock.fn(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, json: async () => ({ description: 'Network error' }) };
        }
        return { ok: true, json: async () => ({ ok: true, result: { message_id: 1 } }) };
      });
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };

      await queueTelegramMessage({
        text: 'Retry test',
        scheduledAt: new Date(Date.now() - 1000),
      });

      await processTelegramQueue(config);
      await processTelegramQueue(config);

      assert.strictEqual(callCount, 2);

      const queue = await getTelegramQueue();
      assert.strictEqual(queue[0].status, 'sent');
      assert.strictEqual(queue[0].retryCount, 1);
    });

    test('processTelegramQueue marks as failed after max retries', async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        json: async () => ({ description: 'Network error' }),
      }));
      global.fetch = mockFetch;

      const config = { botToken: 'test-token', chatId: '123' };

      await queueTelegramMessage({
        text: 'Will fail',
        scheduledAt: new Date(Date.now() - 1000),
      });

      // Process 4 times (initial + 3 retries)
      for (let i = 0; i < 4; i++) {
        await processTelegramQueue(config);
      }

      const queue = await getTelegramQueue();
      assert.strictEqual(queue[0].status, 'failed');
      assert.strictEqual(queue[0].retryCount, 3);
    });
  });
});
