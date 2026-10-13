import assert from 'node:assert';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { ConfigWatcher } from '../src/plugins/config-watcher.js';
import { pluginRegistry } from '../src/plugins/registry.js';
import type { Plugin } from '../src/plugins/types.js';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const WORDCOUNT_DIR = join(PROJECT_ROOT, 'plugins', 'example-wordcount');

const tempDir = mkdtempSync(join(tmpdir(), 'config-watcher-'));
const configPath = join(tempDir, 'plugins.yaml');

const loaded: Plugin[] = [];
const unloaded: string[] = [];
const configChanges: number[] = [];

function writeConfig(body: string) {
  writeFileSync(configPath, body, 'utf-8');
}

/** Simulate an editor/`sed -i` atomic save: write temp + rename (new inode). */
function atomicWriteConfig(body: string) {
  const tempPath = `${configPath}.tmp`;
  writeFileSync(tempPath, body, 'utf-8');
  renameSync(tempPath, configPath);
}

const WITH_WORDCOUNT = `plugins:
  transformers:
    - name: example-wordcount
      source: local
      path: ${WORDCOUNT_DIR}
      enabled: true
      config:
        maxWords: 3
`;

const WITH_BUILTIN = `plugins:
  transformers:
    - name: summarizer
      enabled: true
      config: {}
`;

const EMPTYISH = `plugins: {}
`;

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timeout waiting for condition');
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('ConfigWatcher hot reload (E2E)', () => {
  let watcher: ConfigWatcher;

  before(() => {
    writeConfig(EMPTYISH);
    watcher = new ConfigWatcher({
      configPath,
      onPluginLoad: (plugin: Plugin) => loaded.push(plugin),
      onPluginUnload: (name: string) => unloaded.push(name),
      onConfigChange: () => configChanges.push(Date.now()),
    });
  });

  beforeEach(async () => {
    // Sync the watcher's bookkeeping with the (cleaned) global registry
    await watcher.unloadAll();
    for (const plugin of pluginRegistry.getAll()) {
      try {
        await pluginRegistry.unregister(plugin.manifest.name);
      } catch {}
    }
    loaded.length = 0;
    unloaded.length = 0;
  });

  after(async () => {
    await watcher.stop();
    rmSync(tempDir, { recursive: true, force: true });
    for (const plugin of pluginRegistry.getAll()) {
      try {
        await pluginRegistry.unregister(plugin.manifest.name);
      } catch {}
    }
  });

  test('start() loads the plugins already in the config', async () => {
    writeConfig(WITH_WORDCOUNT);
    await watcher.start();

    await waitFor(() => loaded.some((p) => p.manifest.name === 'example-wordcount'));

    const registered = pluginRegistry.get('example-wordcount');
    assert.ok(registered, 'example-wordcount should be registered');
    assert.strictEqual(registered!.manifest.type, 'transformer');
    // The YAML config (merged with schema defaults) reached the instance
    assert.strictEqual(registered!.config.config.maxWords, 3);
  });

  test('adding an entry to the YAML loads the plugin (hot reload)', async () => {
    // Baseline: empty config, nothing loaded (a full reload cycle confirms it)
    writeConfig(EMPTYISH);
    const baseline = configChanges.length;
    await waitFor(() => configChanges.length > baseline);
    assert.strictEqual(pluginRegistry.get('example-wordcount'), undefined);
    loaded.length = 0;
    unloaded.length = 0;

    writeConfig(WITH_WORDCOUNT);

    await waitFor(() => loaded.some((p) => p.manifest.name === 'example-wordcount'));
    const registered = pluginRegistry.get('example-wordcount');
    assert.ok(registered, 'plugin should be registered after the YAML change');
    assert.strictEqual(registered!.config.config.maxWords, 3);
  });

  test('removing an entry from the YAML unloads the plugin', async () => {
    writeConfig(WITH_WORDCOUNT);
    await waitFor(() => pluginRegistry.get('example-wordcount') !== undefined);
    unloaded.length = 0;

    writeConfig(EMPTYISH);

    await waitFor(() => unloaded.includes('example-wordcount'));
    assert.strictEqual(pluginRegistry.get('example-wordcount'), undefined);
  });

  test('builtin plugins are instantiated from the YAML name', async () => {
    writeConfig(WITH_BUILTIN);

    await waitFor(() => loaded.some((p) => p.manifest.name === 'summarizer'));
    const registered = pluginRegistry.get('summarizer');
    assert.ok(registered, 'builtin summarizer should be registered');
    assert.strictEqual(registered!.manifest.type, 'transformer');
    assert.strictEqual(typeof (registered as any).transform, 'function');
  });

  test('loaded local plugin exposes its working implementation', async () => {
    writeConfig(WITH_WORDCOUNT);
    await waitFor(() => loaded.some((p) => p.manifest.name === 'example-wordcount'));

    const registered = pluginRegistry.get('example-wordcount') as any;
    const out = await registered.transform('hello world from the example plugin', {
      type: 'summary',
      language: 'en',
    });

    assert.match(out, /6 palavras · 35 caracteres/, out);
    assert.match(out, /excede o limite de 3 palavras/, out);
  });

  test('survives atomic saves (rename replaces the inode)', async () => {
    // Editors and `sed -i` replace the file via rename; a watcher bound to
    // the old inode would go deaf after the first save.
    writeConfig(WITH_WORDCOUNT);
    await waitFor(() => loaded.some((p) => p.manifest.name === 'example-wordcount'));

    atomicWriteConfig(EMPTYISH);
    await waitFor(() => unloaded.includes('example-wordcount'));

    atomicWriteConfig(WITH_WORDCOUNT);
    await waitFor(() => pluginRegistry.get('example-wordcount') !== undefined);
    assert.ok(pluginRegistry.get('example-wordcount'), 'should reload after atomic save');
  });
});
