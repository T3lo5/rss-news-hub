import { useCallback, useEffect, useState } from 'react';
import { fetchFeeds } from '../hooks/useFeeds';
import {
  fetchNewsletterConfig,
  fetchNewsletterHistory,
  triggerNewsletter,
  updateNewsletterConfig,
} from '../hooks/useNewsletter';
import type { FeedConfig, NewsletterConfig, NewsletterHistoryEntry } from '../types';

const CRON_PRESETS = [
  { label: 'Daily 9:00', value: '0 9 * * *' },
  { label: 'Weekly Monday 9:00', value: '0 9 * * 1' },
  { label: 'Mon-Fri 9:00', value: '0 9 * * 1-5' },
  { label: 'Custom', value: '' },
];

export function NewsletterConfigModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
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
      setSelectedPreset(preset ? preset.label : 'Custom');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen, loadData]);

  const handleChange = (key: keyof NewsletterConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    if (key === 'cron') {
      const preset = CRON_PRESETS.find((p) => p.value === value);
      setSelectedPreset(preset ? preset.label : 'Custom');
    }
  };

  const handlePresetChange = (label: string) => {
    const preset = CRON_PRESETS.find((p) => p.label === label);
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
      setSuccess('Configuration saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
        setSuccess(`Test newsletter sent! (${result.itemCount} items)`);
      } else {
        setError(result.error || 'Test failed');
      }
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test failed');
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
          <h3 id="newsletter-config-title">📰 Newsletter Scheduler</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
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
                <strong>Enable Scheduled Newsletter</strong>
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                When enabled, a newsletter will be generated and sent automatically on schedule.
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="cronPreset">Schedule Preset:</label>
              <select
                id="cronPreset"
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
                Cron expression:{' '}
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
              {selectedPreset === 'Custom' && (
                <input
                  type="text"
                  value={config.cron}
                  onChange={(e) => handleChange('cron', e.target.value)}
                  placeholder="e.g. 0 9 * * 1"
                  style={{ marginTop: '8px', fontFamily: 'monospace' }}
                  disabled={loading}
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="lookbackDays">Lookback Days:</label>
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
                Include news from the last N days
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="language">Language:</label>
              <select
                id="language"
                value={config.language}
                onChange={(e) => handleChange('language', e.target.value as 'en' | 'pt')}
                disabled={loading}
              >
                <option value="en">English</option>
                <option value="pt">Português</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="provider">AI Provider:</label>
              <select
                id="provider"
                value={config.provider}
                onChange={(e) => handleChange('provider', e.target.value as any)}
                disabled={loading}
              >
                <option value="auto">Auto (first available)</option>
                <option value="sensenova">SenseNova</option>
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
              </select>
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
                Send via Telegram
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
                Send via E-mail
              </label>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  marginLeft: '24px',
                }}
              >
                Requires SMTP configured in Settings → E-mail.
              </p>
            </div>

            <div className="form-group">
              <label>
                Filter by Sources ({config.sources.length}/{allSources.length}):
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
                    No feeds loaded
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Empty = all sources
              </p>
            </div>

            <div className="form-group">
              <label>
                Filter by Categories ({config.categories.length}/{allCategories.length}):
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
                    No categories
                  </span>
                )}
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Empty = all categories
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
                {testing ? '⏳ Testing...' : '🧪 Test Now'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSave}
                disabled={loading || saving}
              >
                {saving ? '⏳ Saving...' : '💾 Save Config'}
              </button>
            </div>

            {history.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ marginBottom: '12px' }}>Recent Runs</h4>
                <div className="table-container">
                  <table className="stats-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Items</th>
                        <th>Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 10).map((entry, i) => (
                        <tr key={i}>
                          <td>{new Date(entry.timestamp).toLocaleString()}</td>
                          <td>
                            <span className={`status-badge ${entry.success ? 'ok' : 'error'}`}>
                              {entry.success ? 'Success' : 'Failed'}
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
                            {entry.contentPreview || (entry.error ? `Error: ${entry.error}` : '')}
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
