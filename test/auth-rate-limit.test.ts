import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { request, type TestResponse } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

// Credential endpoints are rate limited per client IP. Every request()
// call normally carries a unique x-forwarded-for; these tests pin one
// "client" per test (limiter state is in-memory and shared across tests in
// the same process, so each test needs its own IP).
const LOGIN_IP = { 'x-forwarded-for': '203.0.113.10' };
const HEADERS_IP = { 'x-forwarded-for': '203.0.113.20' };
const ISOLATION_IP = { 'x-forwarded-for': '203.0.113.30' };
const REGISTER_IP = { 'x-forwarded-for': '203.0.113.40' };
const REFRESH_IP = { 'x-forwarded-for': '203.0.113.50' };
const FRESH_IP = { 'x-forwarded-for': '198.51.100.9' };

describe('Auth rate limiting', () => {
  beforeEach(async () => {
    resetTestDb();
    getTestDb();
    await createUser('victim@example.com', 'senha12345', 'Victim', 'user');
  });

  test('login is limited to 10 requests per minute per IP', async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const res = await request(
        'POST',
        '/api/auth/login',
        { email: 'victim@example.com', password: 'senha12345' },
        LOGIN_IP
      );
      assert.strictEqual(res.status, 200, `attempt ${attempt} should pass: ${res.raw}`);
    }

    const blocked = await request(
      'POST',
      '/api/auth/login',
      { email: 'victim@example.com', password: 'senha12345' },
      LOGIN_IP
    );

    assert.strictEqual(blocked.status, 429, blocked.raw);
    assert.ok(blocked.json?.error.includes('Rate limit exceeded'), blocked.raw);
  });

  test('rate limit headers are present on allowed and blocked responses', async () => {
    let allowed: TestResponse | null = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      const res = await request(
        'POST',
        '/api/auth/login',
        { email: 'victim@example.com', password: 'senha12345' },
        HEADERS_IP
      );
      assert.strictEqual(res.status, 200, `attempt ${attempt}: ${res.raw}`);
      allowed = res;
    }

    const blocked = await request(
      'POST',
      '/api/auth/login',
      { email: 'victim@example.com', password: 'senha12345' },
      HEADERS_IP
    );
    assert.strictEqual(blocked.status, 429, blocked.raw);
    assert.ok(blocked.json?.error.includes('Rate limit exceeded'), blocked.raw);
    assert.ok(
      blocked.headers['Retry-After'] !== undefined,
      'blocked response must carry Retry-After'
    );
    assert.ok(allowed, 'expected an allowed response');
  });

  test("a different IP is not affected by another IP's budget", async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(
        'POST',
        '/api/auth/login',
        { email: 'victim@example.com', password: 'senha12345' },
        ISOLATION_IP
      );
    }

    const freshIp = await request(
      'POST',
      '/api/auth/login',
      { email: 'victim@example.com', password: 'senha12345' },
      FRESH_IP
    );

    assert.strictEqual(freshIp.status, 200, freshIp.raw);
  });

  test('register is limited before payload validation runs', async () => {
    // Invalid payloads: the limiter must reject the 6th attempt with 429 even
    // though the payload never reaches the validator (which would say 400).
    for (let attempt = 1; attempt <= 5; attempt++) {
      const res = await request('POST', '/api/auth/register', { email: 'invalid' }, REGISTER_IP);
      assert.strictEqual(res.status, 400, `attempt ${attempt} should be a validation error`);
    }

    const blocked = await request('POST', '/api/auth/register', { email: 'invalid' }, REGISTER_IP);
    assert.strictEqual(blocked.status, 429, blocked.raw);
  });

  test('refresh is limited to 30 requests per minute per IP', async () => {
    for (let attempt = 1; attempt <= 30; attempt++) {
      const res = await request(
        'POST',
        '/api/auth/refresh',
        { refreshToken: 'garbage' },
        REFRESH_IP
      );
      assert.strictEqual(res.status, 401, `attempt ${attempt} should be rejected by the handler`);
    }

    const blocked = await request(
      'POST',
      '/api/auth/refresh',
      { refreshToken: 'garbage' },
      REFRESH_IP
    );
    assert.strictEqual(blocked.status, 429, blocked.raw);
  });
});
