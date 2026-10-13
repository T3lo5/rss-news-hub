/**
 * Plugin Loader - Dynamic loading of plugins from various sources
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './config.js';
import {
  type Plugin,
  PluginConfig,
  type PluginLoader,
  type PluginManifest,
  type PluginType,
  type ValidationResult,
} from './types.js';

export class PluginLoaderImpl implements PluginLoader {
  private loadedPlugins = new Map<string, Plugin>();

  async loadFromPath(pluginPath: string): Promise<Plugin> {
    const absolutePath = isAbsolute(pluginPath) ? pluginPath : resolve(pluginPath);

    // Check if it's a directory
    const stat = statSync(absolutePath);
    let manifestPath: string;
    let pluginRoot: string;

    if (stat.isDirectory()) {
      pluginRoot = absolutePath;
      manifestPath = join(absolutePath, 'plugin.json');
    } else {
      throw new Error('Plugin path must be a directory');
    }

    if (!existsSync(manifestPath)) {
      throw new Error(`Plugin manifest not found at ${manifestPath}`);
    }

    // Load manifest
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as PluginManifest;

    // Validate manifest
    this.validateManifest(manifest);

    // Load plugin entry point
    const entryPath = join(pluginRoot, manifest.main);
    if (!existsSync(entryPath)) {
      throw new Error(`Plugin entry point not found: ${entryPath}`);
    }

    // Dynamic import
    const module = await import(`file://${entryPath}`);
    const pluginClass = module.default || module[manifest.name] || module.Plugin;

    if (!pluginClass) {
      throw new Error(`Plugin export not found in ${entryPath}`);
    }

    // Instantiate plugin
    const plugin = new pluginClass() as Plugin;
    plugin.manifest = manifest;

    // Validate plugin implements required interface
    this.validatePluginInterface(plugin, manifest.type);

    return plugin;
  }

  async loadFromNpm(name: string, version?: string): Promise<Plugin> {
    // For npm packages, we'd use dynamic import with package name
    // This is a simplified version - in production you'd use a proper package manager
    const packageName = version ? `${name}@${version}` : name;

    try {
      const module = await import(packageName);
      const pluginClass = module.default || module.Plugin || module[Object.keys(module)[0]];

      if (!pluginClass) {
        throw new Error(`No plugin export found in package ${packageName}`);
      }

      // Try to load manifest from package
      let manifest: PluginManifest;
      try {
        const manifestPath = join(
          dirname(fileURLToPath(import.meta.url)),
          '..',
          'node_modules',
          name,
          'plugin.json'
        );
        if (existsSync(manifestPath)) {
          const manifestContent = readFileSync(manifestPath, 'utf-8');
          manifest = JSON.parse(manifestContent);
        } else {
          // Generate minimal manifest from package.json
          const pkgPath = join(
            dirname(fileURLToPath(import.meta.url)),
            '..',
            'node_modules',
            name,
            'package.json'
          );
          const pkgContent = readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgContent);

          manifest = {
            name: pkg.name,
            version: pkg.version,
            type: 'ai-provider', // default, would need better detection
            description: pkg.description,
            author: pkg.author,
            license: pkg.license,
            main: pkg.main || 'index.js',
            dependencies: pkg.dependencies,
            peerDependencies: pkg.peerDependencies,
          };
        }
      } catch {
        throw new Error(`Failed to load manifest for ${name}`);
      }

      const plugin = new pluginClass() as Plugin;
      plugin.manifest = manifest;

      return plugin;
    } catch (error) {
      throw new Error(`Failed to load plugin from npm: ${error}`);
    }
  }

  async validatePlugin(plugin: Plugin): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check manifest
    try {
      this.validateManifest(plugin.manifest);
    } catch (error) {
      errors.push(`Manifest validation failed: ${error}`);
    }

    // Check required methods
    if (typeof plugin.init !== 'function') {
      errors.push('Plugin must implement init(config) method');
    }
    if (typeof plugin.shutdown !== 'function') {
      errors.push('Plugin must implement shutdown() method');
    }

    // Type-specific validation
    switch (plugin.manifest.type) {
      case 'ai-provider':
        if (typeof (plugin as any).chat !== 'function') {
          errors.push('AI provider plugin must implement chat() method');
        }
        if (typeof (plugin as any).stream !== 'function') {
          errors.push('AI provider plugin must implement stream() method');
        }
        if (typeof (plugin as any).listModels !== 'function') {
          errors.push('AI provider plugin must implement listModels() method');
        }
        break;
      case 'fetcher':
        if (typeof (plugin as any).fetch !== 'function') {
          errors.push('Fetcher plugin must implement fetch() method');
        }
        if (typeof (plugin as any).parse !== 'function') {
          errors.push('Fetcher plugin must implement parse() method');
        }
        break;
      case 'output':
        if (typeof (plugin as any).send !== 'function') {
          errors.push('Output plugin must implement send() method');
        }
        break;
      case 'transformer':
        if (typeof (plugin as any).transform !== 'function') {
          errors.push('Transformer plugin must implement transform() method');
        }
        break;
    }

    // Validate config
    const configValidation = await validateConfig(
      plugin.config.config,
      plugin.manifest.configSchema || {}
    );
    errors.push(...configValidation.errors);

    return { valid: errors.length === 0, errors };
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name || typeof manifest.name !== 'string') {
      throw new Error('Plugin manifest must have a name');
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
      throw new Error('Plugin manifest must have a version');
    }
    if (
      !manifest.type ||
      !['ai-provider', 'fetcher', 'output', 'transformer'].includes(manifest.type)
    ) {
      throw new Error('Plugin manifest must have a valid type');
    }
    if (!manifest.main || typeof manifest.main !== 'string') {
      throw new Error('Plugin manifest must have a main entry point');
    }
  }

  private validatePluginInterface(plugin: Plugin, type: PluginType): void {
    const requiredMethods: Record<PluginType, string[]> = {
      'ai-provider': ['chat', 'stream', 'listModels'],
      fetcher: ['fetch', 'parse'],
      output: ['send'],
      transformer: ['transform'],
    };

    for (const method of requiredMethods[type] || []) {
      if (typeof (plugin as any)[method] !== 'function') {
        throw new Error(`Plugin ${plugin.manifest.name} must implement ${method}() method`);
      }
    }
  }

  async discoverPlugins(pluginsDir: string): Promise<Plugin[]> {
    if (!existsSync(pluginsDir)) {
      return [];
    }

    const plugins: Plugin[] = [];
    const entries = readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = join(pluginsDir, entry.name);
      const manifestPath = join(pluginPath, 'plugin.json');

      if (!existsSync(manifestPath)) continue;

      try {
        const plugin = await this.loadFromPath(pluginPath);
        this.loadedPlugins.set(plugin.manifest.name, plugin);
        plugins.push(plugin);
      } catch (error) {
        console.warn(`Failed to load plugin ${entry.name}:`, error);
      }
    }

    return plugins;
  }

  getLoadedPlugins(): Plugin[] {
    return Array.from(this.loadedPlugins.values());
  }
}

export const pluginLoader = new PluginLoaderImpl();
