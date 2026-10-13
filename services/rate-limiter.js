const limiters = new Map();

function createRateLimiter({
  maxRequests = 10,
  windowMs = 60000,
  keyPrefix = '',
  autoCleanup = true,
} = {}) {
  const store = new Map();
  const prefix = keyPrefix;
  let cleanupInterval = null;

  function getKey(identifier) {
    return `${prefix}${identifier}`;
  }

  function check(identifier) {
    const key = getKey(identifier);
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = store.get(key) || [];
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      store.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    store.set(key, timestamps);
    return true;
  }

  function getRemaining(identifier) {
    const key = getKey(identifier);
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (store.get(key) || []).filter((ts) => ts > windowStart);
    return Math.max(0, maxRequests - timestamps.length);
  }

  function getResetTime(identifier) {
    const key = getKey(identifier);
    const timestamps = store.get(key) || [];
    if (timestamps.length === 0) return Date.now() + windowMs;
    return timestamps[0] + windowMs;
  }

  function getTrackedCount() {
    const now = Date.now();
    const windowStart = now - windowMs;
    let count = 0;
    for (const [, timestamps] of store) {
      const valid = timestamps.filter((ts) => ts > windowStart);
      if (valid.length > 0) count++;
    }
    return count;
  }

  function cleanup() {
    const now = Date.now();
    const windowStart = now - windowMs;
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter((ts) => ts > windowStart);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  }

  if (autoCleanup) {
    cleanupInterval = setInterval(cleanup, windowMs);
    cleanupInterval.unref?.();
  }

  return {
    check,
    getRemaining,
    getResetTime,
    getTrackedCount,
    cleanup,
    stopCleanup: () => cleanupInterval && clearInterval(cleanupInterval),
  };
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimitMiddleware({ maxRequests = 10, windowMs = 60000, keyPrefix = '' } = {}) {
  const limiter = createRateLimiter({ maxRequests, windowMs, keyPrefix });

  return (req, res, next) => {
    const ip = getClientIp(req);
    const allowed = limiter.check(ip);

    const remaining = limiter.getRemaining(ip);
    const resetTime = Math.ceil(limiter.getResetTime(ip) / 1000);

    const headers = {
      'X-RateLimit-Limit': maxRequests,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': resetTime,
    };

    if (!allowed) {
      const retryAfter = Math.ceil((limiter.getResetTime(ip) - Date.now()) / 1000);
      headers['Retry-After'] = Math.max(1, retryAfter);
      headers['Content-Type'] = 'application/json; charset=utf-8';
      res.writeHead(429, headers);
      res.end(
        JSON.stringify({
          ok: false,
          error: `Rate limit exceeded. Try again in ${Math.max(1, retryAfter)} seconds.`,
        })
      );
      return;
    }

    // Set headers for successful response
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

    if (next) next();
  };
}

export { createRateLimiter, getClientIp, rateLimitMiddleware };
