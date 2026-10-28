import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { SavedSearch } from '../hooks/useSavedSearches';
import { useI18n } from '../i18n';
import { Status } from './Status';

interface SavedSearchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplySearch: (search: SavedSearch) => void;
  searches: SavedSearch[];
  pinnedSearches: SavedSearch[];
  unpinnedSearches: SavedSearch[];
  add: (search: Omit<SavedSearch, 'id' | 'createdAt' | 'updatedAt'>) => void;
  update: (id: string, updates: Partial<SavedSearch>) => void;
  remove: (id: string) => void;
}

export function SavedSearchesModal({
  isOpen,
  onClose,
  onApplySearch,
  searches,
  pinnedSearches,
  unpinnedSearches,
  add,
  update,
  remove,
}: SavedSearchesModalProps) {
  const { t } = useI18n();
  useEscapeKey(isOpen, onClose);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuery, setEditQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [flash, setFlash] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const flashSuccess = (message: string) => {
    setFlash({ message, type: 'success' });
    setTimeout(() => setFlash(null), 3000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const query = newQuery.trim();
    if (!(name && query)) return;

    add({ name, query });
    setNewName('');
    setNewQuery('');
    flashSuccess(t('savedSearches.added'));
  };

  const startEdit = (search: SavedSearch) => {
    setEditingId(search.id);
    setEditName(search.name);
    setEditQuery(search.query);
  };

  const handleEditSave = (id: string) => {
    const name = editName.trim();
    const query = editQuery.trim();
    if (!(name && query)) return;

    update(id, { name, query });
    setEditingId(null);
    flashSuccess(t('savedSearches.updated'));
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('savedSearches.confirmDelete'))) return;
    remove(id);
    flashSuccess(t('savedSearches.deleted'));
  };

  const handlePinToggle = (id: string, current: boolean) => {
    update(id, { pinned: !current });
  };

  const handleApply = (search: SavedSearch) => {
    onApplySearch(search);
    onClose();
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEditSave(id);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-searches-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '700px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="saved-searches-title">{t('savedSearches.title')}</h3>
          <button className="close-btn" onClick={onClose} aria-label={t('common.close')}>
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '70vh' }}
        >
          {flash && (
            <Status message={flash.message} type={flash.type} onClose={() => setFlash(null)} />
          )}

          {/* Add new search form */}
          <form
            onSubmit={handleAdd}
            style={{
              marginBottom: '24px',
              padding: '16px',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius)',
            }}
          >
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('savedSearches.name')}
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('savedSearches.namePlaceholder')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ flex: 2, minWidth: '250px' }}>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {t('savedSearches.queryLabel')}
                </label>
                <input
                  type="text"
                  value={newQuery}
                  onChange={(e) => setNewQuery(e.target.value)}
                  placeholder={t('savedSearches.queryPlaceholder')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-end' }}>
                <Plus size={16} /> {t('savedSearches.add')}
              </button>
            </div>
          </form>

          {/* Pinned searches */}
          {pinnedSearches.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4
                style={{
                  marginBottom: '12px',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 17v5M9 12l3 3 3-3M4 7l7 7 7-7M20 17v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5" />
                </svg>
                {t('savedSearches.pinned')}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pinnedSearches.map((search) => (
                  <SavedSearchRow
                    key={search.id}
                    search={search}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                    onPinToggle={handlePinToggle}
                    onApply={handleApply}
                    editName={editName}
                    editQuery={editQuery}
                    editingId={editingId}
                    setEditName={setEditName}
                    setEditQuery={setEditQuery}
                    onEditSave={handleEditSave}
                    onEditKeyDown={handleEditKeyDown}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unpinned searches */}
          {unpinnedSearches.length > 0 && (
            <div>
              <h4
                style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}
              >
                {t('savedSearches.others')}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {unpinnedSearches.map((search) => (
                  <SavedSearchRow
                    key={search.id}
                    search={search}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                    onPinToggle={handlePinToggle}
                    onApply={handleApply}
                    editName={editName}
                    editQuery={editQuery}
                    editingId={editingId}
                    setEditName={setEditName}
                    setEditQuery={setEditQuery}
                    onEditSave={handleEditSave}
                    onEditKeyDown={handleEditKeyDown}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {searches.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <p>{t('savedSearches.empty')}</p>
              <p style={{ fontSize: '13px', marginTop: '8px' }}>{t('savedSearches.emptyHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SavedSearchRow({
  search,
  onEdit,
  onDelete,
  onPinToggle,
  onApply,
  editName,
  editQuery,
  editingId,
  setEditName,
  setEditQuery,
  onEditSave,
  onEditKeyDown,
  t,
}: {
  search: SavedSearch;
  onEdit: (s: SavedSearch) => void;
  onDelete: (id: string) => void;
  onPinToggle: (id: string, current: boolean) => void;
  onApply: (search: SavedSearch) => void;
  editName: string;
  editQuery: string;
  editingId: string | null;
  setEditName: (v: string) => void;
  setEditQuery: (v: string) => void;
  onEditSave: (id: string) => void;
  onEditKeyDown: (e: React.KeyboardEvent, id: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const isEditing = editingId === search.id;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        background: 'var(--bg-tertiary)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => onEditKeyDown(e, search.id)}
              style={{
                flex: 1,
                minWidth: '150px',
                padding: '6px 10px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
            <input
              type="text"
              value={editQuery}
              onChange={(e) => setEditQuery(e.target.value)}
              onKeyDown={(e) => onEditKeyDown(e, search.id)}
              style={{
                flex: 2,
                minWidth: '200px',
                padding: '6px 10px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => onEditSave(search.id)}>
              <Check size={14} />
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: search.color || '#6366f1',
                  flexShrink: 0,
                }}
              />
              <strong style={{ color: 'var(--text-primary)' }}>{search.name}</strong>
              {search.pinned && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ color: 'var(--accent)' }}
                >
                  <path d="M12 17v5M9 12l3 3 3-3M4 7l7 7 7-7M20 17v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5" />
                </svg>
              )}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {search.query}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {!isEditing && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onApply(search)}
              title={t('savedSearches.apply')}
              style={{ padding: '6px' }}
            >
              <Check size={14} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onEdit(search)}
              title={t('savedSearches.edit')}
              style={{ padding: '6px' }}
            >
              <Pencil size={14} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onPinToggle(search.id, Boolean(search.pinned))}
              title={search.pinned ? t('savedSearches.unpin') : t('savedSearches.pin')}
              style={{
                padding: '6px',
                color: search.pinned ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 17v5M9 12l3 3 3-3M4 7l7 7 7-7M20 17v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5" />
              </svg>
            </button>
            <button
              className="btn btn-ghost btn-sm danger"
              onClick={() => onDelete(search.id)}
              title={t('common.delete')}
              style={{ padding: '6px' }}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
