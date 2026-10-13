import { useCallback, useEffect, useState } from 'react';
import { addFeed, deleteFeed, fetchFeeds, updateFeed } from '../hooks/useFeeds';
import { exportOPML, importOPML } from '../hooks/useOPML';
import type { FeedConfig, OPMLImportResult } from '../types';
import { FeedFormModal } from './FeedFormModal';
import { FeedTable } from './FeedTable';

export function FeedManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingFeed, setEditingFeed] = useState<FeedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [importResult, setImportResult] = useState<OPMLImportResult | null>(null);
  const [showImportResult, setShowImportResult] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFeeds();
      setFeeds(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feeds');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFeeds();
    }
  }, [isOpen, loadFeeds]);

  const handleToggle = async (feed: FeedConfig) => {
    const updated = { ...feed, enabled: !feed.enabled };
    setFeeds((prev) => prev.map((f) => (f.id === feed.id ? updated : f)));
    try {
      await updateFeed(feed.id, { enabled: !feed.enabled });
    } catch {
      setFeeds((prev) => prev.map((f) => (f.id === feed.id ? feed : f)));
      setError('Failed to update feed');
    }
  };

  const handleAdd = async (data: Omit<FeedConfig, 'id'>) => {
    const newFeed = await addFeed(data);
    setFeeds((prev) => [...prev, newFeed]);
  };

  const handleEdit = async (data: Omit<FeedConfig, 'id'>) => {
    if (!editingFeed) return;
    const updated = await updateFeed(editingFeed.id, data);
    setFeeds((prev) => prev.map((f) => (f.id === editingFeed.id ? updated : f)));
    setEditingFeed(null);
  };

  const handleDelete = async (feed: FeedConfig) => {
    if (!confirm(`Delete "${feed.name}"? This cannot be undone.`)) return;

    setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
    try {
      await deleteFeed(feed.id);
    } catch {
      loadFeeds();
      setError('Failed to delete feed');
    }
  };

  const handleTest = (feed: FeedConfig) => {
    setEditingFeed(feed);
    setShowForm(true);
  };

  const handleOpenAdd = () => {
    setEditingFeed(null);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingFeed(null);
  };

  const handleSort = useCallback(
    (field: string) => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortBy(field);
        setSortOrder('asc');
      }
    },
    [sortBy]
  );

  const handleExportOPML = useCallback(async () => {
    try {
      const blob = await exportOPML();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feeds-${new Date().toISOString().slice(0, 10)}.opml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }, []);

  const handleImportOPML = useCallback(
    async (file: File) => {
      setImporting(true);
      setError(null);
      try {
        const result = await importOPML(file);
        setImportResult(result);
        setShowImportResult(true);
        if (result.added > 0) {
          loadFeeds();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setImporting(false);
      }
    },
    [loadFeeds]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImportOPML(file);
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-manager-title"
    >
      <div
        className="modal feed-manager-modal"
        style={{ maxWidth: '1200px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="feed-manager-title">Feed Manager</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{
            padding: 0,
            maxHeight: '70vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="feed-toolbar"
            style={{ padding: '16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <div className="search-box" style={{ flex: 1, minWidth: '250px' }}>
                <input
                  type="text"
                  placeholder="Search feeds..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                style={{ minWidth: '140px' }}
              >
                <option value="all">All Feeds</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <button className="btn btn-primary" onClick={handleOpenAdd}>
                <span role="img">＋</span> Add Feed
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleExportOPML}
                disabled={loading}
                title="Export OPML (O)"
              >
                <span role="img">📤</span> Export OPML
              </button>
              <label style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  type="file"
                  accept=".opml,.xml"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  id="opml-import"
                />
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => document.getElementById('opml-import')?.click()}
                  disabled={loading || importing}
                  title="Import OPML (Shift+O)"
                >
                  <span role="img">📥</span> Import OPML
                </button>
              </label>
              <button className="btn btn-secondary" onClick={loadFeeds} disabled={loading}>
                {loading ? '⟳' : '🔄'} Reload
              </button>
            </div>
          </div>

          {error && (
            <div className="status error" style={{ margin: '16px', borderRadius: 0 }}>
              {error}
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', padding: '0 16px 16px' }}>
            <FeedTable
              feeds={feeds}
              searchQuery={searchQuery}
              filter={filter}
              onToggle={handleToggle}
              onEdit={(feed) => {
                setEditingFeed(feed);
                setShowForm(true);
              }}
              onTest={handleTest}
              onDelete={handleDelete}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          </div>
        </div>
      </div>

      {showForm && (
        <FeedFormModal
          feed={editingFeed}
          onSubmit={editingFeed ? handleEdit : handleAdd}
          onClose={handleCloseForm}
        />
      )}

      {showImportResult && importResult && (
        <div
          className="modal-overlay"
          onClick={() => setShowImportResult(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-result-title"
        >
          <div
            className="modal"
            style={{ maxWidth: '500px', width: '95vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="import-result-title">Import Result</h3>
              <button
                className="close-btn"
                onClick={() => setShowImportResult(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    textAlign: 'center',
                    padding: '12px',
                    background: 'rgba(0, 186, 124, 0.1)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--success)',
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--success)' }}>
                    {importResult.added}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Added</div>
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    padding: '12px',
                    background: 'rgba(29, 155, 240, 0.1)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--accent)',
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent)' }}>
                    {importResult.skipped}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Skipped (duplicates)
                  </div>
                </div>
                <div
                  style={{
                    textAlign: 'center',
                    padding: '12px',
                    background: 'rgba(244, 33, 46, 0.1)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--danger)',
                  }}
                >
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--danger)' }}>
                    {importResult.errors.length}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Errors</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  <h4 style={{ marginBottom: '8px', fontSize: '14px' }}>Errors:</h4>
                  <ul style={{ fontSize: '12px', color: 'var(--danger)', paddingLeft: '20px' }}>
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="modal-footer" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setShowImportResult(false)}>
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
