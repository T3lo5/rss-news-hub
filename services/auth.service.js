import { randomBytes } from 'node:crypto';
import argon2 from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db/index.js';
import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from './api-key.service.js';
import { createAccessToken, createRefreshToken, verifyRefreshToken } from './jwt.service.js';

const SESSION_TOKEN_BYTES = 32;

function generateSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

async function hashPassword(password) {
  return argon2.hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function verifyPassword(password, hash) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function createUser(email, password, name = null, role = 'user') {
  const db = getDb();

  // Check if user exists
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (existing[0]) {
    throw new Error('User with this email already exists');
  }

  const passwordHash = await hashPassword(password);
  const userId = randomBytes(16).toString('hex');

  const user = await db
    .insert(schema.users)
    .values({
      id: userId,
      email,
      name,
      passwordHash,
      role,
    })
    .returning();

  return user[0];
}

export async function getUserByEmail(email) {
  const db = getDb();
  const result = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return result[0];
}

export async function getUserById(id) {
  const db = getDb();
  const result = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return result[0];
}

export async function authenticateUser(email, password) {
  const user = await getUserByEmail(email);
  if (!user?.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return user;
}

export async function loginUser(email, password) {
  const user = await authenticateUser(email, password);
  if (!user) return null;

  const accessToken = await createAccessToken(user);
  const refreshToken = await createRefreshToken(user);

  // Store refresh token hash in session (optional - for revocation)
  // For now, we'll use stateless refresh tokens

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshAccessToken(refreshToken) {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return null;

  const user = await getUserById(payload.sub);
  if (!user) return null;

  const accessToken = await createAccessToken(user);
  const _newRefreshToken = await createRefreshToken(user);

  return { accessToken, refreshToken };
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await getUserById(userId);
  if (!user?.passwordHash) return false;

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return false;

  const passwordHash = await hashPassword(newPassword);
  const db = getDb();

  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return true;
}

export async function updateUser(userId, updates) {
  const db = getDb();
  const allowedFields = ['name', 'role'];
  const filtered = {};

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }

  if (Object.keys(filtered).length === 0) return null;

  const result = await db
    .update(schema.users)
    .set({ ...filtered, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();

  return result[0];
}

export async function deleteUser(userId) {
  const db = getDb();
  const result = await db.delete(schema.users).where(eq(schema.users.id, userId));
  return result.changes > 0;
}

export async function listUsers() {
  const db = getDb();
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(schema.users.createdAt);
}

// API Key management
export { createApiKey, listApiKeys, revokeApiKey, verifyApiKey };

// Session management (for web UI with cookies)
export async function createSession(userId) {
  const token = generateSessionToken();
  const db = getDb();

  await db.insert(schema.sessions).values({
    id: token,
    userId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });

  return token;
}

export async function validateSession(token) {
  if (!token) return null;

  const db = getDb();
  const result = await db
    .select({
      userId: schema.sessions.userId,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, token))
    .limit(1);

  if (!result[0]) return null;
  if (new Date(result[0].expiresAt) < new Date()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
    return null;
  }

  return result[0].userId;
}

export async function deleteSession(token) {
  const db = getDb();
  const result = await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
  return result.changes > 0;
}

export async function createDefaultAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@localhost';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';

  const existing = await getUserByEmail(adminEmail);
  if (existing) return existing;

  return createUser(adminEmail, adminPassword, 'Admin', 'admin');
}
