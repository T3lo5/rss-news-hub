import { Bell, BellOff, CheckCircle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useI18n } from '../i18n';
import { isBackgroundSyncSupported, offlineQueue } from '../services/offlineQueue';

/**
 * Push notification toggle and pending actions indicator.
 * Shows in the toolbar or settings modal.
 */
export function PushNotificationControls() {
  const { t } = useI18n();
  const { subscribed, loading, supported, permission, subscribe, unsubscribe } =
    usePushNotifications();
  const [pendingCounts, setPendingCounts] = useState({ bookmarks: 0, reads: 0, telegram: 0 });

  const updatePendingCounts = useCallback(async () => {
    try {
      const [bookmarks, reads, telegram] = await Promise.all([
        offlineQueue.bookmark.getPending(),
        offlineQueue.read.getPending(),
        offlineQueue.telegram.getPending(),
      ]);
      setPendingCounts({
        bookmarks: bookmarks.length,
        reads: reads.length,
        telegram: telegram.length,
      });
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (!isBackgroundSyncSupported()) return;
    updatePendingCounts();
    const interval = setInterval(updatePendingCounts, 5000);
    return () => clearInterval(interval);
  }, [updatePendingCounts]);

  const totalPending = pendingCounts.bookmarks + pendingCounts.reads + pendingCounts.telegram;

  if (!supported) return null;

  return (
    <div className="push-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      {/* Pending actions indicator */}
      {totalPending > 0 && (
        <div
          className="pending-indicator"
          style={{ position: 'relative' }}
          title={t('pwa.pendingActions', pendingCounts)}
        >
          <Bell size={18} className="pending-bell" />
          <span className="pending-badge">{totalPending}</span>
        </div>
      )}

      {/* Push subscription toggle */}
      <button
        className={`btn btn-ghost btn-sm ${subscribed ? 'subscribed' : ''}`}
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        aria-pressed={subscribed}
        aria-label={subscribed ? t('pwa.pushDisable') : t('pwa.pushEnable')}
        title={subscribed ? t('pwa.pushDisable') : t('pwa.pushEnable')}
      >
        {loading ? (
          <Loader2 size={16} className="spin" />
        ) : subscribed ? (
          <>
            <Bell size={16} />
            <CheckCircle size={12} className="check" />
          </>
        ) : (
          <BellOff size={16} />
        )}
      </button>

      {/* Permission status tooltip */}
      {permission === 'denied' && (
        <span className="permission-denied" title={t('pwa.pushDenied')}>
          ⚠
        </span>
      )}
    </div>
  );
}

/** Hook to get push notification state for other components. */
export function usePushNotificationState() {
  const { subscribed, loading, supported, permission } = usePushNotifications();
  return { subscribed, loading, supported, permission };
}
