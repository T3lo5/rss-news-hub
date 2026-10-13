/**
 * YAML Configuration Loader for Plugins
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parse as parseYAML } from 'yaml';
import { mergeWithDefaults, validateConfig } from './config.js';
import { PluginConfig, PluginManifest } from './types.js';

export interface PluginYAMLConfig {
  plugins?: {
    'ai-providers'?: PluginYAMLEntry[];
    fetchers?: PluginYAMLEntry[];
    outputs?: PluginYAMLEntry[];
    transformers?: PluginYAMLEntry[];
  };
}

/** Section keys of the plugins config (plural, as used in plugins.yaml). */
type ConfigSection = keyof NonNullable<PluginYAMLConfig['plugins']>;

export interface PluginYAMLEntry {
  name: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  source?: 'builtin' | 'npm' | 'local';
  path?: string;
  version?: string;
}

export interface PluginDiscoveryResult {
  plugins: {
    manifest: any;
    config: any;
    source: 'builtin' | 'npm' | 'local';
    path?: string;
  }[];
  errors: string[];
}

const BUILTIN_PLUGINS = {
  'ai-providers': ['openai', 'deepseek', 'sensenova'],
  fetchers: ['rss-fetcher'],
  outputs: ['telegram', 'discord', 'slack'],
  transformers: ['pii-redactor', 'summarizer', 'translator'],
} as const;

/** YAML section name -> singular PluginType used across the codebase. */
const SECTION_TO_TYPE: Record<string, string> = {
  'ai-providers': 'ai-provider',
  fetchers: 'fetcher',
  outputs: 'output',
  transformers: 'transformer',
};

export async function loadPluginConfig(configPath: string): Promise<{
  plugins: { manifest: any; config: any; source: string; path?: string }[];
  errors: string[];
}> {
  const errors: string[] = [];
  const plugins: any[] = [];

  if (!existsSync(configPath)) {
    return { plugins: [], errors: ['Config file not found'] };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const yamlConfig = parseYAML(content) as PluginYAMLConfig;

    if (!yamlConfig.plugins) {
      return { plugins: [], errors: ['No plugins section in config'] };
    }

    // Load builtin plugins
    for (const [type, names] of Object.entries(BUILTIN_PLUGINS) as [
      ConfigSection,
      readonly string[],
    ][]) {
      const yamlEntries = yamlConfig.plugins[type] || [];
      for (const entry of yamlEntries) {
        if (names.includes(entry.name)) {
          plugins.push({
            manifest: { name: entry.name, type: SECTION_TO_TYPE[type] },
            config: { ...entry.config, enabled: entry.enabled ?? true },
            source: 'builtin',
          });
        } else {
          // Check if it's intended to be a builtin plugin (no source specified or source is builtin)
          const isBuiltin = !entry.source || entry.source === 'builtin';
          if (isBuiltin) {
            errors.push(`Unknown builtin plugin: ${entry.name}`);
          }
        }
      }
    }

    // Load npm plugins
    for (const type of ['ai-providers', 'fetchers', 'outputs', 'transformers'] as ConfigSection[]) {
      const yamlEntries = yamlConfig.plugins[type] || [];
      for (const entry of yamlEntries) {
        if (entry.source === 'npm' && entry.name) {
          try {
            // Dynamic import would happen at runtime
            plugins.push({
              manifest: { name: entry.name, type: SECTION_TO_TYPE[type] },
              config: { ...entry.config, enabled: entry.enabled ?? true },
              source: 'npm',
            });
          } catch (error) {
            errors.push(`Failed to load npm plugin ${entry.name}: ${error}`);
          }
        }
      }
    }

    // Load local plugins
    for (const type of ['ai-providers', 'fetchers', 'outputs', 'transformers'] as ConfigSection[]) {
      const yamlEntries = yamlConfig.plugins[type] || [];
      for (const entry of yamlEntries) {
        if (entry.source === 'local' && entry.path) {
          const pluginPath = resolve(configPath, '..', entry.path);
          if (existsSync(pluginPath)) {
            plugins.push({
              manifest: { name: entry.name, type: SECTION_TO_TYPE[type] },
              config: { ...entry.config, enabled: entry.enabled ?? true },
              source: 'local',
              path: pluginPath,
            });
          } else {
            errors.push(`Local plugin path not found: ${entry.path}`);
          }
        }
      }
    }
  } catch (error) {
    errors.push(`Failed to parse YAML config: ${error}`);
  }

  return { plugins, errors };
}

export async function discoverLocalPlugins(pluginsDir: string): Promise<PluginDiscoveryResult> {
  const result: PluginDiscoveryResult = { plugins: [], errors: [] };

  if (!existsSync(pluginsDir)) {
    return result;
  }

  const entries = readdirSync(pluginsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginPath = join(pluginsDir, entry.name);
    const manifestPath = join(pluginPath, 'plugin.json');

    if (!existsSync(manifestPath)) continue;

    try {
      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      // Load config.json if it exists
      const configPath = join(pluginPath, 'config.json');
      let config = { enabled: true };
      if (existsSync(configPath)) {
        try {
          const configContent = readFileSync(configPath, 'utf-8');
          config = { ...JSON.parse(configContent), enabled: true };
        } catch {
          config = { enabled: true };
        }
      }

      result.plugins.push({
        manifest,
        config,
        source: 'local',
        path: pluginPath,
      });
    } catch (error) {
      result.errors.push(`Failed to load plugin ${entry.name}: ${error}`);
    }
  }

  return result;
}

export async function loadPluginConfigFromPath(configPath: string): Promise<{
  plugins: any[];
  errors: string[];
}> {
  return loadPluginConfig(configPath);
}
