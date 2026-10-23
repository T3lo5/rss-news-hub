import { useCallback, useEffect, useRef, useState } from 'react';
import { api, bumpNewsCacheRevision } from '../services/api';
import { readNewsSnapshot, saveNewsSnapshot } from '../services/offlineCache';
import type {
  FetchRssResponse,
  NewsCounts,
  NewsItem,
  NewsQuery,
  NewsReadFilter,
  NewsSort,
} from '../types';
import { useOnlineStatus } from './useOnlineStatus';

/** Cards per request. 48 = 16 linhas de 3 colunas. */
export const NEWS_PAGE_SIZE = 48;

export interface NewsFilters {
  /** Termo de busca já debounced. */
  query?: string;
  source?: string;
  sort?: NewsSort;
  read?: NewsReadFilter;
}

const EMPTY_COUNTS: NewsCounts = { all: 0, unread: 0, read: 0 };

/**
 * Loads the news list for the signed-in user.
 *
 * Search, filtering, sorting and pagination all run on the server
 * (`GET /api/news`); this hook only accumulates pages and keeps the counters
 * in sync. The first page of the last successful response is cached in
 * IndexedDB (`offlineCache.ts`) so the PWA can show it read-only when the
 * connection drops or the app boots offline.
 */
export function useNews(userId?: string, filters: NewsFilters = {}) {
  const { query = '', source = '', sort = 'newest', read = 'all' } = filters;

  const [news, setNews] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<NewsCounts>(EMPTY_COUNTS);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRss, setFetchingRss] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);

  // Snapshot for rollbacks: reading state inside an optimistic updater would
  // be a stale closure and React may run the updater twice.
  const newsRef = useRef(news);
  newsRef.current = news;
  const totalRef = useRef(total);
  totalRef.current = total;
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const readRef = useRef(read);
  readRef.current = read;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const fromCacheRef = useRef(fromCache);
  fromCacheRef.current = fromCache;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // A newer request (filter change, refresh) invalidates older responses.
  const requestSeq = useRef(0);

  const online = useOnlineStatus();

  /** Applies the saved snapshot, if any. Returns false when there is none. */
  const restoreSnapshot = useCallback(async () => {
    if (!userIdRef.current) return false;
    try {
      const snapshot = await readNewsSnapshot(userIdRef.current);
      if (!snapshot) return false;
      const items = snapshot.items;
      setNews(items);
      setTotal(snapshot.total ?? items.length);
      setCounts(
        snapshot.counts ?? {
          all: items.length,
          unread: items.filter((item) => !item.readAt).length,
          read: items.filter((item) => Boolean(item.readAt)).length,
        }
      );
      setSources(snapshot.sources ?? [...new Set(items.map((item) => item.source))]);
      setCachedAt(snapshot.savedAt);
      setFromCache(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadPage = useCallback(
    async (offset: number) => {
      const isFirst = offset === 0;
      const seq = ++requestSeq.current;
      if (isFirst) {
        setLoading(true);
        // A filter change cancels a page-2 request; its finally block is
        // skipped, so clear the flag here or the button stays stuck.
        setLoadingMore(false);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const params: NewsQuery = {
        limit: NEWS_PAGE_SIZE,
        offset,
        q: query || undefined,
        source: source || undefined,
        sort,
        read,
      };

      try {
        const page = await api.fetchNews(params);
        if (seq !== requestSeq.current) return;

        setNews((prev) => {
          if (isFirst) return page.results;
          // A new item can shift the window between pages; drop duplicates.
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...page.results.filter((item) => !seen.has(item.id))];
        });
        setTotal(page.total);
        setCounts(page.counts);
        setSources(page.sources);
        setFromCache(false);
        setCachedAt(null);

        if (isFirst && userIdRef.current) {
          // Best-effort: a quota/private-mode failure must not break the list.
          void saveNewsSnapshot(userIdRef.current, {
            items: page.results,
            total: page.total,
            counts: page.counts,
            sources: page.sources,
          }).catch(() => {});
        }
      } catch (e) {
        if (seq !== requestSeq.current) return;
        if (isFirst && (await restoreSnapshot())) {
          setError(null);
        } else if (isFirst || newsRef.current.length === 0) {
          // Um "Carregar mais" que falha mantém a lista já carregada; o botão
          // volta a ficar habilitado para o usuário tentar de novo.
          setError(e instanceof Error ? e.message : 'Erro ao carregar notícias');
        }
      } finally {
        if (seq === requestSeq.current) {
          if (isFirst) setLoading(false);
          else setLoadingMore(false);
        }
      }
    },
    [query, source, sort, read, restoreSnapshot]
  );

  const fetchNews = useCallback(() => loadPage(0), [loadPage]);

  /** Next page. No-op while a request is in flight or everything is loaded. */
  const fetchMore = useCallback(() => {
    if (!online) return;
    if (loadingRef.current || loadingMoreRef.current) return;
    if (fromCacheRef.current) return;
    if (newsRef.current.length >= totalRef.current) return;
    void loadPage(newsRef.current.length);
  }, [loadPage, online]);

  const fetchRss = useCallback(async (): Promise<FetchRssResponse> => {
    setFetchingRss(true);
    setError(null);
    try {
      const result = await api.fetchRss();
      bumpNewsCacheRevision(); // new items: don't serve a page cached before the fetch
      await fetchNews(); // refresh news after fetch
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar RSS');
      throw e;
    } finally {
      setFetchingRss(false);
    }
  }, [fetchNews]);

  // Boot and every filter change: load the first page. Offline knows there is
  // no point waiting for a request that will time out — use the snapshot.
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
    void loadPage(0);
  }, [loadPage, restoreSnapshot]);

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

  const addNews = useCallback(
    async (newItem: Omit<NewsItem, 'id' | 'pubDate' | 'content'>) => {
      const created = await api.addNews(newItem);
      bumpNewsCacheRevision();
      // The server decides where the item lands under the current sort/filter.
      await fetchNews();
      return created;
    },
    [fetchNews]
  );

  const matchesReadFilter = useCallback((readAt: string | null | undefined) => {
    const filter = readRef.current;
    if (filter === 'unread') return !readAt;
    if (filter === 'read') return Boolean(readAt);
    return true;
  }, []);

  /**
   * Marca/desmarca como lida com atualização otimista: a lista responde na
   * hora e volta ao estado anterior se o servidor recusar. Quando o filtro é
   * "não lidas"/"lidas", o item que deixa de casar sai da lista e os
   * contadores acompanham.
   */
  const setRead = useCallback(
    async (id: string, readFlag: boolean) => {
      const snapshotItem = newsRef.current.find((item) => item.id === id);
      if (!snapshotItem) return;

      const previousReadAt = snapshotItem.readAt ?? null;
      const previousCounts = countsRef.current;
      const previousTotal = totalRef.current;
      let listed = matchesReadFilter(previousReadAt);
      let wasRead = Boolean(previousReadAt);

      const apply = (readAt: string | null) => {
        const nowRead = Boolean(readAt);
        const shouldList = matchesReadFilter(readAt);

        setNews((prev) => {
          const withValue = prev.map((item) => (item.id === id ? { ...item, readAt } : item));
          return shouldList ? withValue : withValue.filter((item) => item.id !== id);
        });

        if (shouldList !== listed) {
          setTotal((current) => current + (shouldList ? 1 : -1));
          listed = shouldList;
        }
        if (nowRead !== wasRead) {
          setCounts((current) => ({
            ...current,
            unread: current.unread + (nowRead ? -1 : 1),
            read: current.read + (nowRead ? 1 : -1),
          }));
          wasRead = nowRead;
        }
      };

      apply(readFlag ? new Date().toISOString() : null);
      try {
        const result = await api.setNewsRead(id, readFlag);
        bumpNewsCacheRevision();
        apply(result.readAt); // canonical timestamp from the server
      } catch (e) {
        setCounts(previousCounts);
        setTotal(previousTotal);
        setNews((prev) => {
          if (prev.some((item) => item.id === id)) {
            return prev.map((item) =>
              item.id === id ? { ...item, readAt: previousReadAt } : item
            );
          }
          // The optimistic update removed it from this filtered list.
          return [{ ...snapshotItem, readAt: previousReadAt }, ...prev];
        });
        throw e;
      }
    },
    [matchesReadFilter]
  );

  return {
    news,
    loading,
    loadingMore,
    error,
    total,
    counts,
    sources,
    hasMore: online && !fromCache && news.length < total,
    fetchNews,
    fetchMore,
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
