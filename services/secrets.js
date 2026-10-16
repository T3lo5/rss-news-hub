// Symmetric encryption for secrets stored in the database (API keys, bot
// tokens). AES-256-GCM with a key derived from SETTINGS_ENCRYPTION_KEY (or, as
// a fallback, JWT_SECRET — which is mandatory in production). Values are stored
// as "enc:v1:<ivB64>:<tagB64>:<ctB64>"; anything without that prefix is treated
// as plaintext so legacy/manually-edited values keep working.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const PREFIX = 'enc:v1:';
const KDF_SALT = 'rss-news-hub:settings:v1';

let cachedKey = null;

function resolveKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY (or JWT_SECRET) is required in production to encrypt settings'
    );
  }
  const base = secret || 'dev-secret-change-in-production';
  cachedKey = scryptSync(base, KDF_SALT, 32);
  return cachedKey;
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plain) {
  if (plain == null || plain === '') return '';
  if (isEncrypted(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', resolveKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(stored) {
  if (!stored) return '';
  if (!isEncrypted(stored)) return stored;
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':');
    const decipher = createDecipheriv('aes-256-gcm', resolveKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered value — never throw into request handling.
    return '';
  }
}

// Test-only hook: drop the memoized key after changing the env.
export function __resetKeyCache() {
  cachedKey = null;
}
