import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const feeds = sqliteTable(
  'feeds',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull().unique(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    category: text('category').notNull().default('General'),
    etag: text('etag'),
    lastModified: text('last_modified'),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    urlIdx: uniqueIndex('feeds_url_idx').on(table.url),
    enabledIdx: index('feeds_enabled_idx').on(table.enabled),
    userIdx: index('feeds_user_idx').on(table.userId),
  })
);

export const newsItems = sqliteTable(
  'news_items',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    link: text('link').notNull().unique(),
    source: text('source').notNull(),
    pubDate: integer('pub_date', { mode: 'timestamp_ms' }).notNull(),
    description: text('description'),
    content: text('content'),
    // NULL = never scored (findUnscored() matches IS NULL). 0 is a real
    // score ("irrelevant"), so inserts must use explicit NULL for new items
    // (see NewsRepository.upsert) instead of relying on this default.
    relevanceScore: integer('relevance_score').default(0),
    feedId: text('feed_id').references(() => feeds.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    linkIdx: uniqueIndex('news_items_link_idx').on(table.link),
    pubDateIdx: index('news_items_pub_date_idx').on(table.pubDate),
    relevanceIdx: index('news_items_relevance_idx').on(table.relevanceScore),
    feedIdx: index('news_items_feed_idx').on(table.feedId),
  })
);

export const newsSearch = sqliteTable(
  'news_search',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    source: text('source').notNull(),
  },
  (table) => ({
    // FTS5 virtual table for full-text search
    // We'll create this via raw SQL migration
  })
);

export const newsHashes = sqliteTable('news_hashes', {
  hash: text('hash').primaryKey(),
  newsId: text('news_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

export const feedCache = sqliteTable('feed_cache', {
  feedId: text('feed_id')
    .primaryKey()
    .references(() => feeds.id),
  etag: text('etag'),
  lastModified: text('last_modified'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

export const feedStats = sqliteTable('feed_stats', {
  feedId: text('feed_id')
    .primaryKey()
    .references(() => feeds.id),
  name: text('name').notNull(),
  lastFetch: integer('last_fetch', { mode: 'timestamp_ms' }),
  lastSuccess: integer('last_success', { mode: 'timestamp_ms' }),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  successfulFetches: integer('successful_fetches').notNull().default(0),
  failedFetches: integer('failed_fetches').notNull().default(0),
  itemsFetched: integer('items_fetched').notNull().default(0),
  itemsNew: integer('items_new').notNull().default(0),
  itemsDuplicate: integer('items_duplicate').notNull().default(0),
  etagHits: integer('etag_hits').notNull().default(0),
  latencies: text('latencies').notNull().default('[]'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

export const userProfiles = sqliteTable('user_profiles', {
  id: text('id').primaryKey().default('default'),
  keywords: text('keywords').notNull().default('[]'),
  topics: text('topics').notNull().default('[]'),
  preferredSources: text('preferred_sources').notNull().default('[]'),
  excludedKeywords: text('excluded_keywords').notNull().default('[]'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

// Per-user read state. A row exists only while the item is read: unmarking
// deletes it, so "unread" needs no storage and the table stays proportional to
// the items someone actually opened. Cascades with both the user and the news
// item (retention deletes news regularly).
export const newsReads = sqliteTable(
  'news_reads',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    newsId: text('news_id')
      .notNull()
      .references(() => newsItems.id, { onDelete: 'cascade' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.newsId] }),
    newsIdx: index('news_reads_news_idx').on(table.newsId),
  })
);

export const bookmarks = sqliteTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    newsId: text('news_id')
      .notNull()
      .references(() => newsItems.id),
    title: text('title').notNull(),
    link: text('link').notNull(),
    source: text('source').notNull(),
    bookmarkedAt: integer('bookmarked_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdx: index('bookmarks_user_idx').on(table.userId),
    userNewsIdx: index('bookmarks_user_news_idx').on(table.userId, table.newsId),
  })
);

export const newsletterHistory = sqliteTable(
  'newsletter_history',
  {
    id: text('id').primaryKey(),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
    success: integer('success', { mode: 'boolean' }).notNull(),
    itemCount: integer('item_count').notNull().default(0),
    error: text('error'),
    contentPreview: text('content_preview'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    timestampIdx: index('newsletter_history_timestamp_idx').on(table.timestamp),
  })
);

export const telegramQueue = sqliteTable(
  'telegram_queue',
  {
    id: text('id').primaryKey(),
    text: text('text').notNull(),
    parseMode: text('parse_mode').notNull().default('Markdown'),
    scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status', { enum: ['pending', 'sent', 'failed'] })
      .notNull()
      .default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    options: text('options'),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    statusIdx: index('telegram_queue_status_idx').on(table.status),
    scheduledIdx: index('telegram_queue_scheduled_idx').on(table.scheduledAt),
    userIdx: index('telegram_queue_user_idx').on(table.userId),
  })
);

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['thread', 'summary', 'linkedin', 'blog', 'newsletter'] }).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  variables: text('variables').notNull().default('[]'),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    passwordHash: text('password_hash'),
    role: text('role', { enum: ['admin', 'user', 'viewer'] })
      .notNull()
      .default('user'),
    language: text('language', { enum: ['pt', 'en'] })
      .notNull()
      .default('pt'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
  })
);

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (table) => ({
    userIdx: index('api_keys_user_idx').on(table.userId),
    keyHashIdx: uniqueIndex('api_keys_key_hash_idx').on(table.keyHash),
  })
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdx: index('sessions_user_idx').on(table.userId),
  })
);

export const globalStats = sqliteTable('global_stats', {
  id: text('id').primaryKey().default('global'),
  totalFetches: integer('total_fetches').notNull().default(0),
  totalItems: integer('total_items').notNull().default(0),
  totalErrors: integer('total_errors').notNull().default(0),
  lastFullFetch: integer('last_full_fetch', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

// Key/value store for admin-editable settings (AI providers, Telegram, ...).
// Each row is a JSON blob; secret fields inside are encrypted (see
// services/secrets.js). Keys are area names: 'ai', 'telegram', 'newsletter',
// 'digest'.
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

// Per-user self-service settings (AI providers, Telegram, email, newsletter,
// digest). Each row is a JSON blob keyed by area. Secret fields inside are
// encrypted at rest (see services/secrets.js). Composite PK (user_id, area).
export const userSettings = sqliteTable(
  'user_settings',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    area: text('area').notNull(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => ({
    userIdx: index('user_settings_user_idx').on(table.userId),
  })
);

export type Feed = typeof feeds.$inferSelect;
export type NewFeed = typeof feeds.$inferInsert;
export type NewsItem = typeof newsItems.$inferSelect;
export type NewNewsItem = typeof newsItems.$inferInsert;
export type NewsSearch = typeof newsSearch.$inferSelect;
export type NewNewsSearch = typeof newsSearch.$inferInsert;
export type NewsHash = typeof newsHashes.$inferSelect;
export type NewNewsHash = typeof newsHashes.$inferInsert;
export type FeedCache = typeof feedCache.$inferSelect;
export type NewFeedCache = typeof feedCache.$inferInsert;
export type FeedStat = typeof feedStats.$inferSelect;
export type NewFeedStat = typeof feedStats.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;
export type NewsRead = typeof newsReads.$inferSelect;
export type NewNewsRead = typeof newsReads.$inferInsert;
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type NewsletterHistory = typeof newsletterHistory.$inferSelect;
export type NewNewsletterHistory = typeof newsletterHistory.$inferInsert;
export type TelegramQueue = typeof telegramQueue.$inferSelect;
export type NewTelegramQueue = typeof telegramQueue.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type GlobalStat = typeof globalStats.$inferSelect;
export type NewGlobalStat = typeof globalStats.$inferInsert;
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
