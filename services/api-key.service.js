import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db/index.js';

const API_KEY_PREFIX = 'rsk_';
const API_KEY_BYTES = 32;

function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

function generateApiKey() {
  const randomPart = randomBytes(API_KEY_BYTES).toString('base64url');
  return `${API_KEY_PREFIX}${randomPart}`;
}

export async function createApiKey(userId, name = 'Default') {
  const key = generateApiKey();
  const keyHash = hashApiKey(key);
  const id = crypto.randomUUID();

  const db = getDb();
  await db.insert(schema.apiKeys).values({
    id,
    userId,
    name,
    keyHash,
    lastUsedAt: null,
  });

  // Return the plain key only once
  return { key, keyHash };
}

export async function verifyApiKey(key) {
  if (!key?.startsWith(API_KEY_PREFIX)) return null;

  const keyHash = hashApiKey(key);
  const db = getDb();

  const result = await db
    .select({
      id: schema.apiKeys.id,
      userId: schema.apiKeys.userId,
      name: schema.apiKeys.name,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.keyHash, keyHash))
    .limit(1);

  if (!result[0]) return null;

  // Update last used timestamp
  await db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, result[0].id));

  return result[0];
}

export async function listApiKeys(userId) {
  const db = getDb();
  return db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId));
}

export async function revokeApiKey(userId, keyId) {
  const db = getDb();
  const result = await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId));
  return result.changes > 0;
}

export function getApiKeyPrefix() {
  return API_KEY_PREFIX;
}
