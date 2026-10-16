import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { updateDigestConfig } from '../services/digest.service.js';
import { settingsRepository } from '../src/db/repositories/index.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

async function createAdminToken(): Promise<string> {
  const email = `digest-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await createUser(email, 'senha12345', 'Digest Admin', 'admin');
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

async function createUserToken(): Promise<string> {
  const res = await request('POST', '/api/auth/register', {
    email: `digest-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`,
    password: 'senha12345',
    name: 'Digest User',
  });
  assert.strictEqual(res.status, 201, res.raw);
  return res.json.data.accessToken;
}

describe('Digest API', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
    updateDigestConfig({
      enabled: false,
      cron: '0 8 * * 1',
      lookbackDays: 7,
      minRelevanceScore: 70,
      maxItems: 10,
      provider: 'auto',
      format: 'thread',
      language: 'en',
    });
  });

  test('GET /api/digest/config returns the current config', async () => {
    const res = await request('GET', '/api/digest/config');
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.maxItems, 10);
    assert.strictEqual(res.json.data.enabled, false);
  });

  test('POST /api/digest/trigger requires admin', async () => {
    const anon = await request('POST', '/api/digest/trigger');
    assert.strictEqual(anon.status, 401, anon.raw);

    const userToken = await createUserToken();
    const forbidden = await request('POST', '/api/digest/trigger', undefined, bearer(userToken));
    assert.strictEqual(forbidden.status, 403, forbidden.raw);
  });

  test('POST /api/digest/trigger works even when the schedule is disabled', async () => {
    const token = await createAdminToken();
    const res = await request('POST', '/api/digest/trigger', undefined, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.success, true);
    assert.strictEqual(res.json.data.itemsCount, 0);
  });

  test('GET /api/digest/preview is admin-only and returns no items on empty DB', async () => {
    const userToken = await createUserToken();
    const forbidden = await request('GET', '/api/digest/preview', undefined, bearer(userToken));
    assert.strictEqual(forbidden.status, 403, forbidden.raw);

    const token = await createAdminToken();
    const res = await request('GET', '/api/digest/preview', undefined, bearer(token));
    assert.strictEqual(res.status, 200, res.raw);
    assert.deepStrictEqual(res.json.data.items, []);
  });

  test('PUT /api/digest/config updates and persists the config', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/digest/config',
      { maxItems: 5, format: 'summary', language: 'pt' },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.maxItems, 5);
    assert.strictEqual(res.json.data.format, 'summary');

    const stored = JSON.parse((await settingsRepository.get('digest')) || '{}');
    assert.strictEqual(stored.maxItems, 5);
    assert.strictEqual(stored.language, 'pt');
  });
});
