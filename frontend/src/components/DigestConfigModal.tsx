import { Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { DigestConfig, DigestPreview, DigestStatus } from '../types';
import { ProviderSelect } from './ProviderSelect';

const CRON_PRESETS = [
  { key: 'digest.presetDaily', value: '0 9 * * *' },
  { key: 'digest.presetWeekly', value: '0 9 * * 1' },
  { key: 'digest.presetWeekdays', value: '0 9 * * 1-5' },
  { key: 'digest.presetCustom', value: '' },
];

const DEFAULT_CONFIG: DigestConfig = {
  enabled: false,
  cron: '0 8 * * 1',
  lookbackDays: 7,
  minRelevanceScore: 70,
  maxItems: 10,
  provider: 'auto',
  format: 'thread',
  language: 'en',
  emailEnabled: false,
};

export function DigestConfigModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t, language } = useI18n();
  useEscapeKey(isOpen, onClose);
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const [config, setConfig] = useState<DigestConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<DigestStatus | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  const [preview, setPreview] = useState<DigestPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfg, status] = await Promise.all([api.getDigestConfig(), api.getDigestStatus()]);
      setConfig(cfg);
      setStatus(status);
      const preset = CRON_PRESETS.find((p) => p.value === cfg.cron);
      setSelectedPreset(preset ? preset.key : 'digest.presetCustom');
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('digest.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const flashSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleChange = <K extends keyof DigestConfig>(key: K, value: DigestConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    if (key === 'cron') {
      const preset = CRON_PRESETS.find((p) => p.value === value);
      setSelectedPreset(preset ? preset.key : 'digest.presetCustom');
    }
  };

  const handlePresetChange = (key: string) => {
    const preset = CRON_PRESETS.find((p) => p.key === key);
    if (preset) handleChange('cron', preset.value);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await api.updateDigestConfig(config);
      setConfig(saved);
      flashSuccess(t('digest.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('digest.errSave'));
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.previewDigest({
        lookbackDays: config.lookbackDays,
        minRelevanceScore: config.minRelevanceScore,
        maxItems: config.maxItems,
        format: config.format,
        language: config.language,
        provider: config.provider,
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('digest.errPreview'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.triggerDigest();
      if (result.success) {
        flashSuccess(
          result.itemsCount > 0
            ? t('digest.sentCount', { count: result.itemsCount })
            : t('digest.sentEmpty')
        );
      } else {
        setError(result.error || t('digest.errSend'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('digest.errSend'));
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="digest-config-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '760px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="digest-config-title">{t('digest.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '75vh' }}
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

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 0 }}>
            {t('digest.intro')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
                <strong>{t('digest.enableScheduled')}</strong>
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                {t('digest.enableScheduledHint')}
              </p>
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
                {t('digest.sendEmail')}
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                {t('digest.sendEmailHint')}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="digestCronPreset">{t('digest.schedule')}</label>
              <select
                id="digestCronPreset"
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
                {t('digest.cron')}{' '}
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
              {status?.enabled && status.nextRun ? (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {t('digest.nextRun')}{' '}
                  <strong>{new Date(status.nextRun).toLocaleString(locale)}</strong>
                </p>
              ) : null}
              {selectedPreset === 'digest.presetCustom' && (
                <input
                  type="text"
                  value={config.cron}
                  onChange={(e) => handleChange('cron', e.target.value)}
                  placeholder={t('digest.cronPlaceholder')}
                  style={{ marginTop: '8px', fontFamily: 'monospace' }}
                  disabled={loading}
                />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label htmlFor="digestLookback">{t('digest.lookback')}</label>
                <input
                  id="digestLookback"
                  type="number"
                  min="1"
                  max="30"
                  value={config.lookbackDays}
                  onChange={(e) => handleChange('lookbackDays', parseInt(e.target.value, 10) || 1)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="digestMinScore">{t('digest.minScore')}</label>
                <input
                  id="digestMinScore"
                  type="number"
                  min="0"
                  max="100"
                  value={config.minRelevanceScore}
                  onChange={(e) =>
                    handleChange('minRelevanceScore', parseInt(e.target.value, 10) || 0)
                  }
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="digestMaxItems">{t('digest.maxItems')}</label>
                <input
                  id="digestMaxItems"
                  type="number"
                  min="1"
                  max="50"
                  value={config.maxItems}
                  onChange={(e) => handleChange('maxItems', parseInt(e.target.value, 10) || 1)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="digestProvider">{t('digest.provider')}</label>
                <ProviderSelect
                  id="digestProvider"
                  value={config.provider}
                  onChange={(value) => handleChange('provider', value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="digestFormat">{t('digest.format')}</label>
                <select
                  id="digestFormat"
                  value={config.format}
                  onChange={(e) => handleChange('format', e.target.value as DigestConfig['format'])}
                  disabled={loading}
                >
                  <option value="thread">{t('digest.formatThread')}</option>
                  <option value="summary">{t('digest.formatSummary')}</option>
                  <option value="linkedin">{t('digest.formatLinkedin')}</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="digestLanguage">{t('digest.language')}</label>
                <select
                  id="digestLanguage"
                  value={config.language}
                  onChange={(e) =>
                    handleChange('language', e.target.value as DigestConfig['language'])
                  }
                  disabled={loading}
                >
                  <option value="en">{t('lang.english')}</option>
                  <option value="pt">{t('lang.portuguese')}</option>
                </select>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                paddingTop: '16px',
                borderTop: '1px solid var(--border)',
              }}
            >
              <button
                className="btn btn-secondary"
                onClick={handlePreview}
                disabled={loading || previewing}
              >
                {previewing ? t('digest.previewing') : t('digest.preview')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSendNow}
                disabled={loading || sending}
              >
                {sending ? t('digest.sending') : t('digest.sendNow')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading || saving}>
                <Save size={15} />
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>

            {preview && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ marginBottom: '12px' }}>
                  {t('digest.previewTitle', { count: preview.items.length })}
                </h4>

                {preview.content ? (
                  <pre
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      padding: '12px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '13px',
                      maxHeight: '280px',
                      overflow: 'auto',
                      marginBottom: '16px',
                    }}
                  >
                    {preview.content}
                  </pre>
                ) : (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {t('digest.noContent')}
                  </p>
                )}

                {preview.items.length > 0 && (
                  <ol style={{ fontSize: '13px', paddingLeft: '20px' }}>
                    {preview.items.map((item) => (
                      <li key={item.id || item.link} style={{ marginBottom: '6px' }}>
                        <a href={item.link} target="_blank" rel="noreferrer">
                          {item.title}
                        </a>
                        {typeof item.relevanceScore === 'number' && (
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {' '}
                            · {item.relevanceScore}/100
                          </span>
                        )}
                        <span style={{ color: 'var(--text-secondary)' }}> · {item.source}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
