import { useCallback, useEffect, useState } from 'react';
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
  sensenova: 'Consumido via SDK OpenAI (base URL termina em /v1).',
  deepseek: 'Padrão: https://api.deepseek.com',
  openai: 'Padrão: https://api.openai.com',
};

export function SettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar configurações');
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
      flashSuccess('Configurações de IA salvas!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar IA');
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
        [id]: { ok: true, message: result.reply ? `OK: ${result.reply}` : 'OK (sem resposta)' },
      }));
    } catch (err) {
      setProviderTest((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : 'Falha no teste' },
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
      flashSuccess('Configurações do Telegram salvas!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar Telegram');
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
      flashSuccess('Configurações de e-mail salvas!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar e-mail');
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
      flashSuccess(`E-mail de teste enviado para ${result.accepted.join(', ')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao testar e-mail');
    } finally {
      setTestingEmail(false);
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
          <h3 id="settings-title">⚙️ Configurações</h3>
          <button className="close-btn" onClick={onClose} aria-label="Fechar">
            ×
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

          {loading && !settings ? (
            <p style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
          ) : (
            settings && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Valores definidos aqui ficam salvos no banco e têm prioridade sobre o{' '}
                  <code>.env</code>. As chaves são armazenadas cifradas e nunca são devolvidas em
                  texto puro.
                </p>

                {/* AI providers */}
                <section>
                  <h4 style={{ marginBottom: '12px' }}>🤖 Provedores de IA</h4>

                  <div className="form-group">
                    <label htmlFor="defaultProvider">Provedor padrão (sugerido no front):</label>
                    <select
                      id="defaultProvider"
                      value={defaultProvider}
                      onChange={(e) =>
                        setDefaultProvider(e.target.value as 'auto' | AiProviderId)
                      }
                    >
                      <option value="auto">Auto (primeiro disponível)</option>
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
                              title="Enviar uma requisição de teste a este provedor"
                            >
                              {testingProvider === provider.id ? '⏳ Testando…' : '🔌 Testar'}
                            </button>
                            <span
                              className={`status-badge ${provider.apiKeySet ? 'ok' : 'error'}`}
                              title={provider.apiKeySet ? 'Chave configurada' : 'Sem chave'}
                            >
                              {provider.apiKeySet ? 'chave definida' : 'sem chave'}
                            </span>
                          </div>
                        </div>

                        {providerTest[provider.id] && (
                          <p
                            style={{
                              fontSize: '12px',
                              margin: '0 0 8px',
                              color: providerTest[provider.id].ok ? '#16a34a' : 'var(--danger)',
                              wordBreak: 'break-word',
                            }}
                          >
                            {providerTest[provider.id].ok ? '✅ ' : '❌ '}
                            {providerTest[provider.id].message}
                          </p>
                        )}

                        <div className="form-group">
                          <label>API Key:</label>
                          <input
                            type="password"
                            autoComplete="off"
                            value={form.apiKey}
                            placeholder={provider.apiKeySet ? '•••••••• (deixe vazio p/ manter)' : 'sk-...'}
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
                              Remover chave (volta ao .env)
                            </label>
                          )}
                        </div>

                        <div className="form-group">
                          <label>Base URL:</label>
                          <input
                            type="text"
                            value={form.baseUrl}
                            onChange={(e) =>
                              updateProviderForm(provider.id, { baseUrl: e.target.value })
                            }
                          />
                        </div>

                        <div className="form-group">
                          <label>Modelo:</label>
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
                            {PROVIDER_HINTS[provider.id]}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button className="btn btn-primary" onClick={handleSaveAi} disabled={savingAi}>
                      {savingAi ? '⏳ Salvando...' : '💾 Salvar IA'}
                    </button>
                  </div>
                </section>

                {/* Telegram */}
                <section style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                  <h4 style={{ marginBottom: '12px' }}>📨 Telegram</h4>

                  <div className="form-group">
                    <label htmlFor="tgChatId">Chat ID:</label>
                    <input
                      id="tgChatId"
                      type="text"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      placeholder="-1001234567890"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="tgBotToken">Bot Token:</label>
                    <input
                      id="tgBotToken"
                      type="password"
                      autoComplete="off"
                      value={botToken}
                      placeholder={
                        settings.telegram.botTokenSet
                          ? '•••••••• (deixe vazio p/ manter)'
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
                        Remover token (volta ao .env)
                      </label>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveTelegram}
                      disabled={savingTelegram}
                    >
                      {savingTelegram ? '⏳ Salvando...' : '💾 Salvar Telegram'}
                    </button>
                  </div>
                </section>

                {/* Email */}
                <section style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                  <h4 style={{ marginBottom: '12px' }}>📧 E-mail (SMTP)</h4>

                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: 0,
                      marginBottom: '12px',
                    }}
                  >
                    Usado para enviar a newsletter e o digest por e-mail. A senha fica cifrada no
                    banco.
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
                    Habilitar envio por e-mail
                  </label>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    <div className="form-group">
                      <label htmlFor="smtpHost">Host SMTP:</label>
                      <input
                        id="smtpHost"
                        type="text"
                        value={emailHost}
                        onChange={(e) => setEmailHost(e.target.value)}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="smtpPort">Porta:</label>
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
                    Conexão segura (TLS implícito, porta 465)
                  </label>

                  <div className="form-group">
                    <label htmlFor="smtpUser">Usuário:</label>
                    <input
                      id="smtpUser"
                      type="text"
                      value={emailUser}
                      onChange={(e) => setEmailUser(e.target.value)}
                      placeholder="voce@exemplo.com"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="smtpPass">Senha / App Password:</label>
                    <input
                      id="smtpPass"
                      type="password"
                      autoComplete="off"
                      value={emailPass}
                      placeholder={
                        settings.email.passwordSet
                          ? '•••••••• (deixe vazio p/ manter)'
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
                        Remover senha (volta ao .env)
                      </label>
                    )}
                  </div>

                  <div className="form-group">
                    <label htmlFor="smtpFrom">Remetente (From):</label>
                    <input
                      id="smtpFrom"
                      type="text"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      placeholder="RSS News Hub <voce@exemplo.com>"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="smtpRecipients">Destinatários (separados por vírgula):</label>
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
                      title="Verifica a conexão e envia um e-mail de teste"
                    >
                      {testingEmail ? '⏳ Testando...' : '🔌 Testar conexão'}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSaveEmail}
                      disabled={savingEmail}
                    >
                      {savingEmail ? '⏳ Salvando...' : '💾 Salvar E-mail'}
                    </button>
                  </div>
                </section>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
