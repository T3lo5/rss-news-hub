import { eq } from 'drizzle-orm';
import { getDb, schema } from '../src/db/index.js';

/**
 * Push notification service using Web Push protocol (VAPID).
 *
 * VAPID keys are generated once and persisted in the database. The public key
 * is exposed to the frontend via VITE_VAPID_PUBLIC_KEY env var (build-time)
 * and the private key is stored in the database for signing push messages.
 */

const _VAPID_SUBJECT = 'mailto:admin@rss-news-hub.local'; // Update for production
let vapidKeys: { publicKey: string; privateKey: string } | null = null;

function base64UrlEncode(buffer: ArrayBuffer): string {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]/g, '');
}

export async function getOrCreateVapidKeys() {
  if (vapidKeys) return vapidKeys;

  const db = getDb();
  const rows = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, 'vapid_keys'));

  if (rows[0]?.value) {
    vapidKeys = JSON.parse(rows[0].value);
    return vapidKeys;
  }

  // Generate new keys using crypto.subtle for proper Web Push format
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, // extractable
    ['sign', 'verify']
  );

  // Export in raw format for web-push
  const publicKeyRaw = await crypto.subtle.exportKey('raw', publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', privateKey);

  vapidKeys = {
    publicKey: base64UrlEncode(publicKeyRaw),
    privateKey: base64UrlEncode(privateKeyRaw),
  };

  await db
    .insert(schema.appSettings)
    .values({
      key: 'vapid_keys',
      value: JSON.stringify(vapidKeys),
    })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: JSON.stringify(vapidKeys) },
    });

  return vapidKeys;
}

export function getVapidPublicKey(): string {
  if (!vapidKeys) throw new Error('VAPID keys not initialized');
  return vapidKeys.publicKey;
}

// Web Push payload encryption (simplified - in production use web-push library)
async function encryptPayload(
  payload: string,
  subscription: Record<string, unknown>
): Promise<{
  body: Uint8Array;
  headers: Record<string, string>;
}> {
  // This is a simplified implementation. In production, use the 'web-push' npm package
  // which handles AES-GCM encryption with the subscription's p256dh and auth keys.
  return {
    body: new TextEncoder().encode(payload),
    headers: {
      'Content-Encoding': 'aesgcm',
    },
  };
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: {
    title: string;
    body: string;
    tag?: string;
    url?: string;
    actions?: unknown[];
    requireInteraction?: boolean;
  }
): Promise<boolean> {
  try {
    await getOrCreateVapidKeys();

    // In production, use: import webPush from 'web-push'
    // webPush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey)
    // await webPush.sendNotification(subscription, JSON.stringify(payload))

    // Fallback: direct fetch to push service (requires proper encryption)
    const pushPayload = JSON.stringify(payload);
    const { body, headers } = await encryptPayload(pushPayload, subscription);

    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      body,
      headers: {
        TTL: '86400',
        ...headers,
      },
    });

    if (res.status === 410) {
      // Subscription expired - will be cleaned up
      return false;
    }
    return res.ok;
  } catch (e) {
    console.error('Push send failed:', e);
    return false;
  }
}

export async function sendPushToAllUsers(payload: {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}): Promise<{ sent: number; failed: number }> {
  const db = getDb();
  const subs = await db
    .select({
      endpoint: schema.pushSubscriptions.endpoint,
      p256dh: schema.pushSubscriptions.p256dh,
      auth: schema.pushSubscriptions.auth,
    })
    .from(schema.pushSubscriptions);

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    const ok = await sendPushNotification(sub, payload);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

/** Save a user's push subscription. */
export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string }
) {
  const db = getDb();
  await db
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { p256dh: subscription.p256dh, auth: subscription.auth, userId },
    });
}

/** Remove a user's push subscription. */
export async function removePushSubscription(userId: string, endpoint?: string) {
  const db = getDb();
  if (endpoint) {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  } else {
    await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId));
  }
}

/** Get all push subscriptions for a user. */
export async function getUserPushSubscriptions(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));
}
