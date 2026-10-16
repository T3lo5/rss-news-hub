import type { FeedConfig } from '../types';

interface FeedTableProps {
  feeds: FeedConfig[];
  searchQuery: string;
  filter: 'all' | 'active' | 'inactive';
  onToggle: (feed: FeedConfig) => void;
  onEdit: (feed: FeedConfig) => void;
  onTest: (feed: FeedConfig) => void;
  onDelete: (feed: FeedConfig) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

function formatDate(timestamp: number | null | undefined): string {
  if (!timestamp) return 'Never';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function getStatusBadge(status: 'ok' | 'error' | 'unknown' | undefined) {
  switch (status) {
    case 'ok':
      return <span className="status-badge ok">OK</span>;
    case 'error':
      return <span className="status-badge error">Error</span>;
    default:
      return <span className="status-badge unknown">Unknown</span>;
  }
}

function FeedRow({
  feed,
  onToggle,
  onEdit,
  onTest,
  onDelete,
}: {
  feed: FeedConfig;
  onToggle: (feed: FeedConfig) => void;
  onEdit: (feed: FeedConfig) => void;
  onTest: (feed: FeedConfig) => void;
  onDelete: (feed: FeedConfig) => void;
}) {
  return (
    <tr key={feed.id} className={!feed.enabled ? 'disabled' : ''}>
      <td style={{ textAlign: 'center' }}>
        <label className="toggle-switch">
          <input type="checkbox" checked={feed.enabled} onChange={() => onToggle(feed)} />
          <span className="toggle-slider"></span>
        </label>
      </td>
      <td>
        <strong>{feed.name}</strong>
        <br />
        <small style={{ opacity: 0.6 }}>{feed.id}</small>
      </td>
      <td>
        <a
          href={feed.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ wordBreak: 'break-all' }}
        >
          {feed.url}
        </a>
      </td>
      <td>
        <span className="category-badge">{feed.category}</span>
      </td>
      <td>{formatDate(feed.lastFetch)}</td>
      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
        {feed.itemCount || 0}
      </td>
      <td>{getStatusBadge(feed.status)}</td>
      <td>
        <div className="action-buttons">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onTest(feed)}
            title="Test feed"
            disabled={!feed.enabled}
          >
            🔍
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onEdit(feed)}
            title="Edit"
          >
            ✏️
          </button>
          <button
            className="btn btn-ghost btn-sm danger"
            onClick={() => onDelete(feed)}
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </td>
    </tr>
  );
}

export function FeedTable({
  feeds,
  searchQuery,
  filter,
  onToggle,
  onEdit,
  onTest,
  onDelete,
  sortBy,
  sortOrder,
  onSort,
}: FeedTableProps) {
  // Defensive: ensure feeds is an array and filter out undefined/null entries
  const feedsArray = Array.isArray(feeds) ? feeds.filter(Boolean) : [];
  let filtered = [...feedsArray];

  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (f) =>
        f?.name?.toLowerCase().includes(query) ||
        f?.url?.toLowerCase().includes(query) ||
        f?.category?.toLowerCase().includes(query)
    );
  }

  if (filter === 'active') {
    filtered = filtered.filter((f) => f?.enabled);
  } else if (filter === 'inactive') {
    filtered = filtered.filter((f) => !f?.enabled);
  }

  filtered.sort((a, b) => {
    let aVal: any = a[sortBy as keyof FeedConfig];
    let bVal: any = b[sortBy as keyof FeedConfig];

    if (aVal === undefined) aVal = '';
    if (bVal === undefined) bVal = '';

    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const columns = [
    { key: 'enabled', label: 'Status', width: '80px' },
    { key: 'name', label: 'Name', width: '200px' },
    { key: 'url', label: 'URL', width: '300px' },
    { key: 'category', label: 'Category', width: '120px' },
    { key: 'lastFetch', label: 'Last Fetch', width: '160px' },
    { key: 'itemCount', label: 'Items', width: '80px', align: 'right' },
    { key: 'status', label: 'Health', width: '100px' },
    { key: 'actions', label: 'Actions', width: '140px' },
  ];

  const handleSort = (key: string) => {
    onSort(key);
  };

  return (
    <div className="table-container">
      <table className="feeds-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, textAlign: col.align || 'left' }}
                onClick={() => col.key !== 'actions' && handleSort(col.key)}
                className={col.key !== 'actions' ? 'sortable' : ''}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {col.label}
                  {sortBy === col.key && <span>{sortOrder === 'asc' ? '▲' : '▼'}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty">
                {searchQuery || filter !== 'all'
                  ? 'No feeds match your filters'
                  : 'No feeds configured. Click "Add Feed" to get started.'}
              </td>
            </tr>
          ) : (
            filtered.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                onToggle={onToggle}
                onEdit={onEdit}
                onTest={onTest}
                onDelete={onDelete}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}