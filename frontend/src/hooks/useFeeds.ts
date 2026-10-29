import { api } from '../services/api';
import type { FeedStat } from '../types';

export async function fetchFeeds() {
  const res = await api.getFeeds();
  return res;
}

export async function fetchFeedsHealth(): Promise<FeedStat[]> {
  try {
    const res = await api.getFeedHealth();
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

export async function addFeed(feed) {
  const res = await api.addFeed(feed);
  return res;
}

export async function updateFeed(id, updates) {
  const res = await api.updateFeed(id, updates);
  return res;
}

export async function deleteFeed(id) {
  const res = await api.deleteFeed(id);
  return res.data;
}

export async function testFeed(id) {
  const res = await api.testFeed(id);
  return res;
}

export async function reloadFeeds() {
  const res = await api.reloadFeeds();
  return res;
}

export async function toggleFeed(id: string, enabled: boolean) {
  const res = await api.updateFeed(id, { enabled });
  return res.data;
}
