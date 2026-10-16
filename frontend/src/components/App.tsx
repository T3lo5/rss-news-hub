import { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAI } from '../hooks/useAI';
import { addBookmark, fetchBookmarks, removeBookmark } from '../hooks/useBookmarks';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNews } from '../hooks/useNews';
import { fetchProfile } from '../hooks/useRelevance';
import { useTelegram } from '../hooks/useTelegram';
import { api } from '../services/api';
import { formatGeneratedContent } from '../utils/content';
import type {
  ContentType,
  DigestGrouping,
  InterestProfile,
  Language,
  NewsItem,
  Provider,
  Template,
} from '../types';

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
import { AddModal } from './AddModal';
import { BookmarksModal } from './BookmarksModal';
import { DigestView } from './DigestView';
import { FeedManagerModal } from './FeedManagerModal';
import { Header } from './Header';
import { InterestProfileModal } from './InterestProfileModal';
import { NewsGrid } from './NewsGrid';
import { NewsletterConfigModal } from './NewsletterConfigModal';
import { NewsletterBuilderModal } from './NewsletterBuilderModal';
import { SettingsModal } from './SettingsModal';
import { DigestConfigModal } from './DigestConfigModal';
import { UsersModal } from './UsersModal';
import { ShareModal } from './ShareModal';
import { ShortcutsHelp } from './ShortcutsHelp';
import { StatsModal } from './StatsModal';
import { Status } from './Status';
import { TemplatesModal } from './TemplatesModal';
import { Toolbar } from './Toolbar';
import { LoginPage } from '../pages/LoginPage';
import { useAuth } from '../contexts/AuthContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando...</div>
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
  const { news, loading, error, fetchNews, addNews, fetchRss, fetchingRss } = useNews();
  const { generatedContent, generating, error: aiError, generate, clear: clearAI, setContent: setAIContent } = useAI();
  const { sending, error: tgError, success: tgSuccess, send, reset: resetTG } = useTelegram();

  const [showShareModal, setShowShareModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFeedManager, setShowFeedManager] = useState(false);
  const [showNewsletterConfig, setShowNewsletterConfig] = useState(false);
  const [showNewsletterBuilder, setShowNewsletterBuilder] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDigestConfig, setShowDigestConfig] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
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
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'relevance'>('newest');

  // filteredNews must be defined BEFORE handlers that use it
  const filteredNews = useMemo(() => {
    let result = [...news];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.source.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
      );
    }

    if (sourceFilter) {
      result = result.filter((item) => item.source === sourceFilter);
    }

    switch (sortOrder) {
      case 'newest':
        result.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.pubDate).getTime() - new Date(b.pubDate).getTime());
        break;
      case 'relevance':
        result.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        break;
    }

    return result;
  }, [news, searchQuery, sourceFilter, sortOrder]);

  const sources = useMemo(() => [...new Set(news.map((n) => n.source))], [news]);

  const generatedIds = useMemo(() => {
    const set = new Set<string>();
    Object.entries(generatedByNews).forEach(([id, entry]) => {
      if (entry?.content) set.add(id);
    });
    return set;
  }, [generatedByNews]);

  const sentIds = useMemo(() => {
    const set = new Set<string>();
    Object.entries(generatedByNews).forEach(([id, entry]) => {
      if (entry?.sentAt) set.add(id);
    });
    return set;
  }, [generatedByNews]);

  const selectedHasGenerated = selectedNews ? generatedIds.has(selectedNews.id) : false;

  // Fetch news immediately (public or auth-protected based on backend)
  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

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
  }, [authLoading, user, fetchNews]);

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
      setStatus({ message: 'Conteúdo copiado!', type: 'success' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }, [generatedContent, contentType]);

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
      await send(formattedContent);
      // Mark as sent so the grid can show the current delivery status.
      if (selectedNews) {
        setGeneratedByNews((prev) => {
          const existing = prev[selectedNews.id];
          if (!existing) return prev;
          return { ...prev, [selectedNews.id]: { ...existing, sentAt: Date.now() } };
        });
      }
      setStatus({ message: 'Enviado para o Telegram!', type: 'success' });
      setTimeout(() => setStatus(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }, [send, generatedContent, contentType, selectedNews]);

  const handleRefresh = useCallback(async () => {
    setStatus({ message: 'Buscando feeds...', type: 'success' });
    try {
      await fetchRss();
      setStatus({ message: 'Feeds atualizados!', type: 'success' });
    } catch (err) {
      setStatus({ message: 'Erro ao buscar feeds', type: 'error' });
    }
    setTimeout(() => setStatus(null), 3000);
  }, [fetchRss]);

  const handleToggleSelect = useCallback(
    (id: string, shiftKey?: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId && lastSelectedId !== id) {
          const ids = filteredNews.map((n) => n.id);
          const from = ids.indexOf(lastSelectedId);
          const to = ids.indexOf(id);
          if (from !== -1 && to !== -1) {
            const [start, end] = from < to ? [from, to] : [to, from];
            ids.slice(start, end + 1).forEach((rangeId) => next.add(rangeId));
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
      const index = filteredNews.findIndex((n) => n.id === id);
      if (index !== -1) {
        setSelectedIndex(index);
        setSelectedNews(filteredNews[index]);
      }
    },
    [filteredNews, lastSelectedId]
  );

  const handleBookmarkToggle = useCallback(
    async (newsId: string, nextBookmarked?: boolean) => {
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
        setStatus({ message: 'Erro ao salvar favorito', type: 'error' });
        setTimeout(() => setStatus(null), 3000);
      }
    },
    [bookmarkedIds]
  );

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredNews.map((n) => n.id)));
  }, [filteredNews]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <div className="app">
      <Header
        onRefresh={handleRefresh}
        onAddClick={() => setShowAddModal(true)}
        onStatsClick={() => setShowStatsModal(true)}
        onFeedsClick={() => setShowFeedManager(true)}
        onSettingsClick={() => setShowSettings(true)}
        onDigestClick={() => setShowDigestConfig(true)}
        onUsersClick={() => setShowUsers(true)}
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
            onNewsletterClick={() => setShowNewsletterConfig(true)}
            onNewsletterBuilderClick={
              user && user.role !== 'viewer' ? () => setShowNewsletterBuilder(true) : undefined
            }
            onBookmarksClick={() => setShowBookmarks(true)}
            bookmarkCount={bookmarkedIds.size}
            onToggleDigest={() => setDigestView(!digestView)}
            digestView={digestView}
            selectedCount={selectedIds.size}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
          />
        </div>

        {status && <Status message={status.message} type={status.type} onClose={() => setStatus(null)} />}

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
            generatedIds={generatedIds}
            sentIds={sentIds}
          />
        ) : (
          <NewsGrid
            news={filteredNews}
            loading={loading}
            error={error}
            onShare={handleShare}
            onSelect={handleToggleSelect}
            selectedIds={selectedIds}
            selectedIndex={selectedIndex}
            bookmarkedIds={bookmarkedIds}
            onBookmarkToggle={handleBookmarkToggle}
            generatedIds={generatedIds}
            sentIds={sentIds}
          />
        )}
      </main>

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

      {showAddModal && (
        <AddModal onClose={() => setShowAddModal(false)} onSubmit={handleAddNews} />
      )}

      {showStatsModal && <StatsModal onClose={() => setShowStatsModal(false)} />}

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

      <DigestConfigModal isOpen={showDigestConfig} onClose={() => setShowDigestConfig(false)} />
      <UsersModal isOpen={showUsers} onClose={() => setShowUsers(false)} />

      <BookmarksModal isOpen={showBookmarks} onClose={() => setShowBookmarks(false)} />

      <InterestProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />

      <TemplatesModal
        isOpen={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
      />

      <ShortcutsHelp />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<ProtectedRoute><AppContent /></ProtectedRoute>} />
    </Routes>
  );
}