/**
 * Built-in Plugin Exports
 */

export { BaseAIProviderPlugin } from './ai-providers.js';
export { DeepSeekProviderPlugin } from './deepseek-provider.js';
export { RSSFetcherPlugin } from './fetchers.js';
export { OpenAIProviderPlugin } from './openai-provider.js';
export {
  DiscordOutputPlugin,
  NotionOutputPlugin,
  ObsidianOutputPlugin,
  SlackOutputPlugin,
  TelegramOutputPlugin,
} from './outputs.js';
export { SenseNovaProviderPlugin } from './sensenova-provider.js';
export { PIIRedactorPlugin, SummarizerPlugin, TranslationPlugin } from './transformers.js';

// Plugin manifest for built-in plugins
export const BUILTIN_PLUGINS = [
  // AI Providers
  'openai',
  'deepseek',
  'sensenova',

  // Fetchers
  'rss-fetcher',

  // Outputs
  'telegram',
  'discord',
  'slack',
  'notion',
  'obsidian',

  // Transformers
  'pii-redactor',
  'summarizer',
  'translator',
] as const;

export type BuiltinPluginName = (typeof BUILTIN_PLUGINS)[number];

// Factory function to create built-in plugin instances
export async function createBuiltinPlugin(name: string, config: any) {
  switch (name) {
    case 'openai': {
      const { OpenAIProviderPlugin } = await import('./openai-provider.js');
      return new OpenAIProviderPlugin();
    }
    case 'deepseek': {
      const { DeepSeekProviderPlugin } = await import('./deepseek-provider.js');
      return new DeepSeekProviderPlugin();
    }
    case 'sensenova': {
      const { SenseNovaProviderPlugin } = await import('./sensenova-provider.js');
      return new SenseNovaProviderPlugin();
    }
    case 'rss-fetcher': {
      const { RSSFetcherPlugin } = await import('./fetchers.js');
      return new RSSFetcherPlugin();
    }
    case 'telegram': {
      const { TelegramOutputPlugin } = await import('./outputs.js');
      return new TelegramOutputPlugin();
    }
    case 'discord': {
      const { DiscordOutputPlugin } = await import('./outputs.js');
      return new DiscordOutputPlugin();
    }
    case 'slack': {
      const { SlackOutputPlugin } = await import('./outputs.js');
      return new SlackOutputPlugin();
    }
    case 'notion': {
      const { NotionOutputPlugin } = await import('./outputs.js');
      return new NotionOutputPlugin();
    }
    case 'obsidian': {
      const { ObsidianOutputPlugin } = await import('./outputs.js');
      return new ObsidianOutputPlugin();
    }
    case 'pii-redactor': {
      const { PIIRedactorPlugin } = await import('./transformers.js');
      return new PIIRedactorPlugin();
    }
    case 'summarizer': {
      const { SummarizerPlugin } = await import('./transformers.js');
      return new SummarizerPlugin();
    }
    case 'translator': {
      const { TranslationPlugin } = await import('./transformers.js');
      return new TranslationPlugin();
    }
    default:
      throw new Error(`Unknown built-in plugin: ${name}`);
  }
}
