import { useEffect, useRef } from 'react';
import type { NewsItem } from '../types';
import { BookmarkButton } from './BookmarkButton';
import { RelevanceBadge } from './RelevanceBadge';

interface NewsGridProps {
  news: NewsItem[];
  loading: boolean;
  error: string | null;
  onShare: (item: NewsItem) => void;
  onSelect: (id: string, shiftKey?: boolean) => void;
  selectedIds: Set<string>;
  selectedIndex: number;
  bookmarkedIds: Set<string>;
  onBookmarkToggle: (id: string, isBookmarked: boolean) => void;
}

function formatDate(iso: string): string {
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
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

export function NewsGrid({
  news,
  loading,
  error,
  onShare,
  onSelect,
  selectedIds,
  selectedIndex,
  bookmarkedIds,
  onBookmarkToggle,
}: NewsGridProps) {
  const cardRefs = useRef<(HTMLArticleElement | null)[]>([]);

  // Scroll selected card into view
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < cardRefs.current.length) {
      const card = cardRefs.current[selectedIndex];
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="news-grid">
        <div className="loading">
          <div className="spinner" aria-hidden="true" />
          <span>Carregando notícias...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="news-grid">
        <div className="empty" style={{ color: 'var(--danger)' }}>
          Erro ao carregar: {error}
        </div>
      </div>
    );
  }

  if (!news.length) {
    return (
      <div className="news-grid">
        <div className="empty">
          Nenhuma notícia encontrada. Use <kbd>j</kbd>/<kbd>k</kbd> para navegar.
        </div>
      </div>
    );
  }

  return (
    <div className="news-grid" role="list" aria-label="Lista de notícias">
      {news.map((item, index) => {
        const isSelected = selectedIds.has(item.id);
        const isKeyboardSelected = index === selectedIndex;
        return (
          <article
            key={item.id}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className={`news-card ${isSelected ? 'selected' : ''} ${isKeyboardSelected ? 'keyboard-selected' : ''}`}
            role="listitem"
            data-selected={isSelected}
            aria-selected={isSelected}
          >
            <div className="news-card-top">
              <input
                type="checkbox"
                className="news-checkbox"
                checked={isSelected}
                onChange={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.shiftKey) {
                    onSelect(item.id, true);
                    e.preventDefault();
                  }
                }}
                aria-label={`Selecionar: ${item.title}`}
              />
              <div className="news-header">
                <span className="news-source">{item.source || 'Desconhecida'}</span>
                <RelevanceBadge score={item.relevanceScore} size="sm" />
                <time className="news-date" dateTime={item.pubDate}>
                  {formatDate(item.pubDate)}
                </time>
              </div>
            </div>
            <h3 className="news-title">{item.title}</h3>
            <p className="news-desc">
              {item.description
                ? escapeHtml(item.description).slice(0, 200) + '...'
                : 'Sem descrição'}
            </p>
            <div className="news-actions">
              <BookmarkButton
                newsId={item.id}
                isBookmarked={bookmarkedIds.has(item.id)}
                onToggle={onBookmarkToggle}
              />
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-link"
              >
                <span role="img" aria-label="link">
                  🔗
                </span>{' '}
                Abrir
              </a>
              <button
                className="btn btn-share"
                onClick={() => onShare(item)}
                aria-label={`Compartilhar: ${item.title}`}
              >
                <span role="img" aria-label="share">
                  📤
                </span>{' '}
                Compartilhar
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
