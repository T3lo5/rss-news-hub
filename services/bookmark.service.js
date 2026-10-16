import { bookmarkRepository } from '../src/db/repositories/index.js';
import { randomBytes } from 'node:crypto';

function generateBookmarkId() {
  return randomBytes(16).toString('hex');
}

export async function readBookmarks(userId) {
  return bookmarkRepository.findAll(userId);
}

export async function addBookmark(userId, newsItem) {
  return bookmarkRepository.add(userId, {
    id: generateBookmarkId(),
    newsId: newsItem.id,
    title: newsItem.title,
    link: newsItem.link,
    source: newsItem.source,
    bookmarkedAt: new Date(),
  });
}

export async function removeBookmark(userId, newsId) {
  return bookmarkRepository.remove(userId, newsId);
}

export async function isBookmarked(userId, newsId) {
  const bookmark = await bookmarkRepository.findByNewsId(userId, newsId);
  return Boolean(bookmark);
}

export async function getBookmarkedNewsIds(userId) {
  return bookmarkRepository.getBookmarkedNewsIds(userId);
}
