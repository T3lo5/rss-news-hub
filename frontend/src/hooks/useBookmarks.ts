import { api } from '../services/api';
import { isBackgroundSyncSupported, offlineQueue } from '../services/offlineQueue';
import { useOnlineStatus } from './useOnlineStatus';

export async function fetchBookmarks() {
  return api.getBookmarks();
}

export async function addBookmark(newsId: string) {
  const online = useOnlineStatus.getSnapshot?.() ?? true;
  if (!online && isBackgroundSyncSupported()) {
    return offlineQueue.bookmark.add(newsId);
  }
  return api.addBookmark(newsId);
}

export async function removeBookmark(newsId: string) {
  const online = useOnlineStatus.getSnapshot?.() ?? true;
  if (!online && isBackgroundSyncSupported()) {
    return offlineQueue.bookmark.remove(newsId);
  }
  return api.removeBookmark(newsId);
}
