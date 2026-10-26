import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { retention } from '../server.config.js';
import { createUser } from '../services/auth.service.js';
import { runRetentionCleanup } from '../services/retention.service.js';
import { bookmarkRepository, newsRepository } from '../src/db/repositories/index.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@test.com`;
}

async function tokenFor(role: 'admin' | 'user'): Promise<string> {
  const email = uniqueEmail(`retention-${role}`);
  await createUser(email, 'senha12345', `Retention ${role}`, role);
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

async function userIdFor(role: 'admin' | 'user'): Promise<string> {
  const email = uniqueEmail(`retention-${role}`);
  const created = await createUser(email, 'senha12345', `Retention ${role}`, role);
  return created.id;
}

const DAY = 24 * 60 * 60 * 1000;

async function seedNews(id: string, ageDays: number, score: number | null = null) {
  await newsRepository.create({
    id,
    title: `Item ${id}`,
    link: `https://example.com/${id}`,
    source: 'Example',
    pubDate: new Date(Date.now() - ageDays * DAY),
    relevanceScore: score,
  });
}

// The score rule reads the live config object, so tests set it explicitly and
// restore it afterwards instead of relying on whatever the environment has.
function withScoreCleanup(lowScoreDays: number, lowScoreThreshold: number) {
  const previousDays = retention.lowScoreDays;
  const previousThreshold = retention.lowScoreThreshold;
  retention.lowScoreDays = lowScoreDays;
  retention.lowScoreThreshold = lowScoreThreshold;
  return () => {
    retention.lowScoreDays = previousDays;
    retention.lowScoreThreshold = previousThreshold;
  };
}

async function seedBookmark(userId: string, newsId: string) {
  const news = await newsRepository.findById(newsId);
  if (!news) throw new Error(`seedBookmark: news ${newsId} not found`);
  await bookmarkRepository.add(userId, {
    id: `bm-${newsId}`,
    newsId,
    title: news.title,
    link: news.link,
    source: news.source,
  });
}

describe('retention API', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
  });

  // Um hub de RSS acumula centenas de itens por semana, então a instalação
  // nova tem que limper depois de si mesma; 0 continua desligando a regra.
  test('ships with pruning enabled by default', () => {
    if (process.env.NEWS_RETENTION_DAYS || process.env.NEWS_LOW_SCORE_DAYS) return;

    assert.ok(retention.retentionDays > 0, `retentionDays=${retention.retentionDays}`);
    assert.ok(retention.lowScoreDays > 0, `lowScoreDays=${retention.lowScoreDays}`);
  });

  test('is admin-only', async () => {
    const anon = await request('GET', '/api/settings/retention');
    assert.strictEqual(anon.status, 401, anon.raw);

    const userToken = await tokenFor('user');
    const forbidden = await request('GET', '/api/settings/retention', undefined, bearer(userToken));
    assert.strictEqual(forbidden.status, 403, forbidden.raw);
  });

  test('PUT /api/settings/retention validates and persists the window', async () => {
    const token = await tokenFor('admin');

    const invalid = await request(
      'PUT',
      '/api/settings/retention',
      { retentionDays: -1 },
      bearer(token)
    );
    assert.strictEqual(invalid.status, 400, invalid.raw);

    const ok = await request(
      'PUT',
      '/api/settings/retention',
      { retentionDays: 30 },
      bearer(token)
    );
    assert.strictEqual(ok.status, 200, ok.raw);
    assert.strictEqual(ok.json.data.retentionDays, 30);

    const read = await request('GET', '/api/settings/retention', undefined, bearer(token));
    assert.strictEqual(read.json.data.retentionDays, 30);
  });

  test('POST /api/news/prune deletes only items older than the cutoff', async () => {
    const token = await tokenFor('admin');
    await seedNews('old-1', 40);
    await seedNews('old-2', 31);
    await seedNews('fresh', 1);

    const res = await request('POST', '/api/news/prune', { retentionDays: 30 }, bearer(token));
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.deleted, 2);
    assert.strictEqual(await newsRepository.count(), 1);

    const remaining = await newsRepository.findAll();
    assert.strictEqual(remaining[0].id, 'fresh');
  });

  test('runRetentionCleanup is a no-op when both rules are disabled', async () => {
    await seedNews('very-old', 1000);

    // The score rule is independent of the age window and is on by default,
    // so "disabled" has to mean both rules off.
    const restore = withScoreCleanup(0, 0);
    try {
      const result = await runRetentionCleanup(0);
      assert.strictEqual(result.skipped, true);
      assert.strictEqual(result.deleted, 0);
      assert.strictEqual(await newsRepository.count(), 1);
    } finally {
      restore();
    }
  });

  test('PUT /api/settings/retention persists the low-score rule', async () => {
    const token = await tokenFor('admin');

    const invalid = await request(
      'PUT',
      '/api/settings/retention',
      { retentionDays: 30, lowScoreThreshold: 101 },
      bearer(token)
    );
    assert.strictEqual(invalid.status, 400, invalid.raw);

    const ok = await request(
      'PUT',
      '/api/settings/retention',
      { retentionDays: 30, lowScoreDays: 14, lowScoreThreshold: 25 },
      bearer(token)
    );
    assert.strictEqual(ok.status, 200, ok.raw);
    assert.strictEqual(ok.json.data.lowScoreDays, 14);
    assert.strictEqual(ok.json.data.lowScoreThreshold, 25);

    const read = await request('GET', '/api/settings/retention', undefined, bearer(token));
    assert.strictEqual(read.json.data.lowScoreDays, 14);
    assert.strictEqual(read.json.data.lowScoreThreshold, 25);
  });

  test('low-score rule prunes only items below the threshold past the window', async () => {
    const restore = withScoreCleanup(14, 30);
    try {
      await seedNews('junk-old', 20, 5);
      await seedNews('junk-fresh', 2, 5);
      await seedNews('good-old', 20, 80);
      await seedNews('edge', 20, 30);
      // Never scored counts as below the threshold.
      await seedNews('unscored-old', 20, null);

      // Age rule off: this run exercises the score rule alone.
      const result = await runRetentionCleanup(0);
      assert.strictEqual(result.skipped, false);
      assert.strictEqual(result.scoreDeleted, 2, JSON.stringify(result));
      assert.strictEqual(result.ageDeleted, 0);

      const remaining = (await newsRepository.findAll()).map((n) => n.id).sort();
      assert.deepStrictEqual(remaining, ['edge', 'good-old', 'junk-fresh']);
    } finally {
      restore();
    }
  });

  test('bookmark survives both rules even when old and low-scoring', async () => {
    const userId = await userIdFor('user');

    await seedNews('bookmarked-junk', 40, 3);
    await seedNews('plain-junk', 40, 3);
    await seedBookmark(userId, 'bookmarked-junk');

    const restore = withScoreCleanup(14, 30);
    try {
      const result = await runRetentionCleanup(30);
      assert.strictEqual(result.skipped, false);
      assert.strictEqual(result.deleted, 1, JSON.stringify(result));

      const remaining = (await newsRepository.findAll()).map((n) => n.id);
      assert.deepStrictEqual(remaining, ['bookmarked-junk']);
    } finally {
      restore();
    }
  });
});
