import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class FeedCacheRepository {
  private get db() {
    return getDb();
  }

  async get(feedId: string): Promise<schema.FeedCache | undefined> {
    const result = await this.db
      .select()
      .from(schema.feedCache)
      .where(eq(schema.feedCache.feedId, feedId))
      .limit(1);
    return result[0];
  }

  async set(feedId: string, etag: string | null, lastModified: string | null): Promise<void> {
    const existing = await this.get(feedId);
    if (existing) {
      await this.db
        .update(schema.feedCache)
        .set({
          etag,
          lastModified,
          updatedAt: sql`(strftime('%s', 'now') * 1000)`,
        })
        .where(eq(schema.feedCache.feedId, feedId));
    } else {
      await this.db.insert(schema.feedCache).values({
        feedId,
        etag,
        lastModified,
      });
    }
  }

  async clear(feedId: string): Promise<void> {
    await this.db.delete(schema.feedCache).where(eq(schema.feedCache.feedId, feedId));
  }

  async clearAll(): Promise<void> {
    await this.db.delete(schema.feedCache);
  }
}

export const feedCacheRepository = new FeedCacheRepository();
