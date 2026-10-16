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
}

export function Toolbar({
  searchQuery = '',
  onSearchChange,
  onSourceFilterChange,
  onSortChange,
  sources,
  currentSourceFilter,
  currentSortOrder,
  selectedCount,
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
}: ToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="toolbar">
      <div className="search-box">
        <input
          type="text"
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
          <button className="btn btn-ghost btn-sm" onClick={onSelectAll}>
            {selectedCount === sources.length ? t('toolbar.deselectAll') : t('toolbar.selectAll')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClearSelection}>
            {t('common.clear')}
          </button>
        </div>
      )}
      <div className="filter-group">
        <label htmlFor="sourceFilter">{t('toolbar.source')}</label>
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
        <label htmlFor="sortFilter">{t('toolbar.sort')}</label>
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
      <div
        className="filter-group"
        style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}
      >
        {bookmarkCount > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBookmarksClick}
            title={t('toolbar.bookmarksTitle', { count: bookmarkCount })}
          >
            <span role="img" aria-label="bookmarks">
              🔖
            </span>
            <span className="badge">{bookmarkCount}</span>
          </button>
        )}
        <div
          className="digest-controls"
          style={{ display: 'flex', gap: '4px', alignItems: 'center' }}
        >
          <button
            className={`btn btn-sm ${digestView ? 'btn-primary' : 'btn-ghost'}`}
            onClick={onToggleDigest}
            title={t('toolbar.digestToggle')}
            aria-pressed={digestView}
          >
            <span role="img" aria-label="digest">
              📑
            </span>
          </button>
          {digestView && (
            <select
              value={digestGrouping}
              onChange={(e) =>
                onChangeDigestGrouping(e.target.value as 'none' | 'daily' | 'weekly')
              }
              aria-label={t('toolbar.digestGroupingAria')}
              style={{ minWidth: '120px', fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="none">{t('toolbar.groupAll')}</option>
              <option value="daily">{t('toolbar.groupDaily')}</option>
              <option value="weekly">{t('toolbar.groupWeekly')}</option>
            </select>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onProfileClick}
          title={t('toolbar.profileTitle')}
        >
          <span role="img" aria-label="profile">
            🎯
          </span>
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onTemplatesClick}
          title={t('toolbar.templatesTitle')}
        >
          <span role="img" aria-label="templates">
            📋
          </span>
        </button>
        {onNewsletterBuilderClick && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onNewsletterBuilderClick}
            title={t('toolbar.builderTitle')}
          >
            <span role="img" aria-label="build newsletter">
              ✍️
            </span>
          </button>
        )}
        <button className="btn btn-secondary" onClick={onNewsletterClick}>
          <span role="img" aria-label="newsletter">
            📰
          </span>{' '}
          {t('toolbar.newsletter')}
        </button>
      </div>
    </div>
  );
}
