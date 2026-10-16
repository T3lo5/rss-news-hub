import { newsRepository } from '../src/db/repositories/index.js';
import { chat, pickProvider } from './ai.service.js';
import { readProfile, scoreNewItems } from './relevance.service.js';
import { telegramSend } from './telegram.service.js';

const DEFAULT_DIGEST_CONFIG = {
  enabled: false,
  cron: '0 8 * * 1',
  lookbackDays: 7,
  minRelevanceScore: 70,
  maxItems: 10,
  provider: 'auto',
  format: 'thread',
  language: 'en',
};

let digestConfig = { ...DEFAULT_DIGEST_CONFIG };
let digestJob = null;

export function getDigestConfig() {
  return { ...digestConfig };
}

export function updateDigestConfig(updates) {
  digestConfig = { ...digestConfig, ...updates };
  if (digestConfig.enabled) {
    startDigestJob();
  } else {
    stopDigestJob();
  }
  return digestConfig;
}

export function startDigestJob() {
  if (digestJob) return;

  const runDigest = async () => {
    try {
      console.log('[digest] Starting scheduled digest generation...');
      await generateAndSendDigest();
      console.log('[digest] Digest generation completed');
    } catch (err) {
      console.error('[digest] Failed to generate digest:', err);
    }
  };

  // Run immediately on start
  runDigest();

  // Parse cron and schedule (simplified: just use interval for now)
  // In production, use a proper cron parser like node-cron
  const intervalMs = parseCronToInterval(digestConfig.cron);
  if (intervalMs > 0) {
    digestJob = setInterval(runDigest, intervalMs);
    console.log(`[digest] Scheduled with interval ${intervalMs}ms (cron: ${digestConfig.cron})`);
  }
}

export function stopDigestJob() {
  if (digestJob) {
    clearInterval(digestJob);
    digestJob = null;
    console.log('[digest] Stopped');
  }
}

function parseCronToInterval(cron) {
  // Simple cron parser for common patterns
  // "0 8 * * 1" = every Monday at 8:00
  // "0 * * * *" = every hour
  // "0 0 * * *" = daily at midnight

  const parts = cron.split(' ');
  if (parts.length !== 5) return 0;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily at specific time
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 24 * 60 * 60 * 1000; // 24 hours
  }

  // Weekly on specific day
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    return 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  // Hourly
  if (minute !== '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 60 * 60 * 1000; // 1 hour
  }

  // Every minute (for testing)
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 60 * 1000; // 1 minute
  }

  return 0;
}

function buildDigestPrompt(config, items) {
  const lang = config.language === 'pt' ? 'Português' : 'English';
  const format = config.format;

  const _itemsText = items
    .map(
      (item, i) =>
        `${i + 1}. [${item.relevanceScore}/100] ${item.title} (${item.source}) - ${item.link}`
    )
    .join('\n');

  if (format === 'thread') {
    return `Create an engaging Twitter/X thread in ${lang} summarizing the top ${items.length} most relevant tech articles. Each tweet should be concise and engaging. Include the article links. Use emojis and hashtags appropriately. Start with a hook tweet.`;
  } else if (format === 'summary') {
    return `Create a concise summary in ${lang} of the top ${items.length} most relevant tech articles. Include key insights and links. Format as a clean list with bullet points.`;
  } else {
    return `Create a professional LinkedIn post in ${lang} highlighting the top ${items.length} most relevant tech articles. Professional tone, include key takeaways and links. Use relevant hashtags.`;
  }
}

function buildDigestUserContent(items) {
  return items
    .map(
      (item, i) =>
        `${i + 1}. Title: ${item.title}\nSource: ${item.source}\nScore: ${item.relevanceScore}/100\nLink: ${item.link}\nDescription: ${item.description?.slice(0, 300) || 'No description'}`
    )
    .join('\n\n');
}

export async function generateAndSendDigest(telegram, options = {}) {
  try {
    const config = getDigestConfig();
    if (!(config.enabled || options.force)) {
      return { success: false, itemsCount: 0, error: 'Digest not enabled' };
    }

    // Score new items first
    const profile = await readProfile();
    await scoreNewItems(profile);

    // Get top scored items from lookback period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.lookbackDays);

    // Get all items with relevance score above threshold, then filter by date and limit
    const allTopItems = await newsRepository.findTopRelevance(config.maxItems * 3);

    const filteredItems = allTopItems
      .filter((item) => {
        if (!item.relevanceScore || item.relevanceScore < config.minRelevanceScore) return false;
        if (item.pubDate < cutoffDate.getTime()) return false;
        return true;
      })
      .slice(0, config.maxItems);

    if (filteredItems.length === 0) {
      return {
        success: true,
        itemsCount: 0,
        content: 'No relevant articles found for this period',
      };
    }

    // Generate content using AI
    const provider = pickProvider(config.provider);
    if (!provider) {
      return { success: false, itemsCount: 0, error: 'No AI provider configured' };
    }

    const systemPrompt = buildDigestPrompt(config, filteredItems);
    const userContent = buildDigestUserContent(filteredItems);

    const content = await chat(systemPrompt, userContent, provider);

    // Send to Telegram if configured
    if (telegram?.botToken && telegram.chatId) {
      await telegramSend(content, 'Markdown', telegram);
    }

    return { success: true, itemsCount: filteredItems.length, content };
  } catch (err) {
    console.error('[digest] Generation failed:', err);
    return {
      success: false,
      itemsCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function generateDigestPreview(config) {
  const effectiveConfig = { ...getDigestConfig(), ...config };

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - effectiveConfig.lookbackDays);

  const allTopItems = await newsRepository.findTopRelevance(effectiveConfig.maxItems * 3);

  const filteredItems = allTopItems
    .filter((item) => {
      if (!item.relevanceScore || item.relevanceScore < effectiveConfig.minRelevanceScore)
        return false;
      if (item.pubDate < cutoffDate.getTime()) return false;
      return true;
    })
    .slice(0, effectiveConfig.maxItems);

  const provider = pickProvider(effectiveConfig.provider);
  let content;

  if (provider && filteredItems.length > 0) {
    const systemPrompt = buildDigestPrompt(effectiveConfig, filteredItems);
    const userContent = buildDigestUserContent(filteredItems);
    content = await chat(systemPrompt, userContent, provider);
  }

  return {
    items: filteredItems,
    content,
  };
}
