// Serviço de configuração por usuário (self-service).
//
// Cada usuário pode configurar seus próprios provedores de IA, Telegram,
// e-mail/SMTP, newsletters e feeds. A cadeia de resolução é:
//   1. user_settings[userId][area]  (config do próprio usuário)
//   2. app_settings[area]           (config global do admin)
//   3. server.config.js (env)       (fallback do .env)
//
// Segredos (apiKey, botToken, senha SMTP) são criptografados em repouso com
// AES-256-GCM (services/secrets.js) e nunca são retornados em texto claro.

import { ai as envAi, email as envEmail, newsletterConfig, telegram as envTelegram } from '../server.config.js';
import { decryptSecret, encryptSecret } from './secrets.js';
import { userSettingsRepository, settingsRepository } from '../src/db/repositories/index.js';

const AI_PROVIDER_IDS = ['sensenova', 'deepseek', 'openai'];

// ─── Helpers de leitura/escrita ────────────────────────────────────────────

async function readUserArea(userId, area) {
  return userSettingsRepository.get(userId, area);
}

async function readGlobalArea(area) {
  const raw = await settingsRepository.get(area);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeUserArea(userId, area, value) {
  await userSettingsRepository.set(userId, area, value);
}

function hasKeys(obj) {
  return Boolean(obj && Object.keys(obj).length > 0);
}

// ─── Builders de config (merge: user → global → env) ───────────────────────

function mergeProvider(userProvider = {}, globalProvider = {}, envProvider = {}) {
  const merged = {
    ...envProvider,
    baseUrl: userProvider.baseUrl || globalProvider.baseUrl || envProvider.baseUrl,
    model: userProvider.model || globalProvider.model || envProvider.model,
    apiKey: userProvider.apiKey
      ? decryptSecret(userProvider.apiKey)
      : globalProvider.apiKey
        ? decryptSecret(globalProvider.apiKey)
        : envProvider.apiKey || '',
  };
  if (envProvider.sdk) merged.sdk = envProvider.sdk;
  return merged;
}

export function resolveAiConfig(userId) {
  // Síncrono: retorna um objeto Promise para manter a API uniforme
  return Promise.resolve().then(async () => {
    const userStored = await readUserArea(userId, 'ai');
    const globalStored = await readGlobalArea('ai');

    const config = {
      sensenova: mergeProvider(userStored.sensenova, globalStored.sensenova, envAi.sensenova),
      deepseek: mergeProvider(userStored.deepseek, globalStored.deepseek, envAi.deepseek),
      openai: mergeProvider(userStored.openai, globalStored.openai, envAi.openai),
      defaultProvider: userStored.defaultProvider || globalStored.defaultProvider || 'auto',
    };
    return config;
  });
}

export function resolveTelegramConfig(userId) {
  return Promise.resolve().then(async () => {
    const userStored = await readUserArea(userId, 'telegram');
    const globalStored = await readGlobalArea('telegram');
    return {
      botToken: userStored.botToken
        ? decryptSecret(userStored.botToken)
        : globalStored.botToken
          ? decryptSecret(globalStored.botToken)
          : envTelegram.botToken,
      chatId: userStored.chatId || globalStored.chatId || envTelegram.chatId,
    };
  });
}

export function resolveEmailConfig(userId) {
  return Promise.resolve().then(async () => {
    const userStored = await readUserArea(userId, 'email');
    const globalStored = await readGlobalArea('email');
    return {
      enabled: userStored.enabled !== undefined
        ? userStored.enabled
        : globalStored.enabled !== undefined
          ? globalStored.enabled
          : envEmail.enabled,
      host: userStored.host || globalStored.host || envEmail.host,
      port: userStored.port || globalStored.port || envEmail.port,
      secure: userStored.secure !== undefined
        ? userStored.secure
        : globalStored.secure !== undefined
          ? globalStored.secure
          : envEmail.secure,
      user: userStored.user !== undefined
        ? userStored.user
        : globalStored.user !== undefined
          ? globalStored.user
          : envEmail.user,
      pass: userStored.pass
        ? decryptSecret(userStored.pass)
        : globalStored.pass
          ? decryptSecret(globalStored.pass)
          : envEmail.pass,
      from: userStored.from || globalStored.from || envEmail.from,
      recipients: userStored.recipients !== undefined
        ? userStored.recipients
        : globalStored.recipients !== undefined
          ? globalStored.recipients
          : envEmail.recipients,
    };
  });
}

export function resolveNewsletterConfig(userId) {
  return Promise.resolve().then(async () => {
    const userStored = await readUserArea(userId, 'newsletter');
    const globalStored = await readGlobalArea('newsletter');
    return {
      enabled: userStored.enabled !== undefined
        ? userStored.enabled
        : globalStored.enabled !== undefined
          ? globalStored.enabled
          : newsletterConfig.enabled,
      cron: userStored.cron || globalStored.cron || newsletterConfig.cron,
      lookbackDays: userStored.lookbackDays !== undefined
        ? userStored.lookbackDays
        : globalStored.lookbackDays !== undefined
          ? globalStored.lookbackDays
          : newsletterConfig.lookbackDays,
      sources: userStored.sources || globalStored.sources || newsletterConfig.sources,
      categories: userStored.categories || globalStored.categories || newsletterConfig.categories,
      language: userStored.language || globalStored.language || newsletterConfig.language,
      provider: userStored.provider || globalStored.provider || newsletterConfig.provider,
      telegramEnabled: userStored.telegramEnabled !== undefined
        ? userStored.telegramEnabled
        : globalStored.telegramEnabled !== undefined
          ? globalStored.telegramEnabled
          : newsletterConfig.telegramEnabled,
      emailEnabled: userStored.emailEnabled !== undefined
        ? userStored.emailEnabled
        : globalStored.emailEnabled !== undefined
          ? globalStored.emailEnabled
          : newsletterConfig.emailEnabled,
    };
  });
}

// ─── CRUD para rotas de API (autoatendimento) ───────────────────────────────

// Lista todas as áreas de config do usuário com indicação de "tem override"
export async function getUserSettingsOverview(userId) {
  const [userAreas, globalAreas] = await Promise.all([
    userSettingsRepository.getAllForUser(userId),
    Promise.all(['ai', 'telegram', 'email', 'newsletter', 'digest'].map(readGlobalArea)),
  ]);
  const globalMap = {};
  for (let i = 0; i < ['ai', 'telegram', 'email', 'newsletter', 'digest'].length; i++) {
    const area = ['ai', 'telegram', 'email', 'newsletter', 'digest'][i];
    globalMap[area] = globalAreas[i];
  }

  const areas = ['ai', 'telegram', 'email', 'newsletter', 'digest'];
  const result = {};
  for (const area of areas) {
    const userStored = userAreas[area];
    const globalStored = globalMap[area];
    const hasUserOverride = hasKeys(userStored);

    if (area === 'ai') {
      const aiCfg = mergeProvider(userStored?.sensenova || {}, globalStored?.sensenova || {}, envAi.sensenova);
      const aiCfgDs = mergeProvider(userStored?.deepseek || {}, globalStored?.deepseek || {}, envAi.deepseek);
      const aiCfgOi = mergeProvider(userStored?.openai || {}, globalStored?.openai || {}, envAi.openai);
      result[area] = {
        hasUserOverride,
        defaultProvider: userStored?.defaultProvider || globalStored?.defaultProvider || 'auto',
        providers: AI_PROVIDER_IDS.map((id) => {
          const cfg = id === 'sensenova' ? aiCfg : id === 'deepseek' ? aiCfgDs : aiCfgOi;
          return {
            id,
            configured: Boolean(cfg.apiKey),
            baseUrl: cfg.baseUrl,
            model: cfg.model,
          };
        }),
      };
    } else if (area === 'telegram') {
      result[area] = {
        hasUserOverride,
        chatId: userStored?.chatId || globalStored?.chatId || envTelegram.chatId || '',
        botTokenSet: Boolean(
          userStored?.botToken
            ? decryptSecret(userStored.botToken)
            : globalStored?.botToken
              ? decryptSecret(globalStored.botToken)
              : envTelegram.botToken
        ),
      };
    } else if (area === 'email') {
      result[area] = {
        hasUserOverride,
        enabled: userStored?.enabled ?? globalStored?.enabled ?? envEmail.enabled,
        host: userStored?.host || globalStored?.host || envEmail.host || '',
        port: userStored?.port || globalStored?.port || envEmail.port,
        secure: userStored?.secure ?? globalStored?.secure ?? envEmail.secure,
        user: userStored?.user ?? globalStored?.user ?? envEmail.user ?? '',
        from: userStored?.from || globalStored?.from || envEmail.from || '',
        passwordSet: Boolean(
          userStored?.pass
            ? decryptSecret(userStored.pass)
            : globalStored?.pass
              ? decryptSecret(globalStored.pass)
              : envEmail.pass
        ),
        recipients: userStored?.recipients ?? globalStored?.recipients ?? envEmail.recipients ?? [],
      };
    } else if (area === 'newsletter') {
      result[area] = {
        hasUserOverride,
        enabled: userStored?.enabled ?? globalStored?.enabled ?? newsletterConfig.enabled,
        cron: userStored?.cron || globalStored?.cron || newsletterConfig.cron,
        lookbackDays: userStored?.lookbackDays ?? globalStored?.lookbackDays ?? newsletterConfig.lookbackDays,
        language: userStored?.language || globalStored?.language || newsletterConfig.language,
        provider: userStored?.provider || globalStored?.provider || newsletterConfig.provider,
      };
    } else if (area === 'digest') {
      result[area] = {
        hasUserOverride,
        cron: userStored?.cron || globalStored?.cron || '',
        minScore: userStored?.minScore ?? globalStored?.minScore ?? 0,
        maxItems: userStored?.maxItems ?? globalStored?.maxItems ?? 10,
      };
    }
  }
  return result;
}

// Salva override do usuário para uma área
export async function saveUserSetting(userId, area, data) {
  const current = await readUserArea(userId, area);
  const next = { ...current, ...data };

  // Criptografa segredos conhecidos antes de persistir
  if (area === 'ai') {
    for (const id of AI_PROVIDER_IDS) {
      const prov = next[id];
      if (prov?.apiKey) {
        prov.apiKey = encryptSecret(prov.apiKey);
      }
    }
  } else if (area === 'telegram') {
    if (next.botToken) next.botToken = encryptSecret(next.botToken);
  } else if (area === 'email') {
    if (next.pass) next.pass = encryptSecret(next.pass);
  }

  await writeUserArea(userId, area, next);
  return { hasUserOverride: true };
}

// Remove override (volta ao fallback global/env)
export async function deleteUserSetting(userId, area) {
  await userSettingsRepository.remove(userId, area);
  return { hasUserOverride: false };
}
