import { api } from '../services/api';

export async function fetchBookmarks() {
  return api.getBookmarks();
}

export async function addBookmark(newsId: string) {
  return api.addBookmark(newsId);
}

export async function removeBookmark(newsId: string) {
  return api.removeBookmark(newsId);
}
