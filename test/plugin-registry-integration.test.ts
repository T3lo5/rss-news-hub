import assert from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { pluginRegistry } from '../src/plugins/registry.js';
import type { Plugin, PluginConfig, PluginManifest, PluginType } from '../src/plugins/types.js';

// Mock plugin implementation for testing
function createMockPlugin(
  name: string,
  type: PluginType,
  config: Record<string, unknown> = {}
): Plugin {
  const manifest: PluginManifest = {
    name,
    version: '1.0.0',
    type,
    main: 'index.js',
  };

  // Allow enabled to be overridden by config
  const { enabled = true, ...restConfig } = config;

  return {
    manifest,
    config: { ...restConfig, enabled },
    async init(config: PluginConfig) {
      // Mock implementation
    },
    async shutdown() {
      // Mock implementation
    },
  };
}

describe('Plugin Registry', () => {
  beforeEach(async () => {
    // Clear registry before each test
    const plugins = pluginRegistry.getAll();
    for (const plugin of plugins) {
      await pluginRegistry.unregister(plugin.manifest.name);
    }
  });

  afterEach(async () => {
    // Clean up after each test
    const plugins = pluginRegistry.getAll();
    for (const plugin of plugins) {
      await pluginRegistry.unregister(plugin.manifest.name);
    }
  });

  describe('register/unregister', () => {
    test('registers and retrieves a plugin', async () => {
      const plugin = createMockPlugin('test-ai', 'ai-provider');

      await pluginRegistry.register(plugin);
      const retrieved = pluginRegistry.get('test-ai');

      assert.ok(retrieved);
      assert.strictEqual(retrieved!.manifest.name, 'test-ai');
      assert.strictEqual(retrieved!.manifest.type, 'ai-provider');
    });

    test('prevents duplicate registration', async () => {
      const plugin1 = createMockPlugin('test-ai', 'ai-provider');
      const plugin2 = createMockPlugin('test-ai', 'output');

      await pluginRegistry.register(plugin1);

      await assert.rejects(pluginRegistry.register(plugin2), /already registered/);
    });

    test('unregisters a plugin', async () => {
      const plugin = createMockPlugin('test-ai', 'ai-provider');

      await pluginRegistry.register(plugin);
      assert.ok(pluginRegistry.get('test-ai'));

      await pluginRegistry.unregister('test-ai');
      assert.ok(!pluginRegistry.get('test-ai'));
    });

    test('rejects unregistering non-existent plugin', async () => {
      await assert.rejects(pluginRegistry.unregister('non-existent'), /not found/);
    });
  });

  describe('getByType', () => {
    test('filters plugins by type', async () => {
      const aiPlugin = createMockPlugin('ai-1', 'ai-provider');
      const fetcherPlugin = createMockPlugin('fetcher-1', 'fetcher');
      const outputPlugin = createMockPlugin('output-1', 'output');

      await pluginRegistry.register(aiPlugin);
      await pluginRegistry.register(fetcherPlugin);
      await pluginRegistry.register(outputPlugin);

      const aiPlugins = pluginRegistry.getByType('ai-provider');
      const fetcherPlugins = pluginRegistry.getByType('fetcher');
      const outputPlugins = pluginRegistry.getByType('output');

      assert.strictEqual(aiPlugins.length, 1);
      assert.strictEqual(fetcherPlugins.length, 1);
      assert.strictEqual(outputPlugins.length, 1);
    });

    test('getEnabledByType filters by enabled status', async () => {
      // Clear any existing plugins first
      const existing = pluginRegistry.getAll();
      for (const p of existing) {
        await pluginRegistry.unregister(p.manifest.name);
      }

      const enabledPlugin = createMockPlugin('enabled-ai', 'ai-provider', { enabled: true });
      const disabledPlugin = createMockPlugin('disabled-ai', 'ai-provider', { enabled: false });

      await pluginRegistry.register(enabledPlugin);
      await pluginRegistry.register(disabledPlugin);

      const enabledPlugins = pluginRegistry.getEnabledByType('ai-provider');

      assert.strictEqual(enabledPlugins.length, 1);
      assert.strictEqual(enabledPlugins[0].manifest.name, 'enabled-ai');
    });
  });

  describe('config validation', () => {
    test('validates plugin config against schema', async () => {
      const manifest = {
        name: 'test-ai-invalid',
        version: '1.0.0',
        type: 'ai-provider' as PluginType,
        main: 'index.js',
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string', minLength: 1 },
            model: { type: 'string', default: 'default' },
          },
          required: ['apiKey'],
        },
      };

      // PluginConfig has a nested config property
      const plugin = {
        manifest,
        config: {
          apiKey: '',
          model: 'gpt-4',
          enabled: true,
          config: { apiKey: '', model: 'gpt-4' }, // nested config for validation
        },
        async init() {},
        async shutdown() {},
      } as any;

      await assert.rejects(pluginRegistry.register(plugin), /Invalid config/);
    });

    test('accepts valid config with defaults', async () => {
      const manifest = {
        name: 'test-ai-valid',
        version: '1.0.0',
        type: 'ai-provider' as PluginType,
        main: 'index.js',
        configSchema: {
          type: 'object',
          properties: {
            apiKey: { type: 'string', minLength: 1 },
            model: { type: 'string', default: 'default-model' },
          },
          required: ['apiKey'],
        },
      };

      const plugin = {
        manifest,
        config: {
          apiKey: 'test-key',
          enabled: true,
          config: { apiKey: 'test-key' }, // nested config for validation
        },
        async init() {},
        async shutdown() {},
      } as any;

      await pluginRegistry.register(plugin);
      const retrieved = pluginRegistry.get('test-ai-valid');
      // Model is in the nested config after merging
      assert.strictEqual(retrieved!.config.config.model, 'default-model');
    });
  });

  describe('shutdown on unregister', () => {
    test('calls shutdown on unregister', async () => {
      let shutdownCalled = false;

      const plugin = createMockPlugin('test-shutdown', 'ai-provider');
      plugin.shutdown = async () => {
        shutdownCalled = true;
      };

      await pluginRegistry.register(plugin);
      await pluginRegistry.unregister('test-shutdown');

      assert.ok(shutdownCalled);
    });
  });
});
