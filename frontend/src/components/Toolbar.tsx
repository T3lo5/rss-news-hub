import {
  ArrowUpDown,
  Bookmark,
  BookOpen,
  ChevronDown,
  Download,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Newspaper,
  PenLine,
  Search,
  Target,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../i18n';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  source?: string;
  sort?: 'newest' | 'oldest' | 'relevance';
  read?: 'all' | 'unread' | 'read';
  color?: string;
  pinned?: boolean;
}

export type ExportFormat = 'md' | 'json' | 'opml';

interface ToolbarProps {
  searchQuery?: string;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (source: string) => void;
  onSortChange: (order: 'newest' | 'oldest' | 'relevance') => void;
  onReadFilterChange: (value: ReadFilter) => void;
  onSavedSearchApply: (search: SavedSearch) => void;
  pinnedSearches: SavedSearch[];
  onSavedSearchesClick: () => void;
  sources: string[];
  currentSourceFilter: string;
  currentSortOrder: 'newest' | 'oldest' | 'relevance';
  readFilter: ReadFilter;
  selectedCount: number;
  loadedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExport?: (format: ExportFormat) => void;
  onNewsletterClick?: () => void;
  onTemplatesClick: () => void;
  onBookmarksClick: () => void;
  bookmarkCount: number;
  digestView: boolean;
  onToggleDigest: () => void;
  digestGrouping: 'none' | 'daily' | 'weekly';
  onChangeDigestGrouping: (value: 'none' | 'daily' | 'weekly') => void;
  onProfileClick: () => void;
  onNewsletterBuilderClick?: () => void;
  unreadCount: number;
  readCount: number;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export type ReadFilter = 'all' | 'unread' | 'read';

export function Toolbar({
  searchQuery = '',
  onSearchChange,
  onSourceFilterChange,
  onSortChange,
  onReadFilterChange,
  onSavedSearchApply,
  pinnedSearches,
  onSavedSearchesClick,
  sources,
  currentSourceFilter,
  currentSortOrder,
  readFilter,
  selectedCount,
  loadedCount,
  onSelectAll,
  onClearSelection,
  onNewsletterClick,
  onTemplatesClick,
  bookmarkCount,
  onBookmarksClick,
  digestView,
  onToggleDigest,
  digestGrouping,
  onChangeDigestGrouping,
  onProfileClick,
  onNewsletterBuilderClick,
  unreadCount,
  readCount,
  searchInputRef,
}: ToolbarProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [showSavedSearches, setShowSavedSearches] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  // Toda a lista carregada está marcada → o botão passa a desmarcar.
  const allSelected = loadedCount > 0 && selectedCount >= loadedCount;

  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showSavedSearches &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowSavedSearches(false);
      }
      if (
        showExport &&
        exportDropdownRef.current &&
        !exportDropdownRef.current.contains(event.target as Node)
      ) {
        setShowExport(false);
      }
    };
    if (showSavedSearches || showExport) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSavedSearches, showExport]);

  const handleSearchApply = (search: SavedSearch) => {
    onSavedSearchApply(search);
    // Focus the search input after applying
    searchInputRef?.current?.focus();
    setShowSavedSearches(false);
  };

  return (
    <div className="toolbar">
      <div className="search-box">
        <Search className="search-icon" size={16} aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          placeholder={t('news.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={t('toolbar.searchAria')}
        />
      </div>

      {/* Saved searches dropdown */}
      <div className="saved-searches-dropdown" ref={dropdownRef}>
        <button
          className={`btn btn-icon btn-sm ${showSavedSearches ? 'active' : ''}`}
          onClick={() => setShowSavedSearches((prev) => !prev)}
          title={t('toolbar.savedSearchesTitle')}
          aria-label={t('toolbar.savedSearchesTitle')}
          aria-expanded={showSavedSearches}
          aria-haspopup="listbox"
        >
          <BookOpen size={16} />
          <ChevronDown size={14} className="chevron" />
        </button>

        {showSavedSearches && (
          <div
            className="saved-searches-popover"
            role="listbox"
            aria-label={t('savedSearches.title')}
          >
            {pinnedSearches.length > 0 && (
              <div className="saved-searches-pinned">
                <span className="saved-searches-section-title">{t('savedSearches.pinned')}</span>
                {pinnedSearches.slice(0, 3).map((search) => (
                  <button
                    key={search.id}
                    className="saved-search-chip"
                    onClick={() => handleSearchApply(search)}
                    role="option"
                    style={{ '--chip-color': search.color || '#6366f1' }}
                    title={`${search.name}: ${search.query}`}
                  >
                    <span
                      className="chip-color"
                      style={{ background: search.color || '#6366f1' }}
                    />
                    <span className="chip-name">{search.name}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              className="saved-searches-manage"
              onClick={() => {
                setShowSavedSearches(false);
                onSavedSearchesClick();
              }}
              role="option"
            >
              <span>{t('savedSearches.manage')}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="selection-bar">
          <span className="selection-count">
            {t(selectedCount === 1 ? 'toolbar.selectedOne' : 'toolbar.selectedMany', {
              count: selectedCount,
            })}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={allSelected ? onClearSelection : onSelectAll}
          >
            {allSelected ? t('toolbar.deselectAll') : t('toolbar.selectAll')}
          </button>
          {onExport && (
            <div className="export-dropdown" ref={exportDropdownRef}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowExport(!showExport)}
                aria-expanded={showExport}
                aria-haspopup="menu"
                aria-label={t('toolbar.exportAria')}
              >
                <Download size={14} />
                <span>{t('toolbar.export')}</span>
                <ChevronDown size={12} className={`chevron ${showExport ? 'rotated' : ''}`} />
              </button>
              {showExport && (
                <div className="export-popover" role="menu">
                  <button
                    className="export-option"
                    role="menuitem"
                    onClick={() => {
                      onExport('md');
                      setShowExport(false);
                    }}
                  >
                    <FileText size={14} />
                    <span>{t('toolbar.exportMd')}</span>
                  </button>
                  <button
                    className="export-option"
                    role="menuitem"
                    onClick={() => {
                      onExport('json');
                      setShowExport(false);
                    }}
                  >
                    <FileText size={14} />
                    <span>{t('toolbar.exportJson')}</span>
                  </button>
                  <button
                    className="export-option"
                    role="menuitem"
                    onClick={() => {
                      onExport('opml');
                      setShowExport(false);
                    }}
                  >
                    <FileText size={14} />
                    <span>{t('toolbar.exportOpml')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClearSelection}
            aria-label={t('common.clear')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="read-filter" role="group" aria-label={t('toolbar.readFilterAria')}>
        {(['all', 'unread', 'read'] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="read-filter-btn"
            aria-pressed={readFilter === option}
            onClick={() => onReadFilterChange(option)}
          >
            {t(`toolbar.read.${option}`)}
            {option !== 'all' && (
              <span className="read-filter-count">
                {option === 'unread' ? unreadCount : readCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="filter-group">
        <label htmlFor="sourceFilter">
          <Filter size={13} aria-hidden="true" />
          {t('toolbar.source')}
        </label>
        <select
          id="sourceFilter"
          value={currentSourceFilter}
          onChange={(e) => onSourceFilterChange(e.target.value)}
          aria-label={t('toolbar.sourceAria')}
        >
          <option value="">{t('toolbar.allSources')}</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="sortFilter">
          <ArrowUpDown size={13} aria-hidden="true" />
          {t('toolbar.sort')}
        </label>
        <select
          id="sortFilter"
          value={currentSortOrder}
          onChange={(e) => onSortChange(e.target.value as 'newest' | 'oldest' | 'relevance')}
          aria-label={t('toolbar.sortAria')}
        >
          <option value="newest">{t('toolbar.newest')}</option>
          <option value="oldest">{t('toolbar.oldest')}</option>
          <option value="relevance">{t('toolbar.relevance')}</option>
        </select>
      </div>

      <div className="filter-group toolbar-spacer">
        {bookmarkCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBookmarksClick}
            title={t('toolbar.bookmarksTitle', { count: bookmarkCount })}
          >
            <Bookmark size={15} />
            <span className="badge">{bookmarkCount}</span>
          </button>
        )}

        <div className="digest-controls">
          <button
            className={`btn btn-icon btn-sm ${digestView ? 'active' : ''}`}
            onClick={onToggleDigest}
            title={t('toolbar.digestToggle')}
            aria-pressed={digestView}
          >
            {digestView ? <LayoutGrid size={16} /> : <List size={16} />}
          </button>
          {digestView && (
            <select
              value={digestGrouping}
              onChange={(e) =>
                onChangeDigestGrouping(e.target.value as 'none' | 'daily' | 'weekly')
              }
              aria-label={t('toolbar.digestGroupingAria')}
            >
              <option value="none">{t('toolbar.groupAll')}</option>
              <option value="daily">{t('toolbar.groupDaily')}</option>
              <option value="weekly">{t('toolbar.groupWeekly')}</option>
            </select>
          )}
        </div>

        {user?.role !== 'viewer' && (
          <button
            className="btn btn-icon btn-sm"
            onClick={onProfileClick}
            title={t('toolbar.profileTitle')}
            aria-label={t('toolbar.profileTitle')}
          >
            <Target size={16} />
          </button>
        )}
        <button
          className="btn btn-icon btn-sm"
          onClick={onTemplatesClick}
          title={t('toolbar.templatesTitle')}
          aria-label={t('toolbar.templatesTitle')}
        >
          <FileText size={16} />
        </button>
        {onNewsletterBuilderClick && (
          <button
            className="btn btn-icon btn-sm"
            onClick={onNewsletterBuilderClick}
            title={t('toolbar.builderTitle')}
            aria-label={t('toolbar.builderTitle')}
          >
            <PenLine size={16} />
          </button>
        )}

        {onNewsletterClick && (
          <button className="btn btn-secondary btn-sm" onClick={onNewsletterClick}>
            <Newspaper size={15} />
            <span className="btn-label">{t('toolbar.newsletter')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
