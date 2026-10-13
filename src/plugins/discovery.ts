/**
 * Plugin Discovery - Find and load plugins from various sources
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type PluginConfig, type PluginManifest } from './types.js';

export interface DiscoveryOptions {
  pluginsDir?: string;
  npmPackages?: string[];
  includeBuiltin?: boolean;
  npmRegistry?: string;
}

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  config: PluginConfig;
  source: 'builtin' | 'npm' | 'local';
  path?: string;
}

export class PluginDiscovery {
  private options: DiscoveryOptions;

  constructor(options: DiscoveryOptions = {}) {
    this.options = {
      includeBuiltin: true,
      ...options,
    };
  }

  async discoverAll(): Promise<{ plugins: any[]; errors: string[] }> {
    const plugins: any[] = [];
    const _errors: string[] = [];

    // Load builtin plugins
    if (this.options.includeBuiltin !== false) {
      const builtinPlugins = await this.discoverBuiltin();
      plugins.push(...builtinPlugins);
    }

    // Load local plugins
    if (this.options.pluginsDir) {
      const localPlugins = await this.discoverLocal(this.options.pluginsDir);
      plugins.push(...localPlugins);
    }

    // Load npm packages
    if (this.options.npmPackages) {
      const npmPlugins = await this.discoverNpm(this.options.npmPackages);
      plugins.push(...npmPlugins);
    }

    return { plugins, errors: [] };
  }

  async discoverBuiltin(): Promise<any[]> {
    const builtinPlugins = [
      { name: 'openai', type: 'ai-provider', description: 'OpenAI-compatible chat provider' },
      { name: 'deepseek', type: 'ai-provider', description: 'DeepSeek chat provider' },
      { name: 'sensenova', type: 'ai-provider', description: 'SenseNova chat provider' },
      { name: 'rss-fetcher', type: 'fetcher', description: 'Fetch and parse RSS/Atom feeds' },
      { name: 'telegram', type: 'output', description: 'Send messages to Telegram' },
      { name: 'discord', type: 'output', description: 'Send messages to Discord' },
      { name: 'slack', type: 'output', description: 'Send messages to Slack' },
      { name: 'pii-redactor', type: 'transformer', description: 'Redact PII from content' },
      { name: 'summarizer', type: 'transformer', description: 'Summarize content with AI' },
      {
        name: 'translator',
        type: 'transformer',
        description: 'Translate content between languages',
      },
    ];

    return builtinPlugins.map((p) => ({
      manifest: { name: p.name, type: p.type, version: '1.0.0', description: p.description } as any,
      config: { enabled: true },
      source: 'builtin',
    }));
  }

  async discoverLocal(dir: string): Promise<any[]> {
    const plugins: any[] = [];

    if (!existsSync(dir)) {
      return plugins;
    }

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = join(dir, entry.name);
      const manifestPath = join(pluginPath, 'plugin.json');

      if (!existsSync(manifestPath)) continue;

      try {
        const manifestContent = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent);

        // Validate manifest
        if (!(manifest.name && manifest.type)) {
          console.warn(`Invalid manifest for ${entry.name}`);
          continue;
        }

        // Check if there's a config file
        const configPath = join(pluginPath, 'config.json');
        let config = { enabled: true };
        if (existsSync(configPath)) {
          const configContent = readFileSync(configPath, 'utf-8');
          config = JSON.parse(configContent);
        }

        plugins.push({
          manifest: {
            name: manifest.name,
            version: manifest.version,
            type: manifest.type,
            main: manifest.main,
          },
          config: { ...config, enabled: config.enabled ?? true },
          source: 'local',
          path: pluginPath,
        });
      } catch (error) {
        console.warn(`Failed to load plugin ${entry.name}:`, error);
      }
    }

    return plugins;
  }

  async discoverNpm(packages: string[]): Promise<any[]> {
    const plugins: any[] = [];

    for (const pkg of packages) {
      try {
        // Try to load the package
        const module = await import(pkg);
        const pluginClass = module.default || module.Plugin || module[Object.keys(module)[0]];

        if (!pluginClass) {
          console.warn(`No plugin export found in ${pkg}`);
          continue;
        }

        // Try to load manifest from package
        let manifest;
        try {
          const manifestPath = resolve(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            'node_modules',
            pkg,
            'plugin.json'
          );
          if (existsSync(manifestPath)) {
            const manifestContent = readFileSync(manifestPath, 'utf-8');
            manifest = JSON.parse(manifestContent);
          } else {
            // Generate from package.json
            const pkgPath = resolve(
              dirname(fileURLToPath(import.meta.url)),
              '..',
              'node_modules',
              pkg,
              'package.json'
            );
            const pkgContent = readFileSync(pkgPath, 'utf-8');
            const pkgJson = JSON.parse(pkgContent);

            manifest = {
              name: pkgJson.name,
              version: pkgJson.version,
              type: 'ai-provider', // default, would need better detection
              description: pkgJson.description,
              author: pkgJson.author,
              license: pkgJson.license,
              main: pkgJson.main || 'index.js',
            };
          }
        } catch {
          manifest = {
            name: pkg,
            version: '1.0.0',
            type: 'ai-provider',
            main: 'index.js',
          };
        }

        const _plugin = new pluginClass() as any;

        plugins.push({
          manifest: manifest,
          config: { enabled: true },
          source: 'npm',
        });
      } catch (error) {
        console.warn(`Failed to load npm plugin ${pkg}:`, error);
      }
    }

    return plugins;
  }
}

export async function discoverPlugins(options: DiscoveryOptions = {}): Promise<{
  plugins: any[];
  errors: string[];
}> {
  const discovery = new PluginDiscovery(options);
  return discovery.discoverAll();
}
