import type { Database } from 'better-sqlite3';
import { getDb } from '../index.js';

function getSqlite(): Database {
  const db = getDb();
  return db.$client;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string | null;
  source: string;
  link: string;
  pubDate: Date;
  relevanceScore: number;
  feedId: string | null;
  rank: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  minRelevanceScore?: number;
  feedId?: string;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export async function searchNews(options: SearchOptions): Promise<SearchResult[]> {
  const sqlite = getSqlite();
  const {
    query,
    limit = 20,
    offset = 0,
    minRelevanceScore,
    feedId,
    category,
    dateFrom,
    dateTo,
  } = options;

  const whereConditions = ['news_search MATCH ?'];
  const params: unknown[] = [query];

  if (feedId) {
    whereConditions.push('ni.feed_id = ?');
    params.push(feedId);
  }

  if (category) {
    whereConditions.push('f.category = ?');
    params.push(category);
  }

  if (minRelevanceScore !== undefined) {
    whereConditions.push('ni.relevance_score >= ?');
    params.push(minRelevanceScore);
  }

  if (dateFrom) {
    whereConditions.push('ni.pub_date >= ?');
    params.push(dateFrom.getTime());
  }

  if (dateTo) {
    whereConditions.push('ni.pub_date <= ?');
    params.push(dateTo.getTime());
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  const queryStr = `
    SELECT
      ni.id,
      ni.title,
      ni.content,
      ni.source,
      ni.link,
      ni.pub_date,
      ni.relevance_score,
      ni.feed_id,
      bm25(news_search) as rank
    FROM news_search
    JOIN news_items ni ON news_search.id = ni.id
    LEFT JOIN feeds f ON ni.feed_id = f.id
    ${whereClause}
    ORDER BY rank ASC
    LIMIT ? OFFSET ?
  `;

  params.push(limit, offset);

  const stmt = sqlite.prepare(queryStr);
  const rows = stmt.all(...params) as Array<{
    id: string;
    title: string;
    content: string | null;
    source: string;
    link: string;
    pub_date: number;
    relevance_score: number;
    feed_id: string | null;
    rank: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    source: row.source,
    link: row.link,
    pubDate: new Date(row.pub_date),
    relevanceScore: row.relevance_score,
    feedId: row.feed_id,
    rank: row.rank,
  }));
}

export async function searchNewsCount(
  options: Omit<SearchOptions, 'limit' | 'offset'>
): Promise<number> {
  const sqlite = getSqlite();
  const { query, minRelevanceScore, feedId, category, dateFrom, dateTo } = options;

  const whereConditions = ['news_search MATCH ?'];
  const params: unknown[] = [query];

  if (feedId) {
    whereConditions.push('ni.feed_id = ?');
    params.push(feedId);
  }

  if (category) {
    whereConditions.push('f.category = ?');
    params.push(category);
  }

  if (minRelevanceScore !== undefined) {
    whereConditions.push('ni.relevance_score >= ?');
    params.push(minRelevanceScore);
  }

  if (dateFrom) {
    whereConditions.push('ni.pub_date >= ?');
    params.push(dateFrom.getTime());
  }

  if (dateTo) {
    whereConditions.push('ni.pub_date <= ?');
    params.push(dateTo.getTime());
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  const queryStr = `
    SELECT COUNT(*) as count
    FROM news_search
    JOIN news_items ni ON news_search.id = ni.id
    LEFT JOIN feeds f ON ni.feed_id = f.id
    ${whereClause}
  `;

  const stmt = sqlite.prepare(queryStr);
  const result = stmt.get(...params) as { count: number } | undefined;

  return result?.count || 0;
}

export async function rebuildSearchIndex(): Promise<void> {
  const sqlite = getSqlite();

  // Delete all entries and re-insert
  sqlite.prepare('DELETE FROM news_search').run();
  sqlite
    .prepare(`
    INSERT INTO news_search(rowid, id, title, content, source)
    SELECT rowid, id, title, content, source FROM news_items
  `)
    .run();
}

export async function getSearchSuggestions(partialQuery: string, limit = 10): Promise<string[]> {
  const sqlite = getSqlite();

  const stmt = sqlite.prepare(`
    SELECT DISTINCT title
    FROM news_items
    WHERE title LIKE ?
    ORDER BY pub_date DESC
    LIMIT ?
  `);

  const rows = stmt.all(`%${partialQuery}%`, limit) as Array<{ title: string }>;

  return rows.map((row) => row.title);
}

export const searchRepository = {
  searchNews,
  searchNewsCount,
  rebuildSearchIndex,
  getSearchSuggestions,
};
