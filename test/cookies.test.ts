import assert from 'node:assert';
import { describe, test } from 'node:test';
import { clearCookie, parseCookies, serializeCookie } from '../services/cookies.js';

describe('cookie helpers', () => {
  test('parseCookies reads multiple cookies', () => {
    const req = { headers: { cookie: 'a=1; b=two; refresh_token=abc.def.ghi' } } as any;
    const cookies = parseCookies(req);

    assert.strictEqual(cookies.a, '1');
    assert.strictEqual(cookies.b, 'two');
    assert.strictEqual(cookies.refresh_token, 'abc.def.ghi');
  });

  test('parseCookies decodes values and tolerates missing header', () => {
    assert.deepStrictEqual(parseCookies({ headers: {} } as any), {});
    assert.deepStrictEqual(parseCookies(null as any), {});
    assert.strictEqual(parseCookies({ headers: { cookie: 'x=a%20b' } } as any).x, 'a b');
  });

  test('serializeCookie sets HttpOnly, Path, SameSite and Max-Age', () => {
    const out = serializeCookie('refresh_token', 'tok', {
      maxAge: 100,
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'Lax',
      req: { headers: {} },
    });

    assert.match(out, /^refresh_token=tok/);
    assert.match(out, /Path=\/api\/auth/);
    assert.match(out, /HttpOnly/);
    assert.match(out, /Max-Age=100/);
    assert.match(out, /SameSite=Lax/);
    assert.doesNotMatch(out, /Secure/);
  });

  test('serializeCookie omits Secure over plain http but honours the override', () => {
    const http = serializeCookie('t', 'v', { req: { headers: { host: 'localhost' } } });
    assert.doesNotMatch(http, /Secure/);

    const https = serializeCookie('t', 'v', {
      req: { headers: { 'x-forwarded-proto': 'https' } },
    });
    assert.match(https, /Secure/);
  });

  test('clearCookie expires the cookie with Max-Age=0', () => {
    const out = clearCookie('refresh_token', { path: '/api/auth', req: { headers: {} } });

    assert.match(out, /refresh_token=;/);
    assert.match(out, /Max-Age=0/);
    assert.match(out, /HttpOnly/);
  });
});
