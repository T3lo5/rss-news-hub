import { Check, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type {
  AiProviderId,
  AiProviderOverride,
  AiSettingsUpdate,
  AppSettings,
  EmailSettingsUpdate,
} from '../types';

type ProviderForm = {
  baseUrl: string;
  model: string;
  apiKey: string;
  clear: boolean;
};

const PROVIDER_HINTS: Record<AiProviderId, string> = {
  sensenova: 'settings.hintSensenova',
  deepseek: 'settings.hintDeepseek',
  openai: 'settings.hintOpenai',
};

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [savingAi, setSavingAi] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerTest, setProviderTest] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  const [defaultProvider, setDefaultProvider] = useState<'auto' | AiProviderId>('auto');
  const [providerForms, setProviderForms] = useState<Record<string, ProviderForm>>({});

  const [chatId, setChatId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [clearToken, setClearToken] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailHost, setEmailHost] = useState('');
  const [emailPort, setEmailPort] = useState('587');
  const [emailSecure, setEmailSecure] = useState(false);
  const [emailUser, setEmailUser] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [clearEmailPass, setClearEmailPass] = useState(false);
  const [emailFrom, setEmailFrom] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const [retentionDays, setRetentionDays] = useState('0');
  const [savingRetention, setSavingRetention] = useState(false);
  const [pruning, setPruning] = useState(false);

  // Uma aba por área: antes era um scroll único de ~4 seções, cada uma com
  // 3+ formulários. Trocar de aba também volta o scroll ao topo.
  const [tab, setTab] = useState<'ai' | 'telegram' | 'email' | 'maintenance'>('ai');
  const bodyRef = useRef<HTMLDivElement>(null);
  const switchTab = (next: typeof tab) => {
    setTab(next);
    bodyRef.current?.scrollTo({ top: 0 });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSettings();
      setSettings(data);
      setDefaultProvider(data.ai.defaultProvider);

      const forms: Record<string, ProviderForm> = {};
      for (const provider of data.ai.providers) {
        forms[provider.id] = {
          baseUrl: provider.baseUrl,
          model: provider.model,
          apiKey: '',
          clear: false,
        };
      }
      setProviderForms(forms);

      setChatId(data.telegram.chatId);
      setBotToken('');
      setClearToken(false);

      setEmailEnabled(data.email.enabled);
      setEmailHost(data.email.host);
      setEmailPort(String(data.email.port));
      setEmailSecure(data.email.secure);
      setEmailUser(data.email.user);
      setEmailPass('');
      setClearEmailPass(false);
      setEmailFrom(data.email.from);
      setEmailRecipients(data.email.recipients.join(', '));
      setRetentionDays(String(data.retention.retentionDays));
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

  const updateProviderForm = (id: string, patch: Partial<ProviderForm>) => {
    setProviderForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSaveAi = async () => {
    if (!settings) return;
    setSavingAi(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: AiSettingsUpdate = { defaultProvider };

      for (const provider of settings.ai.providers) {
        const form = providerForms[provider.id];
        if (!form) continue;

        const override: AiProviderOverride = {};
        if (form.baseUrl && form.baseUrl !== provider.baseUrl) override.baseUrl = form.baseUrl;
        if (form.model && form.model !== provider.model) override.model = form.model;
        if (form.apiKey) override.apiKey = form.apiKey;
        else if (form.clear) override.apiKey = null;

        if (Object.keys(override).length > 0) {
          payload[provider.id] = override;
        }
      }

      const ai = await api.updateAiSettings(payload);
      setSettings((prev) => (prev ? { ...prev, ai } : prev));

      const forms: Record<string, ProviderForm> = {};
      for (const provider of ai.providers) {
        forms[provider.id] = {
          baseUrl: provider.baseUrl,
          model: provider.model,
          apiKey: '',
          clear: false,
        };
      }
      setProviderForms(forms);
      flashSuccess(t('settings.savedAi'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveAi'));
    } finally {
      setSavingAi(false);
    }
  };

  const handleTestProvider = async (id: AiProviderId) => {
    setTestingProvider(id);
    setProviderTest((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await api.testAiProvider(id);
      setProviderTest((prev) => ({
        ...prev,
        [id]: {
          ok: true,
          message: result.reply
            ? t('settings.testOk', { reply: result.reply })
            : t('settings.testOkNoReply'),
        },
      }));
    } catch (err) {
      setProviderTest((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : t('settings.errTest') },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSaveTelegram = async () => {
    setSavingTelegram(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: { chatId: string; botToken?: string | null } = { chatId };
      if (botToken) payload.botToken = botToken;
      else if (clearToken) payload.botToken = null;

      const telegram = await api.updateTelegramSettings(payload);
      setSettings((prev) => (prev ? { ...prev, telegram } : prev));
      setBotToken('');
      setClearToken(false);
      flashSuccess(t('settings.savedTelegram'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveTelegram'));
    } finally {
      setSavingTelegram(false);
    }
  };

  const parseRecipients = () =>
    emailRecipients
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: EmailSettingsUpdate = {
        enabled: emailEnabled,
        host: emailHost,
        port: Number(emailPort) || 587,
        secure: emailSecure,
        user: emailUser,
        from: emailFrom,
        recipients: parseRecipients(),
      };
      if (emailPass) payload.pass = emailPass;
      else if (clearEmailPass) payload.pass = null;

      const emailSettings = await api.updateEmailSettings(payload);
      setSettings((prev) => (prev ? { ...prev, email: emailSettings } : prev));
      setEmailPass('');
      setClearEmailPass(false);
      setEmailRecipients(emailSettings.recipients.join(', '));
      flashSuccess(t('settings.savedEmail'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveEmail'));
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setError(null);
    setSuccess(null);
    try {
      const recipients = parseRecipients();
      const result = await api.testEmail(recipients.length ? recipients : undefined);
      flashSuccess(t('settings.testEmailSent', { list: result.accepted.join(', ') }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errTestEmail'));
    } finally {
      setTestingEmail(false);
    }
  };

  const handleRetentionDays = (): number | null => {
    const parsed = Number.parseInt(retentionDays, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setError(t('settings.errRetention'));
      return null;
    }
    return parsed;
  };

  const handleSaveRetention = async () => {
    setError(null);
    setSuccess(null);
    const days = handleRetentionDays();
    if (days === null) return;

    setSavingRetention(true);
    try {
      const retention = await api.updateRetentionSettings(days);
      setSettings((prev) => (prev ? { ...prev, retention } : prev));
      flashSuccess(t('settings.savedRetention'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errSaveRetention'));
    } finally {
      setSavingRetention(false);
    }
  };

  const handlePrune = async () => {
    setError(null);
    setSuccess(null);
    const days = handleRetentionDays();
    if (days === null) return;

    setPruning(true);
    try {
      const result = await api.pruneNews(days > 0 ? days : undefined);
      if (result.skipped) {
        flashSuccess(t('settings.pruneSkipped'));
      } else {
        flashSuccess(t('settings.pruneDone', { count: result.deleted }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.errPrune'));
    } finally {
      setPruning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '760px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="settings-title">{t('settings.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div
          className="modal-body"
          ref={bodyRef}
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

          {loading && !settings ? (
            <p style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p>
          ) : (
            settings && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  {t('settings.introPre')} <code>.env</code>
                  {t('settings.introPost')}
                </p>

                <div className="settings-tabs" role="tablist" aria-label={t('settings.title')}>
                  {(
                    [
                      ['ai', 'settings.aiSection'],
                      ['telegram', 'settings.telegramSection'],
                      ['email', 'settings.emailSection'],
                      ['maintenance', 'settings.maintenance'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      id={`settings-tab-${id}`}
                      type="button"
                      role="tab"
                      className="settings-tab"
                      aria-selected={tab === id}
                      aria-controls={`settings-panel-${id}`}
                      tabIndex={tab === id ? 0 : -1}
                      onClick={() => switchTab(id)}
                    >
                      {t(label)}
                    </button>
                  ))}
                </div>

                {/* AI providers */}
                {tab === 'ai' && (
                  <section id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai">
                    <div className="form-group">
                    <label htmlFor="defaultProvider">{t('settings.defaultProvider')}</label>
                    <select
                      id="defaultProvider"
                      value={defaultProvider}
                      onChange={(e) => setDefaultProvider(e.target.value as 'auto' | AiProviderId)}
                    >
                      <option value="auto">{t('common.autoFirst')}</option>
                      {settings.ai.providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {settings.ai.providers.map((provider) => {
                    const form = providerForms[provider.id] || {
                      baseUrl: provider.baseUrl,
                      model: provider.model,
                      apiKey: '',
                      clear: false,
                    };
                    return (
                      <div
                        key={provider.id}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          padding: '14px',
                          marginTop: '12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '10px',
                            gap: '8px',
                          }}
                        >
                          <strong>{provider.label}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleTestProvider(provider.id)}
                              disabled={testingProvider === provider.id}
                              title={t('settings.testProviderTitle')}
                            >
                              {testingProvider === provider.id
                                ? t('common.testing')
                                : t('common.test')}
                            </button>
                            <span
                              className={`status-badge ${provider.apiKeySet ? 'ok' : 'error'}`}
                              title={
                                provider.apiKeySet
                                  ? t('settings.keySetTitle')
                                  : t('settings.noKeyTitle')
                              }
                            >
                              {provider.apiKeySet ? t('settings.keySet') : t('settings.noKey')}
                            </span>
                          </div>
                        </div>

                        {providerTest[provider.id] && (
                          <div
                            className={`test-result ${providerTest[provider.id].ok ? 'success' : 'error'}`}
                          >
                            {providerTest[provider.id].ok ? <Check size={13} /> : <X size={13} />}{' '}
                            {providerTest[provider.id].message}
                          </div>
                        )}

                        <div className="form-group">
                          <label>{t('settings.apiKeyLabel')}</label>
                          <input
                            type="password"
                            autoComplete="off"
                            value={form.apiKey}
                            placeholder={
                              provider.apiKeySet ? t('settings.secretPlaceholderKeep') : 'sk-...'
                            }
                            onChange={(e) =>
                              updateProviderForm(provider.id, {
                                apiKey: e.target.value,
                                clear: false,
                              })
                            }
                          />
                          {provider.apiKeySet && (
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginTop: '6px',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={form.clear}
                                onChange={(e) =>
                                  updateProviderForm(provider.id, {
                                    clear: e.target.checked,
                                    apiKey: '',
                                  })
                                }
                              />
                              {t('settings.removeKey')}
                            </label>
                          )}
                        </div>

                        <div className="form-group">
                          <label>{t('settings.baseUrl')}</label>
                          <input
                            type="text"
                            value={form.baseUrl}
                            onChange={(e) =>
                              updateProviderForm(provider.id, { baseUrl: e.target.value })
                            }
                          />
                        </div>

                        <div className="form-group">
                          <label>{t('settings.model')}</label>
                          <input
                            type="text"
                            value={form.model}
                            onChange={(e) =>
                              updateProviderForm(provider.id, { model: e.target.value })
                            }
                          />
                          <p
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-secondary)',
                              marginTop: '4px',
                            }}
                          >
                            {t(PROVIDER_HINTS[provider.id])}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button className="btn btn-primary" onClick={handleSaveAi} disabled={savingAi}>
                      {savingAi ? t('common.saving') : t('settings.saveAi')}
                    </button>
                  </div>
                  </section>
                )}

                {/* Telegram */}
                {tab === 'telegram' && (
                  <section
                    id="settings-panel-telegram"
                    role="tabpanel"
                    aria-labelledby="settings-tab-telegram"
                  >
                  <div className="form-group">
                    <label htmlFor="tgChatId">{t('settings.chatId')}</label>
                    <input
                      id="tgChatId"
                      type="text"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="-1001234567890"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="tgBotToken">{t('settings.botToken')}</label>
                    <input
                      id="tgBotToken"
                      type="password"
                      autoComplete="off"
                      value={botToken}
                      placeholder={
                        settings.telegram.botTokenSet
                          ? t('settings.secretPlaceholderKeep')
                          : '123456:ABC-DEF...'
                      }
                      onChange={(e) => {
                        setBotToken(e.target.value);
                        setClearToken(false);
                      }}
                    />
                    {settings.telegram.botTokenSet && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={clearToken}
                          onChange={(e) => {
                            setClearToken(e.target.checked);
                            setBotToken('');
                          }}
                        />
                        {t('settings.removeToken')}
                      </label>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveTelegram}
                      disabled={savingTelegram}
                    >
                      {savingTelegram ? t('common.saving') : t('settings.saveTelegram')}
                    </button>
                  </div>
                  </section>
                )}

                {/* Email */}
                {tab === 'email' && (
                  <section
                    id="settings-panel-email"
                    role="tabpanel"
                    aria-labelledby="settings-tab-email"
                  >
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: 0,
                      marginBottom: '12px',
                    }}
                  >
                    {t('settings.emailIntro')}
                  </p>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      marginBottom: '12px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={emailEnabled}
                      onChange={(e) => setEmailEnabled(e.target.checked)}
                    />
                    {t('settings.emailEnable')}
                  </label>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <div className="form-group">
                      <label htmlFor="smtpHost">{t('settings.smtpHost')}</label>
                      <input
                        id="smtpHost"
                        type="text"
                        value={emailHost}
                        onChange={(e) => setEmailHost(e.target.value)}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="smtpPort">{t('settings.port')}</label>
                      <input
                        id="smtpPort"
                        type="number"
                        value={emailPort}
                        onChange={(e) => setEmailPort(e.target.value)}
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      marginBottom: '12px',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={emailSecure}
                      onChange={(e) => setEmailSecure(e.target.checked)}
                    />
                    {t('settings.emailSecure')}
                  </label>

                  <div className="form-group">
                    <label htmlFor="smtpUser">{t('settings.user')}</label>
                    <input
                      id="smtpUser"
                      type="text"
                      value={emailUser}
                      onChange={(e) => setEmailUser(e.target.value)}
                      placeholder="voce@exemplo.com"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="smtpPass">{t('settings.emailPass')}</label>
                    <input
                      id="smtpPass"
                      type="password"
                      autoComplete="off"
                      value={emailPass}
                      placeholder={
                        settings.email.passwordSet
                          ? t('settings.secretPlaceholderKeep')
                          : 'app password'
                      }
                      onChange={(e) => {
                        setEmailPass(e.target.value);
                        setClearEmailPass(false);
                      }}
                    />
                    {settings.email.passwordSet && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={clearEmailPass}
                          onChange={(e) => {
                            setClearEmailPass(e.target.checked);
                            setEmailPass('');
                          }}
                        />
                        {t('settings.removePass')}
                      </label>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="smtpFrom">{t('settings.from')}</label>
                    <input
                      id="smtpFrom"
                      type="text"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      placeholder="RSS News Hub <voce@exemplo.com>"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="smtpRecipients">{t('settings.recipients')}</label>
                    <input
                      id="smtpRecipients"
                      type="text"
                      value={emailRecipients}
                      onChange={(e) => setEmailRecipients(e.target.value)}
                      placeholder="a@exemplo.com, b@exemplo.com"
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '10px',
                      marginTop: '16px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      className="btn btn-ghost"
                      onClick={handleTestEmail}
                      disabled={testingEmail || !emailHost || !emailFrom}
                      title={t('settings.testEmailTitle')}
                    >
                      {testingEmail ? t('settings.testingEmail') : t('settings.testConnection')}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveEmail}
                      disabled={savingEmail}
                    >
                      {savingEmail ? t('common.saving') : t('settings.saveEmail')}
                    </button>
                  </div>
                  </section>
                )}

                {/* Maintenance / retention */}
                {tab === 'maintenance' && (
                  <section
                    id="settings-panel-maintenance"
                    role="tabpanel"
                    aria-labelledby="settings-tab-maintenance"
                  >
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: 0,
                      marginBottom: '12px',
                    }}
                  >
                    {t('settings.maintenancePre')} <strong>{t('settings.maintenanceOff')}</strong>{' '}
                    {t('settings.maintenancePost')}
                  </p>

                  <div className="form-group" style={{ maxWidth: '220px' }}>
                    <label htmlFor="retentionDays">{t('settings.retentionLabel')}</label>
                    <input
                      id="retentionDays"
                      type="number"
                      min={0}
                      max={3650}
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(e.target.value)}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '10px',
                      marginTop: '16px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button className="btn btn-ghost" onClick={handlePrune} disabled={pruning}>
                      {pruning ? t('settings.pruning') : t('settings.prune')}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveRetention}
                      disabled={savingRetention}
                    >
                      {savingRetention ? t('common.saving') : t('settings.saveRetention')}
                    </button>
                  </div>
                  </section>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
