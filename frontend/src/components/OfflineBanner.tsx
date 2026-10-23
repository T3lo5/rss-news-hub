import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useI18n } from '../i18n';

/** Thin strip above the header while the browser reports no connection. */
export function OfflineBanner() {
  const { t } = useI18n();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={15} aria-hidden="true" />
      <span>{t('pwa.offline')}</span>
    </div>
  );
}
