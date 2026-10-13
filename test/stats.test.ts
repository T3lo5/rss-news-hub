import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import {
  getFeedHealth,
  getStatsAsync,
  recordFeedResult,
  recordFetchResult,
  recordFetchStart,
} from '../services/stats.service.js';
import { getTestDb, insertTestFeed, resetTestDb, testFixtures } from './setup.js';

describe('stats.service (DB-backed)', () => {
  beforeEach(async () => {
    resetTestDb();
    // Insert test feeds with unique URLs
    const db = getTestDb();
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'openai-blog',
        name: 'OpenAI Blog',
        url: 'https://openai.com/blog/rss.xml',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'hacker-news',
        name: 'Hacker News',
        url: 'https://hnrss.org/frontpage',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'broken-feed',
        name: 'Broken Feed',
        url: 'https://broken.example.com/feed',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({ id: 'feed-a', name: 'Feed A', url: 'https://feed-a.example.com/rss.xml' })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({ id: 'feed-b', name: 'Feed B', url: 'https://feed-b.example.com/rss.xml' })
    );
  });

  describe('recordFetchStart', () => {
    test('increments totalFetches', async () => {
      await recordFetchStart();
      await recordFetchStart();
      const stats = await getStatsAsync();
      assert.strictEqual(stats.totals.totalFetches, 2);
    });
  });

  describe('recordFetchResult', () => {
    test('records successful fetch with totals', async () => {
      await recordFetchStart();
      await recordFetchResult({ total: 10, errors: 0 });
      const stats = await getStatsAsync();
      assert.strictEqual(stats.totals.totalFetches, 1);
      assert.strictEqual(stats.totals.totalItems, 10);
      assert.strictEqual(stats.totals.totalErrors, 0);
      assert(stats.totals.lastFullFetch > 0);
    });

    test('records failed fetch', async () => {
      await recordFetchStart();
      await recordFetchResult({ total: 0, errors: 1 });
      const stats = await getStatsAsync();
      assert.strictEqual(stats.totals.totalErrors, 1);
    });
  });

  describe('recordFeedResult', () => {
    test('records per-feed metrics on success', async () => {
      await recordFeedResult('OpenAI Blog', { success: true, items: 5, etagHit: false });
      await recordFeedResult('OpenAI Blog', { success: true, items: 5, etagHit: true });
      await recordFeedResult('Hacker News', { success: true, items: 3, etagHit: false });

      const stats = await getStatsAsync();
      const openai = stats.feeds['openai-blog'];
      assert.strictEqual(openai.lastStatus, 'ok');
      assert.strictEqual(openai.itemsFetched, 10);
      assert.strictEqual(openai.etagHits, 1);
      assert(openai.lastFetch > 0);

      const hn = stats.feeds['hacker-news'];
      assert.strictEqual(hn.itemsFetched, 3);
      assert.strictEqual(hn.etagHits, 0);
    });

    test('records per-feed metrics on error', async () => {
      await recordFeedResult('Broken Feed', { success: false, error: 'timeout' });
      const stats = await getStatsAsync();
      const feed = stats.feeds['broken-feed'];
      assert.strictEqual(feed.lastStatus, 'error');
      assert.strictEqual(feed.lastError, 'timeout');
    });
  });

  describe('getStatsAsync', () => {
    test('includes scheduler state', async () => {
      const stats = await getStatsAsync();
      assert(typeof stats.scheduler === 'object');
      assert(typeof stats.scheduler.running === 'boolean');
      assert(typeof stats.scheduler.intervalMs === 'number');
    });

    test('aggregates totals correctly', async () => {
      await recordFetchStart();
      await recordFetchResult({ total: 15, errors: 0 });
      await recordFeedResult('Feed A', { success: true, items: 10, etagHit: false });
      await recordFeedResult('Feed B', { success: true, items: 5, etagHit: true });

      const stats = await getStatsAsync();
      // recordFetchResult tracks global totals (15)
      // recordFeedResult tracks per-feed items but NOT global totals
      assert.strictEqual(stats.totals.totalFetches, 1);
      assert.strictEqual(stats.totals.totalItems, 15); // Only from recordFetchResult
      assert.strictEqual(stats.totals.totalErrors, 0);
    });
  });

  describe('getFeedHealth', () => {
    test('returns health status for all feeds', async () => {
      // First record some stats for feeds to appear in health
      await recordFeedResult('OpenAI Blog', { success: true, items: 1 });
      await recordFeedResult('Hacker News', { success: true, items: 1 });

      const health = await getFeedHealth();
      assert.ok(Array.isArray(health));
      assert.ok(health.length > 0);

      const openai = health.find((f) => f.name === 'OpenAI Blog');
      assert.ok(openai);
      assert.ok(['healthy', 'degraded', 'failing', 'unknown'].includes(openai.status));
    });

    test('calculates success rate correctly', async () => {
      // Record some successes and failures
      for (let i = 0; i < 9; i++) {
        await recordFeedResult('Feed A', { success: true, items: 1 });
      }
      await recordFeedResult('Feed A', { success: false, error: 'timeout' });

      const health = await getFeedHealth();
      const feedA = health.find((f) => f.name === 'Feed A');
      assert.ok(feedA);
      assert.strictEqual(feedA.totalFetches, 10);
      assert.strictEqual(feedA.successfulFetches, 9);
      assert.strictEqual(feedA.failedFetches, 1);
      assert.strictEqual(feedA.successRate, 0.9);
    });

    test('marks feed as healthy when success rate >= 0.9 and recent success', async () => {
      // Record 10 successes
      for (let i = 0; i < 10; i++) {
        await recordFeedResult('Feed A', { success: true, items: 1 });
      }

      const health = await getFeedHealth();
      const feedA = health.find((f) => f.name === 'Feed A');
      assert.ok(feedA);
      assert.strictEqual(feedA.status, 'healthy');
    });

    test('marks feed as degraded when success rate < 0.5 but has recent success', async () => {
      // 1 success, 3 failures = 25% success rate, but has recent success
      await recordFeedResult('Feed A', { success: true, items: 1 });
      for (let i = 0; i < 3; i++) {
        await recordFeedResult('Feed A', { success: false, error: 'error' });
      }

      const health = await getFeedHealth();
      const feedA = health.find((f) => f.name === 'Feed A');
      assert.ok(feedA);
      // With recent success, status is "degraded" not "failing"
      assert.strictEqual(feedA.status, 'degraded');
    });
  });
});
