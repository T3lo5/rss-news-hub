import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env file synchronously
function loadEnv() {
  const envPath = join(__dirname, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    }
  }
}

loadEnv();

// SenseNova is consumed through the OpenAI SDK (see services/ai.service.js),
// which appends /chat/completions to the base URL. Guarantee the /v1 prefix
// so a bare host in .env doesn't produce nginx 404s.
function ensureV1(value, fallback) {
  const normalized = (value || fallback).replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

const PORT = parseInt(process.env.PORT || '3000', 10);

const telegram = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || '',
};

const ai = {
  sensenova: {
    apiKey: process.env.SENSENOVA_API_KEY || '',
    // The OpenAI SDK appends /chat/completions itself, so the base URL must
    // already include /v1. Normalize to tolerate a bare host in .env.
    baseUrl: ensureV1(process.env.SENSENOVA_BASE_URL, 'https://token.sensenova.ai/v1'),
    model: process.env.SENSENOVA_MODEL || 'sensenova-6.8-flash-lite',
    sdk: 'openai',
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
};

const DATA_DIR = join(__dirname, 'data');
const NEWS_FILE = join(DATA_DIR, 'news.json');
const CACHE_FILE = join(DATA_DIR, 'fetch-cache.json');
const FEED_STATS_FILE = join(DATA_DIR, 'feed-stats.json');
const BOOKMARKS_FILE = join(DATA_DIR, 'bookmarks.json');
const PROFILE_FILE = join(DATA_DIR, 'profile.json');
const NEWSLETTER_HISTORY_FILE = join(DATA_DIR, 'newsletter-history.json');

const RSS_FEEDS = [
  {
    id: 'techcrunch',
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    enabled: true,
    category: 'Tech',
  },
  {
    id: 'theverge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    enabled: true,
    category: 'Tech',
  },
  {
    id: 'ars',
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    enabled: true,
    category: 'Tech',
  },
  {
    id: 'hn',
    name: 'Hacker News',
    url: 'https://hnrss.org/frontpage',
    enabled: true,
    category: 'Tech',
  },
  { id: 'devto', name: 'dev.to', url: 'https://dev.to/feed', enabled: true, category: 'Dev' },
  {
    id: 'css-tricks',
    name: 'CSS-Tricks',
    url: 'https://css-tricks.com/feed/',
    enabled: true,
    category: 'Dev',
  },
  {
    id: 'smashing',
    name: 'Smashing Magazine',
    url: 'https://www.smashingmagazine.com/feed/',
    enabled: true,
    category: 'Dev',
  },
];

const newsletterConfig = {
  enabled: false,
  cron: '0 8 * * 1',
  lookbackDays: 7,
  sources: [],
  categories: [],
  // Only items at or above this score make it into the edition; 0 keeps them all.
  minRelevanceScore: 0,
  // Upper bound on items per edition so one send never becomes unreadable.
  maxItems: 15,
  language: 'en',
  provider: 'auto',
  telegramEnabled: true,
  emailEnabled: false,
};

// SMTP delivery (optional). Disabled unless a host is provided, so the app
// still boots fine without email configured.
const email = {
  enabled: process.env.SMTP_HOST ? process.env.SMTP_ENABLED !== 'false' : false,
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  recipients: (process.env.NEWSLETTER_RECIPIENTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
};

// News retention. Pruning is ON by default: an RSS hub accumulates a few
// hundred items a week and the database only grows, so a fresh install should
// clean after itself instead of needing an admin to remember the setting.
// 0 still disables a rule, and whatever is saved on the admin Settings screen
// (app_settings.retention) wins over these defaults at boot.
const retention = {
  // Everything older than this goes, bookmarked items excepted.
  retentionDays: parseInt(process.env.NEWS_RETENTION_DAYS || '30', 10),
  // Second, faster rule for junk: items scoring below the threshold AND older
  // than lowScoreDays are pruned while relevant news survives. Items never
  // scored (relevance_score IS NULL) count as below the threshold — anything
  // old enough has already been through the scoring cycle. 0 disables it.
  lowScoreThreshold: parseInt(process.env.NEWS_LOW_SCORE_THRESHOLD || '30', 10),
  lowScoreDays: parseInt(process.env.NEWS_LOW_SCORE_DAYS || '7', 10),
};

export {
  ai,
  BOOKMARKS_FILE,
  CACHE_FILE,
  DATA_DIR,
  email,
  FEED_STATS_FILE,
  NEWS_FILE,
  NEWSLETTER_HISTORY_FILE,
  newsletterConfig,
  PORT,
  PROFILE_FILE,
  RSS_FEEDS,
  retention,
  telegram,
};
