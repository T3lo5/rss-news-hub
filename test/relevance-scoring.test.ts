import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { newsRepository } from '../src/db/repositories/index.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

describe('Relevance scoring sentinel (NULL = unscored)', () => {
  let token: string;

  beforeEach(async () => {
    resetTestDb();
    getTestDb();

    const register = await request('POST', '/api/auth/register', {
      email: `relevance-${Date.now()}@test.com`,
      password: 'senha12345',
      name: 'Relevance Test',
    });
    assert.strictEqual(register.status, 201, register.raw);
    token = register.json.data.accessToken;
  });

  test('manually added news starts unscored (NULL), not 0', async () => {
    const created = await request(
      'POST',
      '/api/news',
      {
        title: 'Unscored article',
        link: 'https://example.com/unscored',
        description: 'fresh item',
      },
      bearer(token)
    );
    assert.strictEqual(created.status, 200, created.raw);

    const list = await request('GET', '/api/news', undefined, bearer(token));
    const item = list.json.data.find((n: any) => n.title === 'Unscored article');
    assert.ok(item, 'item must be listed');
    assert.strictEqual(item.relevanceScore, null);
  });

  test('upsert of a new item without score stores NULL', async () => {
    const saved = await newsRepository.upsert({
      id: 'rel-new-1',
      title: 'Fresh',
      link: 'https://example.com/rel-new-1',
      source: 'Test',
      pubDate: new Date(),
      description: 'd',
      content: 'c',
    } as any);

    assert.strictEqual(saved.relevanceScore, null);
  });

  test('upsert of an existing item preserves its score', async () => {
    await newsRepository.create({
      id: 'rel-keep-1',
      title: 'Original',
      link: 'https://example.com/rel-keep-1',
      source: 'Test',
      pubDate: new Date(),
      description: 'd',
      content: 'c',
      relevanceScore: 80,
    } as any);

    const updated = await newsRepository.upsert({
      id: 'rel-keep-1',
      title: 'Re-fetched title',
      link: 'https://example.com/rel-keep-1',
      source: 'Test',
      pubDate: new Date(),
      description: 'd2',
      content: 'c2',
    } as any);

    assert.strictEqual(updated.title, 'Re-fetched title');
    assert.strictEqual(updated.relevanceScore, 80);
  });

  test('findUnscored picks up NULL items for the scorer', async () => {
    await newsRepository.upsert({
      id: 'rel-queue-1',
      title: 'To score',
      link: 'https://example.com/rel-queue-1',
      source: 'Test',
      pubDate: new Date(),
      description: 'd',
      content: 'c',
    } as any);

    const unscored = await newsRepository.findUnscored();
    assert.ok(
      unscored.some((n) => n.id === 'rel-queue-1'),
      'NULL-scored item must be found by findUnscored'
    );
  });
});
