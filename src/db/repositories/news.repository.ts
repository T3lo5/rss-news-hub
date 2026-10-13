import { desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class NewsRepository {
  private get db() {
    return getDb();
  }

  async findAll(limit?: number, offset?: number): Promise<schema.NewsItem[]> {
    let query = this.db.select().from(schema.newsItems).orderBy(desc(schema.newsItems.pubDate));

    if (limit) query = query.limit(limit) as typeof query;
    if (offset) query = query.offset(offset) as typeof query;

    return query;
  }

  async findById(id: string): Promise<schema.NewsItem | undefined> {
    const result = await this.db
      .select()
      .from(schema.newsItems)
      .where(eq(schema.newsItems.id, id))
      .limit(1);
    return result[0];
  }

  async findByIds(ids: string[]): Promise<schema.NewsItem[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(schema.newsItems).where(inArray(schema.newsItems.id, ids));
  }

  async findBySource(source: string, limit?: number): Promise<schema.NewsItem[]> {
    let query = this.db
      .select()
      .from(schema.newsItems)
      .where(eq(schema.newsItems.source, source))
      .orderBy(desc(schema.newsItems.pubDate));

    if (limit) query = query.limit(limit) as typeof query;
    return query;
  }

  async findUnscored(limit?: number): Promise<schema.NewsItem[]> {
    let query = this.db
      .select()
      .from(schema.newsItems)
      .where(isNull(schema.newsItems.relevanceScore))
      .orderBy(desc(schema.newsItems.pubDate));

    if (limit) query = query.limit(limit) as typeof query;
    return query;
  }

  async findTopRelevance(limit: number): Promise<schema.NewsItem[]> {
    return this.db
      .select()
      .from(schema.newsItems)
      .where(sql`${schema.newsItems.relevanceScore} IS NOT NULL`)
      .orderBy(desc(schema.newsItems.relevanceScore), desc(schema.newsItems.pubDate))
      .limit(limit);
  }

  async create(item: schema.NewNewsItem): Promise<schema.NewsItem> {
    const result = await this.db.insert(schema.newsItems).values(item).returning();
    return result[0];
  }

  async createMany(items: schema.NewNewsItem[]): Promise<schema.NewsItem[]> {
    if (items.length === 0) return [];
    return this.db.insert(schema.newsItems).values(items).returning();
  }

  async upsert(item: schema.NewNewsItem): Promise<schema.NewsItem> {
    const existing = await this.findById(item.id);
    if (existing) {
      const updated = await this.update(item.id, item);
      return updated!;
    }
    return this.create(item);
  }

  async upsertMany(items: schema.NewNewsItem[]): Promise<schema.NewsItem[]> {
    const results: schema.NewsItem[] = [];
    for (const item of items) {
      results.push(await this.upsert(item));
    }
    return results;
  }

  async update(
    id: string,
    updates: Partial<schema.NewNewsItem>
  ): Promise<schema.NewsItem | undefined> {
    const result = await this.db
      .update(schema.newsItems)
      .set({ ...updates, updatedAt: sql`(strftime('%s', 'now') * 1000)` })
      .where(eq(schema.newsItems.id, id))
      .returning();
    return result[0];
  }

  async updateRelevanceScores(
    updates: Array<{ id: string; relevanceScore: number }>
  ): Promise<void> {
    if (updates.length === 0) return;

    await this.db.transaction(async (tx) => {
      for (const { id, relevanceScore } of updates) {
        await tx
          .update(schema.newsItems)
          .set({ relevanceScore, updatedAt: sql`(strftime('%s', 'now') * 1000)` })
          .where(eq(schema.newsItems.id, id));
      }
    });
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.newsItems).where(eq(schema.newsItems.id, id));
    return result.changes > 0;
  }

  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.db
      .delete(schema.newsItems)
      .where(sql`${schema.newsItems.pubDate} < ${cutoffDate.getTime()}`);
    return result.changes;
  }

  async count(): Promise<number> {
    const result = await this.db.select({ count: sql<number>`count(*)` }).from(schema.newsItems);
    return result[0]?.count ?? 0;
  }

  async countBySource(): Promise<Record<string, number>> {
    const results = await this.db
      .select({
        source: schema.newsItems.source,
        count: sql<number>`count(*)`,
      })
      .from(schema.newsItems)
      .groupBy(schema.newsItems.source);

    return Object.fromEntries(results.map((r) => [r.source, r.count]));
  }
}

export const newsRepository = new NewsRepository();
