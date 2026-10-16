import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

describe('Bookmarks API', () => {
  let token: string;
  let newsId: string;

  beforeEach(async () => {
    resetTestDb();
    getTestDb();

    const register = await request('POST', '/api/auth/register', {
      email: `bookmarks-${Date.now()}@test.com`,
      password: 'senha12345',
      name: 'Bookmarks Test',
    });
    assert.strictEqual(register.status, 201, register.raw);
    token = register.json.data.accessToken;

    const created = await request(
      'POST',
      '/api/news',
      {
        title: 'Bookmarkable article',
        link: 'https://example.com/bookmarkable',
        description: 'article to bookmark',
      },
      bearer(token)
    );
    assert.strictEqual(created.status, 200, created.raw);
    newsId = created.json.data.id;
  });

  test('POST /api/bookmarks adds a bookmark (regression: must not hang)', async () => {
    const res = await request('POST', '/api/bookmarks', { newsId }, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.ok, true);
    assert.strictEqual(res.json.data.newsId, newsId);
  });

  test('GET /api/bookmarks lists added bookmarks', async () => {
    await request('POST', '/api/bookmarks', { newsId }, bearer(token));

    const res = await request('GET', '/api/bookmarks', undefined, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    assert.ok(Array.isArray(res.json.data));
    assert.ok(res.json.data.some((b: any) => b.newsId === newsId));
  });

  test('POST /api/bookmarks rejects missing newsId with 400', async () => {
    const res = await request('POST', '/api/bookmarks', {}, bearer(token));

    assert.strictEqual(res.status, 400, res.raw);
  });

  test('POST /api/bookmarks rejects unknown newsId with 404', async () => {
    const res = await request(
      'POST',
      '/api/bookmarks',
      { newsId: 'https://example.com/does-not-exist' },
      bearer(token)
    );

    assert.strictEqual(res.status, 404, res.raw);
  });

  test('DELETE /api/bookmarks/:newsId removes a bookmark', async () => {
    await request('POST', '/api/bookmarks', { newsId }, bearer(token));

    const del = await request('DELETE', `/api/bookmarks/${newsId}`, undefined, bearer(token));

    assert.strictEqual(del.status, 200, del.raw);
    assert.strictEqual(del.json.data.removed, true);

    const list = await request('GET', '/api/bookmarks', undefined, bearer(token));
    assert.ok(!list.json.data.some((b: any) => b.newsId === newsId));
  });
});
