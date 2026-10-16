import assert from 'node:assert';
import { describe, test } from 'node:test';
import { isTransientNetworkError, withRetry } from '../services/net.js';

describe('isTransientNetworkError', () => {
  test('detects EAI_AGAIN via cause code', () => {
    const err = new TypeError('fetch failed');
    err.cause = Object.assign(new Error('getaddrinfo EAI_AGAIN example.com'), {
      code: 'EAI_AGAIN',
    });
    assert.strictEqual(isTransientNetworkError(err), true);
  });

  test('detects undici connect timeout', () => {
    const err = new TypeError('fetch failed');
    err.cause = Object.assign(new Error('Connect Timeout Error'), {
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });
    assert.strictEqual(isTransientNetworkError(err), true);
  });

  test('detects transient keywords in the message', () => {
    assert.strictEqual(isTransientNetworkError(new Error('fetch failed')), true);
    assert.strictEqual(isTransientNetworkError(new Error('socket hang up')), true);
  });

  test('does not treat our own abort as transient', () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    assert.strictEqual(isTransientNetworkError(err), false);
  });

  test('returns false for application errors', () => {
    assert.strictEqual(isTransientNetworkError(new Error('AI API error 500: boom')), false);
    assert.strictEqual(isTransientNetworkError(new Error('HTTP 404 for feed')), false);
  });
});

describe('withRetry', () => {
  test('returns immediately on success', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 'ok';
    });
    assert.strictEqual(result, 'ok');
    assert.strictEqual(calls, 1);
  });

  test('retries transient failures then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) {
          const err = new TypeError('fetch failed');
          err.cause = Object.assign(new Error('getaddrinfo EAI_AGAIN x'), { code: 'EAI_AGAIN' });
          throw err;
        }
        return 'recovered';
      },
      { retries: 3, baseDelayMs: 1 }
    );
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(calls, 3);
  });

  test('does not retry non-transient errors', async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            calls++;
            throw new Error('AI API error 500: boom');
          },
          { retries: 3, baseDelayMs: 1 }
        ),
      /AI API error 500/
    );
    assert.strictEqual(calls, 1);
  });

  test('gives up after the configured number of retries', async () => {
    let calls = 0;
    await assert.rejects(() =>
      withRetry(
        async () => {
          calls++;
          throw new Error('fetch failed');
        },
        { retries: 2, baseDelayMs: 1 }
      )
    );
    assert.strictEqual(calls, 3); // initial + 2 retries
  });
});
