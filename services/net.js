// Network resilience helpers.
//
// The failures seen in practice are transient: `EAI_AGAIN` (temporary DNS
// resolution failure), `UND_ERR_CONNECT_TIMEOUT`, `ECONNRESET`, etc. A short
// retry with backoff turns most of these into success without any user action.

const TRANSIENT_CODES = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

const TRANSIENT_MESSAGE =
  /fetch failed|connect timeout|headers timeout|body timeout|socket hang up|network|temporarily unavailable|getaddrinfo|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EPIPE/i;

export function isTransientNetworkError(err) {
  if (!err) return false;
  // Our own AbortController timeout — retrying under an already-aborted signal
  // is pointless and would just delay the failure.
  if (err.name === 'AbortError') return false;

  const code = err.code || err.cause?.code;
  if (code && TRANSIENT_CODES.has(code)) return true;

  const message = `${err.message || ''} ${err.cause?.message || ''}`;
  return TRANSIENT_MESSAGE.test(message);
}

// Run `fn`, retrying on transient network failures with exponential backoff.
// `signal` (if provided) aborts the wait/loop between attempts.
export async function withRetry(fn, { retries = 2, baseDelayMs = 400, signal } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || signal?.aborted || !isTransientNetworkError(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
