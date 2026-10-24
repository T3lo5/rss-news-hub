import {
  Check,
  CheckCheck,
  ExternalLink,
  Inbox,
  Mail,
  MailOpen,
  Share2,
  Sparkles,
} from 'lucide-react';
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
  /** Called when the user opens an item (title, button or card click). */
  onOpen?: (item: NewsItem) => void;
  onReadToggle: (item: NewsItem, read: boolean) => void;
  generatedIds?: Set<string>;
  sentIds?: Set<string>;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** A next page is being fetched. */
  loadingMore?: boolean;
  /** Overrides the default empty state (e.g. "nothing unread"). */
  emptyMessage?: string;
  total?: number;
  shown?: number;
  /** Offline snapshot: write actions (read state, bookmarks) are disabled. */
  readOnly?: boolean;
  /** Preference: card click opens the in-app reader instead of a new tab. */
  openInReader?: boolean;
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
  onOpen,
  onReadToggle,
  generatedIds,
  sentIds,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  emptyMessage,
  total: totalProp,
  shown: shownProp,
  readOnly = false,
  openInReader = false,
}: NewsGridProps) {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : 'pt-BR';
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const shown = shownProp ?? news.length;
  const total = totalProp ?? news.length;

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
          {emptyMessage ? (
            <div>{emptyMessage}</div>
          ) : (
            <div>
              {t('news.emptyNavigatePre')} <kbd>j</kbd>/<kbd>k</kbd> {t('news.emptyNavigatePost')}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="news-grid" role="list" aria-label={t('news.listAria')}>
      {news.map((item, index) => {
        const isSelected = selectedIds?.has(item.id) ?? false;
        const isKeyboardSelected = index === selectedIndex;
        const isRead = Boolean(item.readAt);
        return (
          <article
            key={item.id}
            ref={(el) => {
              cardRefs.current[index] = el;
            }}
            className={`news-card ${isRead ? 'read' : 'unread'} ${isSelected ? 'selected' : ''} ${isKeyboardSelected ? 'keyboard-selected' : ''} ${openInReader ? 'reader-clickable' : ''}`}
            role="listitem"
            data-selected={isSelected}
            data-read={isRead}
            aria-selected={isSelected}
            onClick={(event) => {
              if (!openInReader) return;
              // Links, botões e o checkbox têm ações próprias.
              if ((event.target as HTMLElement).closest('a, button, input, label')) return;
              onOpen?.(item);
            }}
          >
            <div className="news-card-top">
              <input
                type="checkbox"
                className="news-checkbox"
                checked={isSelected}
                onChange={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  // Só Shift+Espaço faz seleção em range. Antes qualquer tecla
                  // com Shift caía aqui: Shift+Tab era bloqueado (o foco não
                  // saía do checkbox) e a seleção era desfeita sem querer (MU-004).
                  if (e.shiftKey && (e.key === ' ' || e.key === 'Spacebar')) {
                    e.preventDefault();
                    onSelect(item.id, true);
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
                {isRead && (
                  <span className="read-badge" title={t('news.readTitle')}>
                    <CheckCheck size={12} aria-hidden="true" />
                    {t('news.read')}
                  </span>
                )}
                <time className="news-date" dateTime={item.pubDate}>
                  {formatDate(item.pubDate, locale)}
                </time>
              </div>
            </div>
            <h3 className="news-title">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="news-title-link"
                onClick={(event) => {
                  if (openInReader) event.preventDefault();
                  onOpen?.(item);
                }}
              >
                {item.title}
              </a>
            </h3>
            <p className="news-desc">
              {item.description
                ? truncate(cleanDescription(item.description), 220)
                : t('news.noDescription')}
            </p>
            <div className="news-actions">
              <button
                className="btn btn-read"
                onClick={() => onReadToggle(item, !isRead)}
                disabled={readOnly}
                aria-label={t(isRead ? 'news.markUnreadAria' : 'news.markReadAria', {
                  title: item.title,
                })}
                title={t(isRead ? 'news.markUnread' : 'news.markRead')}
              >
                {/* Icon-only like the bookmark button: a text label here made
                    the footer overflow at the 340px minimum card width. */}
                {isRead ? (
                  <MailOpen size={17} aria-hidden="true" />
                ) : (
                  <Mail size={17} aria-hidden="true" />
                )}
              </button>
              <BookmarkButton
                newsId={item.id}
                isBookmarked={bookmarkedIds?.has(item.id) ?? false}
                onToggle={onBookmarkToggle}
                disabled={readOnly}
              />
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-open"
                onClick={(event) => {
                  if (openInReader) event.preventDefault();
                  onOpen?.(item);
                }}
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

      {total > 0 && (
        <div className="news-more">
          {hasMore && (
            <button className="btn btn-secondary" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? t('common.loading') : t('news.loadMore', { remaining: total - shown })}
            </button>
          )}
          <span className="news-more-count">{t('news.showing', { shown, total })}</span>
        </div>
      )}
    </div>
  );
}
