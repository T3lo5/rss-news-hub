import { RSS_FEEDS } from '../server.config.js';
import { feedRepository } from '../src/db/repositories/index.js';

/** Ids dos feeds padrão — a semente de `RSS_FEEDS`. */
export const DEFAULT_FEED_IDS = RSS_FEEDS.map((feed, index) => feed.id || `feed-${index}`);

/**
 * Instalação limpa: `RSS_FEEDS` é só a semente. Materializa os feeds padrão em
 * `feeds` antes de qualquer escrita que os referencie — `feed_caches`,
 * `feed_stats` e `news_items.feed_id` têm FK para `feeds.id`, então a coleta
 * morria com "FOREIGN KEY constraint failed" num banco vazio.
 *
 * Não faz nada quando já existe qualquer feed: uma lista personalizada (mesmo
 * que vazia de propósito, via UI) não é re-semeada em runtime.
 */
export async function ensureDefaultFeeds() {
  const existing = await feedRepository.findAll();
  if (existing.length > 0) return existing;

  await feedRepository.ensureMany(
    RSS_FEEDS.map((feed, index) => ({
      id: feed.id || `feed-${index}`,
      name: feed.name,
      url: feed.url,
      enabled: feed.enabled !== false,
      category: feed.category || 'General',
    }))
  );

  return feedRepository.findAll();
}

export async function readFeedsConfig() {
  const feeds = await feedRepository.findAll();
  if (feeds.length > 0) {
    return feeds.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      enabled: f.enabled,
      category: f.category,
    }));
  }

  // Fallback to initial config if database is empty
  return RSS_FEEDS.map((feed, index) => ({
    id: feed.id || `feed-${index}`,
    name: feed.name,
    url: feed.url,
    enabled: feed.enabled !== false,
    category: feed.category || 'General',
  }));
}

/**
 * Escopo de leitura por papel. O admin enxerga o catálogo inteiro; qualquer
 * outra conta enxerga apenas os feeds padrão (a semente de `RSS_FEEDS`), nunca
 * os feeds que outro usuário adicionou.
 *
 * Só para leitura via HTTP. Os jobs internos (fetch/ingest/scheduler) devem
 * continuar chamando `readFeedsConfig()`, que devolve tudo: a coleta precisa de
 * todos os feeds, não da visão de um usuário.
 */
export async function readVisibleFeedsConfig(user) {
  const feeds = await readFeedsConfig();
  if (!user || user.role === 'admin') return feeds;
  return feeds.filter((feed) => DEFAULT_FEED_IDS.includes(feed.id));
}

export async function writeFeedsConfig(feeds) {
  const db = await import('../src/db/repositories/index.js').then((m) => m.feedRepository);

  // Get existing feed IDs from database
  const existingFeeds = await db.findAll();
  const existingIds = new Set(existingFeeds.map((f) => f.id));
  const providedIds = new Set(feeds.map((f) => f.id));

  // Delete feeds that are no longer in the provided list
  for (const existingId of existingIds) {
    if (!providedIds.has(existingId)) {
      await db.delete(existingId);
    }
  }

  // Create or update feeds from the provided list
  for (const feed of feeds) {
    const existing = await db.findById(feed.id);
    if (existing) {
      await db.update(feed.id, {
        name: feed.name,
        url: feed.url,
        enabled: feed.enabled,
        category: feed.category,
      });
    } else {
      await db.create({
        id: feed.id,
        name: feed.name,
        url: feed.url,
        enabled: feed.enabled !== false,
        category: feed.category || 'General',
      });
    }
  }
}

export function generateFeedId(name, existingIds = []) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let id = base;
  let counter = 1;

  while (existingIds.includes(id)) {
    counter++;
    id = `${base}-${counter}`;
  }

  return id;
}

export function validateFeedUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function __resetFeedsConfig() {
  // No-op
}
