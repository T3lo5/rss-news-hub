import { api } from '../services/api';
import type { NewsletterConfig, NewsletterHistoryEntry } from '../types';

export async function fetchNewsletterConfig() {
  return api.getNewsletterConfig();
}

export async function updateNewsletterConfig(config: Partial<NewsletterConfig>) {
  return api.updateNewsletterConfig(config);
}

export async function triggerNewsletter() {
  return api.triggerNewsletter();
}

export async function fetchNewsletterHistory() {
  return api.getNewsletterHistory();
}
