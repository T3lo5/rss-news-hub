import { jwtVerify, SignJWT } from 'jose';

/**
 * Resolve the HMAC secret used to sign and verify JWTs.
 *
 * Production (NODE_ENV=production) requires an explicit JWT_SECRET: the
 * process refuses to boot rather than sign tokens with a public fallback.
 * Development and tests keep a documented fallback (with a warning) so the
 * local workflow needs zero configuration.
 */
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret) {
    if (secret.length < 32) {
      console.warn(
        '[auth] JWT_SECRET is shorter than 32 characters - use a strong random value in production'
      );
    }
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Generate one with: openssl rand -base64 48'
    );
  }

  console.warn('[auth] JWT_SECRET is not set - using the insecure development fallback');
  return 'dev-secret-change-in-production';
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

export async function createAccessToken(user) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function createRefreshToken(user) {
  return new SignJWT({
    sub: user.id,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload;
  } catch {
    return null;
  }
}

export async function verifyAccessToken(token) {
  const payload = await verifyToken(token);
  if (!payload || payload.type === 'refresh') return null;
  return payload;
}

export async function verifyRefreshToken(token) {
  const payload = await verifyToken(token);
  if (payload?.type !== 'refresh') return null;
  return payload;
}

export function getTokenFromHeader(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

export function getApiKeyFromHeader(authHeader) {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'apikey') return null;
  return parts[1];
}
