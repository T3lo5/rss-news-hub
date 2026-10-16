import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { Language, NewsItem, Provider, Template } from '../types';
import { formatGeneratedContent } from '../utils/content';
import { ProviderSelect } from './ProviderSelect';

interface NewsletterBuilderModalProps {
  isOpen: boolean;
  news: NewsItem[];
  onClose: () => void;
}

export function NewsletterBuilderModal({ isOpen, news, onClose }: NewsletterBuilderModalProps) {
  const { t, language: uiLanguage } = useI18n();
  const locale = uiLanguage === 'en' ? 'en-US' : 'pt-BR';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());

  const [language, setLanguage] = useState<Language>('pt');
  const [provider, setProvider] = useState<Provider>('auto');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});

  const [content, setContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [emailRecipients, setEmailRecipients] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const { sending, error: tgError, success: tgSuccess, send, reset: resetTg } = useTelegram();

  useEffect(() => {
    if (!isOpen) return;
    api
      .getTemplates()
      .then((res) => setTemplates(res.templates.filter((t) => t.type === 'newsletter')))
      .catch(() => setTemplates([]));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setContent('');
      setError(null);
      setCopied(false);
      setEmailError(null);
      setEmailSuccess(false);
      resetTg();
    }
  }, [isOpen, resetTg]);

  const sources = useMemo(
    () => [...new Set(news.map((n) => n.source).filter(Boolean))].sort(),
    [news]
  );

  const visibleNews = useMemo(() => {
    const query = search.trim().toLowerCase();
    return news.filter((n) => {
      if (sourceFilter.size > 0 && !sourceFilter.has(n.source)) return false;
      if (query && !`${n.title} ${n.source}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [news, search, sourceFilter]);

  const selectedItems = useMemo(
    () => news.filter((n) => selectedIds.has(n.id)),
    [news, selectedIds]
  );

  const selectedTemplate = templates.find((tpl) => tpl.id === templateId) || templates[0];
  const templateVars = selectedTemplate?.variables || [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of visibleNews) next.add(item.id);
      return next;
    });
  };

  const toggleSource = (source: string) => {
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const handleGenerate = useCallback(async () => {
    if (selectedItems.length === 0) return;
    setGenerating(true);
    setError(null);
    setContent('');
    try {
      const result = await api.generateContent({
        news: selectedItems,
        type: 'newsletter',
        language,
        provider,
        templateId: templateId || undefined,
        templateVariables,
      });
      setContent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newsletterBuilder.errGenerate'));
    } finally {
      setGenerating(false);
    }
  }, [selectedItems, language, provider, templateId, templateVariables, t]);

  const handleSend = async () => {
    if (!content) return;
    try {
      await send(formatGeneratedContent(content, 'newsletter'));
    } catch {
      // error surfaced via tgError
    }
  };

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleSendEmail = async () => {
    if (!content) return;
    setEmailing(true);
    setEmailError(null);
    setEmailSuccess(false);
    try {
      const to = emailRecipients
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      await api.sendEmail({
        to: to.length ? to : undefined,
        subject: t('newsletterBuilder.emailSubject', {
          date: new Date().toLocaleDateString(locale),
        }),
        text: content,
      });
      setEmailSuccess(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : t('newsletterBuilder.errEmail'));
    } finally {
      setEmailing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-builder-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '860px', width: '95vw', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="newsletter-builder-title">{t('newsletterBuilder.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '78vh' }}
        >
          {error && (
            <div className="status error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}
          {tgSuccess && (
            <div className="status success" style={{ marginBottom: '16px' }}>
              {t('content.sentTelegramBanner')}
            </div>
          )}

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 0 }}>
            {t('newsletterBuilder.intro')}
          </p>

          {/* Filters */}
          <div className="form-group">
            <label>{t('newsletterBuilder.filterBySource')}</label>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                maxHeight: '90px',
                overflow: 'auto',
                padding: '8px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}
            >
              {sources.map((source) => (
                <label
                  key={source}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sourceFilter.has(source)}
                    onChange={() => toggleSource(source)}
                  />
                  {source}
                </label>
              ))}
              {sources.length === 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {t('newsletterBuilder.noSources')}
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {t('newsletterBuilder.allSourcesHint')}
            </p>
          </div>

          <div className="form-group">
            <input
              type="text"
              placeholder={t('news.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {t('newsletterBuilder.selection', {
                selected: selectedItems.length,
                visible: visibleNews.length,
              })}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={selectAllVisible}
                disabled={visibleNews.length === 0}
              >
                {t('newsletterBuilder.selectCount', { count: visibleNews.length })}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedItems.length === 0}
              >
                {t('common.clear')}
              </button>
            </div>
          </div>

          <div
            style={{
              maxHeight: '220px',
              overflow: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            {visibleNews.length === 0 ? (
              <p style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {t('newsletterBuilder.noNews')}
              </p>
            ) : (
              visibleNews.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: checked ? 'var(--bg-secondary)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(item.id)}
                      style={{ marginTop: '3px' }}
                    />
                    <span style={{ fontSize: '13px' }}>
                      <a href={item.link} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                      <span style={{ color: 'var(--text-secondary)' }}> · {item.source}</span>
                      {typeof item.relevanceScore === 'number' && (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {' '}
                          · {item.relevanceScore}/100
                        </span>
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Options */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '12px',
              marginTop: '16px',
            }}
          >
            <div className="form-group">
              <label htmlFor="builderLanguage">{t('content.language')}</label>
              <select
                id="builderLanguage"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="pt">{t('lang.portuguese')}</option>
                <option value="en">{t('lang.english')}</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="builderProvider">{t('newsletterBuilder.providerLabel')}</label>
              <ProviderSelect
                id="builderProvider"
                value={provider}
                onChange={setProvider}
                autoLabel={t('common.auto')}
              />
            </div>
            <div className="form-group">
              <label htmlFor="builderTemplate">{t('newsletterBuilder.templateLabel')}</label>
              <select
                id="builderTemplate"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">{t('newsletterBuilder.defaultTemplate')}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                    {tpl.builtin ? t('content.builtin') : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {templateVars.length > 0 && (
            <div className="form-group">
              <label>{t('content.templateVars')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {templateVars.map((name) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      style={{
                        minWidth: '120px',
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {name}
                    </label>
                    <input
                      type="text"
                      value={templateVariables[name] || ''}
                      onChange={(e) =>
                        setTemplateVariables({ ...templateVariables, [name]: e.target.value })
                      }
                      placeholder={t('content.varPlaceholder', { name })}
                      style={{ flex: 1 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating || selectedItems.length === 0}
            style={{ width: '100%', marginTop: '8px' }}
          >
            {generating
              ? t('newsletterBuilder.generating')
              : t('newsletterBuilder.generate', { count: selectedItems.length })}
          </button>

          {(content || generating) && (
            <pre
              style={{
                marginTop: '16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '13px',
                maxHeight: '320px',
                overflow: 'auto',
              }}
            >
              {generating ? t('newsletterBuilder.generatingPre') : content}
            </pre>
          )}

          {content && !generating && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'flex-end',
                marginTop: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button className="btn btn-ghost" onClick={handleCopy}>
                {copied ? t('content.copied') : t('content.copy')}
              </button>
              <button
                className="btn btn-success"
                onClick={handleSend}
                disabled={sending || tgSuccess}
              >
                {sending ? t('content.sending') : tgSuccess ? t('content.sent') : t('content.sendTelegram')}
              </button>
            </div>
          )}

          {tgError && (
            <div style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '12px' }}>
              {t('newsletterBuilder.tgError', { error: tgError })}
            </div>
          )}

          {content && !generating && (
            <div
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="builderEmailRecipients">
                  {t('newsletterBuilder.emailToLabel')}
                </label>
                <input
                  id="builderEmailRecipients"
                  type="text"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                  placeholder={t('newsletterBuilder.emailPlaceholder')}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSendEmail}
                  disabled={emailing || emailSuccess}
                >
                  {emailing
                    ? t('content.sending')
                    : emailSuccess
                      ? t('content.sent')
                      : t('newsletterBuilder.sendEmail')}
                </button>
              </div>
              {emailError && (
                <div style={{ color: 'var(--danger)', fontSize: '13px' }}>
                  {t('newsletterBuilder.emailError', { error: emailError })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
