import { useCallback, useEffect } from 'react';
import { useI18n } from '../i18n';

interface Shortcut {
  key: string;
  description: string;
}

interface ShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
}

export function ShortcutsHelp({ isOpen, onClose, shortcuts }: ShortcutsHelpProps) {
  const { t } = useI18n();
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="shortcuts-title">{t('shortcuts.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="shortcuts-list">
            {shortcuts.map((shortcut, index) => (
              <div key={index} className="shortcut-item">
                <kbd className="shortcut-key">{shortcut.key}</kbd>
                <span className="shortcut-desc">{shortcut.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
