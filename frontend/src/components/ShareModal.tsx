import { formatGeneratedContent } from '../utils/content';
import type { ContentType, Language, NewsItem, Provider, Template } from '../types';
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
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
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
  const _previewItems = isNewsletter ? selectedNews : news ? [news] : [];

  // Filter templates by content type
  const typeTemplates = templates.filter((t) => t.type === contentType);
  const defaultTemplate = templates.find((t) => t.id === templateId) || typeTemplates[0];

  // Get template variables for the selected template
  const templateVars = defaultTemplate?.variables || [];

  // Render variable inputs for the selected template
  const renderVariableInputs = () => {
    if (templateVars.length === 0) return null;
    return (
      <div className="form-group" style={{ marginTop: '12px' }}>
        <label>Variáveis do template:</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templateVars.map((varName) => (
            <div key={varName} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ minWidth: '120px', fontSize: '13px', color: 'var(--text-muted)' }}>
                {varName}
              </label>
              <input
                type="text"
                value={templateVariables[varName] || ''}
                onChange={(e) =>
                  onTemplateVariablesChange({ ...templateVariables, [varName]: e.target.value })
                }
                placeholder={`Valor para ${varName}`}
                style={{ flex: 1 }}
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="modal-title">{isNewsletter ? '📰 Newsletter' : '📤 Compartilhar no Telegram'}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Fechar modal">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="news-preview">
            {isNewsletter ? (
              <div>
                <h4>Newsletter ({selectedNews.length} itens selecionados)</h4>
                <ul
                  style={{
                    margin: '8px 0',
                    paddingLeft: '20px',
                    maxHeight: '200px',
                    overflow: 'auto',
                  }}
                >
                  {selectedNews.map((item) => (
                    <li key={item.id} style={{ marginBottom: '4px' }}>
                      <a href={item.link} target="_blank" rel="noopener noreferrer">
                        {item.title}
                      </a>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {' '}
                        • {item.source}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : news ? (
              <>
                <h4>{news.title}</h4>
                <a href={news.link} target="_blank" rel="noopener noreferrer">
                  🔗 {news.link}
                </a>
                <p>
                  Fonte: {news.source} • {formatDate(news.pubDate)}
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>
                Selecione uma notícia ou marque múltiplas para newsletter
              </p>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="contentType">Tipo de conteúdo:</label>
            <select
              id="contentType"
              value={contentType}
              onChange={(e) => onContentTypeChange(e.target.value as ContentType)}
            >
              <option value="thread">🐦 Thread Twitter/X (3 tweets)</option>
              <option value="summary">📝 Resumo</option>
              <option value="linkedin">💼 Post LinkedIn</option>
              <option value="blog">📖 Post Blog (Substack/dev.to)</option>
              <option value="newsletter">📰 Newsletter (múltiplas notícias)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="templateSelector">Template:</label>
            <select
              id="templateSelector"
              value={templateId}
              onChange={(e) => onTemplateIdChange(e.target.value)}
            >
              <option value="">Usar padrão para o tipo</option>
              {typeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.builtin ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
          </div>

          {renderVariableInputs()}

          <div className="form-group">
            <label htmlFor="contentLanguage">Idioma:</label>
            <select
              id="contentLanguage"
              value={language}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="pt">Português</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="aiProvider">Provedor IA (opcional):</label>
            <ProviderSelect
              id="aiProvider"
              value={provider}
              onChange={onProviderChange}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={onGenerate}
            disabled={generating || (isNewsletter && selectedNews.length === 0)}
            style={{ width: '100%', marginBottom: '12px' }}
          >
            {generating ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>
                  ⏳
                </span>
                Gerando...
              </>
            ) : isNewsletter ? (
              `✨ Gerar Newsletter (${selectedNews.length} itens)`
            ) : hasGenerated ? (
              '🔄 Gerar novamente'
            ) : (
              '✨ Gerar conteúdo'
            )}
          </button>

          <div
            className={`generated-output ${generating ? 'loading' : ''} ${aiError ? 'error' : ''}`}
            aria-live="polite"
          >
            {generating
              ? 'Gerando conteúdo...'
              : aiError
                ? `Erro: ${aiError}`
                : generatedContent
                  ? formatGeneratedContent(generatedContent, contentType)
                  : 'Clique em "Gerar" para criar o conteúdo'}
          </div>

          {generatedContent && !generating && !aiError && (
            <div className="modal-footer">
              <button
                className="btn btn-success"
                onClick={onSendTelegram}
                disabled={sending || tgSuccess}
              >
                {sending ? '⏳ Enviando...' : tgSuccess ? '✅ Enviado!' : '📤 Enviar p/ Telegram'}
              </button>
              {isNewsletter ? (
                <>
                  <button className="btn btn-ghost" onClick={onCopyMarkdown}>
                    <span role="img" aria-label="copy">
                      📋
                    </span>{' '}
                    Copiar Markdown
                  </button>
                  <button className="btn btn-ghost" onClick={onCopyHtml}>
                    <span role="img" aria-label="copy">
                      🌐
                    </span>{' '}
                    Copiar HTML
                  </button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={onCopy}>
                  <span role="img" aria-label="copy">
                    📋
                  </span>{' '}
                  Copiar
                </button>
              )}
            </div>
          )}

          {tgError && (
            <div
              style={{
                color: 'var(--danger)',
                fontSize: '13px',
                marginTop: '12px',
                textAlign: 'center',
              }}
            >
              Erro: {tgError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
