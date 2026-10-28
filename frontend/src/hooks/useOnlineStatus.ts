import { useEffect, useState } from 'react';

let onlineSnapshot = true;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/** Tracks `navigator.onLine` so the UI can tell the user it is offline. */
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    onlineSnapshot = navigator.onLine;
    return onlineSnapshot;
  });

  useEffect(() => {
    const goOnline = () => {
      onlineSnapshot = true;
      setOnline(true);
      notify();
    };
    const goOffline = () => {
      onlineSnapshot = false;
      setOnline(false);
      notify();
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** Get current online status without subscribing (for one-off checks). */
export function getOnlineSnapshot(): boolean {
  return onlineSnapshot;
}

/** Subscribe to online/offline changes (returns unsubscribe). */
export function subscribeOnlineStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
