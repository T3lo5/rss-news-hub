import {
  ArrowUpDown,
  Bookmark,
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
import { useI18n } from '../i18n';

interface ToolbarProps {
  searchQuery?: string;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (source: string) => void;
  onSortChange: (order: 'newest' | 'oldest' | 'relevance') => void;
  sources: string[];
  currentSourceFilter: string;
  currentSortOrder: 'newest' | 'oldest' | 'relevance';
  selectedCount: number;
  /** Itens atualmente carregados na lista — é o que "Selecionar todos" marca. */
  loadedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onNewsletterClick: () => void;
  onTemplatesClick: () => void;
  bookmarkCount: number;
  onBookmarksClick: () => void;
  digestView: boolean;
  onToggleDigest: () => void;
  digestGrouping: 'none' | 'daily' | 'weekly';
  onChangeDigestGrouping: (value: 'none' | 'daily' | 'weekly') => void;
  onProfileClick: () => void;
  onNewsletterBuilderClick?: () => void;
  readFilter: ReadFilter;
  onReadFilterChange: (value: ReadFilter) => void;
  unreadCount: number;
  readCount: number;
}

export type ReadFilter = 'all' | 'unread' | 'read';

export function Toolbar({
  searchQuery = '',
  onSearchChange,
  onSourceFilterChange,
  onSortChange,
  sources,
  currentSourceFilter,
  currentSortOrder,
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
  readFilter,
  onReadFilterChange,
  unreadCount,
  readCount,
}: ToolbarProps) {
  const { t } = useI18n();

  // Toda a lista carregada está marcada → o botão passa a desmarcar.
  const allSelected = loadedCount > 0 && selectedCount >= loadedCount;

  return (
    <div className="toolbar">
      <div className="search-box">
        <Search className="search-icon" size={16} aria-hidden="true" />
        <input
          type="search"
          placeholder={t('news.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={t('toolbar.searchAria')}
        />
      </div>

      {selectedCount > 0 && (
        <div className="selection-bar">
          <span className="selection-count">
            {t(selectedCount === 1 ? 'toolbar.selectedOne' : 'toolbar.selectedMany', {
              count: selectedCount,
            })}
          </span>
          {/* O rótulo tem que descrever a ação do clique: "Desmarcar todos" só
              aparece quando a seleção cobre a lista carregada, e aí o clique
              limpa. Antes a comparação era com `sources.length`, o que fazia o
              botão dizer "Desmarcar" enquanto seguia selecionando (MU-001). */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={allSelected ? onClearSelection : onSelectAll}
          >
            {allSelected ? t('toolbar.deselectAll') : t('toolbar.selectAll')}
          </button>
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

        <button
          className="btn btn-icon btn-sm"
          onClick={onProfileClick}
          title={t('toolbar.profileTitle')}
          aria-label={t('toolbar.profileTitle')}
        >
          <Target size={16} />
        </button>
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

        <button className="btn btn-secondary btn-sm" onClick={onNewsletterClick}>
          <Newspaper size={15} />
          <span className="btn-label">{t('toolbar.newsletter')}</span>
        </button>
      </div>
    </div>
  );
}
