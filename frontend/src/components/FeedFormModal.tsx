import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { testFeed } from '../hooks/useFeeds';
import { useI18n } from '../i18n';
import type { FeedConfig } from '../types';

interface FeedFormModalProps {
  feed?: FeedConfig | null;
  onSubmit: (data: Omit<FeedConfig, 'id'>) => Promise<void>;
  onClose: () => void;
}

export function FeedFormModal({ feed, onSubmit, onClose }: FeedFormModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [category, setCategory] = useState('General');
  const [categories, setCategories] = useState<string[]>([
    'General',
    'Tech',
    'AI/ML',
    'Security',
    'DevOps',
    'Science',
    'News',
  ]);
  const [customCategory, setCustomCategory] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    preview?: Array<{ title: string; link: string }>;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (feed) {
      setName(feed.name);
      setUrl(feed.url);
      setEnabled(feed.enabled);
      setCategory(feed.category);
      if (!categories.includes(feed.category)) {
        setCategories((prev) => [...prev, feed.category]);
      }
    } else {
      setName('');
      setUrl('');
      setEnabled(true);
      setCategory('General');
      setCustomCategory('');
    }
    setTestResult(null);
    setErrors({});
  }, [feed, categories]);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = t('feedForm.errName');
    if (!url.trim()) newErrors.url = t('feedForm.errUrl');
    else {
      try {
        new URL(url);
      } catch {
        newErrors.url = t('feedForm.errUrlInvalid');
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, url, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const finalCategory = category === 'custom' ? customCategory.trim() : category;
    if (!finalCategory) {
      setErrors((prev) => ({ ...prev, category: t('feedForm.errCategory') }));
      return;
    }

    await onSubmit({ name: name.trim(), url: url.trim(), enabled, category: finalCategory });
    onClose();
  };

  const handleTest = async () => {
    if (!validate()) return;
    if (!feed?.id) return;

    setTesting(true);
    setTestResult(null);
    try {
      const result = await testFeed(feed.id);
      setTestResult({
        success: result.success,
        message: result.success
          ? t('feedForm.testSuccess', { count: result.itemCount })
          : t('feedForm.testError', { error: result.error }),
        preview: result.preview?.slice(0, 3),
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: t('feedForm.testError', {
          error: err instanceof Error ? err.message : t('feedForm.unknownError'),
        }),
      });
    } finally {
      setTesting(false);
    }
  };

  const isEditing = Boolean(feed);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-form-title"
    >
      <div className="modal" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="feed-form-title">
            {isEditing ? t('feedForm.editTitle') : t('feedForm.addFeed')}
          </h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="feed-name">{t('feedForm.name')}</label>
            <input
              id="feed-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('feedForm.namePlaceholder')}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="feed-url">{t('feedForm.url')}</label>
            <input
              id="feed-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/rss.xml"
              className={errors.url ? 'error' : ''}
            />
            {errors.url && <span className="error-text">{errors.url}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="feed-category">{t('feedForm.category')}</label>
            <select
              id="feed-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="custom">{t('feedForm.custom')}</option>
            </select>
            {category === 'custom' && (
              <input
                type="text"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder={t('feedForm.customPlaceholder')}
                style={{ marginTop: '8px' }}
              />
            )}
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{t('feedForm.enabled')}</span>
            </label>
          </div>

          {testResult && (
            <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>
                {testResult.success ? <Check size={13} /> : <X size={13} />} {testResult.message}
              </div>
              {testResult.preview && testResult.preview.length > 0 && (
                <div style={{ fontSize: '12px', opacity: 0.8 }}>
                  {t('feedForm.preview')}
                  <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    {testResult.preview.map((item, i) => (
                      <li key={i}>
                        <a href={item.link} target="_blank" rel="noopener noreferrer">
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleTest}
              disabled={testing || !feed?.id}
            >
              {testing ? t('feedForm.testing') : t('feedForm.test')}
            </button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? t('feedForm.saveChanges') : t('feedForm.addFeed')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
