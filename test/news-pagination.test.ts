import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { newsReadRepository, newsRepository } from '../src/db/repositories/index.js';
import type { NewNewsItem } from '../src/db/schema.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

const PAGE_SIZE = 48;

async function registerUser(email: string): Promise<string> {
  const res = await request('POST', '/api/auth/register', {
    email,
    password: 'senha12345',
    name: 'Pagination Test',
  });
  assert.strictEqual(res.status, 201, res.raw);
  return res.json.data.accessToken;
}

function buildItems(count: number): NewNewsItem[] {
  const base = Date.UTC(2026, 9, 1, 12, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    id: `page-${String(i).padStart(2, '0')}`,
    title: i === 7 ? 'Unique quantum article' : `Article ${i}`,
    link: `https://example.com/page/${i}`,
    source: i % 2 === 0 ? 'Source A' : 'Source B',
    // descrição pesquisável só em alguns itens
    description: i % 5 === 0 ? `alpha body ${i}` : `body ${i}`,
    pubDate: new Date(base + i * 60_000),
    relevanceScore: i % 10,
  }));
}

async function list(token: string, query = '') {
  const res = await request(
    'GET',
    `/api/news${query ? `?${query}` : ''}`,
    undefined,
    bearer(token)
  );
  assert.strictEqual(res.status, 200, res.raw);
  return { body: res.json.data, headers: res.headers };
}

describe('GET /api/news pagination and filters', () => {
  let token: string;

  beforeEach(async () => {
    resetTestDb();
    getTestDb();
    token = await registerUser(`page-${Date.now()}@test.com`);
    await newsRepository.createMany(buildItems(60));
  });

  test('default page returns 48 of 60 with totals, counters and header', async () => {
    const { body, headers } = await list(token);

    assert.strictEqual(body.limit, PAGE_SIZE);
    assert.strictEqual(body.offset, 0);
    assert.strictEqual(body.results.length, PAGE_SIZE);
    assert.strictEqual(body.total, 60);
    assert.deepStrictEqual(body.counts, { all: 60, unread: 60, read: 0 });
    assert.deepStrictEqual(body.sources, ['Source A', 'Source B']);
    assert.strictEqual(headers['cache-control'], 'private, max-age=15');

    // newest first, deterministic tiebreaker by id
    assert.strictEqual(body.results[0].id, 'page-59');
    assert.strictEqual(body.results[47].id, 'page-12');
  });

  test('offset returns the next page', async () => {
    const first = await list(token, 'limit=20&offset=0');
    const second = await list(token, 'limit=20&offset=20');

    assert.strictEqual(first.body.results.length, 20);
    assert.strictEqual(second.body.results.length, 20);
    assert.strictEqual(first.body.total, 60);
    assert.strictEqual(second.body.total, 60);
    assert.strictEqual(first.body.results[0].id, 'page-59');
    assert.strictEqual(second.body.results[0].id, 'page-39');

    const ids = new Set([...first.body.results, ...second.body.results].map((n: any) => n.id));
    assert.strictEqual(ids.size, 40, 'pages must not overlap');
  });

  test('last page is partial and offset past the end is empty', async () => {
    const tail = await list(token, 'limit=20&offset=50');
    const past = await list(token, 'limit=20&offset=500');

    assert.strictEqual(tail.body.results.length, 10);
    assert.strictEqual(tail.body.results[0].id, 'page-09');
    assert.strictEqual(past.body.results.length, 0);
    assert.strictEqual(past.body.total, 60);
  });

  test('q searches title, source and description (case-insensitive) and updates total', async () => {
    const title = await list(token, 'q=quantum');
    assert.strictEqual(title.body.total, 1);
    assert.strictEqual(title.body.results[0].id, 'page-07');

    const upper = await list(token, 'q=QUANTUM');
    assert.strictEqual(upper.body.total, 1);

    const source = await list(token, 'q=source%20b');
    assert.strictEqual(source.body.total, 30);
    assert.ok(source.body.results.every((n: any) => n.source === 'Source B'));

    const description = await list(token, 'q=alpha');
    assert.strictEqual(description.body.total, 12);
    assert.deepStrictEqual(description.body.counts, { all: 12, unread: 12, read: 0 });
  });

  test('source filter narrows results and counters', async () => {
    const { body } = await list(token, 'source=Source%20A');

    assert.strictEqual(body.total, 30);
    assert.strictEqual(body.results.length, 30);
    assert.ok(body.results.every((n: any) => n.source === 'Source A'));
    assert.deepStrictEqual(body.counts, { all: 30, unread: 30, read: 0 });
    // A lista de fontes continua completa para o seletor não perder opções.
    assert.deepStrictEqual(body.sources, ['Source A', 'Source B']);
  });

  test('sort=oldest and sort=relevance order on the server', async () => {
    const oldest = await list(token, 'sort=oldest&limit=5');
    assert.strictEqual(oldest.body.results[0].id, 'page-00');

    const relevance = await list(token, 'sort=relevance&limit=5');
    const scores = relevance.body.results.map((n: any) => n.relevanceScore);
    assert.deepStrictEqual(scores, [9, 9, 9, 9, 9]);
    assert.strictEqual(relevance.body.results[0].id, 'page-59');
  });

  test('read filter uses the caller state and keeps all counters', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `page-${String(i).padStart(2, '0')}`);
    for (const id of ids) await newsReadRepository.setRead(tokenUserId(token), id, true);

    const all = await list(token);
    assert.deepStrictEqual(all.body.counts, { all: 60, unread: 50, read: 10 });
    assert.strictEqual(all.body.total, 60);

    const unread = await list(token, 'read=unread&limit=100');
    assert.strictEqual(unread.body.total, 50);
    assert.strictEqual(unread.body.results.length, 50);
    assert.ok(unread.body.results.every((n: any) => n.readAt === null));

    const read = await list(token, 'read=read&limit=100');
    assert.strictEqual(read.body.total, 10);
    assert.strictEqual(read.body.results.length, 10);
    assert.ok(read.body.results.every((n: any) => n.readAt));
    assert.deepStrictEqual(read.body.counts, { all: 60, unread: 50, read: 10 });
  });

  test('read state is per user', async () => {
    await newsReadRepository.setRead(tokenUserId(token), 'page-00', true);
    const otherToken = await registerUser(`page-other-${Date.now()}@test.com`);

    const mine = await list(token, 'read=read');
    const other = await list(otherToken, 'read=read');

    assert.strictEqual(mine.body.total, 1);
    assert.strictEqual(other.body.total, 0);
    assert.deepStrictEqual(other.body.counts, { all: 60, unread: 60, read: 0 });
  });

  test('invalid params fall back to safe defaults', async () => {
    const fallback = await list(token, 'sort=bogus&read=bogus&limit=abc&offset=-5');
    assert.strictEqual(fallback.body.limit, PAGE_SIZE);
    assert.strictEqual(fallback.body.offset, 0);
    assert.strictEqual(fallback.body.results[0].id, 'page-59');

    const clamped = await list(token, 'limit=500');
    assert.strictEqual(clamped.body.limit, 100);
    assert.strictEqual(clamped.body.results.length, 60);
  });

  test('q, source and read filters combine', async () => {
    await newsReadRepository.setRead(tokenUserId(token), 'page-09', true);

    const { body } = await list(token, 'q=article&source=Source%20B&read=read');
    assert.strictEqual(body.total, 1);
    assert.strictEqual(body.results[0].id, 'page-09');
    assert.deepStrictEqual(body.counts, { all: 30, unread: 29, read: 1 });
  });
});

/** `registerUser` returns the JWT, but read rows are keyed by user id. */
function tokenUserId(token: string): string {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return payload.sub;
}
