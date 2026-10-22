import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

describe('Auth API (HTTP-level)', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
  });

  test('GET /api/auth/config reports the registration flag', async () => {
    const res = await request('GET', '/api/auth/config');
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(typeof res.json.data.registrationEnabled, 'boolean');
  });

  test('GET /api/auth/config reflects ALLOW_REGISTRATION=false', async () => {
    const previous = process.env.ALLOW_REGISTRATION;
    process.env.ALLOW_REGISTRATION = 'false';
    try {
      const res = await request('GET', '/api/auth/config');
      assert.strictEqual(res.status, 200, res.raw);
      assert.strictEqual(res.json.data.registrationEnabled, false);
    } finally {
      if (previous === undefined) delete process.env.ALLOW_REGISTRATION;
      else process.env.ALLOW_REGISTRATION = previous;
    }
  });

  test('POST /api/auth/register creates a user and returns tokens', async () => {
    const res = await request('POST', '/api/auth/register', {
      email: 'ana@example.com',
      password: 'senha12345',
      name: 'Ana',
    });

    assert.strictEqual(res.status, 201, `unexpected status: ${res.raw}`);
    assert.ok(res.json.data.accessToken, 'expected accessToken');
    assert.ok(res.json.data.refreshToken, 'expected refreshToken');
    assert.strictEqual(res.json.data.user.email, 'ana@example.com');
  });

  test('POST /api/auth/register rejects an invalid payload with 400', async () => {
    const res = await request('POST', '/api/auth/register', { email: 'not-an-email' });

    assert.strictEqual(res.status, 400);
    assert.ok(String(res.json.error).includes('Validation'), res.raw);
  });

  test('POST /api/auth/login returns tokens for a valid user', async () => {
    await createUser('bia@example.com', 'senha12345', 'Bia', 'user');

    const res = await request('POST', '/api/auth/login', {
      email: 'bia@example.com',
      password: 'senha12345',
    });

    assert.strictEqual(res.status, 200, `unexpected status: ${res.raw}`);
    assert.ok(res.json.data.accessToken, 'expected accessToken');
    assert.ok(res.json.data.refreshToken, 'expected refreshToken');
  });

  test('GET /api/auth/me returns the authenticated user', async () => {
    const register = await request('POST', '/api/auth/register', {
      email: 'carlos@example.com',
      password: 'senha12345',
      name: 'Carlos',
    });
    assert.strictEqual(register.status, 201, register.raw);

    const me = await request(
      'GET',
      '/api/auth/me',
      undefined,
      bearer(register.json.data.accessToken)
    );

    assert.strictEqual(me.status, 200, `unexpected status: ${me.raw}`);
    assert.strictEqual(me.json.data.email, 'carlos@example.com');
    assert.strictEqual(me.json.data.role, 'user');
  });

  test('GET /api/auth/me returns 401 without a token', async () => {
    const me = await request('GET', '/api/auth/me');

    assert.strictEqual(me.status, 401);
    assert.strictEqual(me.json.error, 'Not authenticated');
  });

  test('POST /api/auth/refresh issues a new token pair (sessions table)', async () => {
    const register = await request('POST', '/api/auth/register', {
      email: 'davi@example.com',
      password: 'senha12345',
      name: 'Davi',
    });
    assert.strictEqual(register.status, 201, register.raw);

    const refreshed = await request('POST', '/api/auth/refresh', {
      refreshToken: register.json.data.refreshToken,
    });

    assert.strictEqual(refreshed.status, 200, `unexpected status: ${refreshed.raw}`);
    assert.ok(refreshed.json.data.accessToken, 'expected new accessToken');
    assert.ok(refreshed.json.data.refreshToken, 'expected new refreshToken');
  });

  test('login sets an HttpOnly refresh_token cookie scoped to /api/auth', async () => {
    await createUser('cookie@example.com', 'senha12345', 'Cookie', 'user');

    const res = await request('POST', '/api/auth/login', {
      email: 'cookie@example.com',
      password: 'senha12345',
    });

    const setCookie = String(res.headers['set-cookie'] || '');
    assert.match(setCookie, /refresh_token=/, setCookie);
    assert.match(setCookie, /HttpOnly/, setCookie);
    assert.match(setCookie, /Path=\/api\/auth/, setCookie);
    assert.match(setCookie, /SameSite=Lax/, setCookie);
  });

  test('POST /api/auth/refresh accepts the refresh token from the cookie', async () => {
    const register = await request('POST', '/api/auth/register', {
      email: 'cookie2@example.com',
      password: 'senha12345',
      name: 'Cookie2',
    });
    const cookie = String(register.headers['set-cookie']).split(';')[0];

    const refreshed = await request('POST', '/api/auth/refresh', {}, { cookie });

    assert.strictEqual(refreshed.status, 200, `unexpected status: ${refreshed.raw}`);
    assert.ok(refreshed.json.data.accessToken, 'expected new accessToken');
    // A rotated cookie is set on refresh as well.
    assert.match(String(refreshed.headers['set-cookie'] || ''), /refresh_token=/, refreshed.raw);
  });

  test('POST /api/auth/refresh without a cookie or body token returns 401', async () => {
    const refreshed = await request('POST', '/api/auth/refresh', {});
    assert.strictEqual(refreshed.status, 401, refreshed.raw);
  });

  test('POST /api/auth/logout clears the refresh cookie', async () => {
    const res = await request('POST', '/api/auth/logout');

    assert.strictEqual(res.status, 200, res.raw);
    const setCookie = String(res.headers['set-cookie'] || '');
    assert.match(setCookie, /refresh_token=;/, setCookie);
    assert.match(setCookie, /Max-Age=0/, setCookie);
  });

  test('API keys can be created and listed (api_keys table)', async () => {
    const register = await request('POST', '/api/auth/register', {
      email: 'eve@example.com',
      password: 'senha12345',
      name: 'Eve',
    });
    assert.strictEqual(register.status, 201, register.raw);
    const auth = bearer(register.json.data.accessToken);

    const created = await request('POST', '/api/auth/api-key', { name: 'ci-key' }, auth);
    assert.strictEqual(created.status, 201, `unexpected status: ${created.raw}`);
    assert.ok(created.json.data.key, 'expected the raw key');

    const list = await request('GET', '/api/auth/api-keys', undefined, auth);
    assert.strictEqual(list.status, 200, `unexpected status: ${list.raw}`);
    assert.ok(
      Array.isArray(list.json.data) && list.json.data.some((k: any) => k.name === 'ci-key'),
      `expected ci-key in ${list.raw}`
    );
  });

  test('protected auth endpoints return 401 without a token', async () => {
    const res = await request('POST', '/api/auth/api-key', { name: 'anon' });

    assert.strictEqual(res.status, 401, res.raw);
    assert.ok(String(res.json?.error).length > 0);
  });
});
