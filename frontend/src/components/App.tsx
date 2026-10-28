import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAI } from '../hooks/useAI';
import { addBookmark, fetchBookmarks, removeBookmark } from '../hooks/useBookmarks';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useMarkOnOpen } from '../hooks/useMarkOnOpen';
import { useNews } from '../hooks/useNews';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useOpenInReader } from '../hooks/useOpenInReader';
import { useReadingPreferences } from '../hooks/useReadingPreferences';
import { fetchProfile } from '../hooks/useRelevance';
import { useSavedSearches } from '../hooks/useSavedSearches';
import { useTelegram } from '../hooks/useTelegram';
import { useI18n } from '../i18n';
import { api } from '../services/api';
import type {
  ContentType,
  DigestGrouping,
  InterestProfile,
  Language,
  NewsItem,
  Provider,
  Template,
} from '../types';
import { formatGeneratedContent, withSourceAttribution } from '../utils/content';

// Persisted map of newsId -> generated content, so a post that was already
// generated can be reopened and re-sent (e.g. after a failed Telegram send)
// without regenerating it.
const GENERATED_STORE_KEY = 'generated_content_by_news';

interface GeneratedEntry {
  content: string;
  contentType: ContentType;
  updatedAt: number;
  sentAt?: number;
}

function loadGeneratedStore(): Record<string, GeneratedEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(GENERATED_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

import { useAuth } from '../contexts/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { AddModal } from './AddModal';
import { BookmarksModal } from './BookmarksModal';
import { DigestConfigModal } from './DigestConfigModal';
import { DigestView } from './DigestView';
import { FeedManagerModal } from './FeedManagerModal';
import { Header } from './Header';
import { InterestProfileModal } from './InterestProfileModal';
import { MetricsModal } from './MetricsModal';
import { NewsGrid } from './NewsGrid';
import { NewsletterBuilderModal } from './NewsletterBuilderModal';
import { NewsletterConfigModal } from './NewsletterConfigModal';
import { OfflineBanner } from './OfflineBanner';
import { ReaderModal } from './ReaderModal';
import { SavedSearchesModal } from './SavedSearchesModal';
import { SettingsModal } from './SettingsModal';
import { ShareModal } from './ShareModal';
import { ShortcutsHelp } from './ShortcutsHelp';
import { StatsModal } from './StatsModal';
import { Status } from './Status';
import { TelegramQueueModal } from './TelegramQueueModal';
import { TemplatesModal } from './TemplatesModal';
import { type ExportFormat, Toolbar } from './Toolbar';
import { UpdateToast } from './UpdateToast';
import { UserSettingsModal } from './UserSettingsModal';
import { UsersModal } from './UsersModal';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) {
    return (
      <div
        className="app"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100dvh',
        }}
      >
        <div>{t('app.loading')}</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();
  const online = useOnlineStatus();
  const [markOnOpen] = useMarkOnOpen();
  const [openInReader] = useOpenInReader();
  const {
    generatedContent,
    generating,
    error: aiError,
    generate,
    clear: clearAI,
    setContent: setAIContent,
  } = useAI();
  const { sending, error: tgError, success: tgSuccess, send, reset: resetTG } = useTelegram();

  const [showShareModal, setShowShareModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showMetricsModal, setShowMetricsModal] = useState(false);
  const [showFeedManager, setShowFeedManager] = useState(false);
  const [showNewsletterConfig, setShowNewsletterConfig] = useState(false);
  const [showNewsletterBuilder, setShowNewsletterBuilder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDigestConfig, setShowDigestConfig] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showTelegramQueue, setShowTelegramQueue] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [_interestProfile, setInterestProfile] = useState<InterestProfile | null>(null);
  const [digestGrouping, setDigestGrouping] = useState<DigestGrouping>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('digestGrouping') as DigestGrouping) || 'none';
    }
    return 'none';
  });
  const [digestView, setDigestView] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [readerItem, setReaderItem] = useState<NewsItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType>('thread');
  const [language, setLanguage] = useState<Language>('pt');
  const [provider, setProvider] = useState<Provider>('auto');
  const [templateId, setTemplateId] = useState<string>('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [generatedByNews, setGeneratedByNews] =
    useState<Record<string, GeneratedEntry>>(loadGeneratedStore);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  // Reading preferences (persisted per user via userSettings + localStorage fallback)
  const { readFilter, sortOrder, pageSize, setReadFilter, setSortOrder } = useReadingPreferences(
    user?.id
  );

  // Keep localStorage in sync for backward compatibility with any code that reads it directly
  useEffect(() => {
    try {
      localStorage.setItem('readFilter', readFilter);
    } catch {}
  }, [readFilter]);
  useEffect(() => {
    try {
      localStorage.setItem('sortOrder', sortOrder);
    } catch {}
  }, [sortOrder]);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  // Ref para focar o input de busca ao aplicar uma busca salva
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Buscas salvas: o hook é dono do estado (server-first + localStorage fallback)
  const {
    searches: savedSearches,
    pinnedSearches,
    unpinnedSearches,
    add: addSavedSearch,
    update: updateSavedSearch,
    remove: removeSavedSearch,
  } = useSavedSearches(user?.id);

  // O input responde na hora; o servidor só é consultado quando o usuário
  // para de digitar.
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const {
    news,
    loading,
    loadingMore,
    error,
    total,
    counts,
    sources,
    hasMore,
    fetchMore,
    addNews,
    fetchRss,
    setRead,
    fromCache,
    cachedAt,
  } = useNews(user?.id, {
    query: debouncedSearch,
    source: sourceFilter,
    sort: sortOrder,
    read: readFilter,
    pageSize,
  });

  const unreadCount = counts.unread;
  const readCount = counts.read;

  // Busca, filtro, ordenação e paginação já vêm do servidor: a lista em mãos
  // é exatamente o recorte pedido. Os aliases mantêm os handlers abaixo com
  // o mesmo nome de antes.
  const filteredNews = news;
  const visibleNews = news;
  // Remember the filter across reloads (same pattern as the digest grouping).
  useEffect(() => {
    try {
      localStorage.setItem('readFilter', readFilter);
    } catch {
      // Best-effort: blocked storage just means the filter resets on reload.
    }
  }, [readFilter]);

  const generatedIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, entry] of Object.entries(generatedByNews)) {
      if (entry?.content) set.add(id);
    }
    return set;
  }, [generatedByNews]);

  const sentIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, entry] of Object.entries(generatedByNews)) {
      if (entry?.sentAt) set.add(id);
    }
    return set;
  }, [generatedByNews]);

  const selectedHasGenerated = selectedNews ? generatedIds.has(selectedNews.id) : false;

  // Fetch bookmarks, templates, profile ONLY after auth is ready and user is logged in
  useEffect(() => {
    if (!authLoading && user) {
      fetchBookmarks()
        .then((bookmarks) => {
          if (Array.isArray(bookmarks)) {
            setBookmarkedIds(new Set(bookmarks.map((b: { newsId: string }) => b.newsId)));
          }
        })
        .catch(() => {
          // Ignore errors
        });
      api
        .getTemplates()
        .then((data) => setTemplates(Array.isArray(data?.templates) ? data.templates : []))
        .catch(() => {
          // Templates are optional for share flow
        });
      fetchProfile()
        .then((profile) => setInterestProfile(profile))
        .catch(() => {
          // Ignore errors
        });
    }
  }, [authLoading, user]);

  // Persist generated content per news item so it survives reloads and can be
  // re-sent later.
  useEffect(() => {
    try {
      localStorage.setItem(GENERATED_STORE_KEY, JSON.stringify(generatedByNews));
    } catch {
      // Ignore quota/serialization errors — persistence is best-effort.
    }
  }, [generatedByNews]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowShareModal(false);
        setShowAddModal(false);
        setShowStatsModal(false);
        setShowFeedManager(false);
        setShowNewsletterConfig(false);
        setShowBookmarks(false);
        setShowProfileModal(false);
        setShowTemplatesModal(false);
        setDigestView(false);
        setSelectedNews(null);
        clearAI();
        resetTG();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearAI, resetTG]);

  const handleAddNews = useCallback(
    async (data: { title: string; link: string; source?: string; description?: string }) => {
      setShowAddModal(false);
      try {
        await addNews(data);
      } catch (err) {
        console.error(err);
      }
    },
    [addNews]
  );

  const handleShare = useCallback(
    (item: NewsItem) => {
      setSelectedNews(item);
      resetTG();
      const saved = generatedByNews[item.id];
      if (saved) {
        // Restore the previously generated post (and its content type) so the
        // user can just re-send instead of regenerating.
        setAIContent(saved.content);
        setContentType(saved.contentType);
      } else {
        clearAI();
      }
      setShowShareModal(true);
    },
    [clearAI, resetTG, generatedByNews, setAIContent]
  );

  const handleCopy = useCallback(async () => {
    if (!generatedContent) return;
    try {
      const formattedContent = formatGeneratedContent(generatedContent, contentType);
      await navigator.clipboard.writeText(formattedContent);
      setStatus({ message: t('app.copied'), type: 'success' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }, [generatedContent, contentType, t]);

  const handleGenerate = useCallback(async () => {
    const isNewsletter = contentType === 'newsletter';
    const newsPayload = isNewsletter
      ? filteredNews.filter((n) => selectedIds.has(n.id))
      : selectedNews;
    if (!newsPayload || (Array.isArray(newsPayload) && newsPayload.length === 0)) return;
    try {
      const content = await generate(
        newsPayload,
        contentType,
        language,
        provider,
        templateId || undefined,
        templateVariables
      );
      // Remember the generated post for this specific news item so it can be
      // reopened and re-sent later.
      if (!isNewsletter && selectedNews && content) {
        const entry: GeneratedEntry = {
          content,
          contentType,
          updatedAt: Date.now(),
        };
        setGeneratedByNews((prev) => {
          const existing = prev[selectedNews.id];
          return {
            ...prev,
            [selectedNews.id]: {
              ...entry,
              sentAt: existing?.sentAt, // keep prior sent marker on regenerate
            },
          };
        });
      }
    } catch (err) {
      console.error(err);
    }
  }, [
    generate,
    selectedNews,
    filteredNews,
    selectedIds,
    contentType,
    language,
    provider,
    templateId,
    templateVariables,
  ]);

  const handleSendTelegram = useCallback(async () => {
    if (!generatedContent) return;
    try {
      const formattedContent = formatGeneratedContent(generatedContent, contentType);
      // Every send carries the source: append the news link(s) the model left out.
      const sourceItems =
        contentType === 'newsletter'
          ? filteredNews.filter((n) => selectedIds.has(n.id))
          : selectedNews
            ? [selectedNews]
            : [];
      const body = withSourceAttribution(formattedContent, sourceItems, {
        one: t('share.sourceLabel'),
        many: t('share.sourceLabelMany'),
      });
      await send(body);
      // Mark as sent so the grid can show the current delivery status.
      if (selectedNews) {
        setGeneratedByNews((prev) => {
          const existing = prev[selectedNews.id];
          if (!existing) return prev;
          return { ...prev, [selectedNews.id]: { ...existing, sentAt: Date.now() } };
        });
      }
      setStatus({ message: t('app.sentTelegram'), type: 'success' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }, [send, generatedContent, contentType, selectedNews, filteredNews, selectedIds, t]);

  const handleRefresh = useCallback(async () => {
    if (!online) {
      setStatus({ message: t('pwa.offlineReadOnly'), type: 'error' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    setStatus({ message: t('app.fetchingFeeds'), type: 'success' });
    try {
      await fetchRss();
      setStatus({ message: t('app.feedsUpdated'), type: 'success' });
    } catch {
      setStatus({ message: t('app.errFetch'), type: 'error' });
    }
    setTimeout(() => setStatus(null), 3000);
  }, [fetchRss, online, t]);

  const handleToggleSelect = useCallback(
    (id: string, shiftKey?: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId && lastSelectedId !== id) {
          const ids = visibleNews.map((n) => n.id);
          const from = ids.indexOf(lastSelectedId);
          const to = ids.indexOf(id);
          if (from !== -1 && to !== -1) {
            const [start, end] = from < to ? [from, to] : [to, from];
            for (const rangeId of ids.slice(start, end + 1)) next.add(rangeId);
            return next;
          }
        }
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setLastSelectedId(id);
      const index = visibleNews.findIndex((n) => n.id === id);
      if (index !== -1) {
        setSelectedIndex(index);
        setSelectedNews(visibleNews[index]);
      }
    },
    [visibleNews, lastSelectedId]
  );

  const handleBookmarkToggle = useCallback(
    async (newsId: string, nextBookmarked?: boolean) => {
      if (!online) {
        setStatus({ message: t('pwa.offlineReadOnly'), type: 'error' });
        setTimeout(() => setStatus(null), 3000);
        return;
      }
      const wantBookmarked =
        typeof nextBookmarked === 'boolean'
          ? nextBookmarked
          : !(bookmarkedIds ?? new Set()).has(newsId);
      try {
        if (wantBookmarked) {
          await addBookmark(newsId);
          setBookmarkedIds((prev) => new Set(prev ?? []).add(newsId));
        } else {
          await removeBookmark(newsId);
          setBookmarkedIds((prev) => {
            const next = new Set(prev ?? []);
            next.delete(newsId);
            return next;
          });
        }
      } catch (err) {
        console.error(err);
        setStatus({ message: t('app.errBookmark'), type: 'error' });
        setTimeout(() => setStatus(null), 3000);
      }
    },
    [bookmarkedIds, online, t]
  );

  const handleReadToggle = useCallback(
    async (item: NewsItem, read: boolean) => {
      if (!online) {
        setStatus({ message: t('pwa.offlineReadOnly'), type: 'error' });
        setTimeout(() => setStatus(null), 3000);
        return;
      }
      try {
        await setRead(item.id, read);
      } catch (err) {
        console.error(err);
        setStatus({ message: t('app.errRead'), type: 'error' });
        setTimeout(() => setStatus(null), 3000);
      }
    },
    [online, setRead, t]
  );

  // Abrir a notícia marca como lida e, se a preferência estiver ligada,
  // abre o leitor interno em vez de uma nova aba.
  const handleOpen = useCallback(
    (item: NewsItem) => {
      // Offline a lista vem do snapshot e não há como gravar a leitura.
      if (online && markOnOpen && !item.readAt) handleReadToggle(item, true);
      if (openInReader) setReaderItem(item);
    },
    [markOnOpen, handleReadToggle, online, openInReader]
  );

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(visibleNews.map((n) => n.id)));
  }, [visibleNews]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (selectedIds.size === 0) return;

      const ids = Array.from(selectedIds).join(',');
      try {
        const response = await fetch(`/api/news/export?ids=${ids}&format=${format}`, {
          credentials: 'include',
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Export failed' }));
          throw new Error(error.error || 'Export failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        // Extract filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `rss-news-selection-${new Date().toISOString().split('T')[0]}.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="([^"]+)"/);
          if (match) filename = match[1];
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setStatus({ message: t('app.exported', { count: selectedIds.size }), type: 'success' });
        setTimeout(() => setStatus(null), 3000);
      } catch (err) {
        console.error('Export error:', err);
        setStatus({ message: t('app.errExport', { error: err.message }), type: 'error' });
        setTimeout(() => setStatus(null), 3000);
      }
    },
    [selectedIds, t]
  );

  const handleApplySavedSearch = useCallback(
    (search: { query: string; source?: string; sort?: string; read?: string }) => {
      setSearchQuery(search.query);
      if (search.source !== undefined) setSourceFilter(search.source);
      if (search.sort !== undefined) setSortOrder(search.sort as 'newest' | 'oldest' | 'relevance');
      if (search.read !== undefined) setReadFilter(search.read as 'all' | 'unread' | 'read');
    },
    []
  );

  const readerNews = readerItem
    ? (news.find((item) => item.id === readerItem.id) ?? readerItem)
    : null;

  const modalOpen =
    readerNews !== null ||
    showShareModal ||
    showAddModal ||
    showStatsModal ||
    showFeedManager ||
    showNewsletterConfig ||
    showNewsletterBuilder ||
    showSettings ||
    showDigestConfig ||
    showUsers ||
    showTelegramQueue ||
    showSavedSearches ||
    showBookmarks ||
    showProfileModal ||
    showTemplatesModal ||
    showUserSettings ||
    showShortcuts;

  const moveSelection = useCallback(
    (delta: number) => {
      if (!visibleNews.length) return;
      const next = Math.min(Math.max(selectedIndex + delta, 0), visibleNews.length - 1);
      setSelectedIndex(next);
      setSelectedNews(visibleNews[next]);
    },
    [visibleNews, selectedIndex]
  );

  const selectedItem = selectedIndex >= 0 ? visibleNews[selectedIndex] : undefined;

  const shortcutHints = useMemo(
    () => [
      { key: 'j / k', description: t('shortcuts.navigate') },
      { key: 'm', description: t('shortcuts.toggleRead') },
      { key: 'o', description: t('shortcuts.open') },
      { key: 'D', description: t('shortcuts.digest') },
      { key: 'Shift+R', description: t('shortcuts.profile') },
      { key: '?', description: t('shortcuts.help') },
      { key: 'Esc', description: t('shortcuts.close') },
    ],
    [t]
  );

  useKeyboardShortcuts({
    enabled: !modalOpen,
    shortcuts: [
      { key: 'j', description: '', handler: () => moveSelection(1), disabledInInputs: true },
      { key: 'k', description: '', handler: () => moveSelection(-1), disabledInInputs: true },
      {
        key: 'm',
        description: '',
        handler: () => {
          if (selectedItem) handleReadToggle(selectedItem, !selectedItem.readAt);
        },
        disabledInInputs: true,
      },
      {
        key: 'o',
        description: '',
        handler: () => {
          if (!selectedItem) return;
          handleOpen(selectedItem);
          if (!openInReader) window.open(selectedItem.link, '_blank', 'noopener,noreferrer');
        },
        disabledInInputs: true,
      },
      // Os tooltips da toolbar já anunciavam (D) e (Shift+R); antes não havia
      // handler nenhum para eles (MU-018).
      {
        key: 'd',
        description: '',
        handler: () => setDigestView((current) => !current),
        preventDefault: true,
        disabledInInputs: true,
      },
      {
        key: 'shift+r',
        description: '',
        handler: () => setShowProfileModal(true),
        preventDefault: true,
        disabledInInputs: true,
      },
      {
        key: '?',
        description: '',
        handler: () => setShowShortcuts(true),
        disabledInInputs: true,
      },
      {
        key: 'Escape',
        description: '',
        handler: () => {
          setSelectedIds(new Set());
          setSelectedIndex(-1);
          setSelectedNews(null);
        },
      },
    ],
  });

  return (
    <div className="app">
      <OfflineBanner cachedAt={fromCache ? cachedAt : null} />
      <Header
        onRefresh={handleRefresh}
        onAddClick={() => setShowAddModal(true)}
        onStatsClick={() => setShowStatsModal(true)}
        onFeedsClick={() => setShowFeedManager(true)}
        onSettingsClick={() => setShowSettings(true)}
        onDigestClick={() => setShowDigestConfig(true)}
        onUsersClick={() => setShowUsers(true)}
        onTelegramQueueClick={() => setShowTelegramQueue(true)}
        onUserSettingsClick={() => setShowUserSettings(true)}
      />
      <main className="main">
        <div className="toolbar-container">
          <Toolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            currentSourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            currentSortOrder={sortOrder}
            onSortChange={setSortOrder}
            sources={sources}
            onChangeDigestGrouping={setDigestGrouping}
            digestGrouping={digestGrouping}
            onProfileClick={() => setShowProfileModal(true)}
            onTemplatesClick={() => setShowTemplatesModal(true)}
            onMetricsClick={() => setShowMetricsModal(true)}
            onNewsletterClick={
              user && user.role === 'admin' ? () => setShowNewsletterConfig(true) : undefined
            }
            onNewsletterBuilderClick={
              user && user.role !== 'viewer' ? () => setShowNewsletterBuilder(true) : undefined
            }
            onBookmarksClick={() => setShowBookmarks(true)}
            bookmarkCount={bookmarkedIds.size}
            onToggleDigest={() => setDigestView(!digestView)}
            digestView={digestView}
            selectedCount={selectedIds.size}
            loadedCount={visibleNews.length}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onExport={handleExport}
            readFilter={readFilter}
            onReadFilterChange={setReadFilter}
            unreadCount={unreadCount}
            readCount={readCount}
            onSavedSearchesClick={() => setShowSavedSearches(true)}
            onSavedSearchApply={handleApplySavedSearch}
            pinnedSearches={pinnedSearches}
            searchInputRef={searchInputRef}
          />
        </div>

        {status && (
          <Status message={status.message} type={status.type} onClose={() => setStatus(null)} />
        )}

        {digestView ? (
          <DigestView
            news={filteredNews}
            loading={loading}
            error={error}
            grouping={digestGrouping}
            onShare={handleShare}
            selectedIds={selectedIds}
            onSelect={handleToggleSelect}
            selectedIndex={selectedIndex}
            bookmarkedIds={bookmarkedIds}
            onBookmarkToggle={handleBookmarkToggle}
            onOpen={handleOpen}
            generatedIds={generatedIds}
            sentIds={sentIds}
          />
        ) : (
          <NewsGrid
            news={visibleNews}
            loading={loading}
            error={error}
            onShare={handleShare}
            onSelect={handleToggleSelect}
            selectedIds={selectedIds}
            selectedIndex={selectedIndex}
            bookmarkedIds={bookmarkedIds}
            onBookmarkToggle={handleBookmarkToggle}
            onOpen={handleOpen}
            onReadToggle={handleReadToggle}
            emptyMessage={readFilter === 'all' ? undefined : t('news.emptyFiltered')}
            generatedIds={generatedIds}
            sentIds={sentIds}
            hasMore={hasMore}
            onLoadMore={fetchMore}
            loadingMore={loadingMore}
            shown={news.length}
            total={total}
            readOnly={!online}
            openInReader={openInReader}
          />
        )}
      </main>

      {readerNews && (
        <ReaderModal
          item={readerNews}
          isBookmarked={bookmarkedIds.has(readerNews.id)}
          readOnly={!online}
          onClose={() => setReaderItem(null)}
          onToggleBookmark={handleBookmarkToggle}
          onReadToggle={handleReadToggle}
          onShare={handleShare}
        />
      )}

      {showShareModal && (
        <ShareModal
          news={selectedNews}
          selectedNews={filteredNews.filter((n) => selectedIds.has(n.id))}
          contentType={contentType}
          language={language}
          provider={provider}
          templateId={templateId}
          templateVariables={templateVariables}
          templates={templates}
          generatedContent={generatedContent}
          generating={generating}
          aiError={aiError}
          hasGenerated={selectedHasGenerated}
          sending={sending}
          tgError={tgError}
          tgSuccess={tgSuccess}
          onContentTypeChange={setContentType}
          onLanguageChange={setLanguage}
          onProviderChange={setProvider}
          onTemplateIdChange={setTemplateId}
          onTemplateVariablesChange={setTemplateVariables}
          onGenerate={handleGenerate}
          onSendTelegram={handleSendTelegram}
          onCopy={handleCopy}
          onCopyHtml={handleCopy}
          onCopyMarkdown={handleCopy}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {showAddModal && <AddModal onClose={() => setShowAddModal(false)} onSubmit={handleAddNews} />}

      {showStatsModal && <StatsModal onClose={() => setShowStatsModal(false)} />}

      {showMetricsModal && <MetricsModal onClose={() => setShowMetricsModal(false)} />}

      <SavedSearchesModal
        isOpen={showSavedSearches}
        onClose={() => setShowSavedSearches(false)}
        onApplySearch={handleApplySavedSearch}
        searches={savedSearches}
        pinnedSearches={pinnedSearches}
        unpinnedSearches={unpinnedSearches}
        add={addSavedSearch}
        update={updateSavedSearch}
        remove={removeSavedSearch}
      />

      <FeedManagerModal isOpen={showFeedManager} onClose={() => setShowFeedManager(false)} />

      <NewsletterConfigModal
        isOpen={showNewsletterConfig}
        onClose={() => setShowNewsletterConfig(false)}
      />

      <NewsletterBuilderModal
        isOpen={showNewsletterBuilder}
        news={news}
        onClose={() => setShowNewsletterBuilder(false)}
      />

      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      <UserSettingsModal isOpen={showUserSettings} onClose={() => setShowUserSettings(false)} />

      <DigestConfigModal isOpen={showDigestConfig} onClose={() => setShowDigestConfig(false)} />
      <UsersModal isOpen={showUsers} onClose={() => setShowUsers(false)} />
      <TelegramQueueModal isOpen={showTelegramQueue} onClose={() => setShowTelegramQueue(false)} />

      <BookmarksModal isOpen={showBookmarks} onClose={() => setShowBookmarks(false)} />

      <InterestProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />

      <TemplatesModal isOpen={showTemplatesModal} onClose={() => setShowTemplatesModal(false)} />

      <ShortcutsHelp
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        shortcuts={shortcutHints}
      />
    </div>
  );
}

export function App() {
  return (
    <>
      <UpdateToast />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppContent />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}
