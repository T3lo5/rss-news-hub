// Minimal cookie helpers (no external dependency), used to keep the refresh
// token in an HttpOnly cookie so client-side JS can never read it.

export function parseCookies(req) {
  const header = req?.headers?.cookie;
  const out = {};
  if (!header || typeof header !== 'string') return out;

  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

// Only mark the cookie Secure when the request actually arrives over HTTPS.
// Dev runs on plain http, where a Secure cookie would be silently dropped.
function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  if ((req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') return true;
  return process.env.NODE_ENV === 'production';
}

export function serializeCookie(
  name,
  value,
  { maxAge, path = '/', httpOnly = true, sameSite = 'Lax', secure, req } = {}
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (path) parts.push(`Path=${path}`);
  if (httpOnly) parts.push('HttpOnly');
  if (maxAge != null) parts.push(`Max-Age=${Math.floor(maxAge)}`);
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure != null ? secure : isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name, { path = '/', req } = {}) {
  return serializeCookie(name, '', { maxAge: 0, path, httpOnly: true, sameSite: 'Lax', req });
}
