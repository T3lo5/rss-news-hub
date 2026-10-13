import type {
  AddNewsRequest,
  AIResponse,
  Bookmark,
  FeedConfig,
  FeedTestResponse,
  FetchRssResponse,
  GenerateContentRequest,
  InterestProfile,
  NewsItem,
  NewsletterConfig,
  NewsletterHistoryEntry,
  NewsResponse,
  OPMLImportResult,
  SchedulerStatus,
  ScoredNewsItem,
  StatsResponse,
  TelegramResponse,
  Template,
  TemplatesResponse,
} from '../types';

const API_BASE = '';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  async fetchNews(): Promise<NewsItem[]> {
    const res = await fetch(`${API_BASE}/api/news`);
    const data = await handleResponse<NewsResponse>(res);
    return data.data;
  },

  async addNews(news: AddNewsRequest): Promise<NewsItem> {
    const res = await fetch(`${API_BASE}/api/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(news),
    });
    const data = await handleResponse<NewsResponse>(res);
    return data.data[0];
  },

  async fetchRss(): Promise<FetchRssResponse> {
    const res = await fetch(`${API_BASE}/api/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<FetchRssResponse>(res);
  },

  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const res = await fetch(`${API_BASE}/api/scheduler/status`);
    const data = await handleResponse<{ ok: boolean; data: SchedulerStatus }>(res);
    return data.data;
  },

  async triggerScheduler(): Promise<FetchRssResponse> {
    const res = await fetch(`${API_BASE}/api/scheduler/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse<FetchRssResponse>(res);
  },

  async setSchedulerInterval(intervalMs: number): Promise<{ intervalMs: number }> {
    const res = await fetch(`${API_BASE}/api/scheduler/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intervalMs }),
    });
    return handleResponse<{ ok: boolean; data: { intervalMs: number } }>(res);
  },

  async getStats(): Promise<StatsResponse> {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await handleResponse<{ ok: boolean; data: StatsResponse }>(res);
    return data.data;
  },

  async generateContent(request: GenerateContentRequest): Promise<string> {
    const res = await fetch(`${API_BASE}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await handleResponse<AIResponse>(res);
    return data.data.content;
  },

  async sendToTelegram(text: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/telegram/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, parseMode: 'Markdown' }),
    });
    await handleResponse<TelegramResponse>(res);
  },

  // Feed management
  async getFeeds(): Promise<FeedConfig[]> {
    const res = await fetch(`${API_BASE}/api/feeds`);
    const data = await handleResponse<{ ok: boolean; data: FeedConfig[] }>(res);
    return data.data;
  },

  async addFeed(feed: Omit<FeedConfig, 'id'>): Promise<FeedConfig> {
    const res = await fetch(`${API_BASE}/api/feeds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feed),
    });
    const data = await handleResponse<{ ok: boolean; data: FeedConfig }>(res);
    return data.data;
  },

  async updateFeed(id: string, updates: Partial<FeedConfig>): Promise<FeedConfig> {
    const res = await fetch(`${API_BASE}/api/feeds/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await handleResponse<{ ok: boolean; data: FeedConfig }>(res);
    return data.data;
  },

  async deleteFeed(id: string): Promise<{ id: string }> {
    const res = await fetch(`${API_BASE}/api/feeds/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean; data: { id: string } }>(res);
  },

  async testFeed(id: string): Promise<FeedTestResponse> {
    const res = await fetch(`${API_BASE}/api/feeds/${id}/test`, {
      method: 'POST',
    });
    const data = await handleResponse<{ ok: boolean; data: FeedTestResponse }>(res);
    return data.data;
  },

  async reloadFeeds(): Promise<FeedConfig[]> {
    const res = await fetch(`${API_BASE}/api/feeds/reload`, {
      method: 'POST',
    });
    const data = await handleResponse<{ ok: boolean; data: FeedConfig[] }>(res);
    return data.data;
  },

  // Newsletter
  async getNewsletterConfig(): Promise<NewsletterConfig> {
    const res = await fetch(`${API_BASE}/api/newsletter/config`);
    const data = await handleResponse<{ ok: boolean; data: NewsletterConfig }>(res);
    return data.data;
  },

  async updateNewsletterConfig(config: Partial<NewsletterConfig>): Promise<NewsletterConfig> {
    const res = await fetch(`${API_BASE}/api/newsletter/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await handleResponse<{ ok: boolean; data: NewsletterConfig }>(res);
    return data.data;
  },

  async triggerNewsletter(): Promise<NewsletterHistoryEntry> {
    const res = await fetch(`${API_BASE}/api/newsletter/trigger`, {
      method: 'POST',
    });
    const data = await handleResponse<{ ok: boolean; data: NewsletterHistoryEntry }>(res);
    return data.data;
  },

  async getNewsletterHistory(): Promise<NewsletterHistoryEntry[]> {
    const res = await fetch(`${API_BASE}/api/newsletter/history`);
    const data = await handleResponse<{ ok: boolean; data: NewsletterHistoryEntry[] }>(res);
    return data.data;
  },

  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
    const res = await fetch(`${API_BASE}/api/bookmarks`);
    const data = await handleResponse<{ ok: boolean; data: Bookmark[] }>(res);
    return data.data;
  },

  async addBookmark(newsId: string): Promise<Bookmark> {
    const res = await fetch(`${API_BASE}/api/bookmarks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsId }),
    });
    const data = await handleResponse<{ ok: boolean; data: Bookmark }>(res);
    return data.data;
  },

  async removeBookmark(newsId: string): Promise<{ removed: boolean }> {
    const res = await fetch(`${API_BASE}/api/bookmarks/${newsId}`, {
      method: 'DELETE',
    });
    const data = await handleResponse<{ ok: boolean; data: { removed: boolean } }>(res);
    return data.data;
  },

  // OPML
  async exportOPML(): Promise<Blob> {
    const res = await fetch(`${API_BASE}/api/feeds/opml`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.blob();
  },

  async importOPML(file: File): Promise<OPMLImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/feeds/opml`, {
      method: 'POST',
      body: formData,
    });
    const data = await handleResponse<{ ok: boolean; data: OPMLImportResult }>(res);
    return data.data;
  },

  // Relevance
  async getProfile(): Promise<InterestProfile> {
    const res = await fetch(`${API_BASE}/api/ai/profile`);
    const data = await handleResponse<{ ok: boolean; data: InterestProfile }>(res);
    return data.data;
  },

  async updateProfile(profile: Partial<InterestProfile>): Promise<InterestProfile> {
    const res = await fetch(`${API_BASE}/api/ai/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    const data = await handleResponse<{ ok: boolean; data: InterestProfile }>(res);
    return data.data;
  },

  async scoreItems(items: NewsItem[], profile?: InterestProfile): Promise<ScoredNewsItem[]> {
    const res = await fetch(`${API_BASE}/api/ai/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, profile }),
    });
    const data = await handleResponse<{ ok: boolean; data: ScoredNewsItem[] }>(res);
    return data.data;
  },

  async scoreNewItems(): Promise<{ scored: number; total: number }> {
    const res = await fetch(`${API_BASE}/api/ai/score-new`, {
      method: 'POST',
    });
    const data = await handleResponse<{ ok: boolean; data: { scored: number; total: number } }>(
      res
    );
    return data.data;
  },

  // Templates
  async getTemplates(): Promise<TemplatesResponse> {
    const res = await fetch(`${API_BASE}/api/templates`);
    const data = await handleResponse<{ ok: boolean; data: TemplatesResponse }>(res);
    return data.data;
  },

  async createTemplate(template: Omit<Template, 'builtin'>): Promise<Template> {
    const res = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    const data = await handleResponse<{ ok: boolean; data: Template }>(res);
    return data.data;
  },

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    const res = await fetch(`${API_BASE}/api/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await handleResponse<{ ok: boolean; data: Template }>(res);
    return data.data;
  },

  async deleteTemplate(id: string): Promise<{ deleted: boolean }> {
    const res = await fetch(`${API_BASE}/api/templates/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean; data: { deleted: boolean } }>(res);
  },

  async testTemplate(
    templateId: string,
    variables?: Record<string, string>,
    type?: string,
    news?: NewsItem
  ): Promise<{ templateId: string; systemPrompt: string; variables: Record<string, string> }> {
    const res = await fetch(`${API_BASE}/api/templates/${templateId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, variables, type, news }),
    });
    const data = await handleResponse<{
      ok: boolean;
      data: { templateId: string; systemPrompt: string; variables: Record<string, string> };
    }>(res);
    return data.data;
  },
};
