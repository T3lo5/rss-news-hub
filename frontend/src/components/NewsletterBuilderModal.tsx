import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { api } from '../services/api';
import { formatGeneratedContent } from '../utils/content';
import type { Language, NewsItem, Provider, Template } from '../types';

interface NewsletterBuilderModalProps {
  isOpen: boolean;
  news: NewsItem[];
  onClose: () => void;
}

export function NewsletterBuilderModal({ isOpen, news, onClose }: NewsletterBuilderModalProps) {
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

  const selectedTemplate = templates.find((t) => t.id === templateId) || templates[0];
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
      setError(err instanceof Error ? err.message : 'Erro ao gerar a newsletter');
    } finally {
      setGenerating(false);
    }
  }, [selectedItems, language, provider, templateId, templateVariables]);

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
          <h3 id="newsletter-builder-title">✍️ Montar Newsletter</h3>
          <button className="close-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body" style={{ padding: '20px', overflow: 'auto', maxHeight: '78vh' }}>
          {error && (
            <div className="status error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}
          {tgSuccess && (
            <div className="status success" style={{ marginBottom: '16px' }}>
              Enviado para o Telegram!
            </div>
          )}

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: 0 }}>
            Escolha as notícias e/ou filtre por fontes para gerar a sua própria newsletter.
          </p>

          {/* Filters */}
          <div className="form-group">
            <label>Filtrar por fonte:</label>
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
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}
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
                  Nenhuma fonte
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Sem seleção = todas as fontes
            </p>
          </div>

          <div className="form-group">
            <input
              type="text"
              placeholder="Buscar por título ou fonte..."
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
              {selectedItems.length} selecionada(s) · {visibleNews.length} visível(is)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={selectAllVisible}
                disabled={visibleNews.length === 0}
              >
                Selecionar {visibleNews.length}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedItems.length === 0}
              >
                Limpar
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
                Nenhuma notícia encontrada com esses filtros.
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
              <label htmlFor="builderLanguage">Idioma:</label>
              <select
                id="builderLanguage"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="builderProvider">Provedor IA:</label>
              <select
                id="builderProvider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
              >
                <option value="auto">Auto</option>
                <option value="sensenova">SenseNova</option>
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="builderTemplate">Template:</label>
              <select
                id="builderTemplate"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Padrão do tipo</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.builtin ? ' (padrão)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {templateVars.length > 0 && (
            <div className="form-group">
              <label>Variáveis do template:</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {templateVars.map((name) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      style={{ minWidth: '120px', fontSize: '13px', color: 'var(--text-secondary)' }}
                    >
                      {name}
                    </label>
                    <input
                      type="text"
                      value={templateVariables[name] || ''}
                      onChange={(e) =>
                        setTemplateVariables({ ...templateVariables, [name]: e.target.value })
                      }
                      placeholder={`Valor para ${name}`}
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
            {generating ? '⏳ Gerando...' : `✨ Gerar Newsletter (${selectedItems.length} itens)`}
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
              {generating ? 'Gerando newsletter...' : content}
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
                {copied ? '✅ Copiado' : '📋 Copiar'}
              </button>
              <button className="btn btn-success" onClick={handleSend} disabled={sending || tgSuccess}>
                {sending ? '⏳ Enviando...' : tgSuccess ? '✅ Enviado!' : '📤 Enviar p/ Telegram'}
              </button>
            </div>
          )}

          {tgError && (
            <div style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '12px' }}>
              Erro no Telegram: {tgError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
