import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { fetchAllFeeds } from '../services/fetch.service.js';
import { feedRepository, newsRepository } from '../src/db/repositories/index.js';
import { getTestDb, resetTestDb } from './setup.js';

/**
 * Regressão de instalação limpa: `readFeedsConfig()` devolvia os feeds de
 * RSS_FEEDS sem gravá-los em `feeds`, então a primeira coleta morria com
 * "FOREIGN KEY constraint failed" ao gravar `feed_caches` (etag) e
 * `news_items.feed_id`.
 */
function rssFor(url: string): string {
  const slug = new URL(url).hostname.replace(/[^a-z0-9]/gi, '');
  return `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<title>${slug}</title>
<item>
<title>${slug} article</title>
<link>https://example.com/${slug}/1</link>
<guid>https://example.com/${slug}/1</guid>
<pubDate>Mon, 07 Oct 2026 12:00:00 GMT</pubDate>
<description>Description ${slug}</description>
</item>
</channel>
</rss>`;
}

describe('fresh install fetch', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
  });

  test('first fetch persists the configured feeds and stores news', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url: string | URL | Request) => ({
      ok: true,
      status: 200,
      // An ETag forces the feed_caches write, which is the first FK failure
      // on an empty `feeds` table.
      headers: new Map([['etag', '"fresh-install"']]),
      text: async () => rssFor(String(url)),
    });

    try {
      const result = await fetchAllFeeds();
      const failed = result.results.filter((entry: any) => entry.error);

      assert.deepStrictEqual(failed, [], 'every configured feed must be fetched');
      assert.ok(result.total > 0, 'items must be collected');

      const feeds = await feedRepository.findAll();
      const news = await newsRepository.findAll();

      assert.ok(feeds.length > 0, 'the configured feeds must exist in the database');
      assert.ok(news.length > 0, 'news must be persisted');
      assert.ok(
        feeds.some((feed) => feed.id === news[0].feedId),
        'news.feed_id must reference a real feed row'
      );

      // The feed list shown by the UI now matches the persisted rows, so
      // editing/deleting a default feed works on a fresh install.
      const { readFeedsConfig } = await import('../services/config.service.js');
      const config = await readFeedsConfig();
      assert.deepStrictEqual(
        config.map((feed) => feed.id).sort(),
        feeds.map((feed) => feed.id).sort()
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('ensureDefaultFeeds materializes the defaults once', async () => {
    const { ensureDefaultFeeds } = await import('../services/config.service.js');

    const first = await ensureDefaultFeeds();
    assert.ok(first.length > 0);
    assert.strictEqual((await feedRepository.findAll()).length, first.length);

    // A second call must not duplicate or re-create them.
    const second = await ensureDefaultFeeds();
    assert.strictEqual(second.length, first.length);
    assert.strictEqual((await feedRepository.findAll()).length, first.length);
  });
});
