/**
 * SenseNova Provider Plugin
 */

import { type PluginManifest } from '../types.js';
import { BaseAIProviderPlugin } from './ai-providers.js';

export class SenseNovaProviderPlugin extends BaseAIProviderPlugin {
  private apiKey: string = '';
  private baseUrl: string = 'https://token.sensenova.ai/v1';

  manifest: PluginManifest & { type: 'ai-provider' } = {
    name: 'sensenova',
    version: '1.0.0',
    type: 'ai-provider',
    description: 'SenseNova API provider (SenseNova 6.8 Flash Lite, etc.)',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'sensenova-provider.js',
    configSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', minLength: 1 },
        baseUrl: { type: 'string', format: 'url', default: 'https://token.sensenova.ai/v1' },
        model: { type: 'string', default: 'sensenova-6.8-flash-lite' },
      },
      required: ['apiKey'],
    },
  };

  config: any = {
    enabled: true,
    config: {
      apiKey: '',
      baseUrl: 'https://token.sensenova.ai/v1',
      model: 'sensenova-6.8-flash-lite',
    },
  };

  protected getDefaultModel(): string {
    return this.config.config.model || 'sensenova-6.8-flash-lite';
  }

  async init(config: any): Promise<void> {
    await super.init(config);
    this.apiKey = this.config.config.apiKey;
    this.baseUrl = this.config.config.baseUrl;
  }

  async chat(messages: any[], options: any): Promise<string> {
    const response = await fetch(`${this.config.config.baseUrl}/chat/completions`, {
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
      throw new Error(`SenseNova API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async *stream(messages: any[], options: any): AsyncIterable<string> {
    const response = await fetch(`${this.config.config.baseUrl}/chat/completions`, {
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
      throw new Error(`SenseNova API error ${response.status}: ${error}`);
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
    return ['sensenova-6.8-flash-lite', 'sensenova-6.8', 'sensenova-4'];
  }

  async shutdown(): Promise<void> {
    // No client to clean up for fetch-based implementation
  }
}
