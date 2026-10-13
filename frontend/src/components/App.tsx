import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAI } from '../hooks/useAI';
import { addBookmark, fetchBookmarks, removeBookmark } from '../hooks/useBookmarks';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useNews } from '../hooks/useNews';
import { fetchProfile } from '../hooks/useRelevance';
import { useTelegram } from '../hooks/useTelegram';
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
import { AddModal } from './AddModal';
import { BookmarksModal } from './BookmarksModal';
import { DigestView } from './DigestView';
import { FeedManagerModal } from './FeedManagerModal';
import { Header } from './Header';
import { InterestProfileModal } from './InterestProfileModal';
import { NewsGrid } from './NewsGrid';
import { NewsletterConfigModal } from './NewsletterConfigModal';
import { ShareModal } from './ShareModal';
import { ShortcutsHelp } from './ShortcutsHelp';
import { StatsModal } from './StatsModal';
import { Status } from './Status';
import { TemplatesModal } from './TemplatesModal';
import { Toolbar } from './Toolbar';

export function App() {
  const { news, loading, error, fetchNews, addNews, fetchRss, fetchingRss } = useNews();
  const { generatedContent, generating, error: aiError, generate, clear: clearAI } = useAI();
  const { sending, error: tgError, success: tgSuccess, send, reset: resetTG } = useTelegram();

  const [showShareModal, setShowShareModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showFeedManager, setShowFeedManager] = useState(false);
  const [showNewsletterConfig, setShowNewsletterConfig] = useState(false);
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

    result.sort((a, b) => {
      if (sortOrder === 'relevance') {
        const scoreA = a.relevanceScore ?? -1;
        const scoreB = b.relevanceScore ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        // Fallback to date for ties
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      }
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [news, searchQuery, sourceFilter, sortOrder]);

  const showStatus = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setStatus({ message, type });
    setTimeout(() => setStatus(null), 3000);
  }, []);

  const handleOpenShare = useCallback(
    (item: NewsItem) => {
      setSelectedNews(item);
      setShowShareModal(true);
      clearAI();
      resetTG();
    },
    [clearAI, resetTG]
  );

  const handleCloseShare = useCallback(() => {
    setShowShareModal(false);
    setSelectedNews(null);
    clearAI();
  }, [clearAI]);

  const handleGenerate = useCallback(async () => {
    if (contentType === 'newsletter') {
      const selectedItems = filteredNews.filter((n) => selectedIds.has(n.id));
      if (selectedItems.length === 0) return;
      try {
        await generate(
          selectedItems,
          contentType,
          language,
          provider,
          templateId || undefined,
          templateVariables || undefined
        );
      } catch {
        // Error handled in hook
      }
    } else {
      if (!selectedNews) return;
      try {
        await generate(
          selectedNews,
          contentType,
          language,
          provider,
          templateId || undefined,
          templateVariables || undefined
        );
      } catch {
        // Error handled in hook
      }
    }
  }, [
    selectedNews,
    selectedIds,
    filteredNews,
    contentType,
    language,
    provider,
    templateId,
    templateVariables,
    generate,
  ]);

  const handleSendTelegram = useCallback(async () => {
    if (!generatedContent) return;
    try {
      await send(generatedContent);
      showStatus('Enviado para o Telegram!', 'success');
    } catch {
      showStatus('Erro ao enviar para o Telegram', 'error');
    }
  }, [generatedContent, send, showStatus]);

  const handleCopy = useCallback(async () => {
    if (!generatedContent) return;
    try {
      await navigator.clipboard.writeText(generatedContent);
      showStatus('Copiado!', 'success');
    } catch {
      showStatus('Falha ao copiar', 'error');
    }
  }, [generatedContent, showStatus]);

  // Selection handlers
  const handleSelect = useCallback(
    (id: string, shiftKey = false) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastSelectedId && lastSelectedId !== id) {
          // Range selection
          const allIds = filteredNews.map((n) => n.id);
          const start = allIds.indexOf(lastSelectedId);
          const end = allIds.indexOf(id);
          const [min, max] = start < end ? [start, end] : [end, start];
          for (let i = min; i <= max; i++) {
            next.add(allIds[i]);
          }
        } else {
          // Toggle single
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }
        return next;
      });
      setLastSelectedId(id);
    },
    [filteredNews, lastSelectedId]
  );

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(filteredNews.map((n) => n.id));
    if (selectedIds.size === allIds.size && selectedIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(allIds);
    }
    setLastSelectedId(null);
  }, [filteredNews, selectedIds]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectedCount = selectedIds.size;

  const selectedNewsItems = useMemo(
    () => filteredNews.filter((n) => selectedIds.has(n.id)),
    [filteredNews, selectedIds]
  );

  const handleCopyHtml = useCallback(async () => {
    if (!generatedContent) return;
    try {
      const html = markdownToHtml(generatedContent);
      await navigator.clipboard.writeText(html);
      showStatus('HTML copiado!', 'success');
    } catch {
      showStatus('Falha ao copiar HTML', 'error');
    }
  }, [generatedContent, showStatus]);

  const handleCopyMarkdown = useCallback(async () => {
    if (!generatedContent) return;
    try {
      await navigator.clipboard.writeText(generatedContent);
      showStatus('Markdown copiado!', 'success');
    } catch {
      showStatus('Falha ao copiar Markdown', 'error');
    }
  }, [generatedContent, showStatus]);

  // Simple markdown to HTML for email
  function markdownToHtml(md: string): string {
    return md
      .replace(/^# (.+)$/gm, '<h1 style="color:#1a1a2e;margin:24px 0 12px;font-size:24px;">$1</h1>')
      .replace(
        /^## (.+)$/gm,
        '<h2 style="color:#1a1a2e;margin:20px 0 10px;font-size:20px;">$1</h2>'
      )
      .replace(
        /^### (.+)$/gm,
        '<h3 style="color:#1a1a2e;margin:16px 0 8px;font-size:18px;">$1</h3>'
      )
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(
        /`(.+?)`/g,
        '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">$1</code>'
      )
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>')
      .replace(/^- (.+)$/gm, '<li style="margin:8px 0;">$1</li>')
      .replace(/(<li.*>.*<\/li>)/s, '<ul style="margin:12px 0;padding-left:20px;">$1</ul>')
      .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
      .replace(/^(.+)$/gm, '<p style="margin:12px 0;line-height:1.6;">$1</p>')
      .replace(/<p style="margin:12px 0;line-height:1.6;"><\/p>/g, '')
      .replace(/<p style="margin:12px 0;line-height:1.6;">(<h[1-3].*<\/h[1-3]>)<\/p>/g, '$1')
      .replace(/<p style="margin:12px 0;line-height:1.6;">(<ul.*<\/ul>)<\/p>/g, '$1');
  }

  const handleAddNews = useCallback(
    async (data: { title: string; link: string; source?: string; description?: string }) => {
      try {
        await addNews(data);
        showStatus('Notícia adicionada!', 'success');
        setShowAddModal(false);
      } catch {
        showStatus('Erro ao adicionar notícia', 'error');
      }
    },
    [addNews, showStatus]
  );

  const handleRefresh = useCallback(async () => {
    showStatus('Buscando RSS...', 'success');
    try {
      const result = await fetchRss();
      const total = result.data?.total || 0;
      const sources = result.data?.results?.filter((r) => r.count > 0).length || 0;
      showStatus(`Atualizado! ${total} notícias de ${sources} fontes`, 'success');
    } catch {
      showStatus('Erro ao buscar RSS', 'error');
    }
  }, [fetchRss, showStatus]);

  const handleOpenStats = useCallback(() => {
    setShowStatsModal(true);
  }, []);

  const handleCloseStats = useCallback(() => {
    setShowStatsModal(false);
  }, []);

  const handleOpenFeedManager = useCallback(() => {
    setShowFeedManager(true);
  }, []);

  const handleCloseFeedManager = useCallback(() => {
    setShowFeedManager(false);
  }, []);

  const handleOpenNewsletterConfig = useCallback(() => {
    setShowNewsletterConfig(true);
  }, []);

  const handleOpenTemplates = useCallback(() => {
    setShowTemplatesModal(true);
  }, []);

  const handleCloseNewsletterConfig = useCallback(() => {
    setShowNewsletterConfig(false);
  }, []);

  // Load bookmarks on mount
  useEffect(() => {
    fetchBookmarks()
      .then((b) => setBookmarkedIds(new Set(b.map((item) => item.newsId))))
      .catch(console.error);
  }, []);

  // Persist digest grouping
  useEffect(() => {
    localStorage.setItem('digestGrouping', digestGrouping);
  }, [digestGrouping]);

  // Load interest profile on mount
  useEffect(() => {
    fetchProfile().then(setInterestProfile).catch(console.error);
  }, []);

  // Load templates on mount
  useEffect(() => {
    api
      .getTemplates()
      .then((data) => setTemplates(data.templates))
      .catch(console.error);
  }, []);

  const handleOpenBookmarks = useCallback(() => {
    setShowBookmarks(true);
  }, []);

  const handleCloseBookmarks = useCallback(() => {
    setShowBookmarks(false);
  }, []);

  const handleBookmarkToggle = useCallback(
    async (newsId: string, isBookmarked: boolean) => {
      try {
        if (isBookmarked) {
          await addBookmark(newsId);
          setBookmarkedIds((prev) => new Set(prev).add(newsId));
          showStatus('Saved for later', 'success');
        } else {
          await removeBookmark(newsId);
          setBookmarkedIds((prev) => {
            const next = new Set(prev);
            next.delete(newsId);
            return next;
          });
          showStatus('Removed from bookmarks', 'success');
        }
      } catch (err) {
        showStatus(err instanceof Error ? err.message : 'Failed to update bookmark', 'error');
        // Revert on error
        setBookmarkedIds((prev) => {
          const next = new Set(prev);
          isBookmarked ? next.delete(newsId) : next.add(newsId);
          return next;
        });
      }
    },
    [showStatus]
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleSourceFilterChange = useCallback((value: string) => {
    setSourceFilter(value);
  }, []);

  const handleSortChange = useCallback((value: 'newest' | 'oldest' | 'relevance') => {
    setSortOrder(value);
  }, []);

  const handleOpenProfile = useCallback(() => {
    setShowProfileModal(true);
  }, []);

  const handleCloseProfile = useCallback(() => {
    setShowProfileModal(false);
  }, []);

  const handleToggleDigest = useCallback(() => {
    setDigestView((prev) => !prev);
  }, []);

  const handleCycleDigestGrouping = useCallback(() => {
    setDigestGrouping((prev) => {
      if (prev === 'none') return 'daily';
      if (prev === 'daily') return 'weekly';
      return 'none';
    });
    setDigestView(true);
  }, []);

  // Navigation handlers
  // Reset selection when filtered news changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredNews]);

  const handleNext = useCallback(() => {
    if (filteredNews.length === 0) return;
    setSelectedIndex((prev) => (prev + 1) % filteredNews.length);
  }, [filteredNews.length]);

  const handlePrev = useCallback(() => {
    if (filteredNews.length === 0) return;
    setSelectedIndex((prev) => (prev - 1 + filteredNews.length) % filteredNews.length);
  }, [filteredNews.length]);

  const handleOpen = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filteredNews.length) {
      handleOpenShare(filteredNews[selectedIndex]);
    }
  }, [selectedIndex, filteredNews, handleOpenShare]);

  // Keyboard shortcuts
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const anyModalOpen =
    showShareModal ||
    showAddModal ||
    showStatsModal ||
    showFeedManager ||
    showNewsletterConfig ||
    showBookmarks ||
    showProfileModal ||
    showShortcutsHelp;

  const shortcuts = useMemo(
    () => [
      {
        key: '/',
        description: 'Focus search',
        handler: () => {
          document.querySelector<HTMLInputElement>('.search-box input')?.focus();
        },
      },
      {
        key: 'j',
        description: 'Next news card',
        handler: handleNext,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'k',
        description: 'Previous news card',
        handler: handlePrev,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'Enter',
        description: 'Open selected card',
        handler: handleOpen,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'a',
        description: 'Select all / Clear selection',
        handler: handleSelectAll,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'b',
        description: 'Toggle bookmark on selected',
        handler: () => {
          if (selectedIndex >= 0 && selectedIndex < filteredNews.length)
            handleBookmarkToggle(
              filteredNews[selectedIndex].id,
              !bookmarkedIds.has(filteredNews[selectedIndex].id)
            );
        },
        disabledInInputs: true,
        preventDefault: true,
      },
      { key: 'B', description: 'Open bookmarks', handler: handleOpenBookmarks },
      {
        key: 'd',
        description: 'Toggle digest view',
        handler: handleToggleDigest,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'D',
        description: 'Cycle digest grouping',
        handler: handleCycleDigestGrouping,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'r',
        description: 'Sort by relevance',
        handler: () => setSortOrder('relevance'),
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'R',
        description: 'Open interest profile',
        handler: handleOpenProfile,
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'o',
        description: 'Export OPML',
        handler: () => {
          if (showFeedManager) document.querySelector('button[title*="Export OPML"]')?.click();
        },
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'O',
        description: 'Import OPML',
        handler: () => {
          if (showFeedManager) document.querySelector('button[title*="Import OPML"]')?.click();
        },
        disabledInInputs: true,
        preventDefault: true,
      },
      {
        key: 'g',
        description: 'Generate AI content',
        handler: () => {
          if (showShareModal) handleGenerate();
        },
      },
      {
        key: 't',
        description: 'Send to Telegram',
        handler: () => {
          if (showShareModal && generatedContent) handleSendTelegram();
        },
      },
      {
        key: 'c',
        description: 'Copy generated content',
        handler: () => {
          if (generatedContent) handleCopy();
        },
      },
      { key: 's', description: 'Open stats', handler: handleOpenStats },
      { key: 'f', description: 'Open feed manager', handler: handleOpenFeedManager },
      { key: 'F', description: 'Refresh (fetch RSS)', handler: handleRefresh },
      {
        key: 'Escape',
        description: 'Close modals / Clear selection',
        handler: () => {
          handleCloseShare();
          setShowAddModal(false);
          handleCloseStats();
          handleCloseFeedManager();
          handleCloseNewsletterConfig();
          handleCloseBookmarks();
          handleCloseProfile();
          setShowShortcutsHelp(false);
          handleClearSelection();
        },
      },
      { key: '?', description: 'Show shortcuts help', handler: () => setShowShortcutsHelp(true) },
    ],
    [
      showShareModal,
      generatedContent,
      handleGenerate,
      handleSendTelegram,
      handleCopy,
      handleOpenStats,
      handleRefresh,
      handleCloseShare,
      handleCloseStats,
      handleCloseFeedManager,
      handleOpenFeedManager,
      handleNext,
      handlePrev,
      handleOpen,
      anyModalOpen,
      handleSelectAll,
      handleClearSelection,
      handleOpenBookmarks,
      handleCloseBookmarks,
      handleBookmarkToggle,
      filteredNews,
      selectedIndex,
      bookmarkedIds,
      showFeedManager,
      handleToggleDigest,
      handleCycleDigestGrouping,
      handleOpenProfile,
      handleCloseProfile,
    ]
  );

  useKeyboardShortcuts({ shortcuts });

  const sources = useMemo(
    () => Array.from(new Set(news.map((n) => n.source).filter(Boolean))),
    [news]
  );

  return (
    <div className="app">
      <Header
        onRefresh={handleRefresh}
        onAddClick={() => setShowAddModal(true)}
        onStatsClick={handleOpenStats}
        onFeedsClick={handleOpenFeedManager}
      />

      {status && <Status message={status.message} type={status.type} />}

      <Toolbar
        onSearchChange={handleSearchChange}
        onSourceFilterChange={handleSourceFilterChange}
        onSortChange={handleSortChange}
        sources={sources}
        currentSourceFilter={sourceFilter}
        currentSortOrder={sortOrder}
        selectedCount={selectedCount}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onNewsletterClick={handleOpenNewsletterConfig}
        onTemplatesClick={handleOpenTemplates}
        bookmarkCount={bookmarkedIds.size}
        onBookmarksClick={handleOpenBookmarks}
        digestView={digestView}
        onToggleDigest={handleToggleDigest}
        digestGrouping={digestGrouping}
        onChangeDigestGrouping={setDigestGrouping}
        onProfileClick={handleOpenProfile}
      />

      <main className="main">
        {digestView ? (
          <DigestView
            news={filteredNews}
            loading={loading}
            error={error}
            grouping={digestGrouping}
            onShare={handleOpenShare}
            onBookmarkToggle={handleBookmarkToggle}
            bookmarkedIds={bookmarkedIds}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedIndex={selectedIndex}
          />
        ) : (
          <NewsGrid
            news={filteredNews}
            loading={loading}
            error={error}
            onShare={handleOpenShare}
            onSelect={handleSelect}
            selectedIds={selectedIds}
            selectedIndex={selectedIndex}
            bookmarkedIds={bookmarkedIds}
            onBookmarkToggle={handleBookmarkToggle}
          />
        )}
      </main>

      {showShareModal && (
        <ShareModal
          news={selectedNews}
          selectedNews={selectedNewsItems}
          contentType={contentType}
          language={language}
          provider={provider}
          templateId={templateId}
          templates={templates}
          generatedContent={generatedContent}
          generating={generating}
          aiError={aiError}
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
          onCopyHtml={handleCopyHtml}
          onCopyMarkdown={handleCopyMarkdown}
          onClose={handleCloseShare}
        />
      )}

      {showAddModal && <AddModal onSubmit={handleAddNews} onClose={() => setShowAddModal(false)} />}

      {showStatsModal && <StatsModal onClose={handleCloseStats} />}

      {showFeedManager && (
        <FeedManagerModal isOpen={showFeedManager} onClose={handleCloseFeedManager} />
      )}

      {showNewsletterConfig && (
        <NewsletterConfigModal
          isOpen={showNewsletterConfig}
          onClose={handleCloseNewsletterConfig}
        />
      )}

      {showTemplatesModal && (
        <TemplatesModal isOpen={showTemplatesModal} onClose={() => setShowTemplatesModal(false)} />
      )}

      {showBookmarks && <BookmarksModal isOpen={showBookmarks} onClose={handleCloseBookmarks} />}

      {showProfileModal && (
        <InterestProfileModal isOpen={showProfileModal} onClose={handleCloseProfile} />
      )}

      <ShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        shortcuts={shortcuts.map((s) => ({ key: s.key, description: s.description }))}
      />
    </div>
  );
}
