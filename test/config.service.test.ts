import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import {
  generateFeedId,
  readFeedsConfig,
  validateFeedUrl,
  writeFeedsConfig,
} from '../services/config.service.js';
import { resetTestDb, testFixtures } from './setup.js';

describe('config.service (DB-backed)', () => {
  beforeEach(() => {
    resetTestDb();
  });

  test('readFeedsConfig returns feeds from database', async () => {
    const feeds = await readFeedsConfig();

    assert.ok(Array.isArray(feeds));
    assert.ok(feeds.length > 0);

    const firstFeed = feeds[0];
    assert.ok(firstFeed.id);
    assert.ok(firstFeed.name);
    assert.ok(firstFeed.url);
    assert.ok(typeof firstFeed.enabled === 'boolean');
    assert.ok(firstFeed.category);
  });

  test('writeFeedsConfig adds new feed to database', async () => {
    const testFeed = testFixtures.feed({
      id: 'new-test-feed',
      name: 'New Test Feed',
      url: 'https://example.com/new-feed.xml',
      enabled: true,
      category: 'Test',
    });

    await writeFeedsConfig([testFeed]);

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
    await writeFeedsConfig([originalFeed]);

    // Then update it
    const updatedFeed = { ...originalFeed, name: 'Updated Name', category: 'Updated Category' };
    await writeFeedsConfig([updatedFeed]);

    const feeds = await readFeedsConfig();
    const found = feeds.find((f) => f.id === 'update-test');
    assert.ok(found);
    assert.strictEqual(found.name, 'Updated Name');
    assert.strictEqual(found.category, 'Updated Category');
  });

  test('writeFeedsConfig disables feed', async () => {
    const feed = testFixtures.feed({ id: 'disable-test', enabled: true });
    await writeFeedsConfig([feed]);

    const disabledFeed = { ...feed, enabled: false };
    await writeFeedsConfig([disabledFeed]);

    const feeds = await readFeedsConfig();
    const found = feeds.find((f) => f.id === 'disable-test');
    assert.ok(found);
    assert.strictEqual(found.enabled, false);
  });

  test('generateFeedId slugifies name', () => {
    assert.strictEqual(generateFeedId('TechCrunch'), 'techcrunch');
    assert.strictEqual(generateFeedId('TechCrunch AI'), 'techcrunch-ai');
    assert.strictEqual(generateFeedId('The Verge'), 'the-verge');
    assert.strictEqual(generateFeedId('  Leading Spaces  '), 'leading-spaces');
    assert.strictEqual(generateFeedId('Special@#$Chars'), 'special-chars');
  });

  test('generateFeedId handles duplicates', () => {
    const existing = ['techcrunch', 'techcrunch-1'];
    assert.strictEqual(generateFeedId('TechCrunch', existing), 'techcrunch-2');
  });

  test('validateFeedUrl validates URLs', () => {
    assert.ok(validateFeedUrl('https://example.com/rss.xml'));
    assert.ok(validateFeedUrl('http://example.com/feed'));
    assert.ok(!validateFeedUrl('ftp://example.com/feed'));
    assert.ok(!validateFeedUrl('not-a-url'));
    assert.ok(!validateFeedUrl(''));
  });
});
