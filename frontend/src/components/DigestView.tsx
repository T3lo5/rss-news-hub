import { useMemo } from 'react';
import type { DigestGrouping, NewsItem } from '../types';
import { BookmarkButton } from './BookmarkButton';
import { RelevanceBadge } from './RelevanceBadge';

interface DigestViewProps {
  news: NewsItem[];
  loading: boolean;
  error: string | null;
  grouping: DigestGrouping;
  onShare: (item: NewsItem) => void;
  onBookmarkToggle: (id: string, isBookmarked: boolean) => void;
  bookmarkedIds: Set<string>;
  selectedIds: Set<string>;
  onSelect: (id: string, shiftKey?: boolean) => void;
  selectedIndex: number;
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

function formatDay(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatWeekRange(iso: string): string {
  try {
    const date = new Date(iso);
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay()); // Sunday
    const end = new Date(start);
    end.setDate(start.getDate() + 6); // Saturday

    return `${start.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  } catch {
    return iso;
  }
}

function getGroupKey(item: NewsItem, grouping: DigestGrouping): string {
  const date = new Date(item.pubDate);
  if (grouping === 'daily') {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
  } else if (grouping === 'weekly') {
    const year = date.getFullYear();
    const week = String(Math.ceil((date.getDate() + date.getDay()) / 7)).padStart(2, '0');
    // Better: use ISO week
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  return 'all';
}

function getGroupLabel(key: string, grouping: DigestGrouping): string {
  if (grouping === 'daily') {
    return formatDay(key + 'T00:00:00');
  } else if (grouping === 'weekly') {
    return `Week ${key.split('-W')[1]}, ${key.split('-W')[0]}`;
  }
  return 'All';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'");
}

export function DigestView({
  news,
  loading,
  error,
  grouping,
  onShare,
  onBookmarkToggle,
  bookmarkedIds,
  selectedIds,
  onSelect,
  selectedIndex,
}: DigestViewProps) {
  const groups = useMemo(() => {
    if (grouping === 'none' || !news.length) return [{ key: 'all', items: news, label: 'All' }];

    const map = new Map<string, NewsItem[]>();
    for (const item of news) {
      const key = getGroupKey(item, grouping);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items, label: getGroupLabel(key, grouping) }))
      .sort((a, b) => b.key.localeCompare(a.key)); // newest first
  }, [news, grouping]);

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
        <div className="empty">Nenhuma notícia encontrada.</div>
      </div>
    );
  }

  return (
    <div className="digest-view" role="list" aria-label="Digest view">
      {groups.map(({ key, items, label }, groupIndex) => (
        <section key={key} className="digest-group">
          <header className="digest-group-header">
            <span className="digest-group-label">{label}</span>
            <span className="digest-group-count">
              {items.length} artigo{items.length !== 1 ? 's' : ''}
            </span>
          </header>
          <div className="digest-group-items" role="list">
            {items.map((item, itemIndex) => {
              const globalIndex = news.findIndex((n) => n.id === item.id);
              const isSelected = selectedIds.has(item.id);
              const isKeyboardSelected = globalIndex === selectedIndex;

              return (
                <article
                  key={item.id}
                  className={`digest-item ${isSelected ? 'selected' : ''} ${isKeyboardSelected ? 'keyboard-selected' : ''}`}
                  role="listitem"
                  data-selected={isSelected}
                  aria-selected={isSelected}
                >
                  <div className="digest-item-top">
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
                    <div className="digest-item-header">
                      <span className="news-source">{item.source || 'Desconhecida'}</span>
                      <RelevanceBadge score={item.relevanceScore} size="sm" />
                      <time className="news-date" dateTime={item.pubDate}>
                        {formatDate(item.pubDate)}
                      </time>
                    </div>
                  </div>
                  <h3 className="digest-item-title">{item.title}</h3>
                  <p className="digest-item-desc">
                    {item.description
                      ? escapeHtml(item.description).slice(0, 200) + '...'
                      : 'Sem descrição'}
                  </p>
                  <div className="digest-item-actions">
                    <BookmarkButton
                      newsId={item.id}
                      isBookmarked={bookmarkedIds.has(item.id)}
                      onToggle={onBookmarkToggle}
                    />
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-link btn-sm"
                    >
                      <span role="img" aria-label="link">
                        🔗
                      </span>{' '}
                      Abrir
                    </a>
                    <button
                      className="btn btn-share btn-sm"
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
        </section>
      ))}
    </div>
  );
}
