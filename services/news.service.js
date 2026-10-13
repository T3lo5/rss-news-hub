import { newsRepository } from '../src/db/repositories/index.js';

export async function readNews() {
  return newsRepository.findAll();
}

export async function writeNews(items) {
  // This is kept for compatibility but now uses upsert
  await newsRepository.upsertMany(items);
}

export async function addNews(item) {
  return newsRepository.upsert(item);
}
