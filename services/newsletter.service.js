import { newsletterHistoryRepository, newsRepository } from '../src/db/repositories/index.js';
import { buildSystemPrompt, chat, pickProvider } from './ai.service.js';
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

function markdownToHtml(md) {
  return md
    .replace(/^# (.+)$/gm, '<h1 style="color:#1a1a2e;margin:24px 0 12px;font-size:24px;">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="color:#1a1a2e;margin:20px 0 10px;font-size:20px;">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="color:#1a1a2e;margin:16px 0 8px;font-size:18px;">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`(.+?)`/g,
      '<code style="background:#f0f0f0;padding:2px 4px;border-radius:3px;">$1</code>'
    )
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#2563eb;">$1</a>')
    .replace(/^- (.+)$/gm, '<li style="margin:8px 0;">$1</li>')
    .replace(/(<li.*>.*<\/li>)/s, '<ul style="margin:12px 0;padding-left:20px;">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.6;">')
    .replace(/^(.+)$/gm, '<p style="margin:12px 0;line-height:1.6;">$1</p>')
    .replace(/<p style="margin:12px 0;line-height:1.6;"><\/p>/g, '')
    .replace(/<p style="margin:12px 0;line-height:1.6;">(<h[1-3].*<\/h[1-3]>)<\/p>/g, '$1')
    .replace(/<p style="margin:12px 0;line-height:1.6;">(<ul.*<\/ul>)<\/p>/g, '$1');
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

export async function generateAndSendNewsletter(config, newsletterConfig) {
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

    if (
      config.telegramEnabled &&
      newsletterConfig.telegram?.botToken &&
      newsletterConfig.telegram?.chatId
    ) {
      const html = markdownToHtml(content);
      await telegramSend(html, 'HTML', newsletterConfig.telegram);
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
