import { asc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class FeedRepository {
  private get db() {
    return getDb();
  }

  async findAll(): Promise<schema.Feed[]> {
    return this.db.select().from(schema.feeds).orderBy(asc(schema.feeds.name));
  }

  async findEnabled(): Promise<schema.Feed[]> {
    return this.db
      .select()
      .from(schema.feeds)
      .where(eq(schema.feeds.enabled, true))
      .orderBy(asc(schema.feeds.name));
  }

  async findById(id: string): Promise<schema.Feed | undefined> {
    const result = await this.db
      .select()
      .from(schema.feeds)
      .where(eq(schema.feeds.id, id))
      .limit(1);
    return result[0];
  }

  async findByUrl(url: string): Promise<schema.Feed | undefined> {
    const result = await this.db
      .select()
      .from(schema.feeds)
      .where(eq(schema.feeds.url, url))
      .limit(1);
    return result[0];
  }

  async create(feed: schema.NewFeed): Promise<schema.Feed> {
    const result = await this.db.insert(schema.feeds).values(feed).returning();
    return result[0];
  }

  async update(id: string, updates: Partial<schema.NewFeed>): Promise<schema.Feed | undefined> {
    const result = await this.db
      .update(schema.feeds)
      .set({ ...updates, updatedAt: sql`(strftime('%s', 'now') * 1000)` })
      .where(eq(schema.feeds.id, id))
      .returning();
    return result[0];
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.feeds).where(eq(schema.feeds.id, id));
    return result.changes > 0;
  }

  async updateCacheFields(
    id: string,
    etag: string | null,
    lastModified: string | null
  ): Promise<void> {
    await this.db
      .update(schema.feeds)
      .set({
        etag,
        lastModified,
        updatedAt: sql`(strftime('%s', 'now') * 1000)`,
      })
      .where(eq(schema.feeds.id, id));
  }

  async getCacheFields(
    id: string
  ): Promise<{ etag: string | null; lastModified: string | null } | undefined> {
    const result = await this.db
      .select({ etag: schema.feeds.etag, lastModified: schema.feeds.lastModified })
      .from(schema.feeds)
      .where(eq(schema.feeds.id, id))
      .limit(1);
    return result[0];
  }
}

export const feedRepository = new FeedRepository();
