import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useTelegram } from '../hooks/useTelegram';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type { Language, NewsItem, Provider, Template } from '../types';
import { formatGeneratedContent } from '../utils/content';
import { ProviderSelect } from './ProviderSelect';
import { Status } from './Status';

interface NewsletterBuilderModalProps {
  isOpen: boolean;
  news: NewsItem[];
  onClose: () => void;
}

export function NewsletterBuilderModal({ isOpen, news, onClose }: NewsletterBuilderModalProps) {
  const { t, language: uiLanguage } = useI18n();
  const locale = uiLanguage === 'en' ? 'en-US' : 'pt-BR';
  useEscapeKey(isOpen, onClose);
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
  const [feedSources, setFeedSources] = useState<string[]>([]);

  const { sending, error: tgError, success: tgSuccess, send, reset: resetTg } = useTelegram();

  useEffect(() => {
    if (!isOpen) return;
    api
      .getTemplates()
      .then((res) => setTemplates(res.templates.filter((t) => t.type === 'newsletter')))
      .catch(() => setTemplates([]));
    // A lista de fontes não pode depender só das notícias já carregadas: com a
    // base vazia (primeiro boot, retenção, fetch ainda rodando) o filtro ficava
    // sem nenhuma opção. Os feeds configurados servem de fonte primária.
    api
      .getFeeds()
      .then((feeds) =>
        setFeedSources(feeds.map((feed) => feed.name).filter((name): name is string => !!name))
      )
      .catch(() => setFeedSources([]));
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
    () =>
      [...new Set([...news.map((n) => n.source), ...feedSources].filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [news, feedSources]
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
      // A restricted account has no key of its own and may not borrow the
      // deployment owner's — explain that instead of echoing the raw message.
      const code = (err as { code?: string } | null)?.code;
      const fallback = err instanceof Error ? err.message : t('newsletterBuilder.errGenerate');
      setError(code === 'AI_KEYS_REQUIRED' ? t('ai.keysRequired') : fallback);
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
      <div className="modal modal-newsletter modal-fluid" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="newsletter-builder-title">{t('newsletterBuilder.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {/* Um único toast por vez: o portal ocupa o topo-centro da tela, então
              dois ao mesmo tempo ocupariam exatamente o mesmo lugar. */}
          {error ? (
            <Status message={error} type="error" onClose={() => setError(null)} />
          ) : tgError ? (
            <Status
              message={t('newsletterBuilder.tgError', { error: tgError })}
              type="error"
              onClose={resetTg}
            />
          ) : tgSuccess ? (
            <Status message={t('content.sentTelegramBanner')} type="success" />
          ) : null}

          <p className="newsletter-intro">{t('newsletterBuilder.intro')}</p>

          {/* Filters */}
          <div className="form-group">
            <label>{t('newsletterBuilder.filterBySource')}</label>
            <div className="newsletter-source-list">
              {sources.map((source) => (
                <label key={source} className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={sourceFilter.has(source)}
                    onChange={() => toggleSource(source)}
                  />
                  {source}
                </label>
              ))}
              {sources.length === 0 && (
                <span className="newsletter-list-meta">{t('newsletterBuilder.noSources')}</span>
              )}
            </div>
            <p className="form-hint">{t('newsletterBuilder.allSourcesHint')}</p>
          </div>

          <div className="form-group">
            <input
              type="text"
              placeholder={t('news.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="newsletter-toolbar">
            <span className="newsletter-list-meta">
              {t('newsletterBuilder.selection', {
                selected: selectedItems.length,
                visible: visibleNews.length,
              })}
            </span>
            <div className="newsletter-toolbar-actions">
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

          <div className="newsletter-list">
            {visibleNews.length === 0 ? (
              <p className="newsletter-list-empty">{t('newsletterBuilder.noNews')}</p>
            ) : (
              visibleNews.map((item) => {
                const checked = selectedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    className={`newsletter-list-item${checked ? ' is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(item.id)}
                    />
                    <span className="newsletter-list-item-text">
                      <a href={item.link} target="_blank" rel="noreferrer">
                        {item.title}
                      </a>
                      <span className="newsletter-list-meta"> · {item.source}</span>
                      {typeof item.relevanceScore === 'number' && (
                        <span className="newsletter-list-meta"> · {item.relevanceScore}/100</span>
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Options */}
          <div className="newsletter-options">
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
              <div className="newsletter-template-vars">
                {templateVars.map((name) => (
                  <div key={name} className="newsletter-template-var">
                    <label htmlFor={`builder-var-${name}`}>{name}</label>
                    <input
                      id={`builder-var-${name}`}
                      type="text"
                      value={templateVariables[name] || ''}
                      onChange={(e) =>
                        setTemplateVariables({ ...templateVariables, [name]: e.target.value })
                      }
                      placeholder={t('content.varPlaceholder', { name })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn-primary btn-block newsletter-generate"
            onClick={handleGenerate}
            disabled={generating || selectedItems.length === 0}
          >
            {generating
              ? t('newsletterBuilder.generating')
              : t('newsletterBuilder.generate', { count: selectedItems.length })}
          </button>

          {(content || generating) && (
            <pre className="newsletter-output">
              {generating ? t('newsletterBuilder.generatingPre') : content}
            </pre>
          )}

          {content && !generating && (
            <div className="newsletter-actions">
              <button className="btn btn-ghost" onClick={handleCopy}>
                {copied ? t('content.copied') : t('content.copy')}
              </button>
              <button
                className="btn btn-success"
                onClick={handleSend}
                disabled={sending || tgSuccess}
              >
                {sending
                  ? t('content.sending')
                  : tgSuccess
                    ? t('content.sent')
                    : t('content.sendTelegram')}
              </button>
            </div>
          )}

          {content && !generating && (
            <div className="newsletter-email">
              <div className="form-group form-group-flush">
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
              <div className="newsletter-email-actions">
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
                <div className="newsletter-error">
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
