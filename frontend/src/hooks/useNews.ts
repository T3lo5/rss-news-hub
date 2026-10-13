import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { FetchRssResponse, NewsItem } from '../types';

export function useNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingRss, setFetchingRss] = useState(false);

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

  return { news, loading, error, fetchNews, addNews, fetchRss, fetchingRss };
}
