import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import {
  __resetIndex,
  addToIndex,
  isDuplicate,
  linkHash,
  loadHashIndex,
  normalizeUrl,
} from '../services/deduplication.js';
import { schema } from '../src/db/index.js';
import { newsHashRepository } from '../src/db/repositories/index.js';
import { getTestDb, insertTestFeed, resetTestDb, testFixtures } from './setup.js';

describe('Feed Deduplication (DB-backed)', () => {
  beforeEach(() => {
    resetTestDb();
    __resetIndex();
  });

  describe('normalizeUrl', () => {
    test('strips tracking parameters', () => {
      const url =
        'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=test';
      const normalized = normalizeUrl(url);
      assert.strictEqual(normalized, 'https://example.com/article/');
    });

    test('strips fbclid and gclid', () => {
      const url = 'https://example.com/article?fbclid=123&gclid=456';
      const normalized = normalizeUrl(url);
      assert.strictEqual(normalized, 'https://example.com/article/');
    });

    test('preserves non-tracking params', () => {
      const url = 'https://example.com/article?page=2&sort=date';
      const normalized = normalizeUrl(url);
      assert.ok(normalized.includes('page=2'));
      assert.ok(normalized.includes('sort=date'));
    });

    test('handles URL without query', () => {
      const url = 'https://example.com/article';
      const normalized = normalizeUrl(url);
      assert.strictEqual(normalized, 'https://example.com/article/');
    });

    test('case insensitive domain', () => {
      const url = 'HTTPS://EXAMPLE.COM/Article?UTM_SOURCE=test';
      const normalized = normalizeUrl(url);
      assert.strictEqual(normalized, 'https://example.com/article/');
    });
  });

  describe('linkHash', () => {
    test('produces consistent hash for same URL', () => {
      const hash1 = linkHash('https://example.com/article');
      const hash2 = linkHash('https://example.com/article');
      assert.strictEqual(hash1, hash2);
    });

    test('same hash for URLs with different tracking params', () => {
      const hash1 = linkHash('https://example.com/article?utm_source=twitter');
      const hash2 = linkHash('https://example.com/article?utm_source=facebook');
      assert.strictEqual(hash1, hash2);
    });

    test('different hash for different articles', () => {
      const hash1 = linkHash('https://example.com/article1');
      const hash2 = linkHash('https://example.com/article2');
      assert.notStrictEqual(hash1, hash2);
    });

    test('hash is 16 characters', () => {
      const hash = linkHash('https://example.com/article');
      assert.strictEqual(hash.length, 16);
    });
  });

  describe('Hash Index (Database)', () => {
    test('loadHashIndex loads existing hashes from database', async () => {
      // Add some hashes directly to database
      const db = getTestDb();
      await db.insert(schema.newsHashes).values([
        { hash: 'hash1', newsId: 'id1' },
        { hash: 'hash2', newsId: 'id2' },
      ]);

      await loadHashIndex();
      const exists1 = await isDuplicate('hash1');
      const exists2 = await isDuplicate('hash2');
      assert.ok(exists1, 'hash1 should exist');
      assert.ok(exists2, 'hash2 should exist');
    });

    test('isDuplicate returns false for new hash', async () => {
      const result = await isDuplicate('newhash');
      assert.ok(!result, 'New hash should not be duplicate');
    });

    test('isDuplicate returns true for existing hash', async () => {
      await addToIndex('existinghash', 'news-id-1');
      const result = await isDuplicate('existinghash');
      assert.ok(result, 'Existing hash should be duplicate');
    });

    test('addToIndex adds hash to database', async () => {
      await addToIndex('hash123', 'news-456');

      const db = getTestDb();
      const found = await db
        .select()
        .from(schema.newsHashes)
        .where(eq(schema.newsHashes.hash, 'hash123'));

      assert.ok(found.length > 0, 'Hash should be in database');
      assert.strictEqual(found[0].newsId, 'news-456');
    });

    test('duplicate detection works across fetches', async () => {
      const url = 'https://example.com/article?utm_source=twitter';
      const hash = linkHash(url);

      // First time - not duplicate
      const first = await isDuplicate(hash);
      assert.ok(!first);

      // Add to index
      await addToIndex(hash, 'news-1');

      // Second time - should be duplicate
      const second = await isDuplicate(hash);
      assert.ok(second);
    });

    test('different tracking params produce same hash', async () => {
      const hash1 = linkHash('https://example.com/article?utm_source=twitter');
      const hash2 = linkHash('https://example.com/article?utm_source=facebook');

      assert.strictEqual(hash1, hash2);

      await addToIndex(hash1, 'news-1');
      const isDup = await isDuplicate(hash2);
      assert.ok(isDup, 'Should detect duplicate despite different tracking params');
    });
  });
});
