import { Check, ExternalLink, Inbox, Share2, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '../i18n';
import type { DigestGrouping, NewsItem } from '../types';
import { cleanDescription, truncate } from '../utils/content';
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
  generatedIds?: Set<string>;
  sentIds?: Set<string>;
}

function formatDate(iso: string, locale: string): string {
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
}

function formatDay(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function _formatWeekRange(iso: string): string {
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
    const _year = date.getFullYear();
    const _week = String(Math.ceil((date.getDate() + date.getDay()) / 7)).padStart(2, '0');
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

function getGroupLabel(
  key: string,
  grouping: DigestGrouping,
  t: (key: string, vars?: Record<string, string | number>) => string,
  locale: string
): string {
  if (grouping === 'daily') {
    return formatDay(key + 'T00:00:00', locale);
  } else if (grouping === 'weekly') {
    return t('digestView.week', { week: key.split('-W')[1], year: key.split('-W')[0] });
  }
  return t('digestView.all');
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
  generatedIds,
  sentIds,
}: DigestViewProps) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const groups = useMemo(() => {
    if (grouping === 'none' || !news.length)
      return [{ key: 'all', items: news, label: t('digestView.all') }];

    const map = new Map<string, NewsItem[]>();
    for (const item of news) {
      const key = getGroupKey(item, grouping);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    return Array.from(map.entries())
      .map(([key, items]) => ({ key, items, label: getGroupLabel(key, grouping, t, locale) }))
      .sort((a, b) => b.key.localeCompare(a.key)); // newest first
  }, [news, grouping, t, locale]);

  if (loading) {
    return (
      <div className="news-grid">
        <div className="loading">
          <div className="spinner" aria-hidden="true" />
          <span>{t('news.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="news-grid">
        <div className="empty" style={{ color: 'var(--danger)' }}>
          {t('news.errLoad', { error })}
        </div>
      </div>
    );
  }

  if (!news.length) {
    return (
      <div className="news-grid">
        <div className="empty">
          <Inbox size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <div>{t('news.empty')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="digest-view" role="list" aria-label={t('digestView.aria')}>
      {groups.map(({ key, items, label }, groupIndex) => (
        <section key={key} className="digest-group">
          <header className="digest-group-header">
            <span className="digest-group-label">{label}</span>
            <span className="digest-group-count">
              {t(items.length === 1 ? 'digestView.articleOne' : 'digestView.articleMany', {
                count: items.length,
              })}
            </span>
          </header>
          <div className="digest-group-items" role="list">
            {items.map((item, itemIndex) => {
              const globalIndex = news.findIndex((n) => n.id === item.id);
              const isSelected = selectedIds?.has(item.id) ?? false;
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
                      aria-label={t('news.selectAria', { title: item.title })}
                    />
                    <div className="digest-item-header">
                      <span className="news-source">{item.source || t('news.unknownSource')}</span>
                      <RelevanceBadge score={item.relevanceScore} size="sm" />
                      {sentIds?.has(item.id) ? (
                        <span className="generated-badge sent" title={t('news.sentTitle')}>
                          <Check size={12} />
                          {t('news.sent')}
                        </span>
                      ) : generatedIds?.has(item.id) ? (
                        <span className="generated-badge" title={t('news.generatedTitle')}>
                          <Sparkles size={12} />
                          {t('news.generated')}
                        </span>
                      ) : null}
                      <time className="news-date" dateTime={item.pubDate}>
                        {formatDate(item.pubDate, locale)}
                      </time>
                    </div>
                  </div>
                  <h3 className="digest-item-title">{item.title}</h3>
                  <p className="digest-item-desc">
                    {item.description
                      ? truncate(cleanDescription(item.description), 220)
                      : t('news.noDescription')}
                  </p>
                  <div className="digest-item-actions">
                    <BookmarkButton
                      newsId={item.id}
                      isBookmarked={bookmarkedIds?.has(item.id) ?? false}
                      onToggle={onBookmarkToggle}
                    />
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-link btn-sm"
                    >
                      <ExternalLink size={14} />
                      {t('news.open')}
                    </a>
                    <button
                      className="btn btn-share btn-sm"
                      onClick={() => onShare(item)}
                      aria-label={t('news.shareAria', { title: item.title })}
                    >
                      <Share2 size={14} />
                      {t('news.share')}
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
