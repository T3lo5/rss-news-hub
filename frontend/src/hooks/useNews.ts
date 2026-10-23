import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { readNewsSnapshot, saveNewsSnapshot } from '../services/offlineCache';
import type { FetchRssResponse, NewsItem } from '../types';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * Loads the news list for the signed-in user.
 *
 * The last successful response is cached in IndexedDB (`offlineCache.ts`) so
 * the PWA can show it read-only when the connection drops or the app boots
 * offline. `fromCache`/`cachedAt` let the UI badge that state.
 */
export function useNews(userId?: string) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRss, setFetchingRss] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Snapshot for rollbacks: reading `news` inside the optimistic updater would
  // be a stale closure and React may run the updater twice.
  const newsRef = useRef(news);
  newsRef.current = news;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const fromCacheRef = useRef(fromCache);
  fromCacheRef.current = fromCache;

  const online = useOnlineStatus();

  /** Applies the saved snapshot, if any. Returns false when there is none. */
  const restoreSnapshot = useCallback(async () => {
    if (!userIdRef.current) return false;
    try {
      const snapshot = await readNewsSnapshot(userIdRef.current);
      if (!snapshot) return false;
      setNews(snapshot.items);
      setCachedAt(snapshot.savedAt);
      setFromCache(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchNews();
      setNews(data);
      setFromCache(false);
      setCachedAt(null);
      if (userIdRef.current) {
        // Best-effort: a quota/private-mode failure must not break the list.
        void saveNewsSnapshot(userIdRef.current, data).catch(() => {});
      }
    } catch (e) {
      if (await restoreSnapshot()) {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : 'Erro ao carregar notícias');
      }
    } finally {
      setLoading(false);
    }
  }, [restoreSnapshot]);

  const fetchRss = useCallback(async (): Promise<FetchRssResponse> => {
    setFetchingRss(true);
    setError(null);
    try {
      const result = await api.fetchRss();
      await fetchNews(); // refresh news after fetch
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar RSS');
      throw e;
    } finally {
      setFetchingRss(false);
    }
  }, [fetchNews]);

  // Boot: offline knows there is no point waiting for a request that will
  // time out — go straight to the snapshot.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      void (async () => {
        if (!(await restoreSnapshot())) {
          setError('Sem conexão e sem notícias salvas neste dispositivo.');
        }
        setLoading(false);
      })();
      return;
    }
    void fetchNews();
  }, [fetchNews, restoreSnapshot]);

  // Back online: refresh a list that was being shown from the snapshot.
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (online && wasOffline.current) {
      wasOffline.current = false;
      if (fromCacheRef.current) void fetchNews();
      return;
    }
    if (!online) wasOffline.current = true;
  }, [online, fetchNews]);

  const addNews = useCallback(async (newItem: Omit<NewsItem, 'id' | 'pubDate' | 'content'>) => {
    const created = await api.addNews(newItem);
    setNews((prev) => [created, ...prev]);
    return created;
  }, []);

  /**
   * Marca/desmarca como lida com atualização otimista: a lista responde na
   * hora e volta ao estado anterior se o servidor recusar.
   */
  const setRead = useCallback(async (id: string, read: boolean) => {
    const previous = newsRef.current.find((item) => item.id === id)?.readAt ?? null;
    const apply = (readAt: string | null) =>
      setNews((prev) => prev.map((item) => (item.id === id ? { ...item, readAt } : item)));

    apply(read ? new Date().toISOString() : null);
    try {
      const result = await api.setNewsRead(id, read);
      apply(result.readAt); // canonical timestamp from the server
    } catch (e) {
      apply(previous);
      throw e;
    }
  }, []);

  return {
    news,
    loading,
    error,
    fetchNews,
    addNews,
    fetchRss,
    fetchingRss,
    setRead,
    /** True while the list comes from the offline snapshot (read-only). */
    fromCache,
    /** Epoch ms of the cached snapshot, when `fromCache` is true. */
    cachedAt,
  };
}
