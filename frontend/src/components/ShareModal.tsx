import { Copy, ExternalLink, Globe, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocus } from '../hooks/useModalFocus';
import { useI18n } from '../i18n';
import type { ContentType, Language, NewsItem, Provider, Template } from '../types';
import { formatGeneratedContent } from '../utils/content';
import { ProviderSelect } from './ProviderSelect';

interface ShareModalProps {
  news: NewsItem | null;
  selectedNews: NewsItem[];
  contentType: ContentType;
  language: Language;
  provider: Provider;
  templateId: string;
  templateVariables: Record<string, string>;
  templates: Template[];
  generatedContent: string;
  generating: boolean;
  aiError: string | null;
  hasGenerated?: boolean;
  sending: boolean;
  tgError: string | null;
  tgSuccess: boolean;
  onContentTypeChange: (value: ContentType) => void;
  onLanguageChange: (value: Language) => void;
  onProviderChange: (value: Provider) => void;
  onTemplateIdChange: (value: string) => void;
  onTemplateVariablesChange: (variables: Record<string, string>) => void;
  onGenerate: () => void;
  onSendTelegram: () => void;
  onCopy: () => void;
  onCopyHtml: () => void;
  onCopyMarkdown: () => void;
  onClose: () => void;
}

export function ShareModal({
  news,
  selectedNews,
  contentType,
  language,
  provider,
  templateId,
  templateVariables = {},
  templates = [],
  generatedContent,
  generating,
  aiError,
  hasGenerated,
  sending,
  tgError,
  tgSuccess,
  onContentTypeChange,
  onLanguageChange,
  onProviderChange,
  onTemplateIdChange,
  onTemplateVariablesChange,
  onGenerate,
  onSendTelegram,
  onCopy,
  onCopyHtml,
  onCopyMarkdown,
  onClose,
}: ShareModalProps) {
  const { t, language: uiLanguage } = useI18n();
  useEscapeKey(true, onClose);
  const dialogRef = useModalFocus<HTMLDivElement>(true);
  const locale = uiLanguage === 'en' ? 'en-US' : 'pt-BR';
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const isNewsletter = contentType === 'newsletter';

  const typeTemplates = templates.filter((tpl) => tpl.type === contentType);
  const defaultTemplate = templates.find((tpl) => tpl.id === templateId) || typeTemplates[0];
  const templateVars = defaultTemplate?.variables || [];

  const renderVariableInputs = () => {
    if (templateVars.length === 0) return null;
    return (
      <div className="form-group">
        <label>{t('content.templateVars')}</label>
        <div className="template-vars">
          {templateVars.map((varName) => (
            <div key={varName} className="template-var-row">
              <label className="template-var-name" htmlFor={`var-${varName}`}>
                {varName}
              </label>
              <input
                id={`var-${varName}`}
                type="text"
                value={templateVariables[varName] || ''}
                onChange={(e) =>
                  onTemplateVariablesChange({ ...templateVariables, [varName]: e.target.value })
                }
                placeholder={t('content.varPlaceholder', { name: varName })}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="modal-title">{isNewsletter ? t('share.newsletterTitle') : t('share.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="news-preview">
            {isNewsletter ? (
              <div>
                <h4>{t('share.newsletterItems', { count: selectedNews.length })}</h4>
                <ul className="share-news-list">
                  {selectedNews.map((item) => (
                    <li key={item.id}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                      <span className="muted"> • {item.source}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : news ? (
              <>
                <h4>{news.title}</h4>
                <a href={news.link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} style={{ verticalAlign: '-2px' }} /> {news.link}
                </a>
                <p>{t('share.source', { source: news.source, date: formatDate(news.pubDate) })}</p>
              </>
            ) : (
              <p className="muted">{t('share.selectPrompt')}</p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="contentType">{t('share.contentType')}</label>
            <select
              id="contentType"
              value={contentType}
              onChange={(e) => onContentTypeChange(e.target.value as ContentType)}
            >
              <option value="thread">{t('share.optThread')}</option>
              <option value="summary">{t('share.optSummary')}</option>
              <option value="linkedin">{t('share.optLinkedin')}</option>
              <option value="blog">{t('share.optBlog')}</option>
              <option value="newsletter">{t('share.optNewsletter')}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="templateSelector">{t('share.template')}</label>
            <select
              id="templateSelector"
              value={templateId}
              onChange={(e) => onTemplateIdChange(e.target.value)}
            >
              <option value="">{t('share.defaultTemplate')}</option>
              {typeTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                  {tpl.builtin ? t('content.builtin') : ''}
                </option>
              ))}
            </select>
          </div>

          {renderVariableInputs()}

          <div className="form-group">
            <label htmlFor="contentLanguage">{t('content.language')}</label>
            <select
              id="contentLanguage"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
            >
              <option value="en">{t('lang.english')}</option>
              <option value="pt">{t('lang.portuguese')}</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="aiProvider">{t('share.aiProvider')}</label>
            <ProviderSelect id="aiProvider" value={provider} onChange={onProviderChange} />
          </div>

          <button
            className="btn btn-primary w-full mb-3"
            onClick={onGenerate}
            disabled={generating || (isNewsletter && selectedNews.length === 0)}
          >
            {generating ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            {generating
              ? t('content.generating')
              : isNewsletter
                ? t('share.generateNewsletter', { count: selectedNews.length })
                : hasGenerated
                  ? t('share.regenerate')
                  : t('share.generate')}
          </button>

          <div
            className={`generated-output ${generating ? 'loading' : ''} ${aiError ? 'error' : ''}`}
            aria-live="polite"
          >
            {generating
              ? t('content.generatingContent')
              : aiError
                ? t('share.error', { error: aiError })
                : generatedContent
                  ? formatGeneratedContent(generatedContent, contentType)
                  : t('share.clickGenerate')}
          </div>

          {generatedContent && !generating && !aiError && (
            <div className="modal-footer">
              <button
                className="btn btn-success"
                onClick={onSendTelegram}
                disabled={sending || tgSuccess}
              >
                <Send size={15} />
                {sending
                  ? t('content.sending')
                  : tgSuccess
                    ? t('content.sent')
                    : t('content.sendTelegram')}
              </button>
              {isNewsletter ? (
                <>
                  <button className="btn btn-ghost" onClick={onCopyMarkdown}>
                    <Copy size={15} />
                    {t('share.copyMarkdown')}
                  </button>
                  <button className="btn btn-ghost" onClick={onCopyHtml}>
                    <Globe size={15} />
                    {t('share.copyHtml')}
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={onCopy}>
                  <Copy size={15} />
                  {t('content.copy')}
                </button>
              )}
            </div>
          )}

          {tgError && (
            <div className="error-text text-center mt-3">
              {t('share.error', { error: tgError })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
