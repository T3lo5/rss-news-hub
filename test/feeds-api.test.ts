import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import {
  generateFeedId,
  readFeedsConfig,
  validateFeedUrl,
  writeFeedsConfig,
} from '../services/config.service.js';
import { fetchFeedByUrl, parseRSS } from '../services/fetch.service.js';
import { getTestDb, insertTestFeed, resetTestDb, testFixtures } from './setup.js';

describe('Feed API (DB-backed)', () => {
  beforeEach(async () => {
    resetTestDb();
    // Insert test feeds
    const db = getTestDb();
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'techcrunch',
        name: 'TechCrunch',
        url: 'https://techcrunch.com/feed/',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({ id: 'theverge', name: 'The Verge', url: 'https://theverge.com/rss.xml' })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({ id: 'ars', name: 'Ars Technica', url: 'https://ars.example.com/feed' })
    );
  });

  describe('readFeedsConfig / writeFeedsConfig', () => {
    test('readFeedsConfig returns all feeds from database', async () => {
      const feeds = await readFeedsConfig();

      assert.ok(Array.isArray(feeds));
      assert.ok(feeds.length >= 3);

      const feed = feeds[0];
      assert.ok(feed.id);
      assert.ok(feed.name);
      assert.ok(feed.url);
      assert.ok(typeof feed.enabled === 'boolean');
      assert.ok(feed.category);
    });

    test('writeFeedsConfig adds new feed to database', async () => {
      const newFeed = testFixtures.feed({
        id: 'new-test-feed',
        name: 'New Test Feed',
        url: 'https://example.com/new-feed.xml',
        enabled: true,
        category: 'Test',
      });

      await writeFeedsConfig([...(await readFeedsConfig()), newFeed]);

      const feeds = await readFeedsConfig();
      const found = feeds.find((f) => f.id === 'new-test-feed');
      assert.ok(found, 'Feed should be found in database');
      assert.strictEqual(found.name, 'New Test Feed');
      assert.strictEqual(found.url, 'https://example.com/new-feed.xml');
      assert.strictEqual(found.enabled, true);
      assert.strictEqual(found.category, 'Test');
    });

    test('writeFeedsConfig updates existing feed', async () => {
      // First create a feed
      const originalFeed = testFixtures.feed({ id: 'update-test', name: 'Original Name' });
      await writeFeedsConfig([...(await readFeedsConfig()), originalFeed]);

      // Then update it
      const updatedFeed = { ...originalFeed, name: 'Updated Name', category: 'Updated Category' };
      await writeFeedsConfig([
        ...(await readFeedsConfig()).filter((f) => f.id !== 'update-test'),
        updatedFeed,
      ]);

      const feeds = await readFeedsConfig();
      const found = feeds.find((f) => f.id === 'update-test');
      assert.ok(found);
      assert.strictEqual(found.name, 'Updated Name');
      assert.strictEqual(found.category, 'Updated Category');
    });

    test('writeFeedsConfig disables feed', async () => {
      const feed = testFixtures.feed({ id: 'disable-test', enabled: true });
      await writeFeedsConfig([...(await readFeedsConfig()), feed]);

      const disabledFeed = { ...feed, enabled: false };
      await writeFeedsConfig([
        ...(await readFeedsConfig()).filter((f) => f.id !== 'disable-test'),
        disabledFeed,
      ]);

      const feeds = await readFeedsConfig();
      const found = feeds.find((f) => f.id === 'disable-test');
      assert.ok(found);
      assert.strictEqual(found.enabled, false);
    });
  });

  describe('generateFeedId', () => {
    test('slugifies name', () => {
      assert.strictEqual(generateFeedId('TechCrunch'), 'techcrunch');
      assert.strictEqual(generateFeedId('TechCrunch AI'), 'techcrunch-ai');
      assert.strictEqual(generateFeedId('The Verge'), 'the-verge');
      assert.strictEqual(generateFeedId('  Leading Spaces  '), 'leading-spaces');
      assert.strictEqual(generateFeedId('Special@#$Chars'), 'special-chars');
    });

    test('handles duplicates', () => {
      const existing = ['techcrunch', 'techcrunch-1'];
      assert.strictEqual(generateFeedId('TechCrunch', existing), 'techcrunch-2');
    });
  });

  describe('validateFeedUrl', () => {
    test('validates URLs', () => {
      assert.ok(validateFeedUrl('https://example.com/rss.xml'));
      assert.ok(validateFeedUrl('http://example.com/feed'));
      assert.ok(!validateFeedUrl('ftp://example.com/feed'));
      assert.ok(!validateFeedUrl('not-a-url'));
      assert.ok(!validateFeedUrl(''));
    });
  });

  describe('fetchFeedByUrl', () => {
    test('fetches feed and returns XML', async () => {
      const mockXml = `<rss><channel>
        <item><title>Item 1</title><link>https://example.com/1</link><guid>1</guid><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><description>Desc 1</description></item>
        <item><title>Item 2</title><link>https://example.com/2</link><guid>2</guid><pubDate>Mon, 01 Jan 2024 01:00:00 GMT</pubDate><description>Desc 2</description></item>
      </channel></rss>`;

      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        headers: new Map(),
        text: async () => mockXml,
      });

      const xml = await fetchFeedByUrl('https://example.com/feed.xml');
      global.fetch = originalFetch;

      assert.ok(typeof xml === 'string');
      assert.ok(xml.includes('<rss'));
      assert.ok(xml.includes('Item 1'));
      assert.ok(xml.includes('Item 2'));
    });
  });

  describe('parseRSS', () => {
    test('parses standard RSS feed', () => {
      const rss = `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <item>
              <title>Article 1</title>
              <link>https://example.com/1</link>
              <guid>1</guid>
              <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
              <description>Description 1</description>
              <content:encoded><![CDATA[<p>Full content 1</p>]]></content:encoded>
            </item>
            <item>
              <title>Article 2</title>
              <link>https://example.com/2</link>
              <description>Description 2</description>
            </item>
          </channel>
        </rss>`;

      const items = parseRSS(rss, 'Test Source');
      assert.strictEqual(items.length, 2);
      assert.strictEqual(items[0].title, 'Article 1');
      assert.strictEqual(items[0].link, 'https://example.com/1');
      assert.strictEqual(items[0].source, 'Test Source');
      assert.ok(items[0].pubDate.includes('2024'));
      assert.strictEqual(items[0].description, 'Description 1');
      assert.ok(items[0].content.includes('Full content 1'));
    });

    test('parses Atom feed', () => {
      const atom = `<?xml version="1.0"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Atom Article</title>
            <link href="https://example.com/atom" />
            <id>atom-1</id>
            <published>2024-01-01T00:00:00Z</published>
            <summary>Atom summary</summary>
          </entry>
        </feed>`;

      const items = parseRSS(atom, 'Atom Source');
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].title, 'Atom Article');
      assert.strictEqual(items[0].link, 'https://example.com/atom');
      assert.strictEqual(items[0].source, 'Atom Source');
      assert.strictEqual(items[0].id, 'atom-1');
    });

    test('limits to 5 items per feed', () => {
      let rss = '<?xml version="1.0"?><rss version="2.0"><channel>';
      for (let i = 1; i <= 10; i++) {
        rss += `<item><title>Article ${i}</title><link>https://example.com/${i}</link></item>`;
      }
      rss += '</channel></rss>';

      const items = parseRSS(rss, 'Test');
      assert.strictEqual(items.length, 5);
    });
  });
});
