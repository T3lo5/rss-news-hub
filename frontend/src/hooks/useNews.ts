import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import type { FetchRssResponse, NewsItem } from '../types';

export function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRss, setFetchingRss] = useState(false);

  // Snapshot for rollbacks: reading `news` inside the optimistic updater would
  // be a stale closure and React may run the updater twice.
  const newsRef = useRef(news);
  newsRef.current = news;

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchNews();
      setNews(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar notícias');
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

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

  return { news, loading, error, fetchNews, addNews, fetchRss, fetchingRss, setRead };
}
