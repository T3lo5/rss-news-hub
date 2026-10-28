import { Check, CheckCircle2, Info, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useMarkOnOpen } from '../hooks/useMarkOnOpen';
import { useOpenInReader } from '../hooks/useOpenInReader';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { AiProviderId } from '../types';
import { Status } from './Status';

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
  ui: {
    hasUserOverride: boolean;
    readFilter: 'all' | 'unread' | 'read';
    sortOrder: 'newest' | 'oldest' | 'relevance';
    pageSize: number;
  };
}

type Tab = 'ai' | 'telegram' | 'email' | 'newsletter' | 'digest' | 'reading';

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
  useEscapeKey(isOpen, onClose);
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

  // UI preferences form state (persisted per user in the server)
  const [uiReadFilter, setUiReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [uiSortOrder, setUiSortOrder] = useState<'newest' | 'oldest' | 'relevance'>('newest');
  const [uiPageSize, setUiPageSize] = useState(48);

  const [saving, setSaving] = useState(false);
  const [markOnOpen, setMarkOnOpen] = useMarkOnOpen();
  const [openInReader, setOpenInReader] = useOpenInReader();

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

      // UI preferences (server-persisted, per user)
      setUiReadFilter(data.ui?.readFilter ?? 'all');
      setUiSortOrder(data.ui?.sortOrder ?? 'newest');
      setUiPageSize(data.ui?.pageSize ?? 48);
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
      flashSuccess(t('userSettings.savedNewsletter'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.errSaveNewsletter'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUi = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.saveUserSetting('ui', {
        readFilter: uiReadFilter,
        sortOrder: uiSortOrder,
        pageSize: uiPageSize,
      });

      const data = await api.getUserSettings();
      setSettings(data);
      flashSuccess(t('userSettings.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.errSave'));
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
      flashSuccess(t('userSettings.overrideRemoved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('userSettings.errRemoveOverride'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'ai', label: t('userSettings.tabAi') },
    { key: 'telegram', label: t('userSettings.tabTelegram') },
    { key: 'email', label: t('userSettings.tabEmail') },
    { key: 'newsletter', label: t('userSettings.tabNewsletter') },
    { key: 'digest', label: t('userSettings.tabDigest') },
    { key: 'reading', label: t('userSettings.tabReading') },
  ];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-settings-title"
    >
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="user-settings-title">{t('userSettings.title') || 'My Settings'}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close') || 'Close'}>
            <X size={18} />
          </button>
        </div>

        {loading && <div className="modal-body">{t('app.loading') || 'Loading...'}</div>}

        {error && <Status message={error} type="error" onClose={() => setError(null)} />}
        {success && <Status message={success} type="success" />}

        {settings && !loading && (
          <div className="modal-body">
            {/* Tabs */}
            <div
              className="settings-tabs"
              role="tablist"
              aria-label={t('userSettings.title') || 'My Settings'}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  id={`user-settings-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  aria-controls={
                    activeTab === tab.key ? `user-settings-panel-${tab.key}` : undefined
                  }
                  tabIndex={activeTab === tab.key ? 0 : -1}
                  onClick={() => setActiveTab(tab.key)}
                  className="settings-tab"
                >
                  {tab.label}
                  {tab.key !== 'reading' && settings[tab.key].hasUserOverride && (
                    <span
                      className="settings-tab-dot"
                      title={t('userSettings.ownConfig')}
                      aria-label={t('userSettings.ownConfig')}
                    />
                  )}
                </button>
              ))}
            </div>

            <div
              className="settings-panel"
              role="tabpanel"
              id={`user-settings-panel-${activeTab}`}
              aria-labelledby={`user-settings-tab-${activeTab}`}
            >
              {/* Fallback badge */}
              {activeTab !== 'reading' && !settings[activeTab].hasUserOverride && (
                <div className="notice info">
                  <Info size={15} />
                  <span>
                    {t('userSettings.usingFallback') ||
                      'Using global configuration (set your own below)'}
                  </span>
                </div>
              )}

              {activeTab !== 'reading' && settings[activeTab].hasUserOverride && (
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
                  <div className="form-group">
                    <label htmlFor="user-default-provider">
                      {t('settings.defaultProvider') || 'Default provider'}
                    </label>
                    <select
                      id="user-default-provider"
                      value={defaultProvider}
                      onChange={(e) => setDefaultProvider(e.target.value as 'auto' | AiProviderId)}
                    >
                      <option value="auto">{t('userSettings.autoChain')}</option>
                      <option value="sensenova">SenseNova</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="openai">OpenAI</option>
                    </select>
                  </div>

                  {settings.ai.providers.map((provider) => {
                    const form = providerForms[provider.id];
                    if (!form) return null;
                    return (
                      <div key={provider.id} className="provider-card">
                        <div className="provider-card-head">
                          <strong>{PROVIDER_LABELS[provider.id]}</strong>
                          <span className={`key-status ${provider.configured ? 'set' : 'unset'}`}>
                            {provider.configured ? <Check size={12} /> : null}
                            {provider.configured
                              ? t('userSettings.configured')
                              : t('userSettings.notConfigured')}
                          </span>
                        </div>
                        <p className="field-hint">
                          {t(PROVIDER_HINT_KEYS[provider.id]) || provider.baseUrl}
                        </p>
                        <div className="form-row">
                          <input
                            type="text"
                            placeholder={t('userSettings.baseUrlPlaceholder')}
                            aria-label={`${PROVIDER_LABELS[provider.id]} ${t('userSettings.baseUrlPlaceholder')}`}
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
                            placeholder={t('userSettings.modelPlaceholder')}
                            aria-label={`${PROVIDER_LABELS[provider.id]} ${t('userSettings.modelPlaceholder')}`}
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
                            provider.configured
                              ? t('userSettings.apiKeyKeepPlaceholder')
                              : t('userSettings.apiKeyPlaceholder')
                          }
                          aria-label={`${PROVIDER_LABELS[provider.id]} ${t('userSettings.apiKeyPlaceholder')}`}
                          value={form.apiKey}
                          onChange={(e) =>
                            setProviderForms((prev) => ({
                              ...prev,
                              [provider.id]: { ...prev[provider.id], apiKey: e.target.value },
                            }))
                          }
                        />
                        {provider.configured && (
                          <label className="checkbox-field">
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
                            {t('userSettings.clearApiKey')}
                          </label>
                        )}
                      </div>
                    );
                  })}

                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={handleSaveAi} disabled={saving}>
                      {saving ? t('common.saving') : t('settings.saveAi')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── TELEGRAM TAB ── */}
              {activeTab === 'telegram' && (
                <div>
                  <div className="form-group">
                    <label htmlFor="user-telegram-token">{t('settings.botToken')}</label>
                    <input
                      id="user-telegram-token"
                      type="password"
                      placeholder={
                        settings.telegram.botTokenSet
                          ? t('userSettings.botTokenKeepPlaceholder')
                          : t('userSettings.botTokenPlaceholder')
                      }
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                    />
                    {settings.telegram.botTokenSet && (
                      <label className="checkbox-field form-hint">
                        <input
                          type="checkbox"
                          checked={clearToken}
                          onChange={(e) => setClearToken(e.target.checked)}
                        />
                        {t('userSettings.clearBotToken')}
                      </label>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="user-telegram-chat">{t('userSettings.chatId')}</label>
                    <input
                      id="user-telegram-chat"
                      type="text"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveTelegram}
                      disabled={saving}
                    >
                      {saving ? t('common.saving') : t('settings.saveTelegram')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── EMAIL TAB ── */}
              {activeTab === 'email' && (
                <div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={emailEnabled}
                      onChange={(e) => setEmailEnabled(e.target.checked)}
                    />
                    {t('userSettings.enableEmail')}
                  </label>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="user-email-host">{t('userSettings.smtpHost')}</label>
                      <input
                        id="user-email-host"
                        type="text"
                        value={emailHost}
                        onChange={(e) => setEmailHost(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="user-email-port">{t('userSettings.port')}</label>
                      <input
                        id="user-email-port"
                        type="text"
                        value={emailPort}
                        onChange={(e) => setEmailPort(e.target.value)}
                      />
                    </div>
                  </div>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={emailSecure}
                      onChange={(e) => setEmailSecure(e.target.checked)}
                    />
                    {t('userSettings.useTls')}
                  </label>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="user-email-user">{t('userSettings.smtpUser')}</label>
                      <input
                        id="user-email-user"
                        type="text"
                        value={emailUser}
                        onChange={(e) => setEmailUser(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="user-email-from">{t('userSettings.from')}</label>
                      <input
                        id="user-email-from"
                        type="text"
                        value={emailFrom}
                        onChange={(e) => setEmailFrom(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="user-email-pass">{t('userSettings.smtpPassword')}</label>
                    <input
                      id="user-email-pass"
                      type="password"
                      placeholder={
                        settings.email.passwordSet
                          ? t('userSettings.passwordKeepPlaceholder')
                          : t('userSettings.passwordPlaceholder')
                      }
                      value={emailPass}
                      onChange={(e) => setEmailPass(e.target.value)}
                    />
                    {settings.email.passwordSet && (
                      <label className="checkbox-field form-hint">
                        <input
                          type="checkbox"
                          checked={clearEmailPass}
                          onChange={(e) => setClearEmailPass(e.target.checked)}
                        />
                        {t('userSettings.clearPassword')}
                      </label>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="user-email-recipients">{t('userSettings.recipients')}</label>
                    <input
                      id="user-email-recipients"
                      type="text"
                      value={emailRecipients}
                      onChange={(e) => setEmailRecipients(e.target.value)}
                    />
                  </div>

                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={handleSaveEmail} disabled={saving}>
                      {saving ? t('common.saving') : t('settings.saveEmail')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── NEWSLETTER TAB ── */}
              {activeTab === 'newsletter' && (
                <div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={nlEnabled}
                      onChange={(e) => setNlEnabled(e.target.checked)}
                    />
                    {t('userSettings.enableNewsletter')}
                  </label>

                  <div className="form-group">
                    <label htmlFor="user-nl-cron">{t('userSettings.cronLabel')}</label>
                    <input
                      id="user-nl-cron"
                      type="text"
                      value={nlCron}
                      onChange={(e) => setNlCron(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="user-nl-lookback">{t('userSettings.lookback')}</label>
                    <input
                      id="user-nl-lookback"
                      type="number"
                      value={nlLookback}
                      onChange={(e) => setNlLookback(e.target.value)}
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveNewsletter}
                      disabled={saving}
                    >
                      {saving ? t('common.saving') : t('userSettings.saveNewsletter')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── DIGEST TAB ── */}
              {activeTab === 'digest' && (
                <p className="field-hint">
                  {t('userSettings.digestComingSoon') || 'Digest configuration coming soon.'}
                </p>
              )}

              {/* ── READING TAB ── */}
              {activeTab === 'reading' && (
                <div>
                  <h4 style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
                    {t('userSettings.uiPreferences') || 'Preferências de lista (salvas no servidor)'}
                  </h4>

                  <div className="form-group">
                    <label htmlFor="ui-read-filter">{t('userSettings.uiReadFilter') || 'Filtro padrão'}</label>
                    <select
                      id="ui-read-filter"
                      value={uiReadFilter}
                      onChange={(e) => setUiReadFilter(e.target.value as 'all' | 'unread' | 'read')}
                    >
                      <option value="all">{t('toolbar.read.all') || 'Todas'}</option>
                      <option value="unread">{t('toolbar.read.unread') || 'Não lidas'}</option>
                      <option value="read">{t('toolbar.read.read') || 'Lidas'}</option>
                    </select>
                    <p className="field-hint">{t('userSettings.uiReadFilterHint') || 'Persistido por usuário — sincroniza entre dispositivos.'}</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="ui-sort-order">{t('userSettings.uiSortOrder') || 'Ordenação padrão'}</label>
                    <select
                      id="ui-sort-order"
                      value={uiSortOrder}
                      onChange={(e) => setUiSortOrder(e.target.value as 'newest' | 'oldest' | 'relevance')}
                    >
                      <option value="newest">{t('toolbar.newest') || 'Mais recentes'}</option>
                      <option value="oldest">{t('toolbar.oldest') || 'Mais antigos'}</option>
                      <option value="relevance">{t('toolbar.relevance') || 'Relevância'}</option>
                    </select>
                    <p className="field-hint">{t('userSettings.uiSortOrderHint') || 'Persistido por usuário — sincroniza entre dispositivos.'}</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="ui-page-size">{t('userSettings.uiPageSize') || 'Itens por página'}</label>
                    <select
                      id="ui-page-size"
                      value={uiPageSize}
                      onChange={(e) => setUiPageSize(Number(e.target.value))}
                    >
                      <option value={24}>{t('userSettings.pageSize24') || '24'}</option>
                      <option value={48}>{t('userSettings.pageSize48') || '48'}</option>
                      <option value={72}>{t('userSettings.pageSize72') || '72'}</option>
                      <option value={96}>{t('userSettings.pageSize96') || '96'}</option>
                    </select>
                    <p className="field-hint">{t('userSettings.uiPageSizeHint') || 'Quantidade de cards carregados de cada vez.'}</p>
                  </div>

                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveUi}
                      disabled={saving}
                    >
                      {saving ? t('common.saving') : t('userSettings.save')}
                    </button>
                  </div>

                  <hr style={{ margin: '24px 0' }} />

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={markOnOpen}
                      onChange={(event) => setMarkOnOpen(event.target.checked)}
                    />
                    {t('userSettings.markOnOpen')}
                  </label>
                  <p className="field-hint">{t('userSettings.markOnOpenHint')}</p>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={openInReader}
                      onChange={(event) => setOpenInReader(event.target.checked)}
                    />
                    {t('userSettings.openInReader')}
                  </label>
                  <p className="field-hint">{t('userSettings.openInReaderHint')}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
