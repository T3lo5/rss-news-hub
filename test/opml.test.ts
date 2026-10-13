import assert from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import {
  exportOPML,
  extractFeedsFromOPML,
  generateOPML,
  importOPML,
  setConfigProvider,
} from '../services/opml.service.js';

describe('OPML Import/Export', () => {
  let testFeeds: any[] = [];

  beforeEach(() => {
    testFeeds = [];
    setConfigProvider({
      readFeedsConfig: () => testFeeds,
      writeFeedsConfig: (feeds: any[]) => {
        testFeeds = feeds;
      },
      generateFeedId: (name: string, existingIds: string[] = []) => {
        const base = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        let id = base;
        let counter = 1;
        while (existingIds.includes(id)) {
          counter++;
          id = `${base}-${counter}`;
        }
        return id;
      },
      validateFeedUrl: (url: string) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
    });
  });

  afterEach(() => {
    setConfigProvider(null);
  });

  describe('generateOPML', () => {
    test('generates valid OPML 2.0 structure', () => {
      const feeds = [
        { name: 'Feed 1', url: 'https://example.com/feed1.xml', category: 'Tech' },
        { name: 'Feed 2', url: 'https://example.com/feed2.xml', category: 'Tech' },
        { name: 'Feed 3', url: 'https://example.com/feed3.xml', category: 'News' },
      ];

      const xml = generateOPML(feeds);

      assert.ok(xml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.ok(xml.includes('<opml version="2.0">'));
      assert.ok(xml.includes('<head>'));
      assert.ok(xml.includes('<title>RSS News Hub Feeds</title>'));
      assert.ok(xml.includes('<body>'));
      assert.ok(xml.includes('text="Tech"'));
      assert.ok(xml.includes('text="News"'));
      assert.ok(xml.includes('xmlUrl="https://example.com/feed1.xml"'));
      assert.ok(xml.includes('xmlUrl="https://example.com/feed2.xml"'));
      assert.ok(xml.includes('xmlUrl="https://example.com/feed3.xml"'));
    });

    test('escapes XML special characters', () => {
      const feeds = [{ name: 'Feed & Co', url: 'https://example.com/feed.xml', category: 'A & B' }];

      const xml = generateOPML(feeds);

      assert.ok(xml.includes('Feed & Co'));
      assert.ok(xml.includes('A & B'));
    });

    test('handles feeds without category', () => {
      const feeds = [{ name: 'No Category Feed', url: 'https://example.com/feed.xml' }];

      const xml = generateOPML(feeds);

      assert.ok(xml.includes('text="Uncategorized"'));
    });
  });

  describe('extractFeedsFromOPML', () => {
    test('extracts feeds from OPML with categories', () => {
      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="Feed 1" title="Feed 1" xmlUrl="https://example.com/feed1.xml" />
      <outline type="rss" text="Feed 2" title="Feed 2" xmlUrl="https://example.com/feed2.xml" />
    </outline>
    <outline text="News" title="News">
      <outline type="rss" text="Feed 3" title="Feed 3" xmlUrl="https://example.com/feed3.xml" />
    </outline>
  </body>
</opml>`;

      const feeds = extractFeedsFromOPML(xml);

      assert.strictEqual(feeds.length, 3);
      assert.strictEqual(feeds[0].name, 'Feed 1');
      assert.strictEqual(feeds[0].url, 'https://example.com/feed1.xml');
      assert.strictEqual(feeds[0].category, 'Tech');
      assert.strictEqual(feeds[2].category, 'News');
    });

    test('handles feeds without type attribute', () => {
      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Feed 1" xmlUrl="https://example.com/feed1.xml" />
  </body>
</opml>`;

      const feeds = extractFeedsFromOPML(xml);

      assert.strictEqual(feeds.length, 1);
      assert.strictEqual(feeds[0].name, 'Feed 1');
    });

    test('ignores outlines without xmlUrl', () => {
      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Category" title="Category">
      <outline text="No URL Feed" title="No URL Feed" />
    </outline>
  </body>
</opml>`;

      const feeds = extractFeedsFromOPML(xml);

      assert.strictEqual(feeds.length, 0);
    });
  });

  describe('importOPML', () => {
    test('imports valid feeds', async () => {
      testFeeds = [];

      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech" title="Tech">
      <outline type="rss" text="New Feed" title="New Feed" xmlUrl="https://example.com/new.xml" />
    </outline>
  </body>
</opml>`;

      const results = await importOPML(Buffer.from(xml));

      assert.strictEqual(results.added, 1);
      assert.strictEqual(results.skipped, 0);
      assert.strictEqual(results.errors.length, 0);

      assert.strictEqual(testFeeds.length, 1);
      assert.strictEqual(testFeeds[0].name, 'New Feed');
    });

    test('skips duplicate URLs', async () => {
      testFeeds = [
        {
          id: 'existing',
          name: 'Existing',
          url: 'https://example.com/existing.xml',
          enabled: true,
          category: 'Test',
        },
      ];

      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Existing" title="Existing" xmlUrl="https://example.com/existing.xml" />
  </body>
</opml>`;

      const results = await importOPML(Buffer.from(xml));

      assert.strictEqual(results.added, 0);
      assert.strictEqual(results.skipped, 1);
      assert.ok(results.errors.some((e) => e.includes('Duplicate')));
    });

    test('skips invalid URLs', async () => {
      testFeeds = [];

      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Bad Feed" title="Bad Feed" xmlUrl="not-a-url" />
  </body>
</opml>`;

      const results = await importOPML(Buffer.from(xml));

      assert.strictEqual(results.added, 0);
      assert.strictEqual(results.skipped, 1);
      assert.ok(results.errors.some((e) => e.includes('Invalid URL')));
    });

    test('handles mixed valid and invalid feeds', async () => {
      testFeeds = [];

      const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline type="rss" text="Good Feed" title="Good Feed" xmlUrl="https://example.com/good.xml" />
    <outline type="rss" text="Bad Feed" title="Bad Feed" xmlUrl="not-a-url" />
  </body>
</opml>`;

      const results = await importOPML(Buffer.from(xml));

      assert.strictEqual(results.added, 1);
      assert.strictEqual(results.skipped, 1);
    });
  });

  describe('exportOPML', () => {
    test('exports current feeds as OPML', async () => {
      testFeeds = [
        {
          id: '1',
          name: 'Feed 1',
          url: 'https://example.com/feed1.xml',
          enabled: true,
          category: 'Tech',
        },
        {
          id: '2',
          name: 'Feed 2',
          url: 'https://example.com/feed2.xml',
          enabled: true,
          category: 'News',
        },
      ];

      const xml = await exportOPML();

      assert.ok(xml.includes('xmlUrl="https://example.com/feed1.xml"'));
      assert.ok(xml.includes('xmlUrl="https://example.com/feed2.xml"'));
      assert.ok(xml.includes('text="Tech"'));
      assert.ok(xml.includes('text="News"'));
    });
  });
});
