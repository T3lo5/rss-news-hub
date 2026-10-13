import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { discoverLocalPlugins, loadPluginConfig } from '../src/plugins/config-loader.js';

const TEST_DIR = resolve('/tmp/rss-news-hub-test');
const CONFIG_FILE = join(TEST_DIR, 'plugins.yaml');
const PLUGINS_DIR = join(TEST_DIR, 'plugins');

function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(PLUGINS_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function createConfigFile(content: string) {
  writeFileSync(CONFIG_FILE, content);
}

function createLocalPlugin(name: string, manifest: object, config?: object) {
  const pluginDir = join(PLUGINS_DIR, name);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
  if (config) {
    writeFileSync(join(pluginDir, 'config.json'), JSON.stringify(config, null, 2));
  }
}

describe('Plugin Config Loader', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('loadPluginConfig', () => {
    test('loads basic plugin config from YAML', async () => {
      const yaml = `
plugins:
  ai-providers:
    - name: openai
      enabled: true
      config:
        apiKey: "test-key"
        model: "gpt-4"
  fetchers:
    - name: rss-fetcher
      enabled: true
      config:
        maxItemsPerFeed: 10
`;
      createConfigFile(yaml);

      const { plugins, errors } = await loadPluginConfig(CONFIG_FILE);

      assert.strictEqual(errors.length, 0);
      assert.ok(plugins.length >= 2);

      const openai = plugins.find((p) => p.manifest.name === 'openai');
      assert.ok(openai);
      assert.strictEqual(openai.source, 'builtin');
      assert.strictEqual(openai.config.apiKey, 'test-key');
      assert.strictEqual(openai.config.model, 'gpt-4');

      const fetcher = plugins.find((p) => p.manifest.name === 'rss-fetcher');
      assert.ok(fetcher);
      assert.strictEqual(fetcher.config.maxItemsPerFeed, 10);
    });

    test('handles missing config file gracefully', async () => {
      const { plugins, errors } = await loadPluginConfig('/nonexistent/path.yaml');
      assert.ok(errors.length > 0);
      assert.strictEqual(plugins.length, 0);
    });

    test('handles invalid YAML gracefully', async () => {
      writeFileSync(CONFIG_FILE, 'invalid: yaml: [');
      const { plugins, errors } = await loadPluginConfig(CONFIG_FILE);
      assert.ok(errors.length > 0);
      assert.strictEqual(plugins.length, 0);
    });

    test('loads npm plugins from config', async () => {
      const yaml = `
plugins:
  ai-providers:
    - name: custom-ai
      source: npm
      enabled: true
      config:
        apiKey: "npm-key"
`;
      createConfigFile(yaml);

      const { plugins } = await loadPluginConfig(CONFIG_FILE);

      // npm plugins are just recorded, not actually loaded
      const npmPlugin = plugins.find((p) => p.manifest.name === 'custom-ai');
      assert.ok(npmPlugin);
      assert.strictEqual(npmPlugin.source, 'npm');
      assert.strictEqual(npmPlugin.config.apiKey, 'npm-key');
    });

    test('loads local plugins from config', async () => {
      const yaml = `
plugins:
  outputs:
    - name: custom-output
      source: local
      path: ./plugins/custom-output
      enabled: true
      config:
        webhookUrl: "https://example.com/webhook"
`;
      createConfigFile(yaml);

      // Create the local plugin directory
      createLocalPlugin('custom-output', {
        name: 'custom-output',
        version: '1.0.0',
        type: 'output',
        main: 'index.js',
      });

      const { plugins, errors } = await loadPluginConfig(CONFIG_FILE);

      assert.strictEqual(errors.length, 0);
      const localPlugin = plugins.find((p) => p.manifest.name === 'custom-output');
      assert.ok(localPlugin);
      assert.strictEqual(localPlugin.source, 'local');
      assert.ok(localPlugin.path);
    });

    test('reports errors for missing local plugin path', async () => {
      const yaml = `
plugins:
  outputs:
    - name: missing-output
      source: local
      path: ./plugins/missing-output
      enabled: true
`;
      createConfigFile(yaml);

      const { plugins, errors } = await loadPluginConfig(CONFIG_FILE);

      assert.ok(errors.some((e) => e.includes('not found')));
      assert.strictEqual(plugins.length, 0);
    });

    test('handles unknown builtin plugin', async () => {
      const yaml = `
plugins:
  ai-providers:
    - name: unknown-ai
      enabled: true
`;
      createConfigFile(yaml);

      const { plugins, errors } = await loadPluginConfig(CONFIG_FILE);

      assert.ok(errors.some((e) => e.includes('Unknown builtin plugin')));
      assert.strictEqual(plugins.length, 0);
    });

    test('applies enabled: false correctly', async () => {
      const yaml = `
plugins:
  ai-providers:
    - name: openai
      enabled: false
`;
      createConfigFile(yaml);

      const { plugins } = await loadPluginConfig(CONFIG_FILE);
      const openai = plugins.find((p) => p.manifest.name === 'openai');
      assert.ok(openai);
      assert.strictEqual(openai.config.enabled, false);
    });
  });

  describe('discoverLocalPlugins', () => {
    test('discovers local plugins from directory', async () => {
      createLocalPlugin(
        'local-ai',
        {
          name: 'local-ai',
          version: '1.0.0',
          type: 'ai-provider',
          main: 'index.js',
        },
        { apiKey: 'local-key' }
      );

      createLocalPlugin('local-fetcher', {
        name: 'local-fetcher',
        version: '1.0.0',
        type: 'fetcher',
        main: 'index.js',
      });

      const { plugins, errors } = await discoverLocalPlugins(PLUGINS_DIR);

      assert.strictEqual(errors.length, 0);
      assert.strictEqual(plugins.length, 2);

      const ai = plugins.find((p) => p.manifest.name === 'local-ai');
      assert.ok(ai);
      assert.strictEqual(ai.source, 'local');
      assert.strictEqual(ai.config.apiKey, 'local-key');

      const fetcher = plugins.find((p) => p.manifest.name === 'local-fetcher');
      assert.ok(fetcher);
      assert.strictEqual(fetcher.source, 'local');
    });

    test('ignores directories without plugin.json', async () => {
      const emptyDir = join(PLUGINS_DIR, 'not-a-plugin');
      mkdirSync(emptyDir, { recursive: true });
      writeFileSync(join(emptyDir, 'README.md'), '# Not a plugin');

      const { plugins, errors } = await discoverLocalPlugins(PLUGINS_DIR);

      assert.strictEqual(errors.length, 0);
      assert.strictEqual(plugins.length, 0);
    });

    test('handles missing plugin.json gracefully', async () => {
      const invalidDir = join(PLUGINS_DIR, 'invalid');
      mkdirSync(invalidDir, { recursive: true });
      writeFileSync(join(invalidDir, 'package.json'), '{"name": "test"}');

      const { plugins } = await discoverLocalPlugins(PLUGINS_DIR);

      // Should not crash, just skip invalid plugins
      assert.ok(Array.isArray(plugins));
    });

    test('handles empty directory', async () => {
      cleanupTestDir();
      setupTestDir(); // Recreate empty dirs

      const { plugins, errors } = await discoverLocalPlugins(PLUGINS_DIR);

      assert.strictEqual(errors.length, 0);
      assert.strictEqual(plugins.length, 0);
    });
  });
});
