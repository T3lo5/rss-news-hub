import { api } from '../services/api';
import type { Bookmark } from '../types';

export async function fetchBookmarks() {
  return api.getBookmarks();
}

export async function addBookmark(newsId: string) {
  return api.addBookmark(newsId);
}

export async function removeBookmark(newsId: string) {
  return api.removeBookmark(newsId);
}
