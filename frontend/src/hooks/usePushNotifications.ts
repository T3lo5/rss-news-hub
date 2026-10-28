import { useCallback, useEffect, useState } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushOptions {
  userVisibleOnly: true;
  applicationServerKey: string;
}

/** Convert base64 URL-safe string to Uint8Array for VAPID key. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Get the push subscription as a plain object for the server. */
export function subscriptionToJSON(subscription: PushSubscription): PushSubscriptionData {
  const key = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  return {
    endpoint: subscription.endpoint,
    p256dh: key ? btoa(String.fromCharCode(...new Uint8Array(key))) : '',
    auth: auth ? btoa(String.fromCharCode(...new Uint8Array(auth))) : '',
  };
}

/** Check if push notifications are supported and permission is not denied. */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator && 'PushManager' in window && Notification.permission !== 'denied'
  );
}

/** Check if user is currently subscribed to push. */
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Subscribe to push notifications. */
export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VAPID public key not configured (VITE_VAPID_PUBLIC_KEY)');
    return null;
  }
  if (!isPushSupported()) return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return subscriptionToJSON(existing);

  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return subscriptionToJSON(subscription);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotAllowedError') {
      // User denied permission
      return null;
    }
    console.error('Push subscription failed:', e);
    throw e;
  }
}

/** Unsubscribe from push notifications. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}

/** Send subscription to server. */
export async function sendSubscriptionToServer(subscription: PushSubscriptionData): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
    credentials: 'include',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to save subscription' }));
    throw new Error(error.error);
  }
}

/** Remove subscription from server. */
export async function removeSubscriptionFromServer(): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Failed to remove subscription' }));
    throw new Error(error.error);
  }
}

/** React hook for push notification state and actions. */
export function usePushNotifications() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
      setSupported(isPushSupported());
      checkSubscription();
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!isPushSupported()) return;
    const sub = await getPushSubscription();
    setSubscribed(Boolean(sub));
  }, []);

  const subscribe = useCallback(async () => {
    if (!isPushSupported()) return;
    setLoading(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult === 'granted') {
        const sub = await subscribeToPush();
        if (sub) {
          await sendSubscriptionToServer(sub);
          setSubscribed(true);
        }
      }
    } catch (e) {
      console.error('Push subscribe failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!isPushSupported()) return;
    setLoading(true);
    try {
      await unsubscribeFromPush();
      await removeSubscriptionFromServer();
      setSubscribed(false);
    } catch (e) {
      console.error('Push unsubscribe failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    subscribed,
    loading,
    supported,
    permission,
    subscribe,
    unsubscribe,
  };
}
