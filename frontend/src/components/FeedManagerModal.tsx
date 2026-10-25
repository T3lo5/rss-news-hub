import { Download, Plus, RefreshCw, Search, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { addFeed, deleteFeed, fetchFeeds, updateFeed } from '../hooks/useFeeds';
import { exportOPML, importOPML } from '../hooks/useOPML';
import { useI18n } from '../i18n';
import type { FeedConfig, OPMLImportResult } from '../types';
import { FeedFormModal } from './FeedFormModal';
import { FeedTable } from './FeedTable';
import { Status } from './Status';

export function FeedManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useI18n();
  useEscapeKey(isOpen && !showForm, onClose);
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
      setError(err instanceof Error ? err.message : t('feedManager.errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setError(t('feedManager.errUpdate'));
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
    if (!confirm(t('feedManager.confirmDelete', { name: feed.name }))) return;

    setFeeds((prev) => prev.filter((f) => f.id !== feed.id));
    try {
      await deleteFeed(feed.id);
    } catch {
      loadFeeds();
      setError(t('feedManager.errDelete'));
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
      setError(err instanceof Error ? err.message : t('feedManager.errExport'));
    }
  }, [t]);

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
        setError(err instanceof Error ? err.message : t('feedManager.errImport'));
      } finally {
        setImporting(false);
      }
    },
    [loadFeeds, t]
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
          <h3 id="feed-manager-title">{t('feedManager.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
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
                <Search className="search-icon" size={16} aria-hidden="true" />
                <input
                  type="search"
                  placeholder={t('feedManager.search')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                style={{ minWidth: '140px' }}
              >
                <option value="all">{t('feedManager.filterAll')}</option>
                <option value="active">{t('feedManager.filterActive')}</option>
                <option value="inactive">{t('feedManager.filterInactive')}</option>
              </select>
              <button className="btn btn-primary" onClick={handleOpenAdd}>
                <Plus size={15} /> {t('feedManager.addFeed')}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleExportOPML}
                disabled={loading}
                title={t('feedManager.exportOpmlTitle')}
              >
                <Download size={15} /> {t('feedManager.exportOpml')}
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
                  title={t('feedManager.importOpmlTitle')}
                >
                  <Upload size={15} /> {t('feedManager.importOpml')}
                </button>
              </label>
              <button className="btn btn-secondary" onClick={loadFeeds} disabled={loading}>
                <RefreshCw size={15} className={loading ? 'spin' : ''} /> {t('feedManager.reload')}
              </button>
            </div>
          </div>

          {error && <Status message={error} type="error" onClose={() => setError(null)} />}

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
              <h3 id="import-result-title">{t('feedManager.importResult')}</h3>
              <button
                className="close-btn"
                onClick={() => setShowImportResult(false)}
                aria-label={t('common.close')}
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
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('feedManager.added')}
                  </div>
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
                    {t('feedManager.skipped')}
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
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {t('feedManager.errors')}
                  </div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  <h4 style={{ marginBottom: '8px', fontSize: '14px' }}>
                    {t('feedManager.errorsLabel')}
                  </h4>
                  <ul style={{ fontSize: '12px', color: 'var(--danger)', paddingLeft: '20px' }}>
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="modal-footer" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => setShowImportResult(false)}>
                  {t('common.ok')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
