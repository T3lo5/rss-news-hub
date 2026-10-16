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
  emailEnabled: boolean;
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

export type AiProviderId = 'sensenova' | 'deepseek' | 'openai';

export type Provider = 'auto' | AiProviderId;

export type ContentType = 'thread' | 'summary' | 'linkedin' | 'blog' | 'newsletter';

export type Language = 'en' | 'pt';

export interface AiProviderInfo {
  id: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  apiKeySet: boolean;
}

export interface AiSettings {
  defaultProvider: 'auto' | AiProviderId;
  providers: AiProviderInfo[];
}

export interface TelegramSettings {
  chatId: string;
  botTokenSet: boolean;
}

export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  passwordSet: boolean;
  recipients: string[];
}

export interface DigestConfig {
  enabled: boolean;
  cron: string;
  lookbackDays: number;
  minRelevanceScore: number;
  maxItems: number;
  provider: 'auto' | AiProviderId;
  format: 'thread' | 'summary' | 'linkedin';
  language: 'en' | 'pt';
  emailEnabled: boolean;
}

export interface AppSettings {
  ai: AiSettings;
  telegram: TelegramSettings;
  email: EmailSettings;
  newsletter: NewsletterConfig;
  digest: DigestConfig;
}

export interface AiProviderListItem {
  id: AiProviderId;
  label: string;
  configured: boolean;
}

export interface AiProviderList {
  defaultProvider: 'auto' | AiProviderId;
  providers: AiProviderListItem[];
}

export interface AiTestResult {
  provider: string;
  reply: string;
}

export interface AiProviderOverride {
  apiKey?: string | null;
  baseUrl?: string;
  model?: string;
}

export interface AiSettingsUpdate {
  defaultProvider?: 'auto' | AiProviderId;
  sensenova?: AiProviderOverride;
  deepseek?: AiProviderOverride;
  openai?: AiProviderOverride;
}

export interface TelegramSettingsUpdate {
  botToken?: string | null;
  chatId?: string;
}

export interface EmailSettingsUpdate {
  enabled?: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string | null;
  from?: string;
  recipients?: string[];
}

export interface EmailSendRequest {
  to?: string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response?: string;
  verified?: boolean;
}

export interface DigestPreview {
  items: NewsItem[];
  content?: string;
}

export interface DigestStatus {
  enabled: boolean;
  cron: string;
  nextRun: number | null;
}

export interface DigestTriggerResult {
  success: boolean;
  itemsCount: number;
  content?: string;
  error?: string;
}

export type UserRole = 'admin' | 'user' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name?: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  name?: string | null;
  role?: UserRole;
  password?: string;
}

export interface TelegramQueueItem {
  id: string;
  chatId?: string;
  text: string;
  scheduledAt?: number;
  status?: string;
  createdAt?: number;
}

export interface TelegramWorkerStatus {
  running: boolean;
  intervalMs: number;
  pending?: number;
}

export interface HealthStatus {
  ok: boolean;
  uptime: number;
  version?: string;
  db: { ok: boolean };
  schedulers: Record<string, unknown>;
  providers: { configured: string[] };
}

