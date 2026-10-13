import { desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class NewsletterHistoryRepository {
  private get db() {
    return getDb();
  }

  async findAll(limit: number = 50): Promise<schema.NewsletterHistory[]> {
    return this.db
      .select()
      .from(schema.newsletterHistory)
      .orderBy(desc(schema.newsletterHistory.timestamp))
      .limit(limit);
  }

  async add(entry: schema.NewNewsletterHistory): Promise<schema.NewsletterHistory> {
    const result = await this.db.insert(schema.newsletterHistory).values(entry).returning();
    return result[0];
  }

  async count(): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.newsletterHistory);
    return result[0]?.count ?? 0;
  }
}

export const newsletterHistoryRepository = new NewsletterHistoryRepository();
