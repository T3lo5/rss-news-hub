import { desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';

export class FeedStatsRepository {
  private get db() {
    return getDb();
  }

  async get(feedId: string): Promise<schema.FeedStat | undefined> {
    const result = await this.db
      .select()
      .from(schema.feedStats)
      .where(eq(schema.feedStats.feedId, feedId))
      .limit(1);
    return result[0];
  }

  async getAll(): Promise<schema.FeedStat[]> {
    return this.db.select().from(schema.feedStats).orderBy(desc(schema.feedStats.lastFetch));
  }

  async recordFetchStart(): Promise<void> {
    // Global stats handled by GlobalStatsRepository
  }

  async recordFeedResult(
    feedId: string,
    name: string,
    data: {
      success: boolean;
      items?: number;
      itemsNew?: number;
      itemsDuplicate?: number;
      etagHit?: boolean;
      error?: string | null;
      latencyMs?: number | null;
    }
  ): Promise<void> {
    const {
      success,
      items = 0,
      itemsNew = 0,
      itemsDuplicate = 0,
      etagHit = false,
      error = null,
      latencyMs = null,
    } = data;
    const now = new Date();

    const existing = await this.get(feedId);

    if (existing) {
      const latencies = JSON.parse(existing.latencies || '[]');
      if (latencyMs !== null) {
        latencies.push(latencyMs);
        if (latencies.length > 10) latencies.shift();
      }

      await this.db
        .update(schema.feedStats)
        .set({
          lastFetch: now,
          lastStatus: success ? 'ok' : 'error',
          lastError: error,
          successfulFetches: existing.successfulFetches + (success ? 1 : 0),
          failedFetches: existing.failedFetches + (success ? 0 : 1),
          itemsFetched: existing.itemsFetched + (success ? items : 0),
          itemsNew: existing.itemsNew + itemsNew,
          itemsDuplicate: existing.itemsDuplicate + itemsDuplicate,
          etagHits: existing.etagHits + (etagHit ? 1 : 0),
          latencies: JSON.stringify(latencies),
          lastSuccess: success ? now : existing.lastSuccess,
          updatedAt: now,
        })
        .where(eq(schema.feedStats.feedId, feedId));
    } else {
      const latencies = latencyMs !== null ? [latencyMs] : [];
      await this.db.insert(schema.feedStats).values({
        feedId,
        name,
        lastFetch: now,
        lastStatus: success ? 'ok' : 'error',
        lastError: error,
        successfulFetches: success ? 1 : 0,
        failedFetches: success ? 0 : 1,
        itemsFetched: success ? items : 0,
        itemsNew,
        itemsDuplicate,
        etagHits: etagHit ? 1 : 0,
        latencies: JSON.stringify(latencies),
        lastSuccess: success ? now : null,
        updatedAt: now,
      });
    }
  }

  async getHealthStatus(): Promise<
    Array<{
      feedId: string;
      name: string;
      totalFetches: number;
      successfulFetches: number;
      failedFetches: number;
      lastFetch: number | null;
      lastSuccess: number | null;
      lastError: string | null;
      avgLatencyMs: number;
      itemsFetched: number;
      itemsNew: number;
      itemsDuplicate: number;
      etagHits: number;
      successRate: number;
      status: 'healthy' | 'degraded' | 'failing' | 'unknown';
    }>
  > {
    const stats = await this.getAll();
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    return stats.map((feed) => {
      const totalFetches = feed.successfulFetches + feed.failedFetches;
      const successRate = totalFetches > 0 ? feed.successfulFetches / totalFetches : 0;
      const latencies = JSON.parse(feed.latencies || '[]');
      const avgLatencyMs =
        latencies.length > 0
          ? latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length
          : 0;

      let status: 'healthy' | 'degraded' | 'failing' | 'unknown';
      if (totalFetches === 0) {
        status = 'unknown';
      } else if (
        successRate >= 0.9 &&
        feed.lastSuccess &&
        now - feed.lastSuccess.getTime() < TWO_HOURS
      ) {
        status = 'healthy';
      } else if (
        successRate >= 0.5 ||
        (feed.lastSuccess && now - feed.lastSuccess.getTime() < TWENTY_FOUR_HOURS)
      ) {
        status = 'degraded';
      } else {
        status = 'failing';
      }

      return {
        feedId: feed.feedId,
        name: feed.name,
        totalFetches,
        successfulFetches: feed.successfulFetches,
        failedFetches: feed.failedFetches,
        lastFetch: feed.lastFetch?.getTime() ?? null,
        lastSuccess: feed.lastSuccess?.getTime() ?? null,
        lastError: feed.lastError,
        avgLatencyMs: Math.round(avgLatencyMs),
        itemsFetched: feed.itemsFetched,
        itemsNew: feed.itemsNew,
        itemsDuplicate: feed.itemsDuplicate,
        etagHits: feed.etagHits,
        successRate: Math.round(successRate * 100) / 100,
        status,
      };
    });
  }
}

export const feedStatsRepository = new FeedStatsRepository();
