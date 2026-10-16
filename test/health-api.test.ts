import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

describe('health API', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
  });

  test('GET /api/health is public and reports db + schedulers', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.ok, true);
    assert.strictEqual(res.json.db.ok, true);
    assert.strictEqual(typeof res.json.uptime, 'number');
    assert.strictEqual(typeof res.json.version, 'string');

    assert(res.json.schedulers.fetch, 'expected fetch scheduler info');
    assert(res.json.schedulers.digest, 'expected digest scheduler info');
    assert(res.json.schedulers.retention, 'expected retention info');
    assert(res.json.schedulers.telegram, 'expected telegram worker info');
    assert.strictEqual(typeof res.json.schedulers.telegram.running, 'boolean');

    assert(Array.isArray(res.json.providers.configured));
  });
});
