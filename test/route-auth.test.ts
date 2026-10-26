import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@test.com`;
}

async function tokenFor(role: 'admin' | 'user' | 'viewer'): Promise<string> {
  const email = uniqueEmail(`route-auth-${role}`);
  await createUser(email, 'senha12345', `Route ${role}`, role);
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

// Every route that spends a system resource (AI credits, the Telegram bot, the
// global fetch interval) or exposes internal state must reject an anonymous
// caller before doing any work. /api/health stays public on purpose: it is what
// the Docker healthcheck polls.
const ANONYMOUS_DENIED = [
  ['POST', '/api/fetch', {}],
  ['GET', '/api/scheduler/status'],
  ['POST', '/api/scheduler/trigger', {}],
  ['POST', '/api/scheduler/config', { intervalMs: 60000 }],
  ['GET', '/api/stats'],
  ['GET', '/api/ai/profile'],
  ['PUT', '/api/ai/profile', { interests: [] }],
  ['POST', '/api/ai/score', { items: [] }],
  ['POST', '/api/ai/score-new', {}],
  ['POST', '/api/telegram/schedule', { text: 'oi', scheduledAt: Date.now() + 3600_000 }],
  ['GET', '/api/templates'],
  ['POST', '/api/templates', { id: 'anon', name: 'x', type: 'summary', systemPrompt: 'y' }],
  ['PUT', '/api/templates/any-id', { name: 'x' }],
  ['DELETE', '/api/templates/any-id'],
  ['POST', '/api/templates/any-id/test', { variables: {} }],
] as const;

describe('route authentication (HTTP-level)', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
  });

  for (const [method, path, body] of ANONYMOUS_DENIED) {
    test(`${method} ${path} rejects anonymous callers with 401`, async () => {
      const res = await request(method, path, body);

      assert.strictEqual(res.status, 401, `${method} ${path}: ${res.raw}`);
      assert.match(res.json.error, /Authentication required/);
    });
  }

  test('GET /api/health stays public for the container healthcheck', async () => {
    const res = await request('GET', '/api/health');

    assert.ok(res.status === 200 || res.status === 503, res.raw);
    assert.ok(typeof res.json.uptime === 'number');
  });

  test('a viewer reads stats and scheduler status but cannot change the interval', async () => {
    const viewer = await tokenFor('viewer');

    const stats = await request('GET', '/api/stats', undefined, bearer(viewer));
    assert.strictEqual(stats.status, 200, stats.raw);

    const status = await request('GET', '/api/scheduler/status', undefined, bearer(viewer));
    assert.strictEqual(status.status, 200, status.raw);
    const originalInterval = status.json.data.intervalMs;

    const denied = await request(
      'POST',
      '/api/scheduler/config',
      { intervalMs: 60000 },
      bearer(viewer)
    );
    assert.strictEqual(denied.status, 403, denied.raw);

    const admin = await tokenFor('admin');
    const allowed = await request(
      'POST',
      '/api/scheduler/config',
      { intervalMs: 60000 },
      bearer(admin)
    );
    assert.strictEqual(allowed.status, 200, allowed.raw);

    // Leave the process-wide interval as it was for the rest of this file.
    await request('POST', '/api/scheduler/config', { intervalMs: originalInterval }, bearer(admin));
  });

  test('a user can queue a scheduled Telegram message, a viewer cannot', async () => {
    const scheduledAt = Date.now() + 3600_000;
    const payload = { text: 'oi', scheduledAt };

    const viewer = await tokenFor('viewer');
    const denied = await request('POST', '/api/telegram/schedule', payload, bearer(viewer));
    assert.strictEqual(denied.status, 403, denied.raw);

    const user = await tokenFor('user');
    const allowed = await request('POST', '/api/telegram/schedule', payload, bearer(user));
    // 400 when no bot is configured (nothing to queue against), never 401/403.
    assert.ok(allowed.status === 200 || allowed.status === 400, allowed.raw);
  });
});
