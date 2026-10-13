import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class GlobalStatsRepository {
  private get db() {
    return getDb();
  }

  async get(): Promise<schema.GlobalStat> {
    const result = await this.db
      .select()
      .from(schema.globalStats)
      .where(eq(schema.globalStats.id, 'global'))
      .limit(1);

    if (result[0]) return result[0];

    // Create default if not exists - use onConflictDoNothing to avoid race conditions
    const inserted = await this.db
      .insert(schema.globalStats)
      .values({ id: 'global' })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) return inserted[0];

    // If insert failed due to race, fetch the existing row
    const existing = await this.db
      .select()
      .from(schema.globalStats)
      .where(eq(schema.globalStats.id, 'global'))
      .limit(1);
    return existing[0];
  }

  async incrementFetches(): Promise<void> {
    // Ensure global stats row exists
    await this.get();
    await this.db
      .update(schema.globalStats)
      .set({
        totalFetches: sql`${schema.globalStats.totalFetches} + 1`,
        updatedAt: sql`(strftime('%s', 'now') * 1000)`,
      })
      .where(eq(schema.globalStats.id, 'global'));
  }

  async recordFetchResult(total: number, errors: number): Promise<void> {
    // Ensure global stats row exists
    await this.get();
    await this.db
      .update(schema.globalStats)
      .set({
        totalItems: sql`${schema.globalStats.totalItems} + ${total}`,
        totalErrors: sql`${schema.globalStats.totalErrors} + ${errors}`,
        lastFullFetch: sql`(strftime('%s', 'now') * 1000)`,
        updatedAt: sql`(strftime('%s', 'now') * 1000)`,
      })
      .where(eq(schema.globalStats.id, 'global'));
  }

  async reset(): Promise<void> {
    await this.db
      .update(schema.globalStats)
      .set({
        totalFetches: 0,
        totalItems: 0,
        totalErrors: 0,
        lastFullFetch: null,
        updatedAt: sql`(strftime('%s', 'now') * 1000)`,
      })
      .where(eq(schema.globalStats.id, 'global'));
  }
}

export const globalStatsRepository = new GlobalStatsRepository();
