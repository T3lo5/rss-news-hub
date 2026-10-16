export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  content: string;
  relevanceScore?: number;
}

export interface NewsResponse {
  ok: boolean;
  data: NewsItem[];
  error?: string;
}

export interface AIResponse {
  ok: boolean;
  data: {
    content: string;
    type: string;
    language: string;
  };
  error?: string;
}

export interface TelegramResponse {
  ok: boolean;
  data: unknown;
  error?: string;
}

export interface FetchRssResponse {
  ok: boolean;
  data: {
    total: number;
    results: Array<{ source: string; count: number; error: string | null }>;
  };
  error?: string;
}

export interface SchedulerStatus {
  running: boolean;
  intervalMs: number;
  lastRun: number | null;
  nextRun: number | null;
  lastResult: unknown;
}

export interface FeedStat {
  name: string;
  lastFetch: number | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  itemsFetched: number;
  etagHits: number;
}

export interface StatsResponse {
  scheduler: SchedulerStatus;
  feeds: FeedStat[];
  totals: {
    totalFetches: number;
    totalItems: number;
    totalErrors: number;
    lastFullFetch: number | null;
  };
}

export interface GenerateContentRequest {
  news: NewsItem | NewsItem[];
  type: 'thread' | 'summary' | 'linkedin' | 'newsletter' | 'blog';
  language: 'en' | 'pt';
  provider?: 'auto' | 'sensenova' | 'deepseek' | 'openai';
  templateId?: string;
  templateVariables?: Record<string, string>;
}

export interface Template {
  id: string;
  name: string;
  type: 'thread' | 'summary' | 'linkedin' | 'blog' | 'newsletter';
  systemPrompt: string;
  variables: string[];
  builtin?: boolean;
}

export interface TemplatesResponse {
  templates: Template[];
  defaultTemplateIds: Record<string, string>;
}

export interface AddNewsRequest {
  title: string;
  link: string;
  source?: string;
  description?: string;
}

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  category: string;
  lastFetch?: number | null;
  lastError?: string | null;
  itemCount?: number;
  etagHits?: number;
  status?: 'ok' | 'error' | 'unknown';
}

export interface FeedTestResponse {
  success: boolean;
  itemCount: number;
  error?: string;
  preview: Array<{ title: string; link: string; pubDate: string }>;
}

export interface NewsletterConfig {
  enabled: boolean;
  cron: string;
  lookbackDays: number;
  sources: string[];
  categories: string[];
  language: 'en' | 'pt';
  provider: 'auto' | 'sensenova' | 'deepseek' | 'openai';
  telegramEnabled: boolean;
}

export interface NewsletterHistoryEntry {
  timestamp: number;
  success: boolean;
  itemCount: number;
  error: string | null;
  contentPreview: string;
}

export interface Bookmark {
  newsId: string;
  title: string;
  link: string;
  source: string;
  bookmarkedAt: number;
}

export interface OPMLImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

export type DigestGrouping = 'none' | 'daily' | 'weekly';

export interface InterestProfile {
  keywords: string[];
  topics: string[];
  preferredSources: string[];
  excludedKeywords: string[];
  updatedAt: number;
}

export interface ScoredNewsItem extends NewsItem {
  relevanceScore?: number;
  scoredAt?: number;
}
