import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

describe('Server core endpoints (HTTP-level)', () => {
  let token: string;

  beforeEach(async () => {
    resetTestDb();
    getTestDb();

    const register = await request('POST', '/api/auth/register', {
      email: `server-${Date.now()}@test.com`,
      password: 'senha12345',
      name: 'Server Test',
    });
    assert.strictEqual(register.status, 201, register.raw);
    token = register.json.data.accessToken;
  });

  test('GET /health returns a status payload', async () => {
    const res = await request('GET', '/health');

    assert.ok(res.status === 200 || res.status === 503, `unexpected status: ${res.raw}`);
    assert.ok(['ok', 'degraded'].includes(res.json.status), res.raw);
    assert.strictEqual(res.json.checks.database, 'ok');
    assert.ok(typeof res.json.uptime === 'number');
  });

  test('GET / serves the frontend index.html', async () => {
    const res = await request('GET', '/');

    assert.strictEqual(res.status, 200, res.raw);
    assert.match(res.raw, /<html/i);
  });

  test('GET /api/news requires authentication', async () => {
    const res = await request('GET', '/api/news');

    assert.strictEqual(res.status, 401, res.raw);
    assert.strictEqual(res.json.error, 'Authentication required');
  });

  test('GET /api/news returns the news list for an authenticated user', async () => {
    const res = await request('GET', '/api/news', undefined, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    assert.ok(Array.isArray(res.json.data));
  });

  test('POST /api/news adds an item for an authenticated user', async () => {
    const res = await request(
      'POST',
      '/api/news',
      {
        title: 'Manual item',
        link: 'https://example.com/manual',
        description: 'added by test',
      },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.title, 'Manual item');
    assert.strictEqual(res.json.data.source, 'Manual');

    const list = await request('GET', '/api/news', undefined, bearer(token));
    assert.ok(list.json.data.some((n: any) => n.title === 'Manual item'));
  });

  test('POST /api/news rejects an invalid payload with 400', async () => {
    const res = await request('POST', '/api/news', { link: 'not-a-url' }, bearer(token));

    assert.strictEqual(res.status, 400, res.raw);
    assert.strictEqual(res.json.ok, false);
  });

  test('POST /api/news requires authentication', async () => {
    const res = await request('POST', '/api/news', { title: 'x', link: 'https://example.com/x' });

    assert.strictEqual(res.status, 401, res.raw);
  });
});
