import { Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { DigestConfig, DigestPreview, DigestStatus } from '../types';
import { ProviderSelect } from './ProviderSelect';
import { Status } from './Status';

type Frequency = 'daily' | 'weekdays' | 'weekly';

interface Schedule {
  frequency: Frequency;
  hour: number;
  weekday: number;
}

/**
 * O agendamento é editado só com números (frequência, hora, dia da semana);
 * o cron é um detalhe de implementação do backend e aqui só convertemos.
 */
function composeCron(schedule: Schedule): string {
  const { frequency, hour, weekday } = schedule;
  if (frequency === 'weekdays') return `0 ${hour} * * 1-5`;
  if (frequency === 'weekly') return `0 ${hour} * * ${weekday}`;
  return `0 ${hour} * * *`;
}

/** Lê de volta um cron armazenado para os campos numéricos do formulário. */
function parseCron(cron: string): Schedule {
  const [minute, hour, dayOfMonth, , dayOfWeek] = (cron || '').trim().split(/\s+/);
  const parsedHour = /^\d+$/.test(hour ?? '') ? Math.min(23, Number(hour)) : 9;
  const base = minute === '0' && dayOfMonth === '*';

  if (base && dayOfWeek === '1-5') return { frequency: 'weekdays', hour: parsedHour, weekday: 1 };
  if (base && /^\d$/.test(dayOfWeek ?? '')) {
    return { frequency: 'weekly', hour: parsedHour, weekday: Number(dayOfWeek) };
  }
  if (base && dayOfWeek === '*') return { frequency: 'daily', hour: parsedHour, weekday: 1 };

  // Cron fora do formato suportado (legado): cai no diário 09:00 e o usuário
  // remonta a agenda com os números.
  return { frequency: 'daily', hour: 9, weekday: 1 };
}

function clampNumber(raw: string, min: number, max: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

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
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [hour, setHour] = useState(8);
  const [weekday, setWeekday] = useState(1);

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
      const parsed = parseCron(cfg.cron);
      setFrequency(parsed.frequency);
      setHour(parsed.hour);
      setWeekday(parsed.weekday);
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
      const parsed = parseCron(String(value));
      setFrequency(parsed.frequency);
      setHour(parsed.hour);
      setWeekday(parsed.weekday);
    }
  };

  // Os três números viram o cron que o backend entende; o usuário só edita
  // frequência, hora e dia.
  const updateSchedule = (patch: Partial<Schedule>) => {
    const next: Schedule = { frequency, hour, weekday, ...patch };
    setFrequency(next.frequency);
    setHour(next.hour);
    setWeekday(next.weekday);
    handleChange('cron', composeCron(next));
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

  // Frase humana do agendamento: o usuário lê “toda segunda-feira às 08:00”,
  // nunca o cron. O nome do dia vem do Intl, já no idioma da interface.
  const timeLabel = `${String(hour).padStart(2, '0')}:00`;
  const weekdayLabel = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(
    new Date(Date.UTC(2026, 0, 4 + weekday))
  );
  const summaryKey =
    frequency === 'weekly'
      ? 'digest.summaryWeekly'
      : frequency === 'weekdays'
        ? 'digest.summaryWeekdays'
        : 'digest.summaryDaily';

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
          {error && <Status message={error} type="error" onClose={() => setError(null)} />}
          {success && <Status message={success} type="success" />}

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
              <label htmlFor="digestFrequency">{t('digest.schedule')}</label>
              <select
                id="digestFrequency"
                value={frequency}
                onChange={(e) => updateSchedule({ frequency: e.target.value as Frequency })}
                disabled={loading}
              >
                <option value="daily">{t('digest.freqDaily')}</option>
                <option value="weekdays">{t('digest.freqWeekdays')}</option>
                <option value="weekly">{t('digest.freqWeekly')}</option>
              </select>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: frequency === 'weekly' ? '1fr 1fr' : '1fr',
                gap: '12px',
              }}
            >
              <div className="form-group">
                <label htmlFor="digestHour">{t('digest.hour')}</label>
                <input
                  id="digestHour"
                  type="number"
                  min="0"
                  max="23"
                  value={hour}
                  onChange={(e) => updateSchedule({ hour: clampNumber(e.target.value, 0, 23) })}
                  disabled={loading}
                />
              </div>
              {frequency === 'weekly' ? (
                <div className="form-group">
                  <label htmlFor="digestWeekday">{t('digest.weekday')}</label>
                  <input
                    id="digestWeekday"
                    type="number"
                    min="0"
                    max="6"
                    value={weekday}
                    onChange={(e) => updateSchedule({ weekday: clampNumber(e.target.value, 0, 6) })}
                    disabled={loading}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {weekdayLabel}
                  </p>
                </div>
              ) : null}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {t(summaryKey, { day: weekdayLabel, time: timeLabel })}
            </p>
            {status?.enabled && status.nextRun ? (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('digest.nextRun')}{' '}
                <strong>{new Date(status.nextRun).toLocaleString(locale)}</strong>
              </p>
            ) : null}

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
