import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import {
  generateAndSendDigest,
  getDigestConfig,
  updateDigestConfig,
} from '../services/digest.service.js';
import { getTestDb, resetTestDb } from './setup.js';

describe('digest service', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
    updateDigestConfig({ enabled: false });
  });

  test('refuses to run when disabled (scheduled path)', async () => {
    const result = await generateAndSendDigest({});
    assert.strictEqual(result.success, false);
    assert.match(String(result.error), /not enabled/i);
  });

  test('force=true runs even when disabled and reports no items', async () => {
    const result = await generateAndSendDigest({}, { force: true });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.itemsCount, 0);
  });

  test('runs when enabled without force', async () => {
    updateDigestConfig({ enabled: true });
    try {
      const result = await generateAndSendDigest({});
      assert.strictEqual(result.success, true);
    } finally {
      updateDigestConfig({ enabled: false });
      assert.strictEqual(getDigestConfig().enabled, false);
    }
  });
});
