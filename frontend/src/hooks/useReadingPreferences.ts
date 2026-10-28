import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';

const STORAGE_KEY = 'reading:preferences';
const EVENT = 'reading:preferences';

interface ReadingPreferences {
  readFilter: 'all' | 'unread' | 'read';
  sortOrder: 'newest' | 'oldest' | 'relevance';
  pageSize: number;
}

const DEFAULTS: ReadingPreferences = {
  readFilter: 'all',
  sortOrder: 'newest',
  pageSize: 48,
};

function readLocal(): ReadingPreferences {
  if (typeof localStorage === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function writeLocal(prefs: ReadingPreferences) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota/private mode: keep in memory only
  }
}

let inMemory: ReadingPreferences = DEFAULTS;

export function useReadingPreferences(userId?: string) {
  const [prefs, setPrefs] = useState<ReadingPreferences>(() => {
    // Initial load from localStorage (fast, sync)
    inMemory = readLocal();
    return inMemory;
  });
  const [synced, setSynced] = useState(false);

  // Sync with server when userId is available
  useEffect(() => {
    if (!userId || synced) return;
    
    let cancelled = false;
    
    api.getUserSettings()
      .then((data) => {
        if (cancelled) return;
        const serverPrefs = data?.ui;
        if (serverPrefs) {
          const merged = { ...DEFAULTS, ...serverPrefs };
          inMemory = merged;
          writeLocal(merged);
          setPrefs(merged);
        }
        setSynced(true);
      })
      .catch(() => {
        // Server unavailable or error: keep local prefs
        setSynced(true);
      });
    
    return () => { cancelled = true; };
  }, [userId, synced]);

  // Listen for cross-tab updates
  useEffect(() => {
    const sync = () => {
      const local = readLocal();
      if (local.readFilter !== inMemory.readFilter ||
          local.sortOrder !== inMemory.sortOrder ||
          local.pageSize !== inMemory.pageSize) {
        inMemory = local;
        setPrefs(local);
      }
    };
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);

  const update = useCallback(async (next: Partial<ReadingPreferences>) => {
    const merged = { ...inMemory, ...next };
    inMemory = merged;
    writeLocal(merged);
    window.dispatchEvent(new Event(EVENT));
    setPrefs(merged);

    // Persist to server if authenticated
    if (userId) {
      api.saveUserSetting('ui', merged).catch(() => {
        // Best-effort: local storage already updated
      });
    }
  }, [userId]);

  const setReadFilter = useCallback((readFilter: 'all' | 'unread' | 'read') => {
    update({ readFilter });
  }, [update]);

  const setSortOrder = useCallback((sortOrder: 'newest' | 'oldest' | 'relevance') => {
    update({ sortOrder });
  }, [update]);

  const setPageSize = useCallback((pageSize: number) => {
    update({ pageSize });
  }, [update]);

  return {
    prefs,
    readFilter: prefs.readFilter,
    sortOrder: prefs.sortOrder,
    pageSize: prefs.pageSize,
    setReadFilter,
    setSortOrder,
    setPageSize,
    synced,
  };
}