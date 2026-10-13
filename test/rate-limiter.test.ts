import assert from 'node:assert';
import { beforeEach, describe, mock, test } from 'node:test';
import { createRateLimiter, getClientIp, rateLimitMiddleware } from '../services/rate-limiter.js';

describe('Rate Limiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter({ maxRequests: 3, windowMs: 60000 });
  });

  test('allows requests under limit', () => {
    assert.ok(limiter.check('127.0.0.1'));
    assert.ok(limiter.check('127.0.0.1'));
    assert.ok(limiter.check('127.0.0.1'));
  });

  test('blocks requests over limit', () => {
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    assert.ok(!limiter.check('127.0.0.1'));
  });

  test('resets after window expires', () => {
    const originalNow = Date.now;
    let currentTime = Date.now();
    global.Date.now = () => currentTime;

    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    assert.ok(!limiter.check('127.0.0.1'));

    currentTime += 60001;
    assert.ok(limiter.check('127.0.0.1'));

    global.Date.now = originalNow;
  });

  test('tracks different IPs independently', () => {
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    assert.ok(!limiter.check('127.0.0.1'));
    assert.ok(limiter.check('192.168.1.1'));
  });

  test('returns correct remaining count', () => {
    assert.strictEqual(limiter.getRemaining('127.0.0.1'), 3);
    limiter.check('127.0.0.1');
    assert.strictEqual(limiter.getRemaining('127.0.0.1'), 2);
    limiter.check('127.0.0.1');
    assert.strictEqual(limiter.getRemaining('127.0.0.1'), 1);
    limiter.check('127.0.0.1');
    assert.strictEqual(limiter.getRemaining('127.0.0.1'), 0);
  });

  test('returns reset timestamp', () => {
    const now = Date.now();
    limiter.check('127.0.0.1');
    const resetTime = limiter.getResetTime('127.0.0.1');
    assert.ok(resetTime >= now + 59000 && resetTime <= now + 61000);
  });

  test('cleans up expired entries', () => {
    const originalNow = Date.now;
    let currentTime = Date.now();
    global.Date.now = () => currentTime;

    limiter.check('127.0.0.1');
    limiter.check('192.168.1.1');
    currentTime += 60001;
    limiter.check('10.0.0.1');
    assert.strictEqual(limiter.getTrackedCount(), 1);

    global.Date.now = originalNow;
  });
});

describe('Rate Limit Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let next: any;

  beforeEach(() => {
    mockReq = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    mockRes = {
      statusCode: 200,
      headers: {},
      writeHead: mock.fn(),
      end: mock.fn(),
      setHeader: mock.fn((k, v) => {
        mockRes.headers[k] = v;
      }),
      getHeader: mock.fn((k) => mockRes.headers[k]),
    };
    next = mock.fn();
  });

  function resetMocks() {
    mockReq = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    };
    mockRes = {
      statusCode: 200,
      headers: {},
      writeHead: mock.fn(),
      end: mock.fn(),
      setHeader: mock.fn((k, v) => {
        mockRes.headers[k] = v;
      }),
      getHeader: mock.fn((k) => mockRes.headers[k]),
    };
    next = mock.fn();
  }

  test('calls next() when under limit', () => {
    const middleware = rateLimitMiddleware({ maxRequests: 2, windowMs: 60000 });
    middleware(mockReq, mockRes, next);
    assert.ok(next.mock.callCount() === 1);
    assert.strictEqual(mockRes.statusCode, 200);
  });

  test('sets rate limit headers', () => {
    const middleware = rateLimitMiddleware({ maxRequests: 2, windowMs: 60000 });
    middleware(mockReq, mockRes, next);
    assert.strictEqual(mockRes.getHeader('X-RateLimit-Limit'), 2);
    assert.strictEqual(mockRes.getHeader('X-RateLimit-Remaining'), 1);
    assert.ok(mockRes.getHeader('X-RateLimit-Reset') !== undefined);
  });

  test('returns 429 when over limit', () => {
    const middleware = rateLimitMiddleware({ maxRequests: 1, windowMs: 60000 });

    let mockReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    let mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: (k, v) => (mockRes.headers[k] = v),
      getHeader: (k) => mockRes.headers[k],
      writeHead: mock.fn((code) => {
        mockRes.statusCode = code;
      }),
      end: mock.fn(),
    };
    let next = mock.fn();

    middleware(mockReq, mockRes, next);

    // Create fresh mocks for second call
    mockReq = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: (k, v) => (mockRes.headers[k] = v),
      getHeader: (k) => mockRes.headers[k],
      writeHead: mock.fn((code) => {
        mockRes.statusCode = code;
      }),
      end: mock.fn(),
    };
    next = mock.fn();

    middleware(mockReq, mockRes, next);
    assert.strictEqual(mockRes.statusCode, 429);
    assert.ok(mockRes.writeHead.mock.callCount() === 1);
    const writeHeadArgs = mockRes.writeHead.mock.calls[0].arguments;
    assert.strictEqual(writeHeadArgs[0], 429);
    assert.strictEqual(writeHeadArgs[1]['Content-Type'], 'application/json; charset=utf-8');
    assert.ok(writeHeadArgs[1]['Retry-After']);
    assert.ok(mockRes.end.mock.callCount() === 1);
    const endArg = mockRes.end.mock.calls[0].arguments[0];
    assert.ok(endArg.includes('Rate limit exceeded'));
    assert.strictEqual(next.mock.callCount(), 0);
  });

  test('uses x-forwarded-for header when present', () => {
    const middleware = rateLimitMiddleware({ maxRequests: 1, windowMs: 60000 });

    let mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.195' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    let mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: (k, v) => (mockRes.headers[k] = v),
      getHeader: (k) => mockRes.headers[k],
      writeHead: mock.fn((code) => {
        mockRes.statusCode = code;
      }),
      end: mock.fn(),
    };
    let next = mock.fn();

    middleware(mockReq, mockRes, next);
    assert.strictEqual(next.mock.callCount(), 1);

    // Fresh mocks for second call
    mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.195' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    mockRes = {
      statusCode: 200,
      headers: {},
      setHeader: (k, v) => (mockRes.headers[k] = v),
      getHeader: (k) => mockRes.headers[k],
      writeHead: mock.fn((code) => {
        mockRes.statusCode = code;
      }),
      end: mock.fn(),
    };
    next = mock.fn();

    middleware(mockReq, mockRes, next);
    assert.strictEqual(mockRes.statusCode, 429);
  });

  test('uses different limits per endpoint via key prefix', () => {
    const aiLimiter = rateLimitMiddleware({ maxRequests: 1, windowMs: 60000, keyPrefix: 'ai:' });
    const tgLimiter = rateLimitMiddleware({ maxRequests: 1, windowMs: 60000, keyPrefix: 'tg:' });

    aiLimiter(mockReq, mockRes, next);
    assert.strictEqual(next.mock.callCount(), 1);

    resetMocks();

    tgLimiter(mockReq, mockRes, next);
    assert.strictEqual(next.mock.callCount(), 1);
  });
});

describe('getClientIp', () => {
  test('returns x-forwarded-for when present', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    assert.strictEqual(getClientIp(req), '203.0.113.195');
  });

  test('returns socket remoteAddress when no forwarded header', () => {
    const req = {
      headers: {},
      socket: { remoteAddress: '192.168.1.100' },
    };
    assert.strictEqual(getClientIp(req), '192.168.1.100');
  });

  test('returns unknown when no ip available', () => {
    const req = { headers: {}, socket: {} };
    assert.strictEqual(getClientIp(req), 'unknown');
  });
});
