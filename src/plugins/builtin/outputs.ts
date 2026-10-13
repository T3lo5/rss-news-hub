/**
 * Built-in Output Plugins - Telegram, Discord, Slack, etc.
 */

import { type OutputOptions, type OutputPlugin, type PluginManifest } from '../types.js';

export class TelegramOutputPlugin implements OutputPlugin {
  manifest: PluginManifest & { type: 'output' } = {
    name: 'telegram',
    version: '1.0.0',
    type: 'output',
    description: 'Send messages to Telegram chats',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'telegram-output.js',
    configSchema: {
      type: 'object',
      properties: {
        botToken: { type: 'string', minLength: 1 },
        chatId: { type: 'string', minLength: 1 },
        defaultParseMode: {
          type: 'string',
          enum: ['Markdown', 'HTML', 'MarkdownV2'],
          default: 'Markdown',
        },
      },
      required: ['botToken', 'chatId'],
    },
  };

  config: any = {
    enabled: true,
    config: {
      botToken: '',
      chatId: '',
      defaultParseMode: 'Markdown',
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async send(content: string, options: OutputOptions = {}): Promise<void> {
    const config = this.config.config;

    if (!(config.botToken && config.chatId)) {
      throw new Error('Telegram not configured');
    }

    const _url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

    const parseMode = options.parseMode || config.defaultParseMode || 'Markdown';

    const body: any = {
      chat_id: config.chatId,
      text: content,
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

    if (options.scheduleAt) {
      // Schedule for later - would need queue implementation
      throw new Error('Scheduled sends not yet implemented in base plugin');
    }

    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Telegram API error: ${result.description}`);
    }
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    const cfg = config as Record<string, unknown>;
    return (
      typeof cfg.botToken === 'string' &&
      cfg.botToken.length > 0 &&
      typeof cfg.chatId === 'string' &&
      cfg.chatId.length > 0
    );
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }
}

export class DiscordOutputPlugin implements OutputPlugin {
  manifest = {
    name: 'discord',
    version: '1.0.0',
    type: 'output' as const,
    description: 'Send messages to Discord via webhooks',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'discord-output.js',
    configSchema: {
      type: 'object',
      properties: {
        webhookUrl: { type: 'string', format: 'url', minLength: 1 },
        username: { type: 'string', maxLength: 80 },
        avatarUrl: { type: 'string', format: 'url' },
      },
      required: ['webhookUrl'],
    },
  };

  config: any = {
    enabled: true,
    config: {
      webhookUrl: '',
      username: 'RSS News Hub',
      avatarUrl: '',
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async send(content: string, options: OutputOptions = {}): Promise<void> {
    const config = this.config.config;

    if (!config.webhookUrl) {
      throw new Error('Discord webhook URL not configured');
    }

    // Discord has a 2000 character limit
    const chunks = this.chunkMessage(content, 1900);

    for (const chunk of chunks) {
      const payload: any = {
        content: chunk,
        username: config.username,
        avatar_url: config.avatarUrl,
      };

      if (options.embed) {
        payload.embeds = [options.embed];
      }

      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Discord webhook error: ${response.status}`);
      }
    }
  }

  private chunkMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
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

      chunks.push(remaining.slice(0, breakPoint).trim());
      remaining = remaining.slice(breakPoint).trimStart();
    }

    return chunks;
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    const cfg = config as Record<string, unknown>;
    return typeof cfg.webhookUrl === 'string' && cfg.webhookUrl.length > 0;
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }
}

export class SlackOutputPlugin implements OutputPlugin {
  manifest = {
    name: 'slack',
    version: '1.0.0',
    type: 'output' as const,
    description: 'Send messages to Slack channels via webhook or Bot API',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'slack-output.js',
    configSchema: {
      type: 'object',
      properties: {
        webhookUrl: { type: 'string', format: 'url' },
        botToken: { type: 'string' },
        channel: { type: 'string', minLength: 1 },
        username: { type: 'string', maxLength: 80 },
        iconUrl: { type: 'string', format: 'url' },
      },
      required: [],
    },
  };

  config: any = {
    enabled: true,
    config: {
      webhookUrl: '',
      botToken: '',
      channel: '',
      username: 'RSS News Hub',
      iconUrl: '',
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async send(content: string, options: OutputOptions = {}): Promise<void> {
    const config = this.config.config;

    if (config.webhookUrl) {
      // Webhook method
      await this.sendViaWebhook(content, options);
    } else if (config.botToken && config.channel) {
      // Bot API method
      await this.sendViaBotAPI(content, options);
    } else {
      throw new Error('Slack not configured: need webhookUrl or botToken+channel');
    }
  }

  private async sendViaWebhook(content: string, options: OutputOptions): Promise<void> {
    const config = this.config.config;

    const payload: any = {
      text: content,
      username: config.username,
      icon_url: config.iconUrl,
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook error: ${response.status}`);
    }
  }

  private async sendViaBotAPI(content: string, options: OutputOptions): Promise<void> {
    const config = this.config.config;

    const payload: any = {
      channel: config.channel,
      text: content,
      username: config.username,
      icon_url: config.iconUrl,
    };

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    const cfg = config as Record<string, unknown>;
    return (
      (typeof cfg.webhookUrl === 'string' && cfg.webhookUrl.length > 0) ||
      (typeof cfg.botToken === 'string' &&
        cfg.botToken.length > 0 &&
        typeof cfg.channel === 'string' &&
        cfg.channel.length > 0)
    );
  }

  async shutdown(): Promise<void> {}
}
