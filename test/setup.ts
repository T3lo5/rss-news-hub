import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb as getAppDb, resetDb, setTestDatabase } from '../src/db/index.js';
import * as schema from '../src/db/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Global test database instance
let testSqlite: Database.Database | null = null;

export function getTestDb() {
  if (!testSqlite) {
    // Use in-memory SQLite for fast, isolated tests
    testSqlite = new Database(':memory:');
    testSqlite.pragma('journal_mode = WAL');
    testSqlite.pragma('foreign_keys = ON');

    // Inject test database into app
    setTestDatabase(testSqlite);

    // Run migrations to create schema
    const migrationsPath = join(__dirname, '..', 'src', 'db', 'migrations');
    migrate(getAppDb(), { migrationsFolder: migrationsPath });
  }
  return getAppDb();
}

export function resetTestDb() {
  if (testSqlite) {
    // Clear all tables in reverse order (respecting foreign keys)
    const tables = [
      'app_settings',
      'news_hashes',
      'news_reads',
      'user_settings',
      'news_items',
      'feed_cache',
      'feed_stats',
      'global_stats',
      'user_profiles',
      'bookmarks',
      'newsletter_history',
      'telegram_queue',
      'templates',
      'feeds',
      'users',
    ];

    for (const table of tables) {
      try {
        testSqlite.exec(`DELETE FROM ${table};`);
      } catch {
        // Table might not exist
      }
    }

    // Reset auto-increment sequences if any
    try {
      testSqlite.exec(`DELETE FROM sqlite_sequence;`);
    } catch {
      // Ignore
    }
  }
}

export function closeTestDb() {
  if (testSqlite) {
    testSqlite.close();
    testSqlite = null;
    resetDb();
  }
}

// Test data factories
export const testFixtures = {
  feed: (overrides = {}) => ({
    id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Test Feed',
    url: 'https://example.com/feed.xml',
    enabled: true,
    category: 'Test',
    ...overrides,
  }),

  newsItem: (overrides = {}) => ({
    id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'Test Article',
    link: 'https://example.com/article',
    source: 'Test Feed',
    pubDate: new Date(),
    description: 'Test description',
    content: 'Test content',
    relevanceScore: 0,
    feedId: 'test-feed',
    ...overrides,
  }),

  feedStat: (overrides = {}) => ({
    feedId: 'test-feed',
    name: 'Test Feed',
    lastFetch: null,
    lastSuccess: null,
    lastStatus: null,
    lastError: null,
    successfulFetches: 0,
    failedFetches: 0,
    itemsFetched: 0,
    itemsNew: 0,
    itemsDuplicate: 0,
    etagHits: 0,
    latencies: '[]',
    ...overrides,
  }),

  template: (overrides = {}) => ({
    id: `template-${Date.now()}`,
    name: 'Test Template',
    type: 'summary',
    systemPrompt: 'Test prompt {{language}}',
    variables: JSON.stringify(['language']),
    isBuiltin: false,
    ...overrides,
  }),

  bookmark: (overrides = {}) => ({
    id: `bm-${Date.now()}`,
    newsId: 'test-news-id',
    title: 'Test Article',
    link: 'https://example.com/article',
    source: 'Test Feed',
    bookmarkedAt: new Date(),
    ...overrides,
  }),

  newsletterHistory: (overrides = {}) => ({
    id: `nl-${Date.now()}`,
    timestamp: new Date(),
    success: true,
    itemCount: 5,
    error: null,
    contentPreview: 'Test preview',
    ...overrides,
  }),

  telegramQueue: (overrides = {}) => ({
    id: `tg-${Date.now()}`,
    text: 'Test message',
    parseMode: 'Markdown',
    scheduledAt: new Date(Date.now() - 1000), // 1 second ago (already due)
    status: 'pending',
    retryCount: 0,
    lastError: null,
    options: null,
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  }),

  userProfile: (overrides = {}) => ({
    id: 'default',
    keywords: JSON.stringify(['AI', 'TypeScript']),
    topics: JSON.stringify(['Software Engineering']),
    preferredSources: JSON.stringify(['Test Blog']),
    excludedKeywords: JSON.stringify(['crypto']),
    ...overrides,
  }),
};

// Helper to insert test data
export async function insertTestFeed(db: ReturnType<typeof drizzle>, feed = testFixtures.feed()) {
  return db.insert(schema.feeds).values(feed).returning();
}

export async function insertTestNews(
  db: ReturnType<typeof drizzle>,
  news = testFixtures.newsItem()
) {
  return db.insert(schema.newsItems).values(news).returning();
}

export async function insertTestFeedStat(
  db: ReturnType<typeof drizzle>,
  stat = testFixtures.feedStat()
) {
  return db.insert(schema.feedStats).values(stat).returning();
}

export async function insertTestTemplate(
  db: ReturnType<typeof drizzle>,
  template = testFixtures.template()
) {
  return db.insert(schema.templates).values(template).returning();
}

// Mock external services
export const mocks = {
  fetch: (
    responses: Map<string, { status: number; text: string; headers: Record<string, string> }>
  ) => {
    const originalFetch = global.fetch;
    global.fetch = async (url: string | URL | Request, options?: RequestInit) => {
      const urlStr = url.toString();
      const response = responses.get(urlStr) || { status: 200, text: '<rss></rss>', headers: {} };
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        headers: {
          get: (name: string) => response.headers[name.toLowerCase()] || null,
        },
        text: async () => response.text,
      } as Response;
    };
    return () => {
      global.fetch = originalFetch;
    };
  },

  aiProvider: (responses: string[]) => {
    let callCount = 0;
    return {
      chat: async () => responses[callCount++] || 'Mock AI response',
      chatStream: async function* () {
        const response = responses[callCount++] || 'Mock AI response';
        for (const chunk of response.split(' ')) {
          yield chunk + ' ';
        }
      },
    };
  },
};

// Setup/teardown for test suites
export function setupTestSuite() {
  beforeEach(() => {
    resetTestDb();
  });

  after(() => {
    closeTestDb();
  });
}

// Initialize test DB on module load
getTestDb();
