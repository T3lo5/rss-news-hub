import { Check, ExternalLink, Inbox, Share2, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';
import type { NewsItem } from '../types';
import { cleanDescription, truncate } from '../utils/content';
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

function SkeletonCard() {
  return (
    <article className="news-card" aria-hidden="true">
      <div className="news-card-top">
        <div className="skeleton" style={{ width: '42%', height: 20, borderRadius: 999 }} />
        <div className="skeleton" style={{ width: 54, height: 20, marginLeft: 'auto' }} />
      </div>
      <div className="skeleton" style={{ width: '92%', height: 18, marginBottom: 8 }} />
      <div className="skeleton" style={{ width: '70%', height: 18, marginBottom: 16 }} />
      <div className="skeleton" style={{ width: '100%', height: 12, marginBottom: 6 }} />
      <div className="skeleton" style={{ width: '85%', height: 12, marginBottom: 20 }} />
      <div
        style={{
          display: 'flex',
          gap: 8,
          paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div className="skeleton" style={{ width: 38, height: 38 }} />
        <div className="skeleton" style={{ flex: 1, height: 38 }} />
        <div className="skeleton" style={{ flex: 1, height: 38 }} />
      </div>
    </article>
  );
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
  generatedIds,
  sentIds,
}: NewsGridProps) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const cardRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < cardRefs.current.length) {
      cardRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedIndex]);

  if (loading) {
    return (
      <div className="news-grid" aria-busy="true" aria-label={t('news.loading')}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
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
          <div>
            {t('news.emptyNavigatePre')} <kbd>j</kbd>/<kbd>k</kbd> {t('news.emptyNavigatePost')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="news-grid" role="list" aria-label={t('news.listAria')}>
      {news.map((item, index) => {
        const isSelected = selectedIds?.has(item.id) ?? false;
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
                aria-label={t('news.selectAria', { title: item.title })}
              />
              <div className="news-header">
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
            <h3 className="news-title">{item.title}</h3>
            <p className="news-desc">
              {item.description
                ? truncate(cleanDescription(item.description), 220)
                : t('news.noDescription')}
            </p>
            <div className="news-actions">
              <BookmarkButton
                newsId={item.id}
                isBookmarked={bookmarkedIds?.has(item.id) ?? false}
                onToggle={onBookmarkToggle}
              />
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-link"
              >
                <ExternalLink size={15} />
                {t('news.open')}
              </a>
              <button
                className="btn btn-share"
                onClick={() => onShare(item)}
                aria-label={t('news.shareAria', { title: item.title })}
              >
                <Share2 size={15} />
                {t('news.share')}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
