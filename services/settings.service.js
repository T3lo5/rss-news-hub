// Persisted, admin-editable settings with encrypted secrets.
//
// Settings live one JSON blob per "area" in the app_settings table. Secret
// fields (AI apiKeys, Telegram botToken) are encrypted at rest by
// services/secrets.js and are never returned by getPublicSettings() — only an
// "is set" boolean is exposed.
//
// At boot initSettings() loads the persisted areas and layers them on top of
// the .env defaults: the AI config is swapped via __setAiConfig(), while the
// Telegram and newsletter config objects are mutated in place (server.js holds
// those references and passes them around).

import { ai, email, newsletterConfig, telegram } from '../server.config.js';
import { settingsRepository } from '../src/db/repositories/index.js';
import { __setAiConfig } from './ai.service.js';
import { getDigestConfig, updateDigestConfig } from './digest.service.js';
import { __resetTransport } from './email.service.js';
import { decryptSecret, encryptSecret } from './secrets.js';

const AI_PROVIDER_IDS = ['sensenova', 'deepseek', 'openai'];
const AI_PROVIDER_LABELS = {
  sensenova: 'SenseNova',
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
};

// Snapshot the .env-derived defaults at import time. Telegram/newsletter are
// mutated in place on apply, so clearing a persisted value must fall back to
// the original env value, not a previously applied one.
const ENV_AI = structuredClone(ai);
const ENV_TELEGRAM = { ...telegram };
const ENV_NEWSLETTER = { ...newsletterConfig };
const ENV_EMAIL = structuredClone(email);

async function readArea(area) {
  const raw = await settingsRepository.get(area);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeArea(area, value) {
  await settingsRepository.set(area, JSON.stringify(value ?? {}));
}

function hasKeys(obj) {
  return Boolean(obj && Object.keys(obj).length > 0);
}

function mergeProvider(storedProvider = {}, envProvider = {}) {
  const merged = {
    ...envProvider,
    baseUrl: storedProvider.baseUrl || envProvider.baseUrl,
    model: storedProvider.model || envProvider.model,
    apiKey: storedProvider.apiKey ? decryptSecret(storedProvider.apiKey) : envProvider.apiKey || '',
  };
  // SenseNova is consumed through the OpenAI SDK; keep its sdk marker.
  if (envProvider.sdk) merged.sdk = envProvider.sdk;
  return merged;
}

function buildAiConfig(stored = {}) {
  return {
    sensenova: mergeProvider(stored.sensenova, ENV_AI.sensenova),
    deepseek: mergeProvider(stored.deepseek, ENV_AI.deepseek),
    openai: mergeProvider(stored.openai, ENV_AI.openai),
  };
}

function buildTelegramConfig(stored = {}) {
  return {
    botToken: stored.botToken ? decryptSecret(stored.botToken) : ENV_TELEGRAM.botToken,
    chatId: stored.chatId || ENV_TELEGRAM.chatId,
  };
}

function buildEmailConfig(stored = {}) {
  return {
    enabled: stored.enabled !== undefined ? stored.enabled : ENV_EMAIL.enabled,
    host: stored.host || ENV_EMAIL.host,
    port: stored.port || ENV_EMAIL.port,
    secure: stored.secure !== undefined ? stored.secure : ENV_EMAIL.secure,
    user: stored.user !== undefined ? stored.user : ENV_EMAIL.user,
    pass: stored.pass ? decryptSecret(stored.pass) : ENV_EMAIL.pass,
    from: stored.from || ENV_EMAIL.from,
    recipients: stored.recipients !== undefined ? stored.recipients : ENV_EMAIL.recipients,
  };
}

// Admin view: effective (env + persisted) config with secrets masked.
export async function getPublicSettings() {
  const [aiStored, tgStored, emailStored] = await Promise.all([
    readArea('ai'),
    readArea('telegram'),
    readArea('email'),
  ]);
  const effectiveAi = buildAiConfig(aiStored);
  const effectiveTg = buildTelegramConfig(tgStored);
  const effectiveEmail = buildEmailConfig(emailStored);

  return {
    ai: {
      defaultProvider: aiStored.defaultProvider || 'auto',
      providers: AI_PROVIDER_IDS.map((id) => ({
        id,
        label: AI_PROVIDER_LABELS[id],
        baseUrl: effectiveAi[id].baseUrl,
        model: effectiveAi[id].model,
        apiKeySet: Boolean(effectiveAi[id].apiKey),
      })),
    },
    telegram: {
      chatId: effectiveTg.chatId,
      botTokenSet: Boolean(effectiveTg.botToken),
    },
    email: {
      enabled: effectiveEmail.enabled,
      host: effectiveEmail.host,
      port: effectiveEmail.port,
      secure: effectiveEmail.secure,
      user: effectiveEmail.user,
      from: effectiveEmail.from,
      passwordSet: Boolean(effectiveEmail.pass),
      recipients: effectiveEmail.recipients,
    },
    newsletter: { ...newsletterConfig },
    digest: getDigestConfig(),
  };
}

// Non-sensitive list for any authenticated user (frontend provider dropdown).
export async function getProviderList() {
  const aiStored = await readArea('ai');
  const effectiveAi = buildAiConfig(aiStored);
  return {
    defaultProvider: aiStored.defaultProvider || 'auto',
    providers: AI_PROVIDER_IDS.map((id) => ({
      id,
      label: AI_PROVIDER_LABELS[id],
      configured: Boolean(effectiveAi[id].apiKey),
    })),
  };
}

export async function updateAiSettings(data = {}) {
  const stored = await readArea('ai');
  const next = { ...stored };

  if (data.defaultProvider !== undefined) next.defaultProvider = data.defaultProvider;

  for (const id of AI_PROVIDER_IDS) {
    const incoming = data[id];
    if (!incoming) continue;
    const current = { ...(next[id] || {}) };

    if (Object.prototype.hasOwnProperty.call(incoming, 'apiKey')) {
      if (incoming.apiKey === null || incoming.apiKey === '') delete current.apiKey;
      else current.apiKey = encryptSecret(incoming.apiKey);
    }
    if (incoming.baseUrl !== undefined) current.baseUrl = incoming.baseUrl;
    if (incoming.model !== undefined) current.model = incoming.model;

    next[id] = current;
  }

  await writeArea('ai', next);
  __setAiConfig(buildAiConfig(next));
  return (await getPublicSettings()).ai;
}

export async function updateTelegramSettings(data = {}) {
  const stored = await readArea('telegram');
  const next = { ...stored };

  if (Object.prototype.hasOwnProperty.call(data, 'botToken')) {
    if (data.botToken === null || data.botToken === '') delete next.botToken;
    else next.botToken = encryptSecret(data.botToken);
  }
  if (data.chatId !== undefined) next.chatId = data.chatId;

  await writeArea('telegram', next);
  Object.assign(telegram, buildTelegramConfig(next));
  return (await getPublicSettings()).telegram;
}

export async function updateEmailSettings(data = {}) {
  const stored = await readArea('email');
  const next = { ...stored };

  if (data.enabled !== undefined) next.enabled = data.enabled;
  if (data.host !== undefined) next.host = data.host;
  if (data.port !== undefined) next.port = data.port;
  if (data.secure !== undefined) next.secure = data.secure;
  if (data.user !== undefined) next.user = data.user;
  if (data.from !== undefined) next.from = data.from;
  if (Array.isArray(data.recipients)) next.recipients = data.recipients;

  if (Object.prototype.hasOwnProperty.call(data, 'pass')) {
    if (data.pass === null || data.pass === '') delete next.pass;
    else next.pass = encryptSecret(data.pass);
  }

  await writeArea('email', next);
  Object.assign(email, buildEmailConfig(next));
  __resetTransport();
  return (await getPublicSettings()).email;
}

// Newsletter/digest already have PUT endpoints that mutate their runtime
// config; these mirror the current state to the DB so it survives restarts.
export async function persistNewsletterSettings() {
  await writeArea('newsletter', { ...newsletterConfig });
}

export async function persistDigestSettings() {
  await writeArea('digest', getDigestConfig());
}

// Load persisted areas and apply them to the running process. Called once at
// boot after the DB is ready and before schedulers/jobs start.
export async function initSettings() {
  const [aiStored, tgStored, nlStored, dgStored, emailStored] = await Promise.all([
    readArea('ai'),
    readArea('telegram'),
    readArea('newsletter'),
    readArea('digest'),
    readArea('email'),
  ]);

  if (hasKeys(aiStored)) __setAiConfig(buildAiConfig(aiStored));
  if (hasKeys(tgStored)) Object.assign(telegram, buildTelegramConfig(tgStored));
  if (hasKeys(nlStored)) Object.assign(newsletterConfig, nlStored);
  if (hasKeys(dgStored)) updateDigestConfig(dgStored);
  if (hasKeys(emailStored)) Object.assign(email, buildEmailConfig(emailStored));
}

// Exposed for tests.
export const __settingsInternals = {
  AI_PROVIDER_IDS,
  buildAiConfig,
  buildEmailConfig,
  buildTelegramConfig,
  ENV_AI,
  ENV_EMAIL,
  ENV_NEWSLETTER,
  ENV_TELEGRAM,
};
