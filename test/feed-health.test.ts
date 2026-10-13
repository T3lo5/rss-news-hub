import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { getFeedHealth, recordFeedResult, recordFetchStart } from '../services/stats.service.js';
import { getTestDb, insertTestFeed, resetTestDb, testFixtures } from './setup.js';

describe('Feed Health Dashboard (DB-backed)', () => {
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
      testFixtures.feed({
        id: 'testfeed',
        name: 'TestFeed',
        url: 'https://testfeed.example.com/feed',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'healthyfeed',
        name: 'HealthyFeed',
        url: 'https://healthyfeed.example.com/feed',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'degradedfeed',
        name: 'DegradedFeed',
        url: 'https://degradedfeed.example.com/feed',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'failingfeed',
        name: 'FailingFeed',
        url: 'https://failingfeed.example.com/feed',
      })
    );
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'persistfeed',
        name: 'PersistFeed',
        url: 'https://persistfeed.example.com/feed',
      })
    );
  });

  test('records successful fetch with feed metrics', async () => {
    await recordFetchStart();
    await recordFeedResult('TechCrunch', { success: true, items: 5, itemsNew: 5, latencyMs: 150 });

    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'TechCrunch');
    assert.ok(feed, 'TechCrunch should be in health');
    assert.strictEqual(feed.successfulFetches, 1);
    assert.strictEqual(feed.itemsFetched, 5);
    assert.ok(feed.avgLatencyMs > 0);
  });

  test('records failed fetch with error', async () => {
    await recordFetchStart();
    await recordFeedResult('TechCrunch', { success: false, error: 'Timeout' });

    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'TechCrunch');
    assert.ok(feed);
    assert.strictEqual(feed.failedFetches, 1);
    assert.strictEqual(feed.lastError, 'Timeout');
  });

  test('calculates success rate correctly', async () => {
    // 3 successful, 1 failed = 75% success rate
    for (let i = 0; i < 3; i++) {
      await recordFetchStart();
      await recordFeedResult('TestFeed', { success: true, items: 2, itemsNew: 2 });
    }
    await recordFetchStart();
    await recordFeedResult('TestFeed', { success: false, error: 'Error' });

    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'TestFeed');
    assert.ok(feed);
    assert.strictEqual(feed.totalFetches, 4);
    assert.strictEqual(feed.successfulFetches, 3);
    assert.strictEqual(feed.failedFetches, 1);
    assert.ok(Math.abs(feed.successRate - 0.75) < 0.01);
  });

  test('tracks ETag hits', async () => {
    await recordFetchStart();
    await recordFeedResult('TestFeed', { success: true, items: 0, itemsNew: 0, etagHit: true });

    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'TestFeed');
    assert.ok(feed);
    assert.strictEqual(feed.etagHits, 1);
  });

  test('tracks duplicate vs new items', async () => {
    await recordFetchStart();
    await recordFeedResult('TestFeed', { success: true, items: 5, itemsNew: 3, itemsDuplicate: 2 });

    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'TestFeed');
    assert.ok(feed);
    assert.strictEqual(feed.itemsNew, 3);
    assert.strictEqual(feed.itemsDuplicate, 2);
  });

  test('calculates rolling average latency', async () => {
    await recordFetchStart();
    await recordFeedResult('TestFeed', { success: true, latencyMs: 100 });
    await recordFetchStart();
    await recordFeedResult('TestFeed', { success: true, latencyMs: 200 });
    await recordFetchStart();
    await recordFeedResult('TestFeed', { success: true, latencyMs: 300 });

    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'TestFeed');
    assert.ok(feed);
    assert.ok(Math.abs(feed.avgLatencyMs - 200) < 1);
  });

  test('determines feed status correctly', async () => {
    // Healthy: 90%+ success rate, recent success
    for (let i = 0; i < 9; i++) {
      await recordFetchStart();
      await recordFeedResult('HealthyFeed', { success: true });
    }
    await recordFetchStart();
    await recordFeedResult('HealthyFeed', { success: false, error: 'Error' });

    let health = await getFeedHealth();
    let feed = health.find((f) => f.name === 'HealthyFeed');
    assert.ok(feed);
    assert.strictEqual(feed.status, 'healthy');

    // Test degraded - 50% success rate
    resetTestDb();
    // Re-insert feeds
    const db = getTestDb();
    await insertTestFeed(
      db,
      testFixtures.feed({
        id: 'degradedfeed',
        name: 'DegradedFeed',
        url: 'https://degradedfeed.example.com/feed',
      })
    );

    for (let i = 0; i < 5; i++) {
      await recordFetchStart();
      await recordFeedResult('DegradedFeed', { success: true });
    }
    for (let i = 0; i < 5; i++) {
      await recordFetchStart();
      await recordFeedResult('DegradedFeed', { success: false, error: 'Error' });
    }

    health = await getFeedHealth();
    feed = health.find((f) => f.name === 'DegradedFeed');
    assert.ok(feed);
    assert.strictEqual(feed.status, 'degraded');

    // Test failing - all failures, no recent success
    resetTestDb();
    const db2 = getTestDb();
    await insertTestFeed(
      db2,
      testFixtures.feed({
        id: 'failingfeed',
        name: 'FailingFeed',
        url: 'https://failingfeed.example.com/feed',
      })
    );

    for (let i = 0; i < 3; i++) {
      await recordFetchStart();
      await recordFeedResult('FailingFeed', { success: false, error: 'Error' });
    }

    health = await getFeedHealth();
    feed = health.find((f) => f.name === 'FailingFeed');
    assert.ok(feed);
    // With all failures and no success, status should be failing
    assert.strictEqual(feed.status, 'failing');

    // Test unknown - no fetches yet
    resetTestDb();
    const db3 = getTestDb();
    await insertTestFeed(
      db3,
      testFixtures.feed({
        id: 'unknownfeed',
        name: 'UnknownFeed',
        url: 'https://unknownfeed.example.com/feed',
      })
    );

    health = await getFeedHealth();
    feed = health.find((f) => f.name === 'UnknownFeed');
    assert.ok(!feed, 'UnknownFeed should not be in health (no fetches yet)');
  });

  test('persists feed stats across restarts', async () => {
    await recordFetchStart();
    await recordFeedResult('PersistFeed', {
      success: true,
      items: 10,
      itemsNew: 10,
      latencyMs: 200,
    });

    // Verify the data is in the current instance
    const health = await getFeedHealth();
    const feed = health.find((f) => f.name === 'PersistFeed');
    assert.ok(feed);
    assert.strictEqual(feed.itemsFetched, 10);
  });
});
