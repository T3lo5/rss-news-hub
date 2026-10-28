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

import { eq } from 'drizzle-orm';
import {
  ai as envAi,
  email as envEmail,
  telegram as envTelegram,
  newsletterConfig,
} from '../server.config.js';
import { getDb, schema } from '../src/db/index.js';
import { settingsRepository, userSettingsRepository } from '../src/db/repositories/index.js';
import { decryptSecret, encryptSecret } from './secrets.js';

const AI_PROVIDER_IDS = ['sensenova', 'deepseek', 'openai'];

// ─── Helpers de leitura/escrita ────────────────────────────────────────────

async function readUserArea(userId, area) {
  // O repositório devolve null quando o usuário nunca salvou nada nessa área.
  // Sem o fallback, todo resolve*Config quebrava com "Cannot read properties
  // of null" justamente no caso mais comum: usar só a config global/env.
  return (await userSettingsRepository.get(userId, area)) ?? {};
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

export { readGlobalArea, readUserArea };

async function writeUserArea(userId, area, value) {
  await userSettingsRepository.set(userId, area, value);
}

function hasKeys(obj) {
  return Boolean(obj && Object.keys(obj).length > 0);
}

// ─── Herança de credenciais do sistema ────────────────────────────────────

// An empty stand-in for the .env AI/Telegram config so a restricted account
// resolves only what it stored itself instead of falling through to secrets
// that belong to the deployment owner.
const LOCKED_AI_ENV = { sensenova: {}, deepseek: {}, openai: {} };
const LOCKED_TELEGRAM_ENV = { botToken: '', chatId: '' };
const LOCKED_EMAIL_ENV = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  from: '',
  recipients: [],
};
// Neutral newsletter fallback for a restricted account: not the owner's
// schedule, language or provider.
const LOCKED_NEWSLETTER = {
  enabled: false,
  cron: '',
  lookbackDays: 7,
  language: 'en',
  provider: 'auto',
};

const LOCKED_SEARCHES = { searches: [] };

/**
 * Whether an account may fall back to the system-wide credentials
 * (app_settings + .env). Only the owner (admin) may: everyone else must bring
 * their own keys, so one account can never spend another one's AI credits or
 * post through someone else's bot.
 *
 * No user context (internal/background calls) keeps the legacy behaviour.
 */
export async function canInheritSystemConfig(userId) {
  if (!userId) return true;
  const rows = await getDb()
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return rows[0]?.role === 'admin';
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
    // `restricted` accounts read only their own row: no global settings, no .env.
    const restricted = !(await canInheritSystemConfig(userId));
    const userStored = await readUserArea(userId, 'ai');
    const globalStored = restricted ? {} : await readGlobalArea('ai');
    const envStored = restricted ? LOCKED_AI_ENV : envAi;

    const config = {
      sensenova: mergeProvider(userStored.sensenova, globalStored.sensenova, envStored.sensenova),
      deepseek: mergeProvider(userStored.deepseek, globalStored.deepseek, envStored.deepseek),
      openai: mergeProvider(userStored.openai, globalStored.openai, envStored.openai),
      defaultProvider: userStored.defaultProvider || globalStored.defaultProvider || 'auto',
      restricted,
    };
    return config;
  });
}

export function resolveTelegramConfig(userId) {
  return Promise.resolve().then(async () => {
    const restricted = !(await canInheritSystemConfig(userId));
    const userStored = await readUserArea(userId, 'telegram');
    const globalStored = restricted ? {} : await readGlobalArea('telegram');
    const envStored = restricted ? LOCKED_TELEGRAM_ENV : envTelegram;
    return {
      botToken: userStored.botToken
        ? decryptSecret(userStored.botToken)
        : globalStored.botToken
          ? decryptSecret(globalStored.botToken)
          : envStored.botToken,
      chatId: userStored.chatId || globalStored.chatId || envStored.chatId,
      restricted,
    };
  });
}

export function resolveEmailConfig(userId) {
  return Promise.resolve().then(async () => {
    const userStored = await readUserArea(userId, 'email');
    const globalStored = await readGlobalArea('email');
    return {
      enabled:
        userStored.enabled !== undefined
          ? userStored.enabled
          : globalStored.enabled !== undefined
            ? globalStored.enabled
            : envEmail.enabled,
      host: userStored.host || globalStored.host || envEmail.host,
      port: userStored.port || globalStored.port || envEmail.port,
      secure:
        userStored.secure !== undefined
          ? userStored.secure
          : globalStored.secure !== undefined
            ? globalStored.secure
            : envEmail.secure,
      user:
        userStored.user !== undefined
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
      recipients:
        userStored.recipients !== undefined
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
      enabled:
        userStored.enabled !== undefined
          ? userStored.enabled
          : globalStored.enabled !== undefined
            ? globalStored.enabled
            : newsletterConfig.enabled,
      cron: userStored.cron || globalStored.cron || newsletterConfig.cron,
      lookbackDays:
        userStored.lookbackDays !== undefined
          ? userStored.lookbackDays
          : globalStored.lookbackDays !== undefined
            ? globalStored.lookbackDays
            : newsletterConfig.lookbackDays,
      sources: userStored.sources || globalStored.sources || newsletterConfig.sources,
      categories: userStored.categories || globalStored.categories || newsletterConfig.categories,
      language: userStored.language || globalStored.language || newsletterConfig.language,
      provider: userStored.provider || globalStored.provider || newsletterConfig.provider,
      telegramEnabled:
        userStored.telegramEnabled !== undefined
          ? userStored.telegramEnabled
          : globalStored.telegramEnabled !== undefined
            ? globalStored.telegramEnabled
            : newsletterConfig.telegramEnabled,
      emailEnabled:
        userStored.emailEnabled !== undefined
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
  // A restricted account has to see the same reality the resolver gives it:
  // only its own override. Merging the global/.env view here told non-admin
  // accounts what the deployment owner has configured — which AI providers are
  // set up, the owner's Telegram chat id, the SMTP host — information they
  // cannot use and should not see.
  const restricted = !(await canInheritSystemConfig(userId));
  const aiEnv = restricted ? LOCKED_AI_ENV : envAi;
  const telegramEnv = restricted ? LOCKED_TELEGRAM_ENV : envTelegram;
  const emailEnv = restricted ? LOCKED_EMAIL_ENV : envEmail;
  const newsletterDefaults = restricted ? LOCKED_NEWSLETTER : newsletterConfig;

  const areas = ['ai', 'telegram', 'email', 'newsletter', 'digest', 'ui', 'searches'];
  const [userAreas, globalAreas] = await Promise.all([
    userSettingsRepository.getAllForUser(userId),
    Promise.all(areas.map((area) => (restricted ? Promise.resolve({}) : readGlobalArea(area)))),
  ]);

  const result = {};
  for (const [index, area] of areas.entries()) {
    const userStored = userAreas[area];
    const globalStored = globalAreas[index] || {};
    const hasUserOverride = hasKeys(userStored);

    if (area === 'ai') {
      const aiCfg = mergeProvider(
        userStored?.sensenova || {},
        globalStored?.sensenova || {},
        aiEnv.sensenova
      );
      const aiCfgDs = mergeProvider(
        userStored?.deepseek || {},
        globalStored?.deepseek || {},
        aiEnv.deepseek
      );
      const aiCfgOi = mergeProvider(
        userStored?.openai || {},
        globalStored?.openai || {},
        aiEnv.openai
      );
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
        chatId: userStored?.chatId || globalStored?.chatId || telegramEnv.chatId || '',
        botTokenSet: Boolean(
          userStored?.botToken
            ? decryptSecret(userStored.botToken)
            : globalStored?.botToken
              ? decryptSecret(globalStored.botToken)
              : telegramEnv.botToken
        ),
      };
    } else if (area === 'email') {
      result[area] = {
        hasUserOverride,
        enabled: userStored?.enabled ?? globalStored?.enabled ?? emailEnv.enabled,
        host: userStored?.host || globalStored?.host || emailEnv.host || '',
        port: userStored?.port || globalStored?.port || emailEnv.port,
        secure: userStored?.secure ?? globalStored?.secure ?? emailEnv.secure,
        user: userStored?.user ?? globalStored?.user ?? emailEnv.user ?? '',
        from: userStored?.from || globalStored?.from || emailEnv.from || '',
        passwordSet: Boolean(
          userStored?.pass
            ? decryptSecret(userStored.pass)
            : globalStored?.pass
              ? decryptSecret(globalStored.pass)
              : emailEnv.pass
        ),
        recipients: userStored?.recipients ?? globalStored?.recipients ?? emailEnv.recipients ?? [],
      };
    } else if (area === 'newsletter') {
      result[area] = {
        hasUserOverride,
        enabled: userStored?.enabled ?? globalStored?.enabled ?? newsletterDefaults.enabled,
        cron: userStored?.cron || globalStored?.cron || newsletterDefaults.cron,
        lookbackDays:
          userStored?.lookbackDays ?? globalStored?.lookbackDays ?? newsletterDefaults.lookbackDays,
        language: userStored?.language || globalStored?.language || newsletterDefaults.language,
        provider: userStored?.provider || globalStored?.provider || newsletterDefaults.provider,
      };
    } else if (area === 'digest') {
      const missedDefaults = {
        enabled: false,
        time: '08:00',
        minScore: 70,
        maxItems: 5,
        lookbackDays: 2,
      };
      result[area] = {
        hasUserOverride,
        cron: userStored?.cron || globalStored?.cron || '',
        minScore: userStored?.minScore ?? globalStored?.minScore ?? 0,
        maxItems: userStored?.maxItems ?? globalStored?.maxItems ?? 10,
        missedDigest: {
          enabled: userStored?.missedDigest?.enabled ?? missedDefaults.enabled,
          time: userStored?.missedDigest?.time ?? missedDefaults.time,
          minScore: userStored?.missedDigest?.minScore ?? missedDefaults.minScore,
          maxItems: userStored?.missedDigest?.maxItems ?? missedDefaults.maxItems,
          lookbackDays: userStored?.missedDigest?.lookbackDays ?? missedDefaults.lookbackDays,
        },
      };
    } else if (area === 'ui') {
      result[area] = {
        hasUserOverride,
        readFilter: userStored?.readFilter || globalStored?.readFilter || 'all',
        sortOrder: userStored?.sortOrder || globalStored?.sortOrder || 'newest',
        pageSize: userStored?.pageSize ?? globalStored?.pageSize ?? 48,
      };
    } else if (area === 'searches') {
      result[area] = {
        hasUserOverride,
        searches: userStored?.searches || globalStored?.searches || [],
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
