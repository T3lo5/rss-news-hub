/**
 * Configuration Watcher - Hot reload support for plugin configurations
 */

import { existsSync, type FSWatcher, watch } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createBuiltinPlugin } from './builtin/index.js';
import { loadPluginConfig, type PluginYAMLConfig } from './config-loader.js';
import { pluginLoader } from './loader.js';
import { pluginRegistry } from './registry.js';
import { type Plugin, type PluginConfig } from './types.js';

/** Shape of one entry returned by loadPluginConfig(). */
interface PluginConfigEntry {
  manifest: { name: string; type: string };
  config: Record<string, unknown> & { enabled?: boolean };
  source: string;
  path?: string;
}

export interface ConfigWatcherOptions {
  configPath: string;
  pluginsDir?: string;
  onConfigChange?: (config: PluginYAMLConfig) => void;
  onPluginLoad?: (plugin: any) => void;
  onPluginUnload?: (pluginName: string) => void;
  onError?: (error: Error) => void;
}

export interface WatchedPlugin {
  name: string;
  config: PluginConfig;
  source: string;
  lastModified: number;
}

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private options: ConfigWatcherOptions;
  private loadedPlugins = new Map<string, WatchedPlugin>();
  private configPath: string;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(options: ConfigWatcherOptions) {
    this.options = options;
    this.configPath = resolve(options.configPath);
  }

  async start(): Promise<void> {
    // Initial load
    await this.reload();

    // Watch the config file's DIRECTORY, not the file itself: atomic saves
    // (editors, `sed -i`) replace the inode via rename, which permanently
    // kills file-level watchers on Linux.
    const configFilename = basename(this.configPath);
    this.watcher = watch(dirname(this.configPath), { persistent: true });
    this.watcher.on('change', (_event, filename) => {
      if (!filename || filename === configFilename) {
        this.scheduleReload();
      }
    });

    // Watch plugins directory if specified
    if (this.options.pluginsDir) {
      this.watchPluginsDir(this.options.pluginsDir);
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  /** Stop watching is NOT implied: unloads every plugin this watcher registered. */
  async unloadAll(): Promise<void> {
    for (const name of Array.from(this.loadedPlugins.keys())) {
      try {
        await pluginRegistry.unregister(name);
      } catch {}
      this.loadedPlugins.delete(name);
      this.options.onPluginUnload?.(name);
    }
  }

  private scheduleReload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.reload(), 100);
  }

  private async reload(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const { plugins, errors } = await loadPluginConfig(this.configPath);

      if (errors.length > 0) {
        for (const error of errors) {
          this.options.onError?.(new Error(error));
        }
      }

      // Entries with enabled: false are discovered but never loaded
      const discovered = new Map<string, PluginConfigEntry>();
      for (const entry of plugins) {
        if (entry.config?.enabled === false) continue;
        discovered.set(entry.manifest.name, entry);
      }

      // Unload plugins that vanished from the config (or got disabled)
      for (const name of Array.from(this.loadedPlugins.keys())) {
        if (discovered.has(name)) continue;
        try {
          await pluginRegistry.unregister(name);
        } catch {}
        this.loadedPlugins.delete(name);
        this.options.onPluginUnload?.(name);
      }

      // Load new entries and re-instantiate changed ones
      for (const [name, entry] of discovered) {
        const watched = this.loadedPlugins.get(name);
        const changed =
          watched && JSON.stringify(watched.config.config) !== JSON.stringify(entry.config);

        if (watched && !changed) continue;

        if (watched) {
          try {
            await pluginRegistry.unregister(name);
          } catch {}
        }

        try {
          const instance = await this.instantiate(entry);
          if (!instance) continue;

          await pluginRegistry.register(instance);
          this.loadedPlugins.set(name, {
            name,
            config: instance.config,
            source: entry.source,
            lastModified: Date.now(),
          });
          this.options.onPluginLoad?.(instance);
        } catch (error) {
          this.options.onError?.(error as Error);
        }
      }

      this.options.onConfigChange?.(this.getCurrentConfig());
    } catch (error) {
      this.options.onError?.(error as Error);
    } finally {
      this.isProcessing = false;
    }
  }

  /** Build a Plugin instance from a discovered config entry, with the YAML config applied. */
  private async instantiate(entry: PluginConfigEntry): Promise<Plugin | null> {
    let instance: Plugin;

    switch (entry.source) {
      case 'builtin':
        instance = await createBuiltinPlugin(entry.manifest.name, entry.config);
        break;
      case 'local':
        if (!entry.path) return null;
        instance = await pluginLoader.loadFromPath(entry.path);
        break;
      case 'npm':
        instance = await pluginLoader.loadFromNpm(entry.manifest.name);
        break;
      default:
        return null;
    }

    if (instance.manifest.name !== entry.manifest.name) {
      throw new Error(
        `Plugin name mismatch: config '${entry.manifest.name}' vs manifest '${instance.manifest.name}'`
      );
    }

    instance.config = {
      name: instance.manifest.name,
      enabled: true,
      config: entry.config,
    };

    return instance;
  }

  private watchPluginsDir(dir: string): void {
    // The plugins directory is optional (a fresh install may not have one)
    if (!existsSync(dir)) return;

    const watcher = watch(dir, { recursive: true, persistent: true });

    watcher.on('change', (eventType, filename) => {
      if (String(filename).endsWith('plugin.json')) {
        this.scheduleReload();
      }
    });

    watcher.on('add', (filename) => {
      if (String(filename).endsWith('plugin.json')) {
        this.scheduleReload();
      }
    });

    watcher.on('unlink', (filename) => {
      if (filename?.endsWith('plugin.json')) {
        this.scheduleReload();
      }
    });
  }

  getCurrentConfig(): any {
    return {
      plugins: Array.from(this.loadedPlugins.values()),
      lastReload: Date.now(),
    };
  }
}

export function createConfigWatcher(options: ConfigWatcherOptions): ConfigWatcher {
  return new ConfigWatcher(options);
}
