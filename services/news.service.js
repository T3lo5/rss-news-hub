import { newsReadRepository, newsRepository } from '../src/db/repositories/index.js';

/**
 * Notícias com o estado de leitura embutido (`readAt`).
 *
 * Sem `userId` devolve `readAt: null` em tudo — é o que consumidores internos
 * (digest, newsletter, bookmarks) esperam, já que leitura é um recorte da lista.
 */
export async function readNews(userId) {
  const [items, reads] = await Promise.all([
    newsRepository.findAll(),
    userId ? newsReadRepository.findAllForUser(userId) : Promise.resolve(new Map()),
  ]);

  if (!reads.size) return items.map((item) => ({ ...item, readAt: null }));

  return items.map((item) => ({ ...item, readAt: reads.get(item.id) ?? null }));
}

/** Página filtrada para a API: busca/filtros/ordenação rodam no SQLite. */
export async function readNewsPage(options) {
  return newsRepository.findPage(options);
}

export async function writeNews(items) {
  // This is kept for compatibility but now uses upsert
  await newsRepository.upsertMany(items);
}

export async function addNews(item) {
  return newsRepository.upsert(item);
}

/** Marca/desmarca uma notícia como lida para um usuário (idempotente). */
export async function setNewsRead(userId, newsId, read) {
  const existing = await newsRepository.findById(newsId);
  if (!existing) return null;

  const readAt = await newsReadRepository.setRead(userId, newsId, read);
  return { id: newsId, read, readAt };
}
