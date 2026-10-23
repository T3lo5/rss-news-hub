import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useI18n } from '../i18n';

interface OfflineBannerProps {
  /** Epoch ms of the cached news snapshot being shown, if any. */
  cachedAt?: number | null;
}

/** Thin strip above the header while the browser reports no connection. */
export function OfflineBanner({ cachedAt }: OfflineBannerProps) {
  const { t } = useI18n();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={15} aria-hidden="true" />
      <span>
        {cachedAt ? t('pwa.offlineCached', { since: formatSince(cachedAt, t) }) : t('pwa.offline')}
      </span>
    </div>
  );
}

/** "agora mesmo" / "há 5 min" / "há 2 h" / "há 3 d". */
function formatSince(
  savedAt: number,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60_000));
  if (minutes < 1) return t('pwa.savedNow');
  if (minutes < 60) return t('pwa.savedMinutes', { count: minutes });

  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('pwa.savedHours', { count: hours });

  return t('pwa.savedDays', { count: Math.round(hours / 24) });
}
