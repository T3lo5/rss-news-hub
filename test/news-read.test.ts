import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { newsRepository } from '../src/db/repositories/index.js';
import * as schema from '../src/db/schema.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

const LINK = 'https://example.com/read-state';

async function registerUser(email: string): Promise<string> {
  const res = await request('POST', '/api/auth/register', {
    email,
    password: 'senha12345',
    name: 'Read State',
  });
  assert.strictEqual(res.status, 201, res.raw);
  return res.json.data.accessToken;
}

async function createNews(token: string, link: string): Promise<string> {
  const res = await request(
    'POST',
    '/api/news',
    { title: 'Readable article', link, description: 'body' },
    bearer(token)
  );
  assert.strictEqual(res.status, 200, res.raw);
  return res.json.data.id;
}

async function fetchReadAt(token: string, id: string) {
  const res = await request('GET', '/api/news', undefined, bearer(token));
  assert.strictEqual(res.status, 200, res.raw);
  const item = res.json.data.results.find((entry: any) => entry.id === id);
  return item ? item.readAt : 'missing';
}

describe('News read state', () => {
  let token: string;
  let newsId: string;

  beforeEach(async () => {
    resetTestDb();
    getTestDb();
    token = await registerUser(`read-${Date.now()}@test.com`);
    newsId = await createNews(token, LINK);
  });

  test('new items start unread', async () => {
    assert.strictEqual(await fetchReadAt(token, newsId), null);
  });

  test('PATCH marks as read and GET reflects it', async () => {
    const res = await request(
      'PATCH',
      `/api/news/${encodeURIComponent(newsId)}/read`,
      { read: true },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.read, true);
    assert.ok(res.json.data.readAt, 'readAt must be returned');

    const readAt = await fetchReadAt(token, newsId);
    assert.ok(readAt, 'GET /api/news must expose the read state');
    assert.ok(new Date(readAt).getTime() > 0);
  });

  test('PATCH is idempotent and unmarking clears the state', async () => {
    const path = `/api/news/${encodeURIComponent(newsId)}/read`;

    const first = await request('PATCH', path, { read: true }, bearer(token));
    const second = await request('PATCH', path, { read: true }, bearer(token));
    assert.strictEqual(second.status, 200, second.raw);
    // Re-marking must not rewrite the original timestamp.
    assert.strictEqual(second.json.data.readAt, first.json.data.readAt);

    const cleared = await request('PATCH', path, { read: false }, bearer(token));
    assert.strictEqual(cleared.status, 200, cleared.raw);
    assert.strictEqual(cleared.json.data.readAt, null);
    assert.strictEqual(await fetchReadAt(token, newsId), null);

    // Unmarking twice is still a success.
    const again = await request('PATCH', path, { read: false }, bearer(token));
    assert.strictEqual(again.status, 200, again.raw);
  });

  test('read state is per user', async () => {
    const otherToken = await registerUser(`read-other-${Date.now()}@test.com`);

    await request(
      'PATCH',
      `/api/news/${encodeURIComponent(newsId)}/read`,
      { read: true },
      bearer(token)
    );

    assert.ok(await fetchReadAt(token, newsId));
    assert.strictEqual(
      await fetchReadAt(otherToken, newsId),
      null,
      'another user must still see it as unread'
    );
  });

  test('rejects a missing boolean payload with 400', async () => {
    const res = await request(
      'PATCH',
      `/api/news/${encodeURIComponent(newsId)}/read`,
      { read: 'yes' },
      bearer(token)
    );

    assert.strictEqual(res.status, 400, res.raw);
  });

  test('unknown news id returns 404', async () => {
    const res = await request(
      'PATCH',
      `/api/news/${encodeURIComponent('https://example.com/missing')}/read`,
      { read: true },
      bearer(token)
    );

    assert.strictEqual(res.status, 404, res.raw);
  });

  test('rejects a malformed id instead of hanging', async () => {
    const res = await request('PATCH', '/api/news/%E0%A4%A/read', { read: true }, bearer(token));

    assert.strictEqual(res.status, 400, res.raw);
  });

  test('requires authentication', async () => {
    const res = await request('PATCH', `/api/news/${encodeURIComponent(newsId)}/read`, {
      read: true,
    });

    assert.strictEqual(res.status, 401, res.raw);
  });

  test('deleting the news item cascades the read state', async () => {
    await request(
      'PATCH',
      `/api/news/${encodeURIComponent(newsId)}/read`,
      { read: true },
      bearer(token)
    );

    // Retention prunes news every day; the FK cascade must not leave orphan
    // rows that would resurrect a stale "read" if the link is fetched again.
    assert.strictEqual(await newsRepository.delete(newsId), true);

    const db = getTestDb();
    const orphans = await db
      .select()
      .from(schema.newsReads)
      .where(eq(schema.newsReads.newsId, newsId));
    assert.strictEqual(orphans.length, 0, 'read rows must cascade with the news item');

    const recreated = await createNews(token, LINK);
    assert.strictEqual(await fetchReadAt(token, recreated), null);
  });
});
