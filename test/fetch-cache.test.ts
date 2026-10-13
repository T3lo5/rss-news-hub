import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { fetchFeed } from '../services/fetch.service.js';
import { feedCacheRepository } from '../src/db/repositories/index.js';
import { getTestDb, insertTestFeed, resetTestDb, testFixtures } from './setup.js';

const MOCK_XML = `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<title>Test Feed</title>
<item>
<title>Item 1</title>
<link>https://example.com/1</link>
<guid>https://example.com/1</guid>
<pubDate>Mon, 07 Oct 2026 12:00:00 GMT</pubDate>
<description>Description 1</description>
</item>
</channel>
</rss>`;

describe('fetch.service - cache (DB-backed)', () => {
  beforeEach(async () => {
    resetTestDb();
    // Insert test feed
    const db = getTestDb();
    await insertTestFeed(
      db,
      testFixtures.feed({ id: 'test-feed', name: 'Test Feed', url: 'https://example.com/feed.xml' })
    );
  });

  describe('fetchFeed with conditional headers', () => {
    test('sends If-None-Match when etag is cached', async () => {
      let capturedHeaders: Record<string, string> = {};
      const originalFetch = global.fetch;
      global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
        capturedHeaders = (options?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          headers: new Map([
            ['etag', '"new-etag"'],
            ['last-modified', 'Mon, 07 Oct 2026 12:00:00 GMT'],
          ]),
          text: async () => MOCK_XML,
        };
      };

      await feedCacheRepository.set('test-feed', '"old-etag"', 'Mon, 07 Oct 2026 10:00:00 GMT');

      await fetchFeed({ url: 'https://example.com/feed.xml', name: 'Test Feed', id: 'test-feed' });
      global.fetch = originalFetch;

      assert.strictEqual(capturedHeaders['If-None-Match'], '"old-etag"');
    });

    test('sends If-Modified-Since when lastModified is cached', async () => {
      let capturedHeaders: Record<string, string> = {};
      const originalFetch = global.fetch;
      global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
        capturedHeaders = (options?.headers as Record<string, string>) || {};
        return {
          ok: true,
          status: 200,
          headers: new Map([
            ['etag', '"new-etag"'],
            ['last-modified', 'Mon, 07 Oct 2026 12:00:00 GMT'],
          ]),
          text: async () => MOCK_XML,
        };
      };

      await feedCacheRepository.set('test-feed', '"old-etag"', 'Mon, 07 Oct 2026 10:00:00 GMT');

      await fetchFeed({ url: 'https://example.com/feed.xml', name: 'Test Feed', id: 'test-feed' });
      global.fetch = originalFetch;

      assert.strictEqual(capturedHeaders['If-Modified-Since'], 'Mon, 07 Oct 2026 10:00:00 GMT');
    });

    test('returns empty items on 304 Not Modified', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 304,
        headers: new Map(),
        text: async () => '',
      });

      await feedCacheRepository.set('test-feed', '"current-etag"', 'Mon, 07 Oct 2026 12:00:00 GMT');

      const items = await fetchFeed({
        url: 'https://example.com/feed.xml',
        name: 'Test Feed',
        id: 'test-feed',
      });
      global.fetch = originalFetch;

      assert.strictEqual(items, '');
    });

    test('updates cache on 200 response', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Map([
          ['etag', '"updated-etag"'],
          ['last-modified', 'Mon, 07 Oct 2026 14:00:00 GMT'],
        ]),
        text: async () => MOCK_XML,
      });

      await fetchFeed({ url: 'https://example.com/feed.xml', name: 'Test Feed', id: 'test-feed' });
      global.fetch = originalFetch;

      const cache = await feedCacheRepository.get('test-feed');
      assert.ok(cache);
      assert.strictEqual(cache!.etag, '"updated-etag"');
      assert.strictEqual(cache!.lastModified, 'Mon, 07 Oct 2026 14:00:00 GMT');
    });

    test('does not update cache on 304', async () => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: false,
        status: 304,
        headers: new Map(),
        text: async () => '',
      });

      await feedCacheRepository.set('test-feed', '"old-etag"', 'Mon, 07 Oct 2026 10:00:00 GMT');

      await fetchFeed({ url: 'https://example.com/feed.xml', name: 'Test Feed', id: 'test-feed' });
      global.fetch = originalFetch;

      const cache = await feedCacheRepository.get('test-feed');
      assert.ok(cache);
      assert.strictEqual(cache!.etag, '"old-etag"');
      assert.strictEqual(cache!.lastModified, 'Mon, 07 Oct 2026 10:00:00 GMT');
    });
  });
});
