import type {
  AddNewsRequest,
  AIResponse,
  AiProviderList,
  AiSettings,
  AiSettingsUpdate,
  AiTestResult,
  AppSettings,
  Bookmark,
  CreateUserRequest,
  DigestConfig,
  DigestPreview,
  DigestStatus,
  DigestTriggerResult,
  EmailSendRequest,
  EmailSendResult,
  EmailSettings,
  EmailSettingsUpdate,
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
  TelegramSettings,
  TelegramSettingsUpdate,
  Template,
  TemplatesResponse,
  UpdateUserRequest,
  User,
} from '../types';

const API_BASE = '';

const TOKEN_KEY = 'auth_token';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

function buildHeaders(options: RequestInit, token: string | null): Headers {
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

// Ask the API for a fresh access token. The refresh token is sent
// automatically in an HttpOnly cookie (credentials: 'include'), so it never
// touches JavaScript or localStorage. The refresh endpoint is not called
// through fetchWithAuth, so it cannot recurse.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return null;

    const data = await res.json();
    const newAccess = data?.data?.accessToken;
    if (!newAccess) return null;

    authToken = newAccess;
    if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, newAccess);
    return newAccess;
  } catch {
    return null;
  }
}

// Coalesce concurrent 401s into a single refresh request.
export function refreshSession(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Best-effort: local state is cleared regardless.
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // Refresh already had its chance in fetchWithAuth — this is a real logout.
    authToken = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
    throw new Error('Authentication required');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let res = await fetch(`${API_BASE}${url}`, {
    ...options,
    credentials: 'include',
    headers: buildHeaders(options, authToken),
  });

  // Access token expired: silently refresh (HttpOnly cookie) and retry the
  // request once, so the session only ends when the refresh token itself
  // expires (30 days) or is revoked.
  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await fetch(`${API_BASE}${url}`, {
        ...options,
        credentials: 'include',
        headers: buildHeaders(options, authToken),
      });
    }
  }

  return res;
}

// Backend GET /api/templates returns raw DB rows (variables as a JSON
// string, isBuiltin flag); normalize to the frontend Template shape here
// so every consumer stays safe.
function normalizeTemplate(t: any): Template {
  let variables: string[] = [];
  if (Array.isArray(t?.variables)) {
    variables = t.variables;
  } else if (typeof t?.variables === 'string') {
    try {
      const parsed = JSON.parse(t.variables);
      variables = Array.isArray(parsed) ? parsed : [];
    } catch {
      variables = [];
    }
  }
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    systemPrompt: t.systemPrompt,
    variables,
    builtin: t.builtin ?? t.isBuiltin ?? false,
  };
}

export const api = {
  async fetchNews(): Promise<NewsItem[]> {
    const res = await fetchWithAuth('/api/news');
    const data = await handleResponse<NewsResponse>(res);
    return data.data;
  },

  async getMe(): Promise<{ id: string; email: string; name: string; role: string }> {
    const res = await fetchWithAuth('/api/auth/me');
    const data = await handleResponse<{
      ok: boolean;
      data: { id: string; email: string; name: string; role: string };
    }>(res);
    return data.data;
  },

  async getUsers(): Promise<User[]> {
    const res = await fetchWithAuth('/api/users');
    const data = await handleResponse<{ ok: boolean; data: User[] }>(res);
    return data.data;
  },

  async createUser(payload: CreateUserRequest): Promise<User> {
    const res = await fetchWithAuth('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ok: boolean; data: User }>(res);
    return data.data;
  },

  async updateUser(id: string, payload: UpdateUserRequest): Promise<User> {
    const res = await fetchWithAuth(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ok: boolean; data: User }>(res);
    return data.data;
  },

  async deleteUser(id: string): Promise<{ deleted: boolean }> {
    const res = await fetchWithAuth(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    const data = await handleResponse<{ ok: boolean; data: { deleted: boolean } }>(res);
    return data.data;
  },

  async addNews(news: AddNewsRequest): Promise<NewsItem> {
    const res = await fetchWithAuth('/api/news', {
      method: 'POST',
      body: JSON.stringify(news),
    });
    const data = await handleResponse<NewsResponse>(res);
    return data.data[0];
  },

  async fetchRss(): Promise<FetchRssResponse> {
    const res = await fetchWithAuth('/api/fetch', { method: 'POST' });
    return handleResponse<FetchRssResponse>(res);
  },

  async getSchedulerStatus(): Promise<SchedulerStatus> {
    const res = await fetchWithAuth('/api/scheduler/status');
    const data = await handleResponse<{ ok: boolean; data: SchedulerStatus }>(res);
    return data.data;
  },

  async triggerScheduler(): Promise<FetchRssResponse> {
    const res = await fetchWithAuth('/api/scheduler/trigger', { method: 'POST' });
    return handleResponse<FetchRssResponse>(res);
  },

  async setSchedulerInterval(intervalMs: number): Promise<{ intervalMs: number }> {
    const res = await fetchWithAuth('/api/scheduler/config', {
      method: 'POST',
      body: JSON.stringify({ intervalMs }),
    });
    return handleResponse<{ ok: boolean; data: { intervalMs: number } }>(res);
  },

  async getStats(): Promise<StatsResponse> {
    const res = await fetchWithAuth('/api/stats');
    const data = await handleResponse<{ ok: boolean; data: StatsResponse }>(res);
    return data.data;
  },

  async generateContent(request: GenerateContentRequest): Promise<string> {
    const res = await fetchWithAuth('/api/ai/generate', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    const data = await handleResponse<AIResponse>(res);
    return data.data.content;
  },

  async sendToTelegram(text: string): Promise<void> {
    const res = await fetchWithAuth('/api/telegram/send', {
      method: 'POST',
      body: JSON.stringify({ text, parseMode: 'Markdown' }),
    });
    await handleResponse<TelegramResponse>(res);
  },

  // Feed management
  async getFeeds(): Promise<FeedConfig[]> {
    const res = await fetchWithAuth('/api/feeds');
    const data = await handleResponse<{ ok: boolean; data: FeedConfig[] }>(res);
    return data.data;
  },

  async addFeed(feed: Omit<FeedConfig, 'id'>): Promise<FeedConfig> {
    const res = await fetchWithAuth('/api/feeds', {
      method: 'POST',
      body: JSON.stringify(feed),
    });
    const data = await handleResponse<{ ok: boolean; data: FeedConfig }>(res);
    return data.data;
  },

  async updateFeed(id: string, updates: Partial<FeedConfig>): Promise<FeedConfig> {
    const res = await fetchWithAuth(`/api/feeds/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await handleResponse<{ ok: boolean; data: FeedConfig }>(res);
    return data.data;
  },

  async deleteFeed(id: string): Promise<{ id: string }> {
    const res = await fetchWithAuth(`/api/feeds/${id}`, { method: 'DELETE' });
    return handleResponse<{ ok: boolean; data: { id: string } }>(res);
  },

  async testFeed(id: string): Promise<FeedTestResponse> {
    const res = await fetchWithAuth(`/api/feeds/${id}/test`, { method: 'POST' });
    const data = await handleResponse<{ ok: boolean; data: FeedTestResponse }>(res);
    return data.data;
  },

  async reloadFeeds(): Promise<FeedConfig[]> {
    const res = await fetchWithAuth('/api/feeds/reload', { method: 'POST' });
    const data = await handleResponse<{ ok: boolean; data: FeedConfig[] }>(res);
    return data.data;
  },

  // Newsletter
  async getNewsletterConfig(): Promise<NewsletterConfig> {
    const res = await fetchWithAuth('/api/newsletter/config');
    const data = await handleResponse<{ ok: boolean; data: NewsletterConfig }>(res);
    return data.data;
  },

  async updateNewsletterConfig(config: Partial<NewsletterConfig>): Promise<NewsletterConfig> {
    const res = await fetchWithAuth('/api/newsletter/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    const data = await handleResponse<{ ok: boolean; data: NewsletterConfig }>(res);
    return data.data;
  },

  async triggerNewsletter(): Promise<NewsletterHistoryEntry> {
    const res = await fetchWithAuth('/api/newsletter/trigger', { method: 'POST' });
    const data = await handleResponse<{ ok: boolean; data: NewsletterHistoryEntry }>(res);
    return data.data;
  },

  async getNewsletterHistory(): Promise<NewsletterHistoryEntry[]> {
    const res = await fetchWithAuth('/api/newsletter/history');
    const data = await handleResponse<{ ok: boolean; data: NewsletterHistoryEntry[] }>(res);
    return data.data;
  },

  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
    const res = await fetchWithAuth('/api/bookmarks');
    const data = await handleResponse<{ ok: boolean; data: Bookmark[] }>(res);
    return data.data;
  },

  async addBookmark(newsId: string): Promise<Bookmark> {
    const res = await fetchWithAuth('/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ newsId }),
    });
    const data = await handleResponse<{ ok: boolean; data: Bookmark }>(res);
    return data.data;
  },

  async removeBookmark(newsId: string): Promise<{ removed: boolean }> {
    const encodedNewsId = encodeURIComponent(newsId);
    const res = await fetchWithAuth(`/api/bookmarks/${encodedNewsId}`, { method: 'DELETE' });
    const data = await handleResponse<{ ok: boolean; data: { removed: boolean } }>(res);
    return data.data;
  },

  // OPML
  async exportOPML(): Promise<Blob> {
    const res = await fetchWithAuth('/api/feeds/opml');
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
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body: formData,
    });
    const data = await handleResponse<{ ok: boolean; data: OPMLImportResult }>(res);
    return data.data;
  },

  // Relevance
  async getProfile(): Promise<InterestProfile> {
    const res = await fetchWithAuth('/api/ai/profile');
    const data = await handleResponse<{ ok: boolean; data: InterestProfile }>(res);
    return data.data;
  },

  async updateProfile(profile: Partial<InterestProfile>): Promise<InterestProfile> {
    const res = await fetchWithAuth('/api/ai/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
    const data = await handleResponse<{ ok: boolean; data: InterestProfile }>(res);
    return data.data;
  },

  async scoreItems(items: NewsItem[], profile?: InterestProfile): Promise<ScoredNewsItem[]> {
    const res = await fetchWithAuth('/api/ai/score', {
      method: 'POST',
      body: JSON.stringify({ items, profile }),
    });
    const data = await handleResponse<{ ok: boolean; data: ScoredNewsItem[] }>(res);
    return data.data;
  },

  async scoreNewItems(): Promise<{ scored: number; total: number }> {
    const res = await fetchWithAuth('/api/ai/score-new', { method: 'POST' });
    const data = await handleResponse<{ ok: boolean; data: { scored: number; total: number } }>(res);
    return data.data;
  },

  // Templates
  // Backend returns DB rows (variables as JSON string, isBuiltin flag);
  // normalize to the frontend Template shape here so all consumers are safe.
  async getTemplates(): Promise<TemplatesResponse> {
    const res = await fetchWithAuth('/api/templates');
    const data = await handleResponse<{ ok: boolean; data: any }>(res);
    const raw = Array.isArray(data.data) ? data.data : (data.data?.templates ?? []);
    const templates = raw.map(normalizeTemplate);
    const defaultTemplateIds =
      data.data?.defaultTemplateIds ?? ({} as Record<string, string>);
    return { templates, defaultTemplateIds };
  },

  async createTemplate(template: Omit<Template, 'builtin'>): Promise<Template> {
    const res = await fetchWithAuth('/api/templates', {
      method: 'POST',
      body: JSON.stringify(template),
    });
    const data = await handleResponse<{ ok: boolean; data: any }>(res);
    return normalizeTemplate(data.data);
  },

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template> {
    const res = await fetchWithAuth(`/api/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await handleResponse<{ ok: boolean; data: any }>(res);
    return normalizeTemplate(data.data);
  },

  async deleteTemplate(id: string): Promise<{ deleted: boolean }> {
    const res = await fetchWithAuth(`/api/templates/${id}`, { method: 'DELETE' });
    return handleResponse<{ ok: boolean; data: { deleted: boolean } }>(res);
  },

  async testTemplate(
    templateId: string,
    variables?: Record<string, string>,
    type?: string,
    news?: NewsItem
  ): Promise<{ templateId: string; systemPrompt: string; variables: Record<string, string> }> {
    const res = await fetchWithAuth(`/api/templates/${templateId}/test`, {
      method: 'POST',
      body: JSON.stringify({ templateId, variables, type, news }),
    });
    const data = await handleResponse<{
      ok: boolean;
      data: { templateId: string; systemPrompt: string; variables: Record<string, string> };
    }>(res);
    return data.data;
  },

  // Settings (admin)
  async getSettings(): Promise<AppSettings> {
    const res = await fetchWithAuth('/api/settings');
    const data = await handleResponse<{ ok: boolean; data: AppSettings }>(res);
    return data.data;
  },

  async updateAiSettings(payload: AiSettingsUpdate): Promise<AiSettings> {
    const res = await fetchWithAuth('/api/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ok: boolean; data: AiSettings }>(res);
    return data.data;
  },

  async updateTelegramSettings(payload: TelegramSettingsUpdate): Promise<TelegramSettings> {
    const res = await fetchWithAuth('/api/settings/telegram', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ok: boolean; data: TelegramSettings }>(res);
    return data.data;
  },

  async updateEmailSettings(payload: EmailSettingsUpdate): Promise<EmailSettings> {
    const res = await fetchWithAuth('/api/settings/email', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ok: boolean; data: EmailSettings }>(res);
    return data.data;
  },

  async sendEmail(payload: EmailSendRequest): Promise<EmailSendResult> {
    const res = await fetchWithAuth('/api/email/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await handleResponse<{ ok: boolean; data: EmailSendResult }>(res);
    return data.data;
  },

  async testEmail(to?: string[]): Promise<EmailSendResult> {
    const res = await fetchWithAuth('/api/email/test', {
      method: 'POST',
      body: JSON.stringify(to?.length ? { to } : {}),
    });
    const data = await handleResponse<{ ok: boolean; data: EmailSendResult }>(res);
    return data.data;
  },

  async getAiProviders(): Promise<AiProviderList> {
    const res = await fetchWithAuth('/api/ai/providers');
    const data = await handleResponse<{ ok: boolean; data: AiProviderList }>(res);
    return data.data;
  },

  async testAiProvider(provider: 'auto' | AiProviderId): Promise<AiTestResult> {
    const res = await fetchWithAuth('/api/ai/test', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
    const data = await handleResponse<{ ok: boolean; data: AiTestResult }>(res);
    return data.data;
  },

  // Digest (Best News)
  async getDigestConfig(): Promise<DigestConfig> {
    const res = await fetchWithAuth('/api/digest/config');
    const data = await handleResponse<{ ok: boolean; data: DigestConfig }>(res);
    return data.data;
  },

  async updateDigestConfig(config: Partial<DigestConfig>): Promise<DigestConfig> {
    const res = await fetchWithAuth('/api/digest/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    const data = await handleResponse<{ ok: boolean; data: DigestConfig }>(res);
    return data.data;
  },

  async getDigestStatus(): Promise<DigestStatus> {
    const res = await fetchWithAuth('/api/digest/status');
    const data = await handleResponse<{ ok: boolean; data: DigestStatus }>(res);
    return data.data;
  },

  async triggerDigest(): Promise<DigestTriggerResult> {
    const res = await fetchWithAuth('/api/digest/trigger', { method: 'POST' });
    const data = await handleResponse<{ ok: boolean; data: DigestTriggerResult }>(res);
    return data.data;
  },

  async previewDigest(
    params: Pick<
      DigestConfig,
      'lookbackDays' | 'minRelevanceScore' | 'maxItems' | 'format' | 'language' | 'provider'
    >
  ): Promise<DigestPreview> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const res = await fetchWithAuth(`/api/digest/preview?${query.toString()}`);
    const data = await handleResponse<{ ok: boolean; data: DigestPreview }>(res);
    return data.data;
  },
};

// Initialize token from localStorage on load
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) setAuthToken(stored);
}