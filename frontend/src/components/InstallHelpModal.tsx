import { Share, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';

interface InstallHelpModalProps {
  onClose: () => void;
}

/** iOS has no `beforeinstallprompt`, so explain the manual Add to Home Screen. */
export function InstallHelpModal({ onClose }: InstallHelpModalProps) {
  const { t } = useI18n();
  useEscapeKey(true, onClose);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-help-title"
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 id="install-help-title">
            <Share size={18} aria-hidden="true" />
            {t('pwa.installHelp.title')}
          </h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <p className="install-help-intro">{t('pwa.installHelp.intro')}</p>
          <ol className="install-help-steps">
            <li>{t('pwa.installHelp.step1')}</li>
            <li>{t('pwa.installHelp.step2')}</li>
            <li>{t('pwa.installHelp.step3')}</li>
          </ol>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            {t('pwa.installHelp.gotIt')}
          </button>
        </div>
      </div>
    </div>
  );
}
