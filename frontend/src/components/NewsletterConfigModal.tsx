import { useCallback, useEffect, useState } from 'react';
import { fetchFeeds } from '../hooks/useFeeds';
import {
  fetchNewsletterConfig,
  fetchNewsletterHistory,
  triggerNewsletter,
  updateNewsletterConfig,
} from '../hooks/useNewsletter';
import { useI18n } from '../i18n';
import type { FeedConfig, NewsletterConfig, NewsletterHistoryEntry } from '../types';
import { ProviderSelect } from './ProviderSelect';

const CRON_PRESETS = [
  { key: 'newsletterConfig.presetDaily', value: '0 9 * * *' },
  { key: 'newsletterConfig.presetWeekly', value: '0 9 * * 1' },
  { key: 'newsletterConfig.presetWeekdays', value: '0 9 * * 1-5' },
  { key: 'newsletterConfig.presetCustom', value: '' },
];

export function NewsletterConfigModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const [config, setConfig] = useState<NewsletterConfig>({
    enabled: false,
    cron: '0 9 * * 1',
    lookbackDays: 7,
    sources: [],
    categories: [],
    language: 'pt',
    provider: 'auto',
    telegramEnabled: true,
    emailEnabled: false,
  });
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [history, setHistory] = useState<NewsletterHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfg, fd, hist] = await Promise.all([
        fetchNewsletterConfig(),
        fetchFeeds(),
        fetchNewsletterHistory(),
      ]);
      setConfig(cfg);
      setFeeds(fd);
      setHistory(hist);

      const preset = CRON_PRESETS.find((p) => p.value === cfg.cron);
      setSelectedPreset(preset ? preset.key : 'newsletterConfig.presetCustom');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newsletterConfig.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  const handleChange = (key: keyof NewsletterConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    if (key === 'cron') {
      const preset = CRON_PRESETS.find((p) => p.value === value);
      setSelectedPreset(preset ? preset.key : 'newsletterConfig.presetCustom');
    }
  };

  const handlePresetChange = (key: string) => {
    const preset = CRON_PRESETS.find((p) => p.key === key);
    if (preset) {
      handleChange('cron', preset.value);
    }
  };

  const handleSourceToggle = (source: string) => {
    setConfig((prev) => ({
      ...prev,
      sources: prev.sources.includes(source)
        ? prev.sources.filter((s) => s !== source)
        : [...prev.sources, source],
    }));
  };

  const handleCategoryToggle = (category: string) => {
    setConfig((prev) => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateNewsletterConfig(config);
      setSuccess(t('newsletterConfig.saved'));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newsletterConfig.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await triggerNewsletter();
      if (result.success) {
        setSuccess(t('newsletterConfig.testSent', { count: result.itemCount }));
      } else {
        setError(result.error || t('newsletterConfig.testFailed'));
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newsletterConfig.testFailed'));
    } finally {
      setTesting(false);
    }
  };

  const allSources = [...new Set(feeds.map((f) => f.source).filter(Boolean))];
  const allCategories = [...new Set(feeds.map((f) => f.category).filter(Boolean))];

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-config-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '700px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="newsletter-config-title">{t('newsletterConfig.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '70vh' }}
        >
          {error && (
            <div className="status error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="status success" style={{ marginBottom: '16px' }}>
              {success}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group">
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => handleChange('enabled', e.target.checked)}
                  disabled={loading}
                />
                <strong>{t('newsletterConfig.enable')}</strong>
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                {t('newsletterConfig.enableHint')}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="cronPreset">{t('newsletterConfig.schedulePreset')}</label>
              <select
                id="cronPreset"
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                disabled={loading}
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {t(p.key)}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('newsletterConfig.cronExpr')}{' '}
                <code
                  style={{
                    background: 'var(--bg-primary)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {config.cron}
                </code>
              </p>
              {selectedPreset === 'newsletterConfig.presetCustom' && (
                <input
                  type="text"
                  value={config.cron}
                  onChange={(e) => handleChange('cron', e.target.value)}
                  placeholder={t('newsletterConfig.cronPlaceholder')}
                  style={{ marginTop: '8px', fontFamily: 'monospace' }}
                  disabled={loading}
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="lookbackDays">{t('newsletterConfig.lookback')}</label>
              <input
                id="lookbackDays"
                type="number"
                min="1"
                max="30"
                value={config.lookbackDays}
                onChange={(e) => handleChange('lookbackDays', parseInt(e.target.value) || 1)}
                disabled={loading}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('newsletterConfig.lookbackHint')}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="language">{t('newsletterConfig.language')}</label>
              <select
                id="language"
                value={config.language}
                onChange={(e) => handleChange('language', e.target.value as 'en' | 'pt')}
                disabled={loading}
              >
                <option value="en">{t('lang.english')}</option>
                <option value="pt">{t('lang.portuguese')}</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="provider">{t('newsletterConfig.provider')}</label>
              <ProviderSelect
                id="provider"
                value={config.provider}
                onChange={(value) => handleChange('provider', value)}
                disabled={loading}
                autoLabel={t('common.autoFirst')}
              />
            </div>

            <div className="form-group">
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={config.telegramEnabled}
                  onChange={(e) => handleChange('telegramEnabled', e.target.checked)}
                  disabled={loading}
                />
                {t('newsletterConfig.telegram')}
              </label>
            </div>

            <div className="form-group">
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={config.emailEnabled}
                  onChange={(e) => handleChange('emailEnabled', e.target.checked)}
                  disabled={loading}
                />
                {t('newsletterConfig.email')}
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                {t('newsletterConfig.emailHint')}
              </p>
            </div>

            <div className="form-group">
              <label>
                {t('newsletterConfig.filterSources', {
                  selected: config.sources.length,
                  total: allSources.length,
                })}
              </label>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  maxHeight: '150px',
                  overflow: 'auto',
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                }}
              >
                {allSources.map((source) => (
                  <label
                    key={source}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={config.sources.includes(source)}
                      onChange={() => handleSourceToggle(source)}
                      disabled={loading}
                    />
                    {source}
                  </label>
                ))}
                {allSources.length === 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {t('newsletterConfig.noFeeds')}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('newsletterConfig.emptySources')}
              </p>
            </div>

            <div className="form-group">
              <label>
                {t('newsletterConfig.filterCategories', {
                  selected: config.categories.length,
                  total: allCategories.length,
                })}
              </label>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  maxHeight: '100px',
                  overflow: 'auto',
                  padding: '8px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                }}
              >
                {allCategories.map((category) => (
                  <label
                    key={category}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={config.categories.includes(category)}
                      onChange={() => handleCategoryToggle(category)}
                      disabled={loading}
                    />
                    {category}
                  </label>
                ))}
                {allCategories.length === 0 && (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {t('newsletterConfig.noCategories')}
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('newsletterConfig.emptyCategories')}
              </p>
            </div>

            <div
              className="modal-footer"
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button
                className="btn btn-primary"
                onClick={handleTest}
                disabled={loading || testing || !config.enabled}
              >
                {testing ? t('newsletterConfig.testing') : t('newsletterConfig.test')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSave}
                disabled={loading || saving}
              >
                {saving ? t('common.saving') : t('newsletterConfig.save')}
              </button>
            </div>

            {history.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px' }}>{t('newsletterConfig.recentRuns')}</h4>
                <div className="table-container">
                  <table className="stats-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>{t('newsletterConfig.colTime')}</th>
                        <th>{t('newsletterConfig.colStatus')}</th>
                        <th>{t('newsletterConfig.colItems')}</th>
                        <th>{t('newsletterConfig.colPreview')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 10).map((entry, i) => (
                        <tr key={i}>
                          <td>{new Date(entry.timestamp).toLocaleString(locale)}</td>
                          <td>
                            <span className={`status-badge ${entry.success ? 'ok' : 'error'}`}>
                              {entry.success
                                ? t('newsletterConfig.success')
                                : t('newsletterConfig.failed')}
                            </span>
                          </td>
                          <td>{entry.itemCount}</td>
                          <td
                            style={{
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: 'monospace',
                              fontSize: '11px',
                            }}
                          >
                            {entry.contentPreview ||
                              (entry.error
                                ? t('newsletterConfig.errorPrefix', { error: entry.error })
                                : '')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
