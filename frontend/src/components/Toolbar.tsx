interface ToolbarProps {
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
}

export function Toolbar({
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
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="search-box">
        <input
          type="text"
          placeholder="Buscar por título ou fonte..."
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Buscar notícias"
        />
      </div>
      {selectedCount > 0 && (
        <div className="selection-bar">
          <span className="selection-count">
            {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onSelectAll}>
            {selectedCount === sources.length ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClearSelection}>
            Limpar
          </button>
        </div>
      )}
      <div className="filter-group">
        <label htmlFor="sourceFilter">Fonte:</label>
        <select
          id="sourceFilter"
          value={currentSourceFilter}
          onChange={(e) => onSourceFilterChange(e.target.value)}
          aria-label="Filtrar por fonte"
        >
          <option value="">Todas</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <label htmlFor="sortFilter">Ordenar:</label>
        <select
          id="sortFilter"
          value={currentSortOrder}
          onChange={(e) => onSortChange(e.target.value as 'newest' | 'oldest' | 'relevance')}
          aria-label="Ordenar notícias"
        >
          <option value="newest">Mais recentes</option>
          <option value="oldest">Mais antigos</option>
          <option value="relevance">Relevância</option>
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
            title={`${bookmarkCount} saved for later`}
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
            title="Toggle digest view (D)"
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
              aria-label="Digest grouping"
              style={{ minWidth: '120px', fontSize: '12px', padding: '4px 8px' }}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onProfileClick}
          title="Interest Profile (Shift+R)"
        >
          <span role="img" aria-label="profile">
            🎯
          </span>
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onTemplatesClick}
          title="Manage Templates"
        >
          <span role="img" aria-label="templates">
            📋
          </span>
        </button>
        <button className="btn btn-secondary" onClick={onNewsletterClick}>
          <span role="img" aria-label="newsletter">
            📰
          </span>{' '}
          Newsletter
        </button>
      </div>
    </div>
  );
}
