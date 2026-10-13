/**
 * Base AI Provider Plugin - Abstract base class for AI provider plugins
 */

import type {
  AIProviderPlugin,
  ChatMessage,
  ChatOptions,
  PluginConfig,
  PluginManifest,
} from '../types.js';

export abstract class BaseAIProviderPlugin implements AIProviderPlugin {
  manifest!: PluginManifest & { type: 'ai-provider' };
  config!: PluginConfig;

  abstract chat(messages: ChatMessage[], options: ChatOptions): Promise<string>;
  abstract stream(messages: ChatMessage[], options: ChatOptions): AsyncIterable<string>;
  abstract listModels(): Promise<string[]>;

  async init(config: PluginConfig): Promise<void> {
    this.config = config;
  }

  async shutdown(): Promise<void> {
    // Cleanup resources if needed
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    const cfg = config as Record<string, unknown>;
    return typeof cfg.apiKey === 'string' && cfg.apiKey.length > 0;
  }

  protected buildMessages(systemPrompt: string, userContent: string): ChatMessage[] {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];
  }

  protected getDefaultOptions(options: ChatOptions): Required<ChatOptions> {
    return {
      model: options.model || this.getDefaultModel(),
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096,
      stream: options.stream ?? false,
    };
  }

  protected abstract getDefaultModel(): string;
}
