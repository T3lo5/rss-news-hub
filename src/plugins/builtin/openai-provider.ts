/**
 * OpenAI Provider Plugin
 */

import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, PluginManifest } from '../types.js';
import { BaseAIProviderPlugin } from './ai-providers.js';

export class OpenAIProviderPlugin extends BaseAIProviderPlugin {
  private client: OpenAI | null = null;

  manifest: PluginManifest & { type: 'ai-provider' } = {
    name: 'openai',
    version: '1.0.0',
    type: 'ai-provider',
    description: 'OpenAI API provider (GPT-4, GPT-3.5, etc.)',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'openai-provider.js',
    configSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', minLength: 1 },
        baseUrl: { type: 'string', format: 'url', default: 'https://api.openai.com' },
        model: { type: 'string', default: 'gpt-4o-mini' },
        organization: { type: 'string' },
      },
      required: ['apiKey'],
    },
  };

  config: any = {
    enabled: true,
    config: {
      apiKey: '',
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
    },
  };

  protected getDefaultModel(): string {
    return this.config.config.model || 'gpt-4o-mini';
  }

  async init(config: any): Promise<void> {
    await super.init(config);
    this.client = new OpenAI({
      apiKey: this.config.config.apiKey,
      baseURL: this.config.config.baseUrl,
      organization: this.config.config.organization,
    });
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    const opts = this.getDefaultOptions(options);
    const completion = await this.client.chat.completions.create({
      model: opts.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: false,
    });

    return completion.choices[0]?.message?.content || '';
  }

  async *stream(messages: ChatMessage[], options: ChatOptions): AsyncIterable<string> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    const opts = this.getDefaultOptions(options);
    const stream = await this.client.chat.completions.create({
      model: opts.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    const models = await this.client.models.list();
    return models.data.map((m) => m.id).filter((id) => id.includes('gpt'));
  }

  async shutdown(): Promise<void> {
    this.client = null;
  }
}
