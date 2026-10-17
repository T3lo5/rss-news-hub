import { Check, CheckCircle2, Info, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { AiProviderId } from '../types';

// Tipos para a visão geral de configurações por usuário
interface UserSettingsOverview {
  ai: {
    hasUserOverride: boolean;
    defaultProvider: 'auto' | AiProviderId;
    providers: Array<{
      id: AiProviderId;
      configured: boolean;
      baseUrl: string;
      model: string;
    }>;
  };
  telegram: {
    hasUserOverride: boolean;
    chatId: string;
    botTokenSet: boolean;
  };
  email: {
    hasUserOverride: boolean;
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    passwordSet: boolean;
    recipients: string[];
  };
  newsletter: {
    hasUserOverride: boolean;
    enabled: boolean;
    cron: string;
    lookbackDays: number;
    language: string;
    provider: string;
  };
  digest: {
    hasUserOverride: boolean;
    cron: string;
    minScore: number;
    maxItems: number;
  };
}

type Tab = 'ai' | 'telegram' | 'email' | 'newsletter' | 'digest';

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  sensenova: 'SenseNova',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
};

const PROVIDER_HINT_KEYS: Record<AiProviderId, string> = {
  sensenova: 'settings.hintSensenova',
  deepseek: 'settings.hintDeepseek',
  openai: 'settings.hintOpenai',
};

export function UserSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<UserSettingsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('ai');

  // AI form state
  const [defaultProvider, setDefaultProvider] = useState<'auto' | AiProviderId>('auto');
  const [providerForms, setProviderForms] = useState<
    Record<string, { baseUrl: string; model: string; apiKey: string; clear: boolean }>
  >({});

  // Telegram form state
  const [chatId, setChatId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [clearToken, setClearToken] = useState(false);

  // Email form state
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailHost, setEmailHost] = useState('');
  const [emailPort, setEmailPort] = useState('587');
  const [emailSecure, setEmailSecure] = useState(false);
  const [emailUser, setEmailUser] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [clearEmailPass, setClearEmailPass] = useState(false);
  const [emailFrom, setEmailFrom] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');

  // Newsletter form state
  const [nlEnabled, setNlEnabled] = useState(false);
  const [nlCron, setNlCron] = useState('0 8 * * 1');
  const [nlLookback, setNlLookback] = useState('7');

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getUserSettings();
      setSettings(data);

      // AI forms
      setDefaultProvider(data.ai.defaultProvider);
      const forms: Record<
        string,
        { baseUrl: string; model: string; apiKey: string; clear: boolean }
      > = {};
      for (const provider of data.ai.providers) {
        forms[provider.id] = {
          baseUrl: provider.baseUrl,
          model: provider.model,
          apiKey: '',
          clear: false,
        };
      }
      setProviderForms(forms);

      // Telegram
      setChatId(data.telegram.chatId);
      setBotToken('');
      setClearToken(false);

      // Email
      setEmailEnabled(data.email.enabled);
      setEmailHost(data.email.host);
      setEmailPort(String(data.email.port));
      setEmailSecure(data.email.secure);
      setEmailUser(data.email.user);
      setEmailPass('');
      setClearEmailPass(false);
      setEmailFrom(data.email.from);
      setEmailRecipients(data.email.recipients.join(', '));

      // Newsletter
      setNlEnabled(data.newsletter.enabled);
      setNlCron(data.newsletter.cron);
      setNlLookback(String(data.newsletter.lookbackDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errLoad'));
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

  const handleSaveAi = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Record<string, unknown> = { defaultProvider };
      for (const provider of settings.ai.providers) {
        const form = providerForms[provider.id];
        if (!form) continue;
        const override: Record<string, unknown> = {};
        if (form.baseUrl && form.baseUrl !== provider.baseUrl) override.baseUrl = form.baseUrl;
        if (form.model && form.model !== provider.model) override.model = form.model;
        if (form.apiKey) override.apiKey = form.apiKey;
        else if (form.clear) override.apiKey = null;
        if (Object.keys(override).length > 0) {
          payload[provider.id] = override;
        }
      }
      await api.saveUserSetting('ai', payload);

      // Recarrega o overview
      const data = await api.getUserSettings();
      setSettings(data);
      const forms: Record<
        string,
        { baseUrl: string; model: string; apiKey: string; clear: boolean }
      > = {};
      for (const provider of data.ai.providers) {
        forms[provider.id] = {
          baseUrl: provider.baseUrl,
          model: provider.model,
          apiKey: '',
          clear: false,
        };
      }
      setProviderForms(forms);
      setDefaultProvider(data.ai.defaultProvider);
      flashSuccess(t('settings.savedAi'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveAi'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTelegram = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: { chatId: string; botToken?: string | null } = { chatId };
      if (botToken) payload.botToken = botToken;
      else if (clearToken) payload.botToken = null;
      await api.saveUserSetting('telegram', payload);

      const data = await api.getUserSettings();
      setSettings(data);
      setChatId(data.telegram.chatId);
      setBotToken('');
      setClearToken(false);
      flashSuccess(t('settings.savedTelegram'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveTelegram'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        enabled: emailEnabled,
        host: emailHost,
        port: Number(emailPort) || 587,
        secure: emailSecure,
        user: emailUser,
        from: emailFrom,
        recipients: emailRecipients
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      };
      if (emailPass) payload.pass = emailPass;
      else if (clearEmailPass) payload.pass = null;

      await api.saveUserSetting('email', payload);

      const data = await api.getUserSettings();
      setSettings(data);
      setEmailPass('');
      setClearEmailPass(false);
      flashSuccess(t('settings.savedEmail'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveEmail'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNewsletter = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.saveUserSetting('newsletter', {
        enabled: nlEnabled,
        cron: nlCron,
        lookbackDays: Number(nlLookback) || 7,
      });

      const data = await api.getUserSettings();
      setSettings(data);
      flashSuccess('Newsletter settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save newsletter settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverride = async (area: Tab) => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteUserSetting(area);
      const data = await api.getUserSettings();
      setSettings(data);
      flashSuccess(`Override removed — now using global fallback`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove override');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'ai', label: t('nav.ai') || 'AI' },
    { key: 'telegram', label: t('nav.telegram') || 'Telegram' },
    { key: 'email', label: t('nav.email') || 'Email' },
    { key: 'newsletter', label: t('nav.newsletter') || 'Newsletter' },
    { key: 'digest', label: t('nav.digest') || 'Digest' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '720px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t('userSettings.title') || 'My Settings'}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading && <div className="modal-body">{t('app.loading') || 'Loading...'}</div>}

        {error && (
          <div className="error-message" style={{ padding: '8px 16px' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="success-message" style={{ padding: '8px 16px' }}>
            {success}
          </div>
        )}

        {settings && !loading && (
          <div className="modal-body">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`btn ${activeTab === tab.key ? 'btn-primary' : ''}`}
                  style={{ fontSize: '13px' }}
                >
                  {tab.label}
                  {settings[tab.key].hasUserOverride && (
                    <span style={{ marginLeft: '4px' }} title="Using your own config">
                      ●
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Fallback badge */}
            {!settings[activeTab].hasUserOverride && (
              <div className="notice info">
                <Info size={15} />
                <span>
                  {t('userSettings.usingFallback') ||
                    'Using global configuration (set your own below)'}
                </span>
              </div>
            )}

            {settings[activeTab].hasUserOverride && (
              <div className="notice success">
                <CheckCircle2 size={15} />
                <span>{t('userSettings.usingOwn') || 'Using your own configuration'}</span>
                <button
                  className="btn btn-sm btn-secondary spacer"
                  onClick={() => handleDeleteOverride(activeTab)}
                  disabled={saving}
                >
                  {t('userSettings.resetToFallback') || 'Reset to global'}
                </button>
              </div>
            )}

            {/* ── AI TAB ── */}
            {activeTab === 'ai' && (
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                    {t('settings.defaultProvider') || 'Default provider'}
                  </label>
                  <select
                    value={defaultProvider}
                    onChange={(e) => setDefaultProvider(e.target.value as 'auto' | AiProviderId)}
                    style={{ width: '100%', padding: '6px' }}
                  >
                    <option value="auto">Auto (fallback chain)</option>
                    <option value="sensenova">SenseNova</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </div>

                {settings.ai.providers.map((provider) => {
                  const form = providerForms[provider.id];
                  if (!form) return null;
                  return (
                    <div
                      key={provider.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '12px',
                        marginBottom: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: '8px',
                        }}
                      >
                        <strong>{PROVIDER_LABELS[provider.id]}</strong>
                        <span className={`key-status ${provider.configured ? 'set' : 'unset'}`}>
                          {provider.configured ? <Check size={12} /> : null}
                          {provider.configured ? 'configured' : 'not configured'}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-secondary)',
                          marginBottom: '8px',
                        }}
                      >
                        {t(PROVIDER_HINT_KEYS[provider.id]) || provider.baseUrl}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridColumns: '1fr 1fr',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Base URL"
                          value={form.baseUrl}
                          onChange={(e) =>
                            setProviderForms((prev) => ({
                              ...prev,
                              [provider.id]: { ...prev[provider.id], baseUrl: e.target.value },
                            }))
                          }
                        />
                        <input
                          type="text"
                          placeholder="Model"
                          value={form.model}
                          onChange={(e) =>
                            setProviderForms((prev) => ({
                              ...prev,
                              [provider.id]: { ...prev[provider.id], model: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <input
                        type="password"
                        placeholder={
                          provider.configured ? 'API key (leave blank to keep current)' : 'API key'
                        }
                        value={form.apiKey}
                        onChange={(e) =>
                          setProviderForms((prev) => ({
                            ...prev,
                            [provider.id]: { ...prev[provider.id], apiKey: e.target.value },
                          }))
                        }
                        style={{ width: '100%', marginBottom: '8px' }}
                      />
                      {provider.configured && (
                        <label
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={form.clear}
                            onChange={(e) =>
                              setProviderForms((prev) => ({
                                ...prev,
                                [provider.id]: { ...prev[provider.id], clear: e.target.checked },
                              }))
                            }
                          />
                          Clear API key
                        </label>
                      )}
                    </div>
                  );
                })}

                <button className="btn btn-primary" onClick={handleSaveAi} disabled={saving}>
                  {saving ? 'Saving...' : t('settings.saveAi') || 'Save AI settings'}
                </button>
              </div>
            )}

            {/* ── TELEGRAM TAB ── */}
            {activeTab === 'telegram' && (
              <div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                    Bot Token
                  </label>
                  <input
                    type="password"
                    placeholder={
                      settings.telegram.botTokenSet
                        ? 'Bot token (leave blank to keep current)'
                        : 'Bot token'
                    }
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  {settings.telegram.botTokenSet && (
                    <label
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '4px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={clearToken}
                        onChange={(e) => setClearToken(e.target.checked)}
                      />
                      Clear bot token
                    </label>
                  )}
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                    Chat ID
                  </label>
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSaveTelegram} disabled={saving}>
                  {saving ? 'Saving...' : t('settings.saveTelegram') || 'Save Telegram settings'}
                </button>
              </div>
            )}

            {/* ── EMAIL TAB ── */}
            {activeTab === 'email' && (
              <div>
                <label
                  style={{
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '12px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  Enable email delivery
                </label>

                <div
                  style={{
                    display: 'grid',
                    gridColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                      SMTP Host
                    </label>
                    <input
                      type="text"
                      value={emailHost}
                      onChange={(e) => setEmailHost(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                      Port
                    </label>
                    <input
                      type="text"
                      value={emailPort}
                      onChange={(e) => setEmailPort(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <label
                  style={{
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '8px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={emailSecure}
                    onChange={(e) => setEmailSecure(e.target.checked)}
                  />
                  Use TLS/SSL
                </label>

                <div
                  style={{
                    display: 'grid',
                    gridColumns: '1fr 1fr',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                      SMTP User
                    </label>
                    <input
                      type="text"
                      value={emailUser}
                      onChange={(e) => setEmailUser(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                      From
                    </label>
                    <input
                      type="text"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                    SMTP Password
                  </label>
                  <input
                    type="password"
                    placeholder={
                      settings.email.passwordSet
                        ? 'Password (leave blank to keep current)'
                        : 'Password'
                    }
                    value={emailPass}
                    onChange={(e) => setEmailPass(e.target.value)}
                    style={{ width: '100%' }}
                  />
                  {settings.email.passwordSet && (
                    <label
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '4px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={clearEmailPass}
                        onChange={(e) => setClearEmailPass(e.target.checked)}
                      />
                      Clear password
                    </label>
                  )}
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                    Recipients (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <button className="btn btn-primary" onClick={handleSaveEmail} disabled={saving}>
                  {saving ? 'Saving...' : t('settings.saveEmail') || 'Save email settings'}
                </button>
              </div>
            )}

            {/* ── NEWSLETTER TAB ── */}
            {activeTab === 'newsletter' && (
              <div>
                <label
                  style={{
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '12px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={nlEnabled}
                    onChange={(e) => setNlEnabled(e.target.checked)}
                  />
                  Enable my newsletter
                </label>

                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                    Cron schedule (5-field: min hour day month weekday)
                  </label>
                  <input
                    type="text"
                    value={nlCron}
                    onChange={(e) => setNlCron(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', marginBottom: '2px' }}>
                    Lookback days
                  </label>
                  <input
                    type="number"
                    value={nlLookback}
                    onChange={(e) => setNlLookback(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleSaveNewsletter}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save newsletter settings'}
                </button>
              </div>
            )}

            {/* ── DIGEST TAB ── */}
            {activeTab === 'digest' && (
              <div>
                <p
                  style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}
                >
                  {t('userSettings.digestComingSoon') || 'Digest configuration coming soon.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
