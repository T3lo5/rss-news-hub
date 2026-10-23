import { RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';

/**
 * The service worker keeps a new version waiting instead of taking over
 * silently (see frontend/public/sw.js). `main.tsx` dispatches `pwa:update-ready`
 * and reloads the page after `pwa:apply-update` once the new worker activates.
 */
export function UpdateToast() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onReady = () => setReady(true);
    window.addEventListener('pwa:update-ready', onReady);
    return () => window.removeEventListener('pwa:update-ready', onReady);
  }, []);

  if (!ready) return null;

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <RefreshCw size={16} aria-hidden="true" />
      <span>{t('pwa.updateAvailable')}</span>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => {
          setReady(false);
          window.dispatchEvent(new Event('pwa:apply-update'));
        }}
      >
        {t('pwa.reload')}
      </button>
      <button className="close-btn" onClick={() => setReady(false)} aria-label={t('common.close')}>
        <X size={15} />
      </button>
    </div>
  );
}
