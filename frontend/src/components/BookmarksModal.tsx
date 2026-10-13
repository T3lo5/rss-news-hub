import { useCallback, useEffect, useState } from 'react';
import { fetchBookmarks, removeBookmark } from '../hooks/useBookmarks';
import type { Bookmark } from '../types';

export function BookmarksModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBookmarks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchBookmarks();
      setBookmarks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadBookmarks();
  }, [isOpen, loadBookmarks]);

  const handleRemove = async (newsId: string) => {
    try {
      await removeBookmark(newsId);
      setBookmarks((prev) => prev.filter((b) => b.newsId !== newsId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove bookmark');
    }
  };

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmarks-title"
    >
      <div
        className="modal"
        style={{ maxWidth: '700px', width: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="bookmarks-title">🔖 Read Later ({bookmarks.length})</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ padding: '20px', overflow: 'auto', maxHeight: '70vh' }}
        >
          {error && (
            <div className="status error" style={{ marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              Loading bookmarks...
            </div>
          ) : bookmarks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>No bookmarks yet</p>
              <p style={{ fontSize: '14px' }}>
                Press <kbd>B</kbd> on any article to save it for later
              </p>
            </div>
          ) : (
            <div
              className="bookmarks-list"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              {bookmarks.map((bookmark, i) => (
                <div
                  key={i}
                  className="bookmark-item"
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '15px', lineHeight: '1.4' }}>
                      <a
                        href={bookmark.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          handleOpenLink(bookmark.link);
                        }}
                        style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                      >
                        {bookmark.title}
                      </a>
                    </h4>
                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>{bookmark.source}</span>
                      <span>{new Date(bookmark.bookmarkedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleRemove(bookmark.newsId)}
                    aria-label="Remove bookmark"
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
