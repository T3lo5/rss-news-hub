/**
 * Core plugin type definitions for the plugin system
 */

export type PluginType = 'ai-provider' | 'fetcher' | 'output' | 'transformer';

export interface PluginConfig {
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface PluginManifest {
  name: string;
  version: string;
  type: PluginType;
  description?: string;
  author?: string;
  license?: string;
  main: string; // Entry point relative to plugin root
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  configSchema?: Record<string, unknown>; // JSON Schema for config validation
}

export interface Plugin {
  manifest: PluginManifest;
  config: PluginConfig;
  init(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;
}

export interface AIProviderPlugin extends Plugin {
  manifest: PluginManifest & { type: 'ai-provider' };
  chat(messages: ChatMessage[], options: ChatOptions): Promise<string>;
  stream(messages: ChatMessage[], options: ChatOptions): AsyncIterable<string>;
  listModels(): Promise<string[]>;
  validateConfig(config: unknown): boolean;
}

export interface FetcherPlugin extends Plugin {
  manifest: PluginManifest & { type: 'fetcher' };
  fetch(feed: FeedConfig): Promise<RawFeedItem[]>;
  parse(xml: string, sourceName: string): RawFeedItem[];
  validateConfig(config: unknown): boolean;
}

export interface OutputPlugin extends Plugin {
  manifest: PluginManifest & { type: 'output' };
  send(content: string, options: OutputOptions): Promise<void>;
  validateConfig(config: unknown): boolean;
}

export interface TransformerPlugin extends Plugin {
  manifest: PluginManifest & { type: 'transformer' };
  transform(content: string, context: TransformContext): Promise<string>;
  validateConfig(config: unknown): boolean;
}

// Supporting types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  category: string;
  config?: Record<string, unknown>;
}

export interface RawFeedItem {
  id: string;
  title: string;
  link: string;
  description?: string;
  content?: string;
  pubDate?: string;
  author?: string;
  categories?: string[];
  [key: string]: unknown;
}

export interface ParsedFeedItem {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: Date;
  description: string;
  content: string;
}

export interface OutputOptions {
  parseMode?: 'Markdown' | 'HTML' | 'MarkdownV2';
  messageThreadId?: number;
  replyToMessageId?: number;
  inlineKeyboard?: InlineKeyboardButton[][];
  linkButton?: boolean;
  linkUrl?: string;
  scheduleAt?: number;
  /** Discord-style embed payload (used by webhook outputs). */
  embed?: Record<string, unknown>;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callbackData?: string;
}

export interface TransformContext {
  item?: ParsedFeedItem;
  feed?: FeedConfig;
  pluginConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PluginRegistry {
  register(plugin: Plugin): Promise<void>;
  unregister(name: string): Promise<void>;
  get(name: string): Plugin | undefined;
  getAll(): Plugin[];
  getByType(type: PluginType): Plugin[];
  getEnabledByType(type: PluginType): Plugin[];
}

export interface PluginLoader {
  loadFromPath(path: string): Promise<Plugin>;
  loadFromNpm(name: string, version?: string): Promise<Plugin>;
  validatePlugin(plugin: Plugin): Promise<ValidationResult>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PluginConfigSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
      enum?: unknown[];
      required?: boolean;
    }
  >;
  required?: string[];
  additionalProperties?: boolean;
}
