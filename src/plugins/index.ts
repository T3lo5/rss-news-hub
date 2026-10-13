/**
 * Plugin System - Main exports including built-in plugins
 */

export * from './builtin/index.js';
export { BUILTIN_PLUGINS, type BuiltinPluginName, createBuiltinPlugin } from './builtin/index.js';
export * from './config.js';
export { mergeWithDefaults, validateConfig } from './config.js';
export * from './config-loader.js';
export {
  discoverLocalPlugins,
  loadPluginConfig,
  PluginYAMLConfig,
  PluginYAMLEntry,
} from './config-loader.js';
export * from './config-watcher.js';
export { ConfigWatcher, createConfigWatcher } from './config-watcher.js';
export * from './discovery.js';
export { discoverPlugins, PluginDiscovery } from './discovery.js';
export * from './loader.js';
export { pluginLoader } from './loader.js';
export * from './registry.js';
export { pluginRegistry } from './registry.js';
// Re-export commonly used types
export type {
  AIProviderPlugin,
  ChatMessage,
  ChatOptions,
  FeedConfig,
  FetcherPlugin,
  InlineKeyboardButton,
  OutputOptions,
  OutputPlugin,
  ParsedFeedItem,
  Plugin,
  PluginConfig,
  PluginConfigSchema,
  PluginLoader,
  PluginManifest,
  PluginRegistry,
  PluginType,
  RawFeedItem,
  TransformContext,
  TransformerPlugin,
  ValidationResult,
} from './types.js';
export * from './types.js';
