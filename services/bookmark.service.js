import { bookmarkRepository } from '../src/db/repositories/index.js';

export async function readBookmarks() {
  return bookmarkRepository.findAll();
}

export async function addBookmark(newsItem) {
  return bookmarkRepository.add({
    id: newsItem.id, // Use news ID as bookmark ID
    newsId: newsItem.id,
    title: newsItem.title,
    link: newsItem.link,
    source: newsItem.source,
    bookmarkedAt: Date.now(),
  });
}

export async function removeBookmark(newsId) {
  return bookmarkRepository.remove(newsId);
}

export async function isBookmarked(newsId) {
  const bookmark = await bookmarkRepository.findByNewsId(newsId);
  return Boolean(bookmark);
}

export async function getBookmarkedNewsIds() {
  return bookmarkRepository.getBookmarkedNewsIds();
}
