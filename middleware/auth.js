import { verifyApiKey } from '../services/api-key.service.js';
import { getUserById } from '../services/auth.service.js';
import {
  getApiKeyFromHeader,
  getTokenFromHeader,
  verifyAccessToken,
} from '../services/jwt.service.js';
import { createRequestLogger } from '../services/logger.js';

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
};

export const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 3,
  [ROLES.USER]: 2,
  [ROLES.VIEWER]: 1,
};

export function hasRole(userRole, requiredRole) {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export async function authenticateRequest(req, res) {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  const _log = createRequestLogger(reqId);

  // Try Bearer token (JWT)
  const bearerToken = getTokenFromHeader(req.headers.authorization);
  if (bearerToken) {
    const payload = await verifyAccessToken(bearerToken);
    if (payload) {
      const user = await getUserById(payload.sub);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
        req.authType = 'jwt';
        return true;
      }
    }
  }

  // Try API Key
  const apiKey = getApiKeyFromHeader(req.headers.authorization);
  if (apiKey) {
    const keyData = await verifyApiKey(apiKey);
    if (keyData) {
      const user = await getUserById(keyData.userId);
      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
        req.authType = 'apikey';
        req.apiKeyId = keyData.id;
        return true;
      }
    }
  }

  return false;
}

export function requireAuth(requiredRole = 'viewer') {
  return async (req, res, next) => {
    const authenticated = await authenticateRequest(req, res);

    if (!(authenticated && req.user)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Authentication required' }));
      return;
    }

    if (!hasRole(req.user.role, requiredRole)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Insufficient permissions' }));
      return;
    }

    next();
  };
}

export function optionalAuth() {
  return async (req, res, next) => {
    await authenticateRequest(req, res);
    next();
  };
}

export function requireAdmin() {
  return requireAuth('admin');
}

export function requireUser() {
  return requireAuth('user');
}

export function requireViewer() {
  return requireAuth('viewer');
}
