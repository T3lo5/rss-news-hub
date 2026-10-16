import { email as emailConfig } from '../server.config.js';
import { newsRepository } from '../src/db/repositories/index.js';
import { chat, pickProvider } from './ai.service.js';
import { getNextCronRun, isValidCron } from './cron.js';
import { isEmailConfigured, sendEmail } from './email.service.js';
import { renderEmailHtml } from './markdown.js';
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
  emailEnabled: false,
};

let digestConfig = { ...DEFAULT_DIGEST_CONFIG };
let digestTimer = null;
let digestNextRun = null;

export function getDigestConfig() {
  return { ...digestConfig };
}

// Computed runtime state for the UI (not persisted).
export function getDigestStatus() {
  return {
    enabled: digestConfig.enabled,
    cron: digestConfig.cron,
    nextRun: digestNextRun,
  };
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

function scheduleNextDigest() {
  if (digestTimer) {
    clearTimeout(digestTimer);
    digestTimer = null;
  }
  if (!isValidCron(digestConfig.cron)) {
    digestNextRun = null;
    console.warn(`[digest] invalid cron "${digestConfig.cron}" - job not scheduled`);
    return;
  }
  // Recompute from the current config each time so edits take effect.
  digestNextRun = getNextCronRun(digestConfig.cron);
  const delay = Math.max(0, digestNextRun - Date.now());
  digestTimer = setTimeout(() => {
    runDigest().finally(() => {
      if (digestConfig.enabled) scheduleNextDigest();
    });
  }, delay);
  digestTimer.unref?.();
}

async function runDigest() {
  try {
    console.log('[digest] Starting scheduled digest generation...');
    await generateAndSendDigest();
    console.log('[digest] Digest generation completed');
  } catch (err) {
    console.error('[digest] Failed to generate digest:', err);
  }
}

export function startDigestJob() {
  if (digestTimer) {
    // Already running: just re-apply a possibly-changed cron.
    scheduleNextDigest();
    return;
  }

  if (!isValidCron(digestConfig.cron)) {
    digestNextRun = null;
    console.warn(`[digest] invalid cron "${digestConfig.cron}" - job not scheduled`);
    return;
  }

  // Run once on enable, then on the cron schedule.
  runDigest();
  scheduleNextDigest();
  console.log(`[digest] Scheduled (cron: ${digestConfig.cron})`);
}

export function stopDigestJob() {
  if (digestTimer) {
    clearTimeout(digestTimer);
    digestTimer = null;
    console.log('[digest] Stopped');
  }
  digestNextRun = null;
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

    // Mirror to email when enabled and SMTP is configured
    if (config.emailEnabled && isEmailConfigured(emailConfig)) {
      const locale = config.language === 'pt' ? 'pt-BR' : 'en-US';
      await sendEmail(
        {
          subject: `RSS News Hub — Digest ${new Date().toLocaleDateString(locale)}`,
          text: content,
          html: renderEmailHtml(content),
        },
        emailConfig
      );
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
