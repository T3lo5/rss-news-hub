import {
  feedRepository,
  newsletterHistoryRepository,
  newsRepository,
} from '../src/db/repositories/index.js';
import { buildSystemPrompt, chat, pickProvider } from './ai.service.js';
import { isEmailConfigured, sendEmail } from './email.service.js';
import { markdownToHtml, renderEmailHtml } from './markdown.js';
import { telegramSend } from './telegram.service.js';

// Exported for tests: this is the whole selection policy (filters, score gate,
// ranking order and cap), so it is worth asserting directly.
export function filterNewsByConfig(news, config) {
  const cutoff = Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000;
  let filtered = news.filter((n) => new Date(n.pubDate).getTime() >= cutoff);

  if (config.sources?.length) {
    filtered = filtered.filter((n) => config.sources.includes(n.source));
  }

  if (config.categories?.length) {
    // `category` lives on `feeds`, not `news_items`: reading `n.category` here
    // always yielded undefined and made every selection collapse to "General",
    // so picking any real category emptied the edition. The caller decorates
    // each item with `feedCategory` before filtering; items the caller did not
    // decorate keep the old "General" fallback.
    filtered = filtered.filter((n) => config.categories.includes(n.feedCategory || 'General'));
  }

  // Score gate. 0 keeps everything; items never scored count as -1 so an
  // unscored backlog cannot slip past a threshold the admin set on purpose.
  const minScore = Number(config.minRelevanceScore) || 0;
  if (minScore > 0) {
    filtered = filtered.filter((n) => Number(n.relevanceScore ?? -1) >= minScore);
  }

  // Best-ranked first, then newest. Ordering matters as soon as maxItems caps
  // the edition: the cap must trim the tail, not whatever sorted first.
  filtered.sort(
    (a, b) =>
      Number(b.relevanceScore ?? -1) - Number(a.relevanceScore ?? -1) ||
      new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
  );

  const maxItems = Number(config.maxItems);
  if (Number.isFinite(maxItems) && maxItems > 0) {
    filtered = filtered.slice(0, maxItems);
  }

  return filtered;
}

export async function readHistory(limit = 50) {
  return newsletterHistoryRepository.findAll(limit);
}

export async function addHistoryEntry(entry) {
  return newsletterHistoryRepository.add({
    id: entry.id || `nl-${Date.now()}`,
    timestamp: entry.timestamp,
    success: entry.success,
    itemCount: entry.itemCount,
    error: entry.error,
    contentPreview: entry.contentPreview,
  });
}

export async function generateAndSendNewsletter(config, delivery = {}) {
  const startTime = Date.now();
  const entry = {
    id: `nl-${startTime}`,
    timestamp: startTime,
    success: false,
    itemCount: 0,
    error: null,
    contentPreview: '',
  };

  try {
    const news = await newsRepository.findAll();
    // Category is a feed property; carry it onto the items so the filter below
    // can match a real selection instead of the "General" fallback.
    const categoryByFeed = new Map(
      (await feedRepository.findAll()).map((feed) => [feed.id, feed.category])
    );
    const enriched = news.map((item) => ({
      ...item,
      feedCategory: categoryByFeed.get(item.feedId) || null,
    }));
    const filtered = filterNewsByConfig(enriched, config);

    if (filtered.length === 0) {
      entry.error = 'No news items match filters';
      await addHistoryEntry(entry);
      return entry;
    }

    entry.itemCount = filtered.length;

    const systemPrompt = buildSystemPrompt('newsletter', config.language);
    const userContent = filtered
      .map(
        (n) =>
          `Title: ${n.title}\nSource: ${n.source}\nLink: ${n.link}\nDescription: ${n.description || n.content?.slice(0, 500)}`
      )
      .join('\n\n---\n\n');

    const provider = pickProvider(config.provider);
    if (!provider) {
      throw new Error('No AI provider configured');
    }

    const content = await chat(systemPrompt, userContent, config.provider);
    entry.contentPreview = content.slice(0, 200);

    if (config.telegramEnabled && delivery.telegram?.botToken && delivery.telegram?.chatId) {
      const html = markdownToHtml(content);
      await telegramSend(html, 'HTML', delivery.telegram);
    }

    if (config.emailEnabled && isEmailConfigured(delivery.email)) {
      const locale = config.language === 'pt' ? 'pt-BR' : 'en-US';
      await sendEmail(
        {
          subject: `RSS News Hub — Newsletter ${new Date().toLocaleDateString(locale)}`,
          text: content,
          html: renderEmailHtml(content),
        },
        delivery.email
      );
    }

    entry.success = true;
    await addHistoryEntry(entry);
    return entry;
  } catch (err) {
    entry.error = err instanceof Error ? err.message : String(err);
    await addHistoryEntry(entry);
    return entry;
  }
}

export function __setHistoryFile(path) {
  // for testing
}

export function __getHistoryFile() {
  return 'database';
}
