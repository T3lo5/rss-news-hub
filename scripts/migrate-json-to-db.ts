#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// Migration script: Import existing JSON data to SQLite database
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { RSS_FEEDS } from '../server.config.js';
import { generateFeedId } from '../services/config.service.js';
import { getDb, schema } from '../src/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Scripts is at project_root/scripts, data is at project_root/data
const DATA_DIR = join(dirname(__dirname), 'data');

const JSON_FILES = {
  news: 'news.json',
  bookmarks: 'bookmarks.json',
  feedStats: 'feed-stats.json',
  newsHashes: 'news-hashes.json',
  rssCache: 'rss-cache.json',
  profile: 'profile.json',
  newsletterHistory: 'newsletter-history.json',
  telegramQueue: 'telegram-queue.json',
  templates: 'templates.json',
};

function readJsonFile(filename: string): any {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) {
    console.log(`  ⏭️  ${filename} not found, skipping`);
    return null;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`  ❌ Failed to parse ${filename}:`, err);
    return null;
  }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function migrateFeeds(db: ReturnType<typeof getDb>) {
  console.log('📦 Migrating feeds...');
  const feedsData = readJsonFile(JSON_FILES.rssCache); // RSS cache has feed names

  for (const feed of RSS_FEEDS) {
    const existing = await db
      .select()
      .from(schema.feeds)
      .where(eq(schema.feeds.id, feed.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.feeds).values({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        enabled: feed.enabled,
        category: feed.category,
      });
      console.log(`  ✅ Added feed: ${feed.name}`);
    } else {
      console.log(`  ⏭️  Feed already exists: ${feed.name}`);
    }
  }
}

async function migrateNews(db: ReturnType<typeof getDb>) {
  console.log('📰 Migrating news items...');
  const news = readJsonFile(JSON_FILES.news);
  if (!news || !news.length) {
    console.log('  ⏭️  No news items to migrate');
    return;
  }

  let inserted = 0;
  for (const item of news) {
    const existing = await db
      .select()
      .from(schema.newsItems)
      .where(eq(schema.newsItems.id, item.id))
      .limit(1);

    if (existing.length === 0) {
      const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
      if (isNaN(pubDate.getTime())) {
        console.warn(`  ⚠️  Invalid pubDate for item ${item.id}: ${item.pubDate}`);
      }
      let relevanceScore = item.relevanceScore;
      if (relevanceScore !== undefined && relevanceScore !== null) {
        relevanceScore = Number(relevanceScore);
        if (isNaN(relevanceScore)) relevanceScore = 0;
      } else {
        relevanceScore = 0;
      }
      // Find the feed ID by matching source name to feed name
      const feed = await db
        .select()
        .from(schema.feeds)
        .where(eq(schema.feeds.name, item.source))
        .limit(1);
      const feedId = feed[0]?.id || item.source;

      console.log(
        `  🔍 Inserting item: ${item.id.slice(0, 50)}... pubDate=${pubDate.toISOString()} relevanceScore=${relevanceScore} feedId=${feedId}`
      );
      const insertData = {
        id: item.id,
        title: item.title,
        link: item.link,
        source: item.source,
        pubDate,
        description: item.description || '',
        content: item.content || '',
        relevanceScore: relevanceScore ?? 0,
        feedId,
      };
      await db.insert(schema.newsItems).values(insertData);
      inserted++;
    }
  }
  console.log(
    `  ✅ Inserted ${inserted} new news items (${news.length - inserted} already existed)`
  );
}

async function migrateNewsHashes(db: ReturnType<typeof getDb>) {
  console.log('🔑 Migrating news hashes...');
  const hashes = readJsonFile(JSON_FILES.newsHashes);
  if (!hashes) {
    console.log('  ⏭️  No news hashes to migrate');
    return;
  }

  let inserted = 0;
  let skipped = 0;
  for (const [hash, newsId] of Object.entries(hashes)) {
    // Check if the news item exists in the database
    const existingNews = await db
      .select({ id: schema.newsItems.id })
      .from(schema.newsItems)
      .where(eq(schema.newsItems.id, newsId))
      .limit(1);

    if (existingNews.length === 0) {
      console.warn(`  ⚠️  Skipping hash for non-existent news item: ${newsId}`);
      skipped++;
      continue;
    }

    const existing = await db
      .select()
      .from(schema.newsHashes)
      .where(eq(schema.newsHashes.hash, hash))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.newsHashes).values({ hash, newsId: newsId as string });
      inserted++;
    }
  }
  console.log(`  ✅ Inserted ${inserted} new hash entries (${skipped} skipped)`);
}

async function migrateFeedCache(db: ReturnType<typeof getDb>) {
  console.log('💾 Migrating feed cache...');
  const cache = readJsonFile(JSON_FILES.rssCache);
  if (!cache) {
    console.log('  ⏭️  No feed cache to migrate');
    return;
  }

  for (const [feedName, data] of Object.entries(cache)) {
    // Find feed by name
    const feed = await db
      .select()
      .from(schema.feeds)
      .where(eq(schema.feeds.name, feedName))
      .limit(1);

    if (feed.length > 0 && data && typeof data === 'object') {
      const cacheData = data as { etag?: string; lastModified?: string };
      if (cacheData.etag || cacheData.lastModified) {
        await db
          .insert(schema.feedCache)
          .values({
            feedId: feed[0].id,
            etag: cacheData.etag || null,
            lastModified: cacheData.lastModified || null,
          })
          .onConflictDoUpdate({
            target: schema.feedCache.feedId,
            set: {
              etag: cacheData.etag || null,
              lastModified: cacheData.lastModified || null,
              updatedAt: sql`(strftime('%s', 'now') * 1000)`,
            },
          });
      }
    }
  }
  console.log('  ✅ Feed cache migrated');
}

async function migrateFeedStats(db: ReturnType<typeof getDb>) {
  console.log('📊 Migrating feed stats...');
  const stats = readJsonFile(JSON_FILES.feedStats);
  if (!stats) {
    console.log('  ⏭️  No feed stats to migrate');
    return;
  }

  for (const [feedName, data] of Object.entries(stats)) {
    if (feedName === 'totals') continue;

    const feed = await db
      .select()
      .from(schema.feeds)
      .where(eq(schema.feeds.name, feedName))
      .limit(1);

    if (feed.length > 0 && data && typeof data === 'object') {
      const s = data as any;
      const latencies = s.latencies || [];

      await db
        .insert(schema.feedStats)
        .values({
          feedId: feed[0].id,
          name: feedName,
          lastFetch: s.lastFetch || null,
          lastSuccess: s.lastSuccess || null,
          lastStatus: s.lastStatus || null,
          lastError: s.lastError || null,
          successfulFetches: s.successfulFetches || 0,
          failedFetches: s.failedFetches || 0,
          itemsFetched: s.itemsFetched || 0,
          itemsNew: s.itemsNew || 0,
          itemsDuplicate: s.itemsDuplicate || 0,
          etagHits: s.etagHits || 0,
          latencies: JSON.stringify(latencies),
          updatedAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: schema.feedStats.feedId,
          set: {
            lastFetch: s.lastFetch || null,
            lastSuccess: s.lastSuccess || null,
            lastStatus: s.lastStatus || null,
            lastError: s.lastError || null,
            successfulFetches: s.successfulFetches || 0,
            failedFetches: s.failedFetches || 0,
            itemsFetched: s.itemsFetched || 0,
            itemsNew: s.itemsNew || 0,
            itemsDuplicate: s.itemsDuplicate || 0,
            etagHits: s.etagHits || 0,
            latencies: JSON.stringify(latencies),
            updatedAt: Date.now(),
          },
        });
    }
  }
  console.log('  ✅ Feed stats migrated');
}

async function migrateGlobalStats(db: ReturnType<typeof getDb>) {
  console.log('🌍 Migrating global stats...');
  const stats = readJsonFile(JSON_FILES.feedStats);
  if (!stats?.totals) {
    console.log('  ⏭️  No global stats to migrate');
    return;
  }

  const totals = stats.totals;
  let lastFullFetch = totals.lastFullFetch;
  if (lastFullFetch && typeof lastFullFetch === 'number') {
    lastFullFetch = new Date(lastFullFetch);
  }

  await db
    .update(schema.globalStats)
    .set({
      totalFetches: totals.totalFetches || 0,
      totalItems: totals.totalItems || 0,
      totalErrors: totals.totalErrors || 0,
      lastFullFetch,
      updatedAt: new Date(),
    })
    .where(eq(schema.globalStats.id, 'global'));

  console.log('  ✅ Global stats migrated');
}

async function migrateProfile(db: ReturnType<typeof getDb>) {
  console.log('🎯 Migrating user profile...');
  const profile = readJsonFile(JSON_FILES.profile);

  await db
    .update(schema.userProfiles)
    .set({
      keywords: JSON.stringify(profile?.keywords || []),
      topics: JSON.stringify(profile?.topics || []),
      preferredSources: JSON.stringify(profile?.preferredSources || []),
      excludedKeywords: JSON.stringify(profile?.excludedKeywords || []),
      updatedAt: new Date(),
    })
    .where(eq(schema.userProfiles.id, 'default'));

  console.log('  ✅ User profile migrated');
}

async function migrateBookmarks(db: ReturnType<typeof getDb>) {
  console.log('🔖 Migrating bookmarks...');
  const bookmarks = readJsonFile(JSON_FILES.bookmarks);
  if (!bookmarks || !bookmarks.length) {
    console.log('  ⏭️  No bookmarks to migrate');
    return;
  }

  let inserted = 0;
  for (const bm of bookmarks) {
    const existing = await db
      .select()
      .from(schema.bookmarks)
      .where(eq(schema.bookmarks.newsId, bm.newsId))
      .limit(1);

    if (existing.length === 0) {
      const bookmarkedAt = bm.bookmarkedAt ? new Date(bm.bookmarkedAt) : new Date();
      await db.insert(schema.bookmarks).values({
        id: bm.id || generateId(),
        newsId: bm.newsId,
        title: bm.title,
        link: bm.link,
        source: bm.source,
        bookmarkedAt,
      });
      inserted++;
    }
  }
  console.log(`  ✅ Inserted ${inserted} new bookmarks`);
}

async function migrateNewsletterHistory(db: ReturnType<typeof getDb>) {
  console.log('📰 Migrating newsletter history...');
  const history = readJsonFile(JSON_FILES.newsletterHistory);
  if (!history || !history.length) {
    console.log('  ⏭️  No newsletter history to migrate');
    return;
  }

  let inserted = 0;
  for (const entry of history) {
    const existing = await db
      .select()
      .from(schema.newsletterHistory)
      .where(eq(schema.newsletterHistory.id, entry.id))
      .limit(1);

    if (existing.length === 0) {
      const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
      await db.insert(schema.newsletterHistory).values({
        id: entry.id || generateId(),
        timestamp,
        success: entry.success || false,
        itemCount: entry.itemCount || 0,
        error: entry.error || null,
        contentPreview: entry.contentPreview || '',
      });
      inserted++;
    }
  }
  console.log(`  ✅ Inserted ${inserted} newsletter history entries`);
}

async function migrateTelegramQueue(db: ReturnType<typeof getDb>) {
  console.log('📱 Migrating Telegram queue...');
  const queue = readJsonFile(JSON_FILES.telegramQueue);
  if (!queue || !queue.length) {
    console.log('  ⏭️  No Telegram queue to migrate');
    return;
  }

  let inserted = 0;
  for (const msg of queue) {
    const existing = await db
      .select()
      .from(schema.telegramQueue)
      .where(eq(schema.telegramQueue.id, msg.id))
      .limit(1);

    if (existing.length === 0) {
      const scheduledAt = msg.scheduledAt ? new Date(msg.scheduledAt) : new Date();
      const createdAt = msg.createdAt ? new Date(msg.createdAt) : new Date();
      const sentAt = msg.sentAt ? new Date(msg.sentAt) : null;

      await db.insert(schema.telegramQueue).values({
        id: msg.id,
        text: msg.text,
        parseMode: msg.parseMode || 'Markdown',
        scheduledAt,
        status: msg.status || 'pending',
        retryCount: msg.retryCount || 0,
        lastError: msg.lastError || null,
        options: msg.options ? JSON.stringify(msg.options) : null,
        createdAt,
        sentAt,
      });
      inserted++;
    }
  }
  console.log(`  ✅ Inserted ${inserted} Telegram queue messages`);
}

async function migrateTemplates(db: ReturnType<typeof getDb>) {
  console.log('📋 Migrating templates...');
  const templates = readJsonFile(JSON_FILES.templates);
  if (!templates) {
    console.log('  ⏭️  No custom templates to migrate');
    return;
  }

  const userTemplates = templates.templates || [];
  let inserted = 0;

  for (const tmpl of userTemplates) {
    const existing = await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, tmpl.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.templates).values({
        id: tmpl.id,
        name: tmpl.name,
        type: tmpl.type,
        systemPrompt: tmpl.systemPrompt,
        variables: JSON.stringify(tmpl.variables || []),
        isBuiltin: false,
      });
      inserted++;
    }
  }

  // Migrate default template IDs if present
  if (templates.defaultTemplateIds) {
    // These are handled by the template repository defaults
    console.log('  ℹ️  Default template IDs noted (handled by repository defaults)');
  }

  console.log(`  ✅ Inserted ${inserted} custom templates`);
}

async function main() {
  console.log('🚀 Starting JSON → SQLite migration\n');

  const db = getDb();

  try {
    await migrateFeeds(db);
    await migrateNews(db);
    await migrateNewsHashes(db);
    await migrateFeedCache(db);
    await migrateFeedStats(db);
    await migrateGlobalStats(db);
    await migrateProfile(db);
    await migrateBookmarks(db);
    await migrateNewsletterHistory(db);
    await migrateTelegramQueue(db);
    await migrateTemplates(db);

    console.log('\n✅ Migration complete!');

    // Verify counts
    const counts = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(schema.feeds),
      db.select({ count: sql<number>`count(*)` }).from(schema.newsItems),
      db.select({ count: sql<number>`count(*)` }).from(schema.newsHashes),
      db.select({ count: sql<number>`count(*)` }).from(schema.feedCache),
      db.select({ count: sql<number>`count(*)` }).from(schema.feedStats),
      db.select({ count: sql<number>`count(*)` }).from(schema.bookmarks),
      db.select({ count: sql<number>`count(*)` }).from(schema.newsletterHistory),
      db.select({ count: sql<number>`count(*)` }).from(schema.telegramQueue),
      db.select({ count: sql<number>`count(*)` }).from(schema.templates),
    ]);

    console.log('\n📊 Database summary:');
    console.log(`  Feeds: ${counts[0][0].count}`);
    console.log(`  News items: ${counts[1][0].count}`);
    console.log(`  News hashes: ${counts[2][0].count}`);
    console.log(`  Feed cache entries: ${counts[3][0].count}`);
    console.log(`  Feed stats: ${counts[4][0].count}`);
    console.log(`  Bookmarks: ${counts[5][0].count}`);
    console.log(`  Newsletter history: ${counts[6][0].count}`);
    console.log(`  Telegram queue: ${counts[7][0].count}`);
    console.log(`  Templates: ${counts[8][0].count}`);
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  }
}

main();
