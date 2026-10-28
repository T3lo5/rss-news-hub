import { authenticateRequest, requireUser } from '../middleware/auth.js';
import {
  getOrCreateVapidKeys,
  getUserPushSubscriptions,
  removePushSubscription,
  savePushSubscription,
} from '../services/push.service.js';

/**
 * Push notification routes.
 * POST /api/push/subscribe - Save subscription
 * DELETE /api/push/subscribe - Remove subscription
 * GET /api/push/subscribe - Get user's subscriptions
 */

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handlePushRoutes(req, res, url) {
  // All push routes require authentication
  const auth = authenticateRequest(req);
  if (!auth) {
    sendJSON(res, 401, { ok: false, error: 'Authentication required' });
    return true;
  }
  requireUser(auth); // viewer+ (just needs to be logged in)

  const userId = auth.user.id;

  // POST /api/push/subscribe - Save push subscription
  if (req.method === 'POST' && url.pathname === '/api/push/subscribe') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const subscription = JSON.parse(body);

    if (!(subscription?.endpoint && subscription?.p256dh && subscription?.auth)) {
      sendJSON(res, 400, { ok: false, error: 'Invalid subscription data' });
      return true;
    }

    try {
      await savePushSubscription(userId, subscription);
      sendJSON(res, 200, { ok: true });
    } catch (e) {
      sendJSON(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to save subscription',
      });
    }
    return true;
  }

  // DELETE /api/push/subscribe - Remove push subscription
  if (req.method === 'DELETE' && url.pathname === '/api/push/subscribe') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { endpoint } = body ? JSON.parse(body) : {};

    try {
      await removePushSubscription(userId, endpoint);
      sendJSON(res, 200, { ok: true });
    } catch (e) {
      sendJSON(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to remove subscription',
      });
    }
    return true;
  }

  // GET /api/push/subscribe - Get user's subscriptions
  if (req.method === 'GET' && url.pathname === '/api/push/subscribe') {
    try {
      const subscriptions = await getUserPushSubscriptions(userId);
      sendJSON(res, 200, { ok: true, data: subscriptions });
    } catch (e) {
      sendJSON(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to get subscriptions',
      });
    }
    return true;
  }

  // GET /api/push/vapid-key - Get VAPID public key
  if (req.method === 'GET' && url.pathname === '/api/push/vapid-key') {
    try {
      const keys = await getOrCreateVapidKeys();
      sendJSON(res, 200, { ok: true, data: { publicKey: keys.publicKey } });
    } catch (e) {
      sendJSON(res, 500, {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to get VAPID key',
      });
    }
    return true;
  }

  return false;
}
