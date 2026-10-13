import assert from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  __resetScheduler,
  getStatus,
  setIntervalMs,
  start,
  stop,
  trigger,
} from '../services/scheduler.service.js';

describe('scheduler.service', () => {
  let callCount = 0;
  let lastCallTime = 0;
  const mockFetchFn = async () => {
    callCount++;
    lastCallTime = Date.now();
    await new Promise((r) => setTimeout(r, 10)); // simulate work
    return { total: 10, results: [] };
  };

  beforeEach(async () => {
    callCount = 0;
    lastCallTime = 0;
    await __resetScheduler();
  });

  after(async () => {
    await stop();
  });

  describe('start/stop', () => {
    test('calls fetchFn at interval', async () => {
      start(50, mockFetchFn);
      await new Promise((r) => setTimeout(r, 120));
      await stop();
      assert(callCount >= 2, `Expected at least 2 calls, got ${callCount}`);
    });

    test('stops calling after stop()', async () => {
      start(50, mockFetchFn);
      await new Promise((r) => setTimeout(r, 120));
      const countAfterStop = callCount;
      await stop();
      await new Promise((r) => setTimeout(r, 120));
      assert.strictEqual(callCount, countAfterStop, 'Should not call after stop');
    });

    test('getStatus returns running state', async () => {
      const status1 = getStatus();
      assert.strictEqual(status1.running, false);

      start(1000, mockFetchFn);
      const status2 = getStatus();
      assert.strictEqual(status2.running, true);
      assert(typeof status2.nextRun === 'number');

      await stop();
      const status3 = getStatus();
      assert.strictEqual(status3.running, false);
    });
  });

  describe('overlapping runs', () => {
    test('skips if previous run still in progress', async () => {
      let running = false;
      const slowFetch = async () => {
        if (running) return { skipped: true };
        running = true;
        await new Promise((r) => setTimeout(r, 100));
        running = false;
        return { total: 1 };
      };

      start(50, slowFetch);
      await new Promise((r) => setTimeout(r, 200));
      await stop();
      // Should only complete 1-2 runs, not 4
      assert(callCount <= 2, `Expected <=2 calls, got ${callCount}`);
    });
  });

  describe('manual trigger', () => {
    test('trigger calls fetchFn immediately', async () => {
      start(10000, mockFetchFn); // long interval
      const result = await trigger();
      assert.strictEqual(result.total, 10);
      assert.strictEqual(callCount, 1);
      await stop();
    });

    test('trigger works when scheduler not running', async () => {
      const result = await trigger(mockFetchFn);
      assert.strictEqual(result.total, 10);
      assert.strictEqual(callCount, 1);
    });
  });

  describe('config update', () => {
    test('setIntervalMs changes interval for next runs', async () => {
      start(1000, mockFetchFn);
      await new Promise((r) => setTimeout(r, 50));
      setIntervalMs(50);
      await new Promise((r) => setTimeout(r, 120));
      await stop();
      // Should have more calls with shorter interval
      assert(callCount >= 2);
    });
  });
});
