/**
 * DeepSeek Provider Plugin
 */

import { type PluginManifest } from '../types.js';
import { BaseAIProviderPlugin } from './ai-providers.js';

export class DeepSeekProviderPlugin extends BaseAIProviderPlugin {
  private apiKey: string = '';
  private baseUrl: string = 'https://api.deepseek.com';

  manifest: PluginManifest & { type: 'ai-provider' } = {
    name: 'deepseek',
    version: '1.0.0',
    type: 'ai-provider',
    description: 'DeepSeek API provider (DeepSeek Chat, DeepSeek Coder)',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'deepseek-provider.js',
    configSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', minLength: 1 },
        baseUrl: { type: 'string', format: 'url', default: 'https://api.deepseek.com' },
        model: { type: 'string', default: 'deepseek-chat' },
      },
      required: ['apiKey'],
    },
  };

  config: any = {
    enabled: true,
    config: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
    },
  };

  protected getDefaultModel(): string {
    return this.config.config.model || 'deepseek-chat';
  }

  async init(config: any): Promise<void> {
    await super.init(config);
    this.apiKey = this.config.config.apiKey;
    this.baseUrl = this.config.config.baseUrl;
  }

  async chat(messages: any[], options: any): Promise<string> {
    const _opts = this.getDefaultOptions(options);

    const response = await fetch(`${this.config.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || this.getDefaultModel(),
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async *stream(messages: any[], options: any): AsyncIterable<string> {
    const response = await fetch(`${this.config.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || this.getDefaultModel(),
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error ${response.status}: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  async listModels(): Promise<string[]> {
    return ['deepseek-chat', 'deepseek-coder'];
  }

  async shutdown(): Promise<void> {
    // No client to clean up for fetch-based implementation
  }
}
