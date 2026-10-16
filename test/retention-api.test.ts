import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { runRetentionCleanup } from '../services/retention.service.js';
import { newsRepository } from '../src/db/repositories/index.js';
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

const DAY = 24 * 60 * 60 * 1000;

async function seedNews(id: string, ageDays: number) {
  await newsRepository.create({
    id,
    title: `Item ${id}`,
    link: `https://example.com/${id}`,
    source: 'Example',
    pubDate: new Date(Date.now() - ageDays * DAY),
    relevanceScore: null,
  });
}

describe('retention API', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
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

  test('runRetentionCleanup is a no-op when the window is disabled', async () => {
    await seedNews('very-old', 1000);
    const result = await runRetentionCleanup(0);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.deleted, 0);
    assert.strictEqual(await newsRepository.count(), 1);
  });
});
