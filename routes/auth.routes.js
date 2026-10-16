import { requireAdmin } from '../middleware/auth.js';
import {
  changePassword,
  createApiKey,
  createDefaultAdmin,
  createUser,
  deleteUser,
  getUserById,
  listApiKeys,
  listUsers,
  loginUser,
  refreshAccessToken,
  revokeApiKey,
  updateUser,
} from '../services/auth.service.js';
import { clearCookie, parseCookies, serializeCookie } from '../services/cookies.js';
import { REFRESH_TOKEN_TTL_SECONDS } from '../services/jwt.service.js';
import { rateLimitMiddleware } from '../services/rate-limiter.js';
import { schemas, validateBody } from '../services/validation.js';

// The refresh token lives in an HttpOnly cookie scoped to the auth endpoints,
// so it is never exposed to client-side JavaScript (and survives cache clears).
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';
// Outside production the refresh token is also returned in the JSON body to
// keep CLI/API clients and tests working; production relies on the cookie only.
const INCLUDE_REFRESH_IN_BODY = process.env.NODE_ENV !== 'production';

function setRefreshCookie(res, req, token) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE, token, {
      maxAge: REFRESH_TOKEN_TTL_SECONDS,
      path: REFRESH_COOKIE_PATH,
      httpOnly: true,
      sameSite: 'Lax',
      req,
    })
  );
}

function clearRefreshCookie(res, req) {
  res.setHeader('Set-Cookie', clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH, req }));
}

// Brute-force protection for credential endpoints, keyed by client IP.
// Applied before validateBody so rejected payloads still consume budget.
const registerLimiter = rateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60_000,
  keyPrefix: 'auth:register:',
});
const loginLimiter = rateLimitMiddleware({
  maxRequests: 10,
  windowMs: 60_000,
  keyPrefix: 'auth:login:',
});
const refreshLimiter = rateLimitMiddleware({
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'auth:refresh:',
});

// Runs the limiter; returns true when the request may proceed.
// When false, the limiter has already written a 429 response.
function applyLimiter(limiter, req, res) {
  let allowed = false;
  limiter(req, res, () => {
    allowed = true;
  });
  return allowed;
}

// Local helper: server.js keeps its own sendJSON private, and importing it
// from here would create a circular dependency between the two modules.
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Handlers below read req.user.id; anonymous requests must get a 401 instead
// of crashing on undefined. Returns false when the request should be rejected.
function requireAuthedUser(req, res) {
  if (!req.user) {
    sendJSON(res, 401, { ok: false, error: 'Authentication required' });
    return false;
  }
  return true;
}

export async function handleAuthRoutes(req, res, path) {
  // POST /api/auth/register
  if (path === '/api/auth/register' && req.method === 'POST') {
    if (!applyLimiter(registerLimiter, req, res)) return true;
    validateBody(schemas.registerSchema)(req, res, async () => {
      try {
        const { email, password, name } = req.body;
        const user = await createUser(email, password, name, 'user');

        const { accessToken, refreshToken } = await loginUser(email, password);
        setRefreshCookie(res, req, refreshToken);

        sendJSON(res, 201, {
          ok: true,
          data: {
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
            accessToken,
            ...(INCLUDE_REFRESH_IN_BODY ? { refreshToken } : {}),
          },
        });
      } catch (err) {
        sendJSON(res, 400, { ok: false, error: err.message });
      }
    });
    return true;
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && req.method === 'POST') {
    if (!applyLimiter(loginLimiter, req, res)) return true;
    validateBody(schemas.loginSchema)(req, res, async () => {
      const { email, password } = req.body;
      const result = await loginUser(email, password);

      if (!result) {
        sendJSON(res, 401, { ok: false, error: 'Invalid credentials' });
        return;
      }

      setRefreshCookie(res, req, result.refreshToken);
      const data = INCLUDE_REFRESH_IN_BODY
        ? result
        : { user: result.user, accessToken: result.accessToken };
      sendJSON(res, 200, { ok: true, data });
    });
    return true;
  }

  // POST /api/auth/refresh
  if (path === '/api/auth/refresh' && req.method === 'POST') {
    if (!applyLimiter(refreshLimiter, req, res)) return true;
    validateBody(schemas.refreshSchema)(req, res, async () => {
      // Prefer the HttpOnly cookie; fall back to the body for API clients.
      const cookieToken = parseCookies(req)[REFRESH_COOKIE];
      const provided = cookieToken || req.body?.refreshToken;
      const tokens = await refreshAccessToken(provided);

      if (!tokens) {
        clearRefreshCookie(res, req);
        sendJSON(res, 401, { ok: false, error: 'Invalid refresh token' });
        return;
      }

      // Rotate: issue a fresh refresh token and extend the cookie.
      setRefreshCookie(res, req, tokens.refreshToken);
      const data = INCLUDE_REFRESH_IN_BODY ? tokens : { accessToken: tokens.accessToken };
      sendJSON(res, 200, { ok: true, data });
    });
    return true;
  }

  // POST /api/auth/logout
  if (path === '/api/auth/logout' && req.method === 'POST') {
    clearRefreshCookie(res, req);
    sendJSON(res, 200, { ok: true, data: { loggedOut: true } });
    return true;
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && req.method === 'GET') {
    if (!req.user) {
      sendJSON(res, 401, { ok: false, error: 'Not authenticated' });
      return true;
    }

    const user = await getUserById(req.user.id);
    if (!user) {
      sendJSON(res, 404, { ok: false, error: 'User not found' });
      return true;
    }

    sendJSON(res, 200, {
      ok: true,
      data: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    return true;
  }

  // PUT /api/auth/me
  if (path === '/api/auth/me' && req.method === 'PUT') {
    if (!requireAuthedUser(req, res)) return true;
    validateBody(schemas.updateProfileSchema)(req, res, async () => {
      const updated = await updateUser(req.user.id, req.body);
      if (!updated) {
        sendJSON(res, 404, { ok: false, error: 'User not found' });
        return;
      }

      sendJSON(res, 200, {
        ok: true,
        data: { id: updated.id, email: updated.email, name: updated.name, role: updated.role },
      });
    });
    return true;
  }

  // POST /api/auth/change-password
  if (path === '/api/auth/change-password' && req.method === 'POST') {
    if (!requireAuthedUser(req, res)) return true;
    validateBody(schemas.changePasswordSchema)(req, res, async () => {
      const { currentPassword, newPassword } = req.body;
      const success = await changePassword(req.user.id, currentPassword, newPassword);

      if (!success) {
        sendJSON(res, 400, { ok: false, error: 'Current password incorrect' });
        return;
      }

      sendJSON(res, 200, { ok: true, data: { changed: true } });
    });
    return true;
  }

  // POST /api/auth/api-key
  if (path === '/api/auth/api-key' && req.method === 'POST') {
    if (!requireAuthedUser(req, res)) return true;
    validateBody(schemas.createApiKeySchema)(req, res, async () => {
      const { name } = req.body;
      const result = await createApiKey(req.user.id, name);

      sendJSON(res, 201, {
        ok: true,
        data: { key: result.key, name: name },
      });
    });
    return true;
  }

  // GET /api/auth/api-keys
  if (path === '/api/auth/api-keys' && req.method === 'GET') {
    if (!requireAuthedUser(req, res)) return true;
    const keys = await listApiKeys(req.user.id);
    sendJSON(res, 200, { ok: true, data: keys });
    return true;
  }

  // DELETE /api/auth/api-key/:id
  if (path.match(/^\/api\/auth\/api-key\/[^/]+$/) && req.method === 'DELETE') {
    if (!requireAuthedUser(req, res)) return true;
    const keyId = path.split('/').pop();
    const revoked = await revokeApiKey(req.user.id, keyId);

    if (!revoked) {
      sendJSON(res, 404, { ok: false, error: 'API key not found' });
      return true;
    }

    sendJSON(res, 200, { ok: true, data: { revoked: true } });
    return true;
  }

  // Admin routes
  // GET /api/users
  if (path === '/api/users' && req.method === 'GET') {
    requireAdmin()(req, res, async () => {
      const users = await listUsers();
      sendJSON(res, 200, { ok: true, data: users });
    });
    return true;
  }

  // POST /api/users - admin creates a user with an explicit role
  if (path === '/api/users' && req.method === 'POST') {
    requireAdmin()(req, res, () => {
      validateBody(schemas.adminCreateUserSchema)(req, res, async () => {
        const { email, password, name, role } = req.body;
        try {
          const user = await createUser(email, password, name ?? null, role ?? 'user');
          const { passwordHash: _passwordHash, ...safe } = user;
          sendJSON(res, 201, { ok: true, data: safe });
        } catch (err) {
          const conflict = /unique|already exists/i.test(err.message);
          sendJSON(res, conflict ? 409 : 400, { ok: false, error: err.message });
        }
      });
    });
    return true;
  }

  // PUT /api/users/:id
  if (path.match(/^\/api\/users\/[^/]+$/) && req.method === 'PUT') {
    requireAdmin()(req, res, () => {
      validateBody(schemas.updateUserSchema)(req, res, async () => {
        const userId = path.split('/').pop();

        // An admin cannot change their own role: that could lock everyone out.
        if (userId === req.user.id && req.body.role && req.body.role !== req.user.role) {
          sendJSON(res, 400, { ok: false, error: 'Cannot change your own role' });
          return;
        }

        const updated = await updateUser(userId, req.body);

        if (!updated) {
          sendJSON(res, 404, { ok: false, error: 'User not found' });
          return;
        }

        const { passwordHash: _passwordHash, ...safe } = updated;
        sendJSON(res, 200, { ok: true, data: safe });
      });
    });
    return true;
  }

  // DELETE /api/users/:id
  if (path.match(/^\/api\/users\/[^/]+$/) && req.method === 'DELETE') {
    requireAdmin()(req, res, async () => {
      const userId = path.split('/').pop();

      if (userId === req.user.id) {
        sendJSON(res, 400, { ok: false, error: 'Cannot delete yourself' });
        return;
      }

      const deleted = await deleteUser(userId);
      if (!deleted) {
        sendJSON(res, 404, { ok: false, error: 'User not found' });
        return;
      }

      sendJSON(res, 200, { ok: true, data: { deleted: true } });
    });
    return true;
  }

  // POST /api/auth/init-admin (only works if no admin exists)
  if (path === '/api/auth/init-admin' && req.method === 'POST') {
    const admin = await createDefaultAdmin();
    sendJSON(res, 200, { ok: true, data: { email: admin.email, role: admin.role } });
    return true;
  }

  return false;
}
