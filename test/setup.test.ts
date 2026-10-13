import assert from 'node:assert';
import { after, beforeEach, describe, it } from 'node:test';
import {
  bookmarkRepository,
  feedCacheRepository,
  feedRepository,
  feedStatsRepository,
  globalStatsRepository,
  newsHashRepository,
  newsletterHistoryRepository,
  newsRepository,
  telegramQueueRepository,
  templateRepository,
  userProfileRepository,
} from '../src/db/repositories/index.js';
import * as schema from '../src/db/schema.js';
import {
  closeTestDb,
  getTestDb,
  insertTestFeed,
  insertTestNews,
  resetTestDb,
  testFixtures,
} from './setup.js';

const db = getTestDb();

describe('Test Infrastructure', () => {
  beforeEach(() => {
    resetTestDb();
  });

  after(() => {
    closeTestDb();
  });

  it('should create test database and run migrations', () => {
    assert.ok(db, 'Database should be initialized');
  });

  it('should insert and retrieve feed', async () => {
    const feed = testFixtures.feed({ name: 'Test Feed 1' });
    await insertTestFeed(db, feed);

    const found = await feedRepository.findById(feed.id);
    assert.ok(found, 'Feed should be found');
    assert.strictEqual(found!.name, 'Test Feed 1');
  });

  it('should insert and retrieve news item', async () => {
    // Need feed first for FK
    await insertTestFeed(db, testFixtures.feed({ id: 'test-feed' }));

    const news = testFixtures.newsItem({ id: 'news-1', feedId: 'test-feed' });
    await insertTestNews(db, news);

    const found = await newsRepository.findById('news-1');
    assert.ok(found, 'News should be found');
    assert.strictEqual(found!.title, 'Test Article');
  });

  it('should test feed cache repository', async () => {
    await insertTestFeed(db, testFixtures.feed({ id: 'feed-1' }));

    await feedCacheRepository.set('feed-1', 'test-etag', 'test-last-modified');
    const cached = await feedCacheRepository.get('feed-1');

    assert.ok(cached, 'Cache should exist');
    assert.strictEqual(cached!.etag, 'test-etag');
    assert.strictEqual(cached!.lastModified, 'test-last-modified');
  });

  it('should test feed stats repository', async () => {
    await insertTestFeed(db, testFixtures.feed({ id: 'feed-1' }));

    await feedStatsRepository.recordFeedResult('feed-1', 'Test Feed', {
      success: true,
      items: 5,
      itemsNew: 3,
      itemsDuplicate: 2,
      etagHit: false,
      latencyMs: 100,
    });

    const stats = await feedStatsRepository.get('feed-1');
    assert.ok(stats, 'Stats should exist');
    assert.strictEqual(stats!.successfulFetches, 1);
    assert.strictEqual(stats!.itemsFetched, 5);
    assert.strictEqual(stats!.itemsNew, 3);
  });

  it('should test global stats repository', async () => {
    // Ensure global stats row exists
    const db = getTestDb();
    await db.insert(schema.globalStats).values({ id: 'global' }).onConflictDoNothing();

    await globalStatsRepository.incrementFetches();
    await globalStatsRepository.recordFetchResult(10, 0);

    const stats = await globalStatsRepository.get();
    assert.strictEqual(stats.totalFetches, 1);
    assert.strictEqual(stats.totalItems, 10);
    assert.strictEqual(stats.totalErrors, 0);
  });

  it('should test news hash repository', async () => {
    await insertTestFeed(db, testFixtures.feed({ id: 'test-feed' }));
    await insertTestNews(db, testFixtures.newsItem({ id: 'news-1', feedId: 'test-feed' }));

    await newsHashRepository.add('test-hash-1', 'news-1');
    const exists = await newsHashRepository.exists('test-hash-1');
    assert.ok(exists, 'Hash should exist');

    const found = await newsHashRepository.findByHash('test-hash-1');
    assert.strictEqual(found!.newsId, 'news-1');
  });

  it('should test user profile repository', async () => {
    const profile = await userProfileRepository.get();
    assert.ok(profile, 'Default profile should exist');
    assert.ok(JSON.parse(profile.keywords).includes('AI'));

    await userProfileRepository.update('default', {
      keywords: ['Rust', 'Go'],
    });

    const updated = await userProfileRepository.get();
    assert.ok(JSON.parse(updated.keywords).includes('Rust'));
  });

  it('should test bookmark repository', async () => {
    await insertTestFeed(db, testFixtures.feed({ id: 'test-feed' }));
    await insertTestNews(db, testFixtures.newsItem({ id: 'news-1', feedId: 'test-feed' }));

    const bm = await bookmarkRepository.add(testFixtures.bookmark({ newsId: 'news-1' }));
    assert.ok(bm, 'Bookmark should be created');

    const found = await bookmarkRepository.findByNewsId('news-1');
    assert.ok(found, 'Bookmark should be found');

    const removed = await bookmarkRepository.remove('news-1');
    assert.ok(removed, 'Bookmark should be removed');
  });

  it('should test newsletter history repository', async () => {
    const entry = await newsletterHistoryRepository.add(testFixtures.newsletterHistory());
    assert.ok(entry, 'History entry should be created');

    const history = await newsletterHistoryRepository.findAll();
    assert.strictEqual(history.length, 1);
  });

  it('should test telegram queue repository', async () => {
    const msg = await telegramQueueRepository.add(testFixtures.telegramQueue());
    assert.ok(msg, 'Queue message should be created');

    const pending = await telegramQueueRepository.findPending();
    assert.strictEqual(pending.length, 1);

    await telegramQueueRepository.updateStatus(msg.id, 'sent');
    const sent = await telegramQueueRepository.findById(msg.id);
    assert.strictEqual(sent!.status, 'sent');
  });

  it('should test template repository', async () => {
    const templates = await templateRepository.findAll();
    assert.ok(templates.length >= 5, 'Should have built-in templates');

    const threadDefault = await templateRepository.findById('thread-default');
    assert.ok(threadDefault, 'Thread default template should exist');
    assert.strictEqual(threadDefault!.isBuiltin, true);

    // Cannot modify built-in
    await assert.rejects(
      templateRepository.update('thread-default', { name: 'Modified' }),
      /Cannot modify built-in/
    );

    // Can create custom
    const custom = await templateRepository.create(testFixtures.template({ id: 'custom-1' }));
    assert.strictEqual(custom.id, 'custom-1');
    assert.strictEqual(custom.isBuiltin, false);
  });

  it('should test factory functions create valid data', () => {
    const feed = testFixtures.feed();
    assert.ok(feed.id.startsWith('feed-'));
    assert.strictEqual(feed.enabled, true);

    const news = testFixtures.newsItem();
    assert.ok(news.id.startsWith('news-'));
    assert.ok(news.pubDate instanceof Date);

    const template = testFixtures.template();
    assert.ok(template.id.startsWith('template-'));
    assert.strictEqual(template.isBuiltin, false);
  });
});

console.log('Test infrastructure validation complete!');
