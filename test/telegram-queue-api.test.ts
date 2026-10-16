import assert from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { __resetTelegramQueue } from '../services/telegram.service.js';
import { stopTelegramQueueWorker } from '../services/telegram-worker.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

let seq = 0;
function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}@test.com`;
}

async function tokenFor(role: 'admin' | 'user' | 'viewer'): Promise<string> {
  const email = uniqueEmail(`tg-${role}`);
  await createUser(email, 'senha12345', `TG ${role}`, role);
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

describe('telegram queue API', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
    await __resetTelegramQueue();
  });

  afterEach(() => {
    stopTelegramQueueWorker();
  });

  test('requires authentication', async () => {
    const anon = await request('GET', '/api/telegram/queue');
    assert.strictEqual(anon.status, 401, anon.raw);
  });

  test('schedules, lists and cancels a message', async () => {
    const token = await tokenFor('user');
    const scheduledAt = Date.now() + 3600_000;

    const scheduled = await request(
      'POST',
      '/api/telegram/schedule',
      { text: 'olá', scheduledAt },
      bearer(token)
    );
    assert.strictEqual(scheduled.status, 200, scheduled.raw);
    assert(scheduled.json.data.messageId, 'expected a messageId');

    const listed = await request('GET', '/api/telegram/queue', undefined, bearer(token));
    assert.strictEqual(listed.status, 200, listed.raw);
    assert.strictEqual(listed.json.data.length, 1);
    assert.strictEqual(listed.json.data[0].text, 'olá');

    const cancelled = await request(
      'DELETE',
      `/api/telegram/queue/${scheduled.json.data.messageId}`,
      undefined,
      bearer(token)
    );
    assert.strictEqual(cancelled.status, 200, cancelled.raw);
    assert.strictEqual(cancelled.json.data.cancelled, true);

    const after = await request('GET', '/api/telegram/queue', undefined, bearer(token));
    assert.strictEqual(after.json.data.length, 0);

    const missing = await request(
      'DELETE',
      `/api/telegram/queue/${scheduled.json.data.messageId}`,
      undefined,
      bearer(token)
    );
    assert.strictEqual(missing.status, 404, missing.raw);
  });

  test('worker status reports a real queue length and start/stop is admin-only', async () => {
    const userToken = await tokenFor('user');
    const adminToken = await tokenFor('admin');

    await request(
      'POST',
      '/api/telegram/schedule',
      { text: 'pendente', scheduledAt: Date.now() + 3600_000 },
      bearer(adminToken)
    );

    const forbidden = await request(
      'POST',
      '/api/telegram/worker/start',
      undefined,
      bearer(userToken)
    );
    assert.strictEqual(forbidden.status, 403, forbidden.raw);

    const started = await request(
      'POST',
      '/api/telegram/worker/start',
      undefined,
      bearer(adminToken)
    );
    assert.strictEqual(started.status, 200, started.raw);
    assert.strictEqual(started.json.data.running, true);
    assert.strictEqual(started.json.data.queueLength, 1);

    const status = await request(
      'GET',
      '/api/telegram/worker/status',
      undefined,
      bearer(userToken)
    );
    assert.strictEqual(status.status, 200, status.raw);
    assert.strictEqual(status.json.data.queueLength, 1);

    const stopped = await request(
      'POST',
      '/api/telegram/worker/stop',
      undefined,
      bearer(adminToken)
    );
    assert.strictEqual(stopped.status, 200, stopped.raw);
    assert.strictEqual(stopped.json.data.running, false);
  });
});
