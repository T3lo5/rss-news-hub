import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { DigestConfig, DigestPreview, DigestStatus } from '../types';
import { ProviderSelect } from './ProviderSelect';

const CRON_PRESETS = [
  { label: 'Diário 9:00', value: '0 9 * * *' },
  { label: 'Semanal (seg) 9:00', value: '0 9 * * 1' },
  { label: 'Seg-Sex 9:00', value: '0 9 * * 1-5' },
  { label: 'Custom', value: '' },
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
      setSelectedPreset(preset ? preset.label : 'Custom');
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o digest');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setSelectedPreset(preset ? preset.label : 'Custom');
    }
  };

  const handlePresetChange = (label: string) => {
    const preset = CRON_PRESETS.find((p) => p.label === label);
    if (preset) handleChange('cron', preset.value);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await api.updateDigestConfig(config);
      setConfig(saved);
      flashSuccess('Configuração do digest salva!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
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
      setError(err instanceof Error ? err.message : 'Falha ao gerar prévia');
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
            ? `Digest enviado! (${result.itemsCount} itens)`
            : 'Digest gerado, mas nenhum item relevante no período.'
        );
      } else {
        setError(result.error || 'Falha ao enviar o digest');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar o digest');
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
          <h3 id="digest-config-title">🧠 Digest Automático (Best News)</h3>
          <button className="close-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body" style={{ padding: '20px', overflow: 'auto', maxHeight: '75vh' }}>
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
            Seleciona as notícias com maior relevância no período e gera um resumo com IA, enviado
            pelo Telegram. As mudanças ficam salvas e sobrevivem a reinícios.
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
                <strong>Ativar envio agendado</strong>
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                Quando ativo, o digest é gerado e enviado automaticamente no horário do cron.
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
                Enviar também por e-mail
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                Requer SMTP configurado em Configurações → E-mail.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="digestCronPreset">Agendamento:</label>
              <select
                id="digestCronPreset"
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                disabled={loading}
              >
                {CRON_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Cron:{' '}
                <code style={{ background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>
                  {config.cron}
                </code>
              </p>
              {status?.enabled && status.nextRun ? (
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Próxima execução: <strong>{new Date(status.nextRun).toLocaleString()}</strong>
                </p>
              ) : null}
              {selectedPreset === 'Custom' && (
                <input
                  type="text"
                  value={config.cron}
                  onChange={(e) => handleChange('cron', e.target.value)}
                  placeholder="ex: 0 9 * * 1"
                  style={{ marginTop: '8px', fontFamily: 'monospace' }}
                  disabled={loading}
                />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label htmlFor="digestLookback">Janela (dias):</label>
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
                <label htmlFor="digestMinScore">Relevância mínima:</label>
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
                <label htmlFor="digestMaxItems">Máximo de itens:</label>
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
                <label htmlFor="digestProvider">Provedor de IA:</label>
                <ProviderSelect
                  id="digestProvider"
                  value={config.provider}
                  onChange={(value) => handleChange('provider', value)}
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="digestFormat">Formato:</label>
                <select
                  id="digestFormat"
                  value={config.format}
                  onChange={(e) => handleChange('format', e.target.value as DigestConfig['format'])}
                  disabled={loading}
                >
                  <option value="thread">Thread (Twitter/X)</option>
                  <option value="summary">Resumo</option>
                  <option value="linkedin">LinkedIn</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="digestLanguage">Idioma:</label>
                <select
                  id="digestLanguage"
                  value={config.language}
                  onChange={(e) =>
                    handleChange('language', e.target.value as DigestConfig['language'])
                  }
                  disabled={loading}
                >
                  <option value="en">English</option>
                  <option value="pt">Português</option>
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
                {previewing ? '⏳ Gerando...' : '👁️ Pré-visualizar'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSendNow}
                disabled={loading || sending}
              >
                {sending ? '⏳ Enviando...' : '📨 Enviar agora'}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading || saving}>
                {saving ? '⏳ Salvando...' : '💾 Salvar'}
              </button>
            </div>

            {preview && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ marginBottom: '12px' }}>
                  Prévia · {preview.items.length} item(ns)
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
                    Nenhum conteúdo gerado (sem itens relevantes ou sem provedor de IA
                    configurado).
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
