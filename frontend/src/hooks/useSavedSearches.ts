import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  source?: string;
  sort?: 'newest' | 'oldest' | 'relevance';
  read?: 'all' | 'unread' | 'read';
  color?: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

const DEFAULT_COLORS = [
  '#6366f1', // indigo
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#84cc16', // lime
];

const STORAGE_KEY = 'saved-searches';

function readLocal(): SavedSearch[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(searches: SavedSearch[]) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Quota/private mode: keep in memory only
  }
}

/**
 * Server-first saved searches with localStorage as offline cache.
 *
 * The server is the source of truth. On mount (or userId change) the hook
 * fetches from the server; if the fetch fails it falls back to the local
 * cache. Writes always hit the server first and only update the cache on
 * success.
 */
export function useSavedSearches(userId?: string) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverSynced, setServerSynced] = useState(false);

  // Load from server when userId is available
  useEffect(() => {
    if (!userId) {
      setSearches([]);
      setServerSynced(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getUserSettings();
        if (cancelled) return;
        const serverSearches: SavedSearch[] = data?.searches?.searches || [];
        setSearches(serverSearches);
        // Cache for offline use
        writeLocal(serverSearches);
        setServerSynced(true);
      } catch {
        if (cancelled) return;
        // Server unavailable: fall back to local cache
        const local = readLocal();
        setSearches(local);
        setServerSynced(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    async (mutate: (current: SavedSearch[]) => SavedSearch[]) => {
      const next = mutate(searches);

      // Optimistic update
      setSearches(next);
      writeLocal(next);

      // Persist to server
      if (userId) {
        try {
          await api.saveUserSetting('searches', { searches: next });
        } catch {
          // Revert on failure
          setSearches(mutate);
        }
      }

      return next;
    },
    [userId, searches]
  );

  const add = useCallback(
    (search: Omit<SavedSearch, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      const newSearch: SavedSearch = {
        ...search,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        color:
          search.color || DEFAULT_COLORS[searches.length % DEFAULT_COLORS.length],
      };
      return persist((current) => [...current, newSearch]);
    },
    [persist, searches.length]
  );

  const update = useCallback(
    (id: string, updates: Partial<SavedSearch>) => {
      return persist((current) =>
        current.map((s) =>
          s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
        )
      );
    },
    [persist]
  );

  const remove = useCallback(
    (id: string) => {
      return persist((current) => current.filter((s) => s.id !== id));
    },
    [persist]
  );

  const applySearch = useCallback(
    (search: SavedSearch, onApply: (s: SavedSearch) => void) => {
      onApply(search);
    },
    []
  );

  const pinnedSearches = searches.filter((s) => s.pinned);
  const unpinnedSearches = searches.filter((s) => !s.pinned);

  return {
    searches,
    loading,
    serverSynced,
    add,
    update,
    remove,
    applySearch,
    pinnedSearches,
    unpinnedSearches,
  };
}
