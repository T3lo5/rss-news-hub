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

  // `news_search` é um FTS5 de conteúdo externo (`content=news_items`):
  // DELETE não limpa o índice e re-inserir duplicaria entradas. O comando
  // 'rebuild' é a forma canônica — ele relê tudo da própria tabela de conteúdo.
  sqlite.prepare(`INSERT INTO news_search(news_search) VALUES('rebuild')`).run();
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

/** Quebra em termos e limpa pontuação que o FTS5 leria como operador. */
const TERM_SPLIT = /\s+/;
const NON_TERM_CHARS = /[^0-9a-zA-ZÀ-ÿ_*]/g;

/**
 * Monta uma expressão MATCH segura para o FTS5.
 *
 * Tudo vira um único bloco entre aspas com `*` no final: um termo é busca por
 * prefixo (`"vacina"*`), vários são frase com prefixo no último termo
 * (`"source b"*`). Frase é de propósito — é a leitura que o filtro legado de
 * substring já fazia ("source b" como unidade, não duas palavras soltas), com
 * o acréscimo de casar por prefixo. Como o texto é sempre entre aspas e a
 * pontuação é removida antes, nada do que o usuário digita é interpretado
 * como sintaxe do FTS5.
 */
export function buildMatchQuery(raw: string): string {
  const terms = raw
    .split(TERM_SPLIT)
    .map((term) => term.replace(NON_TERM_CHARS, ''))
    .filter((term) => term.length > 0);

  if (terms.length === 0) return '';
  return `"${terms.join(' ')}"*`;
}

/** Limite de ids devolvidos por consulta: a paginação final roda em news_items. */
const SEARCH_ID_LIMIT = 1500;

/**
 * Ids que casam com a expressão FTS, em ordem de relevância (bm25).
 *
 * É o caminho rápido do filtro de `q`: devolve só os ids e quem chama aplica
 * paginação/facetas no `news_items`. Consulta FTS malformada devolve lista
 * vazia em vez de estourar, para o chamador cair no filtro legado.
 */
export async function searchNewsIds(options: { query: string; limit?: number }): Promise<string[]> {
  const match = options.query.trim();
  if (!match) return [];

  const sqlite = getSqlite();
  const limit = options.limit ?? SEARCH_ID_LIMIT;

  try {
    const stmt = sqlite.prepare(`
      SELECT id
      FROM news_search
      WHERE news_search MATCH ?
      ORDER BY bm25(news_search)
      LIMIT ?
    `);
    const rows = stmt.all(match, limit) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

/** True quando a consulta tem ao menos um match no índice (para decidir fallback). */
export async function searchHasMatch(query: string): Promise<boolean> {
  const match = buildMatchQuery(query);
  if (!match) return false;
  return (await searchNewsIds({ query: match, limit: 1 })).length > 0;
}

/**
 * Reconcilia índice e tabela no boot.
 *
 * Contagem não serve aqui: como o FTS é de conteúdo externo, `count(*)` lê
 * através da `news_items`. O `integrity-check` (com o argumento 1) compara o
 * índice com o conteúdo e estoura quando estão dessincronizados — aí sim o
 * 'rebuild' reconstrói tudo de uma vez.
 *
 * Manter o índice em dia no dia a dia é trabalho dos triggers da migração
 * 0006 (INSERT/UPDATE/DELETE em `news_items`); isto cobre o estrago que já
 * estava no banco, como bases antigas ou um rebuild manual interrompido.
 */
export async function ensureSearchIndex(): Promise<void> {
  const sqlite = getSqlite();

  try {
    sqlite.prepare(`INSERT INTO news_search(news_search, rank) VALUES('integrity-check', 1)`).run();
  } catch {
    await rebuildSearchIndex();
  }
}

export const searchRepository = {
  searchNews,
  searchNewsCount,
  searchNewsIds,
  searchHasMatch,
  rebuildSearchIndex,
  getSearchSuggestions,
  ensureSearchIndex,
};
