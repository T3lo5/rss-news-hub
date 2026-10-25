import { telegramQueueRepository } from '../src/db/repositories/index.js';
import { withRetry } from './net.js';
import { resolveTelegramConfig } from './user-config.service.js';

// Telegram's hard limit is 4096 chars per message. Keep a safety margin so the
// "(n/m)" prefix we add to multi-part messages never pushes a part over the
// limit.
const SAFE_TG_LENGTH = 4000;

// Split long text into <= maxLength chunks, preferring paragraph boundaries,
// then line breaks, then sentence/word boundaries. This prevents a single
// oversized payload from being rejected by Telegram.
export function splitMessage(text, maxLength = SAFE_TG_LENGTH) {
  if (typeof text !== 'string') return [''];
  if (text.length <= maxLength) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
      breakPoint = remaining.lastIndexOf('\n', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
      breakPoint = remaining.lastIndexOf('. ', maxLength);
      if (breakPoint !== -1) breakPoint += 1; // keep the period with the sentence
    }
    if (breakPoint === -1 || breakPoint < maxLength * 0.5) {
      breakPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (breakPoint === -1 || breakPoint <= 0) {
      breakPoint = maxLength;
    }

    parts.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return parts;
}

// Telegram's legacy "Markdown" parse mode uses *bold* (single asterisk), not
// CommonMark's **bold**. Convert so posts render correctly and don't trigger
// "Can't find end of the entity" errors.
function toTelegramMarkdown(text) {
  return text.replace(/\*\*(.+?)\*\*/g, '*$1*');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Perform a single POST to the Telegram API with a hard timeout. Extracts the
// underlying undici cause (ETIMEDOUT/ENOTFOUND/...) so network failures are
// diagnosable instead of a bare "fetch failed".
async function postToTelegram(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // Retry once on transient pre-send failures (DNS/connect). These happen
    // before the request reaches Telegram, so a retry cannot duplicate a send.
    const res = await withRetry(
      () =>
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
          keepalive: false,
        }),
      { retries: 1, signal: controller.signal }
    );
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Telegram request timeout (15s)');
    }
    const cause = err?.cause?.code || err?.cause?.message || '';
    const msg = err?.message || String(err);
    throw new Error(`Telegram network error: ${msg}${cause ? ` (${cause})` : ''}`);
  } finally {
    clearTimeout(timeout);
  }
}

function isEntityParseError(description) {
  return /entit|can't find end|unsupported start tag|parse/i.test(description || '');
}

export async function telegramSend(text, parseMode = 'Markdown', config, options = {}) {
  if (!(config?.botToken && config?.chatId)) {
    // A restricted account cannot fall back to the owner's bot; tell the client
    // why with a code it can translate.
    if (config?.restricted) {
      const err = new Error('This account has no Telegram bot of its own');
      err.code = 'TELEGRAM_REQUIRED';
      throw err;
    }
    throw new Error('Telegram not configured');
  }
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  const useMarkdown = parseMode === 'Markdown';
  const source = useMarkdown ? toTelegramMarkdown(text) : text;
  const parts = splitMessage(source);
  const results = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partText = parts.length > 1 ? `(${i + 1}/${parts.length})\n${part}` : part;

    const body = {
      chat_id: config.chatId,
      text: partText,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };

    if (options.messageThreadId) {
      body.message_thread_id = options.messageThreadId;
    }

    if (options.replyToMessageId) {
      body.reply_parameters = { message_id: options.replyToMessageId };
    }

    if (options.inlineKeyboard) {
      body.reply_markup = { inline_keyboard: options.inlineKeyboard };
    } else if (options.linkButton && options.linkUrl) {
      body.reply_markup = {
        inline_keyboard: [[{ text: '🔗 Read original', url: options.linkUrl }]],
      };
    }

    let { data } = await postToTelegram(url, body);

    // If formatting broke (unbalanced entities after a split), retry this part
    // as plain text so the message is still delivered.
    if (!data?.ok && body.parse_mode && isEntityParseError(data?.description)) {
      const plainBody = { ...body };
      delete plainBody.parse_mode;
      ({ data } = await postToTelegram(url, plainBody));
    }

    if (!data?.ok) {
      throw new Error(`Telegram API error: ${data?.description || 'unknown error'}`);
    }

    results.push(data.result);

    if (i < parts.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

export async function queueTelegramMessage(message) {
  const msg = {
    id: generateId(),
    text: message.text,
    parseMode: message.parseMode || 'Markdown',
    scheduledAt:
      message.scheduledAt instanceof Date ? message.scheduledAt : new Date(message.scheduledAt),
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
    options: message.options ? JSON.stringify(message.options) : null,
  };
  return telegramQueueRepository.add(msg);
}

export async function getTelegramQueue() {
  return telegramQueueRepository.findAll();
}

export async function cancelTelegramMessage(id) {
  return telegramQueueRepository.remove(id);
}

export async function processTelegramQueue(config) {
  const dueMessages = await telegramQueueRepository.findPending();

  for (const msg of dueMessages) {
    try {
      const options = msg.options ? JSON.parse(msg.options) : {};
      // Resolve per-user config; falls back to the provided global config when
      // the message has no userId (legacy global queue entries).
      const effectiveConfig = msg.userId ? await resolveTelegramConfig(msg.userId) : config;
      await telegramSend(msg.text, msg.parseMode, effectiveConfig, options);
      await telegramQueueRepository.updateStatus(msg.id, 'sent');
    } catch (err) {
      await telegramQueueRepository.incrementRetry(msg.id, err.message);
    }
  }
}

export function __resetTelegramQueue() {
  return telegramQueueRepository.clear();
}
