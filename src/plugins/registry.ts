/**
 * Plugin Registry - Central registry for managing plugins
 */

import { mergeWithDefaults, validateConfig } from './config.js';
import {
  type Plugin,
  type PluginConfig,
  type PluginManifest,
  type PluginRegistry,
  type PluginType,
  type ValidationResult,
} from './types.js';

export class PluginRegistryImpl implements PluginRegistry {
  private plugins = new Map<string, Plugin>();

  async register(plugin: Plugin): Promise<void> {
    const { manifest, config } = plugin;

    // Validate manifest
    this.validateManifest(manifest);

    // Apply defaults from schema
    let mergedConfig = config;
    if (manifest.configSchema) {
      mergedConfig = {
        ...config,
        config: mergeWithDefaults(config.config || {}, manifest.configSchema),
      };
    }

    // Validate config against schema
    const validation = await this.validatePluginConfig(manifest, mergedConfig);
    if (!validation.valid) {
      throw new Error(
        `Invalid config for plugin ${manifest.name}: ${validation.errors.join(', ')}`
      );
    }

    // Check for conflicts
    if (this.plugins.has(manifest.name)) {
      throw new Error(`Plugin ${manifest.name} already registered`);
    }

    // Initialize plugin with merged config
    await plugin.init(mergedConfig);

    // Store the instance itself (a spread copy would lose prototype methods);
    // the merged config is applied to the instance.
    plugin.config = mergedConfig;
    this.plugins.set(manifest.name, plugin);
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    await plugin.shutdown();
    this.plugins.delete(name);
  }

  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getByType(type: PluginType): Plugin[] {
    return this.getAll().filter((p) => p.manifest.type === type);
  }

  getEnabledByType(type: PluginType): Plugin[] {
    return this.getByType(type).filter((p) => p.config.enabled);
  }

  private validateManifest(manifest: PluginManifest): void {
    if (!manifest.name || typeof manifest.name !== 'string') {
      throw new Error('Plugin manifest must have a name');
    }
    if (!manifest.version || typeof manifest.version !== 'string') {
      throw new Error('Plugin manifest must have a version');
    }
    if (
      !(
        manifest.type && ['ai-provider', 'fetcher', 'output', 'transformer'].includes(manifest.type)
      )
    ) {
      throw new Error('Plugin manifest must have a valid type');
    }
    if (!manifest.main || typeof manifest.main !== 'string') {
      throw new Error('Plugin manifest must have a main entry point');
    }
  }

  private async validatePluginConfig(
    manifest: PluginManifest,
    config: PluginConfig
  ): Promise<ValidationResult> {
    if (!manifest.configSchema) {
      return { valid: true, errors: [] };
    }

    return validateConfig(config.config, manifest.configSchema);
  }
}

export const pluginRegistry = new PluginRegistryImpl();
