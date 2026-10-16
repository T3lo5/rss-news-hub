import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

let seq = 0;

async function registerAndGetToken(): Promise<string> {
  seq += 1;
  const res = await request('POST', '/api/auth/register', {
    email: `lang-${Date.now()}-${seq}@test.com`,
    password: 'senha12345',
    name: 'Lang',
  });
  assert.strictEqual(res.status, 201, res.raw);
  return res.json.data.accessToken;
}

describe('user language preference', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
  });

  test('defaults to pt and can be changed to en via PUT /api/auth/me', async () => {
    const token = await registerAndGetToken();

    const initial = await request('GET', '/api/auth/me', undefined, bearer(token));
    assert.strictEqual(initial.status, 200, initial.raw);
    assert.strictEqual(initial.json.data.language, 'pt');

    const updated = await request('PUT', '/api/auth/me', { language: 'en' }, bearer(token));
    assert.strictEqual(updated.status, 200, updated.raw);
    assert.strictEqual(updated.json.data.language, 'en');

    const reread = await request('GET', '/api/auth/me', undefined, bearer(token));
    assert.strictEqual(reread.json.data.language, 'en');
  });

  test('rejects unsupported languages', async () => {
    const token = await registerAndGetToken();
    const res = await request('PUT', '/api/auth/me', { language: 'fr' }, bearer(token));
    assert.strictEqual(res.status, 400, res.raw);
  });
});
