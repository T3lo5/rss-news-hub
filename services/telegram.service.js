import { telegramQueueRepository } from '../src/db/repositories/index.js';

const MAX_TG_LENGTH = 4096;

function splitMessage(text, maxLength = MAX_TG_LENGTH) {
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
      breakPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (breakPoint === -1) {
      breakPoint = maxLength;
    }

    parts.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return parts;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export async function telegramSend(text, parseMode = 'Markdown', config, options = {}) {
  if (!(config?.botToken && config?.chatId)) {
    throw new Error('Telegram not configured');
  }
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  const parts = splitMessage(text);
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description}`);
      }
      results.push(data.result);

      if (i < parts.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      clearTimeout(timeout);
      throw err;
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
      await telegramSend(msg.text, msg.parseMode, config, options);
      await telegramQueueRepository.updateStatus(msg.id, 'sent');
    } catch (err) {
      await telegramQueueRepository.incrementRetry(msg.id, err.message);
    }
  }
}

export function __resetTelegramQueue() {
  return telegramQueueRepository.clear();
}
