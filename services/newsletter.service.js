import { newsletterHistoryRepository, newsRepository } from '../src/db/repositories/index.js';
import { buildSystemPrompt, chat, pickProvider } from './ai.service.js';
import { isEmailConfigured, sendEmail } from './email.service.js';
import { markdownToHtml, renderEmailHtml } from './markdown.js';
import { telegramSend } from './telegram.service.js';

function filterNewsByConfig(news, config) {
  const cutoff = Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000;
  let filtered = news.filter((n) => new Date(n.pubDate).getTime() >= cutoff);

  if (config.sources?.length) {
    filtered = filtered.filter((n) => config.sources.includes(n.source));
  }

  if (config.categories?.length) {
    filtered = filtered.filter((n) => config.categories.includes(n.category || 'General'));
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
    const filtered = filterNewsByConfig(news, config);

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
