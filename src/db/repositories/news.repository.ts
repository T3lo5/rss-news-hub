import { and, asc, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from '../index.js';
import { buildMatchQuery, searchNewsIds } from './search.repository.js';

export type NewsSortOrder = 'newest' | 'oldest' | 'relevance';
export type NewsReadFilter = 'all' | 'unread' | 'read';

/**
 * Shared guard for every pruning statement: a row that any user bookmarked is
 * never deleted, whatever its age or score. The table is referenced by name so
 * the subquery keeps resolving to `bookmarks` and not the outer `news_items`.
 */
function notBookmarked() {
  return sql`NOT EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks.news_id = ${schema.newsItems.id})`;
}

export interface NewsPageOptions {
  userId?: string;
  limit: number;
  offset: number;
  query?: string;
  source?: string;
  sort?: NewsSortOrder;
  /** Caller's read state, applied on top of `query`/`source`. */
  read?: NewsReadFilter;
}

export interface NewsPageResult {
  results: Array<schema.NewsItem & { readAt: Date | null }>;
  total: number;
  counts: { all: number; unread: number; read: number };
  /** All sources, so the filter dropdown stays stable across pages. */
  sources: string[];
}

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

  /**
   * Paginated list for `GET /api/news`.
   *
   * Search/filter/sort run in SQLite instead of loading the whole history into
   * the browser. `news_reads` is joined for the caller so every row carries
   * `readAt`, and the same filter set produces the counters in a single extra
   * query. `counts` ignores only the read filter (the toolbar shows all three
   * numbers), while `total` matches the requested read state.
   */
  async findPage(options: NewsPageOptions): Promise<NewsPageResult> {
    const { limit, offset, query, source, sort = 'newest', read = 'all' } = options;
    const userId = options.userId ?? '';

    const filters = [];
    const needle = query?.trim();
    if (needle) {
      const matchedIds = await searchNewsIds({ query: buildMatchQuery(needle) });
      if (matchedIds.length > 0) {
        // Índice FTS primeiro: cobre título, conteúdo e fonte, com stemming e
        // ranking. Ele só decide quem entra — a ordenação continua sendo a
        // pedida (data/relevância), porque é um feed de notícias.
        filters.push(inArray(schema.newsItems.id, matchedIds));
      } else {
        // Sem match no índice (consulta sem termos úteis, índice defasado ou
        // sintaxe FTS rejeitada): substring legada, igual ao filtro client-side
        // antigo. `instr` evita LIKE com curingas (`%`, `_`).
        filters.push(sql`(
          instr(lower(${schema.newsItems.title}), lower(${needle})) > 0 OR
          instr(lower(${schema.newsItems.source}), lower(${needle})) > 0 OR
          instr(lower(coalesce(${schema.newsItems.description}, '')), lower(${needle})) > 0
        )`);
      }
    }
    if (source) filters.push(eq(schema.newsItems.source, source));
    const baseWhere = filters.length ? and(...filters) : undefined;

    const readCondition =
      read === 'read'
        ? sql`${schema.newsReads.readAt} is not null`
        : read === 'unread'
          ? sql`${schema.newsReads.readAt} is null`
          : undefined;
    const where = readCondition
      ? baseWhere
        ? and(baseWhere, readCondition)
        : readCondition
      : baseWhere;

    const orderBy =
      sort === 'oldest'
        ? [asc(schema.newsItems.pubDate), asc(schema.newsItems.id)]
        : sort === 'relevance'
          ? [
              desc(sql`coalesce(${schema.newsItems.relevanceScore}, 0)`),
              desc(schema.newsItems.pubDate),
              desc(schema.newsItems.id),
            ]
          : [desc(schema.newsItems.pubDate), desc(schema.newsItems.id)];

    const readJoin = and(
      eq(schema.newsReads.newsId, schema.newsItems.id),
      eq(schema.newsReads.userId, userId)
    );

    const [results, countsRow, sourceRows] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(schema.newsItems),
          readAt: schema.newsReads.readAt,
        })
        .from(schema.newsItems)
        .leftJoin(schema.newsReads, readJoin)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({
          all: sql<number>`count(*)`,
          unread: sql<number>`coalesce(sum(case when ${schema.newsReads.readAt} is null then 1 else 0 end), 0)`,
          read: sql<number>`coalesce(sum(case when ${schema.newsReads.readAt} is not null then 1 else 0 end), 0)`,
        })
        .from(schema.newsItems)
        .leftJoin(schema.newsReads, readJoin)
        .where(baseWhere),
      this.db
        .selectDistinct({ source: schema.newsItems.source })
        .from(schema.newsItems)
        .orderBy(asc(schema.newsItems.source)),
    ]);

    const counts = {
      all: Number(countsRow[0]?.all ?? 0),
      unread: Number(countsRow[0]?.unread ?? 0),
      read: Number(countsRow[0]?.read ?? 0),
    };
    const total = read === 'unread' ? counts.unread : read === 'read' ? counts.read : counts.all;

    return {
      results: results.map((row) => ({ ...row, readAt: row.readAt ?? null })),
      total,
      counts,
      sources: sourceRows.map((row) => row.source),
    };
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
      // Never touch the relevance score on re-fetch: NULL means "unscored"
      // and must survive until scoreNewItems() assigns a real score.
      const { relevanceScore: _ignored, ...rest } = item;
      const updated = await this.update(item.id, rest);
      return updated!;
    }
    // New items start unscored (NULL). findUnscored() only matches NULL,
    // so an explicit NULL here is required regardless of the column default.
    return this.create({ relevanceScore: null, ...item });
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

    for (const { id, relevanceScore } of updates) {
      await this.db
        .update(schema.newsItems)
        .set({ relevanceScore, updatedAt: sql`(strftime('%s', 'now') * 1000)` })
        .where(eq(schema.newsItems.id, id));
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.delete(schema.newsItems).where(eq(schema.newsItems.id, id));
    return result.changes > 0;
  }

  async deleteByFeedId(feedId: string): Promise<number> {
    const result = await this.db
      .delete(schema.newsItems)
      .where(eq(schema.newsItems.feedId, feedId));
    return result.changes;
  }

  async deleteOlderThan(cutoffDate: Date): Promise<number> {
    const result = await this.db
      .delete(schema.newsItems)
      .where(and(sql`${schema.newsItems.pubDate} < ${cutoffDate.getTime()}`, notBookmarked()));
    return result.changes;
  }

  /**
   * Prunes the junk tier: items below `threshold` on the 0-100 relevance scale
   * (never-scored items included, treated as -1) that are also older than
   * `cutoffDate`. Bookmarked rows are left alone — a bookmark is an explicit
   * user choice and must outlive any cleanup heuristic.
   */
  async deleteLowRelevanceOlderThan(cutoffDate: Date, threshold: number): Promise<number> {
    const result = await this.db
      .delete(schema.newsItems)
      .where(
        and(
          sql`${schema.newsItems.pubDate} < ${cutoffDate.getTime()}`,
          sql`coalesce(${schema.newsItems.relevanceScore}, -1) < ${threshold}`,
          notBookmarked()
        )
      );
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
