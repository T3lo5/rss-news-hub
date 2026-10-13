import assert from 'node:assert';
import { beforeEach, describe, mock, test } from 'node:test';
import { schemas, validateBody } from '../services/validation.js';

describe('Validation Schemas', () => {
  describe('addNewsSchema', () => {
    test('accepts valid news item', () => {
      const result = schemas.addNewsSchema.safeParse({
        title: 'Test Article',
        link: 'https://example.com/article',
        source: 'Test Source',
        description: 'A test article',
        content: 'Full content here',
        pubDate: '2024-01-15T10:00:00Z',
      });
      assert.ok(result.success);
    });

    test('requires title', () => {
      const result = schemas.addNewsSchema.safeParse({
        link: 'https://example.com/article',
      });
      assert.ok(!result.success);
      assert.ok(result.error.issues.some((i) => i.path.includes('title')));
    });

    test('requires link', () => {
      const result = schemas.addNewsSchema.safeParse({
        title: 'Test Article',
      });
      assert.ok(!result.success);
      assert.ok(result.error.issues.some((i) => i.path.includes('link')));
    });

    test('rejects invalid URL', () => {
      const result = schemas.addNewsSchema.safeParse({
        title: 'Test Article',
        link: 'not-a-url',
      });
      assert.ok(!result.success);
      assert.ok(result.error.issues.some((i) => i.path.includes('link')));
    });

    test('limits title length', () => {
      const result = schemas.addNewsSchema.safeParse({
        title: 'a'.repeat(501),
        link: 'https://example.com/article',
      });
      assert.ok(!result.success);
    });
  });

  describe('generateContentSchema', () => {
    test('accepts valid single news item', () => {
      const result = schemas.generateContentSchema.safeParse({
        news: { id: '1', title: 'Test', link: 'https://example.com', source: 'Test' },
        type: 'linkedin',
        language: 'pt',
        provider: 'auto',
      });
      assert.ok(result.success);
    });

    test('accepts valid news array', () => {
      const result = schemas.generateContentSchema.safeParse({
        news: [
          { id: '1', title: 'Test 1', link: 'https://example.com/1', source: 'Test' },
          { id: '2', title: 'Test 2', link: 'https://example.com/2', source: 'Test' },
        ],
        type: 'newsletter',
        language: 'en',
      });
      assert.ok(result.success);
    });

    test('requires news', () => {
      const result = schemas.generateContentSchema.safeParse({
        type: 'linkedin',
      });
      assert.ok(!result.success);
      assert.ok(result.error.issues.some((i) => i.path.includes('news')));
    });

    test('validates type enum', () => {
      const result = schemas.generateContentSchema.safeParse({
        news: { id: '1', title: 'Test', link: 'https://example.com', source: 'Test' },
        type: 'invalid-type',
      });
      assert.ok(!result.success);
    });

    test('validates language enum', () => {
      const result = schemas.generateContentSchema.safeParse({
        news: { id: '1', title: 'Test', link: 'https://example.com', source: 'Test' },
        type: 'linkedin',
        language: 'fr',
      });
      assert.ok(!result.success);
    });

    test('validates provider enum', () => {
      const result = schemas.generateContentSchema.safeParse({
        news: { id: '1', title: 'Test', link: 'https://example.com', source: 'Test' },
        type: 'linkedin',
        provider: 'anthropic',
      });
      assert.ok(!result.success);
    });
  });

  describe('telegramSendSchema', () => {
    test('accepts valid request', () => {
      const result = schemas.telegramSendSchema.safeParse({
        text: 'Hello world',
        parseMode: 'Markdown',
      });
      assert.ok(result.success);
    });

    test('requires text', () => {
      const result = schemas.telegramSendSchema.safeParse({});
      assert.ok(!result.success);
      assert.ok(result.error.issues.some((i) => i.path.includes('text')));
    });

    test('limits text length', () => {
      const result = schemas.telegramSendSchema.safeParse({
        text: 'a'.repeat(4097),
      });
      assert.ok(!result.success);
    });

    test('validates parseMode enum', () => {
      const result = schemas.telegramSendSchema.safeParse({
        text: 'Hello',
        parseMode: 'InvalidMode',
      });
      assert.ok(!result.success);
    });
  });

  describe('updateFeedSchema', () => {
    test('accepts valid updates', () => {
      const result = schemas.updateFeedSchema.safeParse({
        name: 'Updated Feed',
        url: 'https://example.com/feed.xml',
        enabled: false,
        category: 'Tech',
      });
      assert.ok(result.success);
    });

    test('accepts partial updates', () => {
      const result = schemas.updateFeedSchema.safeParse({
        enabled: true,
      });
      assert.ok(result.success);
    });

    test('validates URL when provided', () => {
      const result = schemas.updateFeedSchema.safeParse({
        url: 'not-a-url',
      });
      assert.ok(!result.success);
    });
  });

  describe('addFeedSchema', () => {
    test('accepts valid feed', () => {
      const result = schemas.addFeedSchema.safeParse({
        name: 'New Feed',
        url: 'https://example.com/feed.xml',
        enabled: true,
        category: 'Tech',
      });
      assert.ok(result.success);
    });

    test('requires name and url', () => {
      const result = schemas.addFeedSchema.safeParse({
        name: 'New Feed',
      });
      assert.ok(!result.success);
    });
  });

  describe('updateNewsletterConfigSchema', () => {
    test('accepts valid config', () => {
      const result = schemas.updateNewsletterConfigSchema.safeParse({
        enabled: true,
        cron: '0 8 * * 1',
        lookbackDays: 7,
        sources: ['techcrunch'],
        categories: ['Tech'],
        language: 'en',
        provider: 'openai',
        telegramEnabled: true,
      });
      assert.ok(result.success);
    });

    test('validates lookbackDays range', () => {
      const result = schemas.updateNewsletterConfigSchema.safeParse({
        lookbackDays: 0,
      });
      assert.ok(!result.success);
    });
  });

  describe('updateProfileSchema', () => {
    test('accepts valid profile', () => {
      const result = schemas.updateProfileSchema.safeParse({
        keywords: ['AI', 'ML'],
        topics: ['Machine Learning'],
        preferredSources: ['techcrunch'],
        excludedKeywords: ['crypto'],
      });
      assert.ok(result.success);
    });
  });
});

describe('validateBody Middleware', () => {
  function createMocks() {
    const req = { body: {} };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead: mock.fn((code) => {
        res.statusCode = code;
      }),
      end: mock.fn(),
      setHeader: mock.fn((k, v) => {
        res.headers[k] = v;
      }),
    };
    const next = mock.fn();
    return { req, res, next };
  }

  test('calls next() for valid body', () => {
    const { req, res, next } = createMocks();
    req.body = { title: 'Test', link: 'https://example.com' };
    const middleware = validateBody(schemas.addNewsSchema);
    middleware(req, res, next);
    assert.strictEqual(next.mock.callCount(), 1);
    assert.strictEqual(req.body.title, 'Test');
  });

  test('returns 400 for invalid body', () => {
    const { req, res, next } = createMocks();
    req.body = { title: 'Test' }; // missing link
    const middleware = validateBody(schemas.addNewsSchema);
    middleware(req, res, next);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(next.mock.callCount(), 0);
    const endArg = JSON.parse(res.end.mock.calls[0].arguments[0]);
    assert.strictEqual(endArg.ok, false);
    assert.strictEqual(endArg.error, 'Validation failed');
    assert.ok(Array.isArray(endArg.details));
    assert.ok(endArg.details.some((d) => d.field === 'link'));
  });

  test('strips unknown fields in strict mode', () => {
    const { req, res, next } = createMocks();
    req.body = { title: 'Test', link: 'https://example.com', unknownField: 'value' };
    const middleware = validateBody(schemas.addNewsSchema);
    middleware(req, res, next);
    assert.strictEqual(next.mock.callCount(), 1);
    assert.strictEqual(req.body.unknownField, undefined);
  });
});
