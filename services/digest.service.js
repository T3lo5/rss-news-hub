import { eq } from 'drizzle-orm';
import { email as emailConfig } from '../server.config.js';
import { getDb, schema } from '../src/db/index.js';
import { newsRepository } from '../src/db/repositories/index.js';
import { chat, pickProvider } from './ai.service.js';
import { ensureSourceAttribution, sourceLabels } from './attribution.js';
import { getNextCronRun, isValidCron } from './cron.js';
import { isEmailConfigured, sendEmail } from './email.service.js';
import { renderEmailHtml } from './markdown.js';
import { readProfile, scoreNewItems } from './relevance.service.js';
import { queueTelegramMessage, telegramSend } from './telegram.service.js';
import { readUserArea, resolveTelegramConfig } from './user-config.service.js';

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

// ─── Missed Digest (per-user "You missed?" daily notification) ───────────────

const DEFAULT_MISSED_DIGEST_CONFIG = {
  enabled: false,
  time: '08:00', // HH:mm
  minScore: 70,
  maxItems: 5,
  lookbackDays: 2,
};

// Store per-user missed digest jobs: userId -> { timer, nextRun, config }
const missedDigestJobs = new Map();

export function getDefaultMissedDigestConfig() {
  return { ...DEFAULT_MISSED_DIGEST_CONFIG };
}

/**
 * Build a simple "You missed?" message in Telegram Markdown format
 * No AI needed - just format the items directly
 */
function buildMissedDigestMessage(items, language, date) {
  const dateStr = new Date(date).toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let msg = `📰 *Você perdeu?* (${dateStr})\n\n`;

  for (const [index, item] of items.entries()) {
    msg += `${index + 1}. *${item.title}* (${item.relevanceScore}/100)\n`;
    msg += `${item.source} — ${item.link}\n\n`;
  }

  msg += `_Responda STOP para desativar._`;

  return msg;
}

/**
 * Generate and queue a missed digest for a specific user
 */
export async function generateAndQueueMissedDigest(userId, date = Date.now()) {
  try {
    // Get user's missed digest config
    const userConfig = await readUserArea(userId, 'digest');
    const missedConfig = userConfig.missedDigest || {};

    if (!missedConfig.enabled) {
      return { success: false, itemsCount: 0, error: 'Missed digest not enabled for user' };
    }

    const config = { ...DEFAULT_MISSED_DIGEST_CONFIG, ...missedConfig };

    // Resolve user's telegram config
    const telegramConfig = await resolveTelegramConfig(userId);

    if (!(telegramConfig.botToken && telegramConfig.chatId)) {
      return { success: false, itemsCount: 0, error: 'User has no Telegram configured' };
    }

    // Find unread high-relevance items for this user
    const items = await newsRepository.findUnreadByRelevance({
      userId,
      minScore: config.minScore,
      maxItems: config.maxItems,
      lookbackDays: config.lookbackDays,
    });

    if (items.length === 0) {
      return { success: true, itemsCount: 0, content: 'No qualifying unread items' };
    }

    // Build message (no AI, just template)
    const message = buildMissedDigestMessage(items, config.language || 'pt', date);

    // Queue for sending (uses existing telegram queue)
    await queueTelegramMessage({
      text: message,
      parseMode: 'Markdown',
      userId,
      scheduledAt: new Date(),
    });

    return { success: true, itemsCount: items.length, content: message };
  } catch (err) {
    console.error(`[missed-digest] Failed for user ${userId}:`, err);
    return {
      success: false,
      itemsCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Start/refresh missed digest job for a specific user
 */
export function startMissedDigestJob(userId) {
  stopMissedDigestJob(userId);

  readUserArea(userId, 'digest')
    .then((userConfig) => {
      const missedConfig = userConfig.missedDigest || {};
      if (!missedConfig.enabled) return;

      const config = { ...DEFAULT_MISSED_DIGEST_CONFIG, ...missedConfig };

      // Parse time (HH:mm) to cron expression: "minute hour * * *"
      const [hour, minute] = config.time.split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) {
        console.warn(`[missed-digest] Invalid time "${config.time}" for user ${userId}`);
        return;
      }

      const cronExpr = `${minute} ${hour} * * *`;

      if (!isValidCron(cronExpr)) {
        console.warn(`[missed-digest] Invalid cron "${cronExpr}" for user ${userId}`);
        return;
      }

      const runMissedDigest = async () => {
        console.log(`[missed-digest] Running for user ${userId}`);
        await generateAndQueueMissedDigest(userId);
        scheduleMissedDigestNext(userId, cronExpr);
      };

      const job = { cron: cronExpr, run: runMissedDigest };
      missedDigestJobs.set(userId, job);
      scheduleMissedDigestNext(userId, cronExpr);
      console.log(
        `[missed-digest] Scheduled for user ${userId} at ${config.time} (cron: ${cronExpr})`
      );
    })
    .catch((err) => {
      console.error(`[missed-digest] Failed to start for user ${userId}:`, err);
    });
}

function scheduleMissedDigestNext(userId, cron) {
  const job = missedDigestJobs.get(userId);
  if (!job) return;

  const nextRun = getNextCronRun(cron);
  const delay = Math.max(0, nextRun - Date.now());

  if (job.timer) {
    clearTimeout(job.timer);
  }

  job.nextRun = nextRun;
  job.timer = setTimeout(() => {
    if (missedDigestJobs.has(userId)) {
      job.run();
    }
  }, delay);
  job.timer.unref?.();
}

/**
 * Stop missed digest job for a specific user
 */
export function stopMissedDigestJob(userId) {
  const job = missedDigestJobs.get(userId);
  if (job?.timer) {
    clearTimeout(job.timer);
  }
  missedDigestJobs.delete(userId);
}

/**
 * Get status of missed digest jobs (for admin UI)
 */
export function getMissedDigestStatus() {
  const status = {};
  for (const [userId, job] of missedDigestJobs.entries()) {
    status[userId] = {
      cron: job.cron,
      nextRun: job.nextRun,
    };
  }
  return status;
}

/**
 * Start missed digest jobs for ALL users who have it enabled
 * Called at boot time
 */
export async function startAllMissedDigestJobs() {
  try {
    const db = getDb();
    const usersWithDigest = await db
      .select({ userId: schema.userSettings.userId })
      .from(schema.userSettings)
      .where(eq(schema.userSettings.area, 'digest'));

    const uniqueUserIds = [...new Set(usersWithDigest.map((r) => r.userId))];

    for (const userId of uniqueUserIds) {
      // Check if this user has missedDigest enabled
      const userConfig = await readUserArea(userId, 'digest');
      if (userConfig.missedDigest?.enabled) {
        startMissedDigestJob(userId);
      }
    }
    console.log(`[missed-digest] Started jobs for ${uniqueUserIds.length} users`);
  } catch (err) {
    console.error('[missed-digest] Failed to start all jobs:', err);
  }
}

/**
 * Refresh missed digest job for a user (called when settings change)
 */
export async function refreshMissedDigestJob(userId) {
  const userConfig = await readUserArea(userId, 'digest');
  if (userConfig.missedDigest?.enabled) {
    startMissedDigestJob(userId);
  } else {
    stopMissedDigestJob(userId);
  }
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

    const generated = await chat(systemPrompt, userContent, provider);
    // Enforce attribution: the prompt asks for links but the model decides.
    const content = ensureSourceAttribution(
      generated,
      filteredItems,
      sourceLabels(config.language)
    );
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
    const generated = await chat(systemPrompt, userContent, provider);
    // Preview must look like what will be sent.
    content = ensureSourceAttribution(
      generated,
      filteredItems,
      sourceLabels(effectiveConfig.language)
    );
  }

  return {
    items: filteredItems,
    content,
  };
}
