import { Save, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n';

interface AddModalProps {
  onSubmit: (data: { title: string; link: string; source?: string; description?: string }) => void;
  onClose: () => void;
}

export function AddModal({ onSubmit, onClose }: AddModalProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [source, setSource] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(title.trim() && link.trim())) return;

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        link: link.trim(),
        source: source.trim() || 'Manual',
        description: description.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-modal-title"
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="add-modal-title">{t('add.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="add-modal-form">
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="addTitle">{t('add.labelTitle')}</label>
              <input
                id="addTitle"
                type="text"
                placeholder={t('add.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="addLink">{t('add.labelLink')}</label>
              <input
                id="addLink"
                type="url"
                placeholder={t('add.linkPlaceholder')}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="addSource">{t('add.labelSource')}</label>
              <input
                id="addSource"
                type="text"
                placeholder={t('add.sourcePlaceholder')}
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="addDesc">{t('add.labelDescription')}</label>
              <textarea
                id="addDesc"
                placeholder={t('add.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              <Save size={15} />
              {submitting ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
