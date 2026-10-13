import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const CLI_PATH = join(PROJECT_ROOT, 'src', 'cli', 'index.ts');
const PLUGINS_DIR = join(PROJECT_ROOT, 'plugins');
const CONFIG_FILE = join(PROJECT_ROOT, 'config', 'plugins.yaml');

const CONFIG_BACKUP_FILE = join(PROJECT_ROOT, 'config', 'plugins.yaml.test-backup');
const hadConfig = existsSync(CONFIG_FILE);

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run the CLI as a real child process, exactly like a user would. */
function runCli(args: string[], timeoutMs = 20000): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'node',
      ['--import', 'tsx', CLI_PATH, ...args],
      { cwd: PROJECT_ROOT, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolvePromise({
          code: error ? (error.code as number) : 0,
          stdout,
          stderr,
        });
      }
    );
  });
}

function readConfigText(): string {
  return existsSync(CONFIG_FILE) ? readFileSync(CONFIG_FILE, 'utf-8') : '';
}

describe('CLI - Plugin Management', () => {
  before(() => {
    // Preserve any user config so the suite never destroys real data.
    if (hadConfig) {
      writeFileSync(CONFIG_BACKUP_FILE, readFileSync(CONFIG_FILE, 'utf-8'));
    }
  });

  after(() => {
    // Restore the user's config and drop scaffolds created by tests.
    if (hadConfig) {
      writeFileSync(CONFIG_FILE, readFileSync(CONFIG_BACKUP_FILE, 'utf-8'));
      rmSync(CONFIG_BACKUP_FILE, { force: true });
    } else {
      rmSync(CONFIG_FILE, { force: true });
    }
    for (const name of ['cli-test-fetcher', 'cli-test-output']) {
      rmSync(join(PLUGINS_DIR, name), { recursive: true, force: true });
    }
  });

  test('plugin --help lists every management command', async () => {
    const { code, stdout } = await runCli(['--help']);

    assert.strictEqual(code, 0);
    for (const cmd of [
      'plugin:list',
      'plugin:install',
      'plugin:enable',
      'plugin:disable',
      'plugin:create',
      'plugin:remove',
      'plugin:status',
    ]) {
      assert.ok(stdout.includes(cmd), `expected help to mention ${cmd}`);
    }
  });

  test('plugin:list returns the built-in plugins', async () => {
    const { code, stdout } = await runCli(['plugin:list']);

    assert.strictEqual(code, 0);
    for (const name of ['openai', 'rss-fetcher', 'telegram', 'summarizer']) {
      assert.ok(stdout.includes(name), `expected list to include ${name}`);
    }
  });

  test('plugin:list --json emits a machine readable array', async () => {
    const { code, stdout } = await runCli(['plugin:list', '--json']);

    assert.strictEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed), 'expected an array');
    assert.ok(parsed.length > 0, 'expected at least one plugin');

    const telegram = parsed.find((p: any) => p?.manifest?.name === 'telegram');
    assert.ok(telegram, 'expected telegram in the JSON output');
    assert.strictEqual(telegram.source, 'builtin');
    assert.strictEqual(telegram.manifest.type, 'output');
  });

  test('plugin:list --type filters by plugin type', async () => {
    const { code, stdout } = await runCli(['plugin:list', '--type', 'output', '--json']);

    assert.strictEqual(code, 0);
    const parsed = JSON.parse(stdout);
    assert.ok(parsed.length > 0);
    for (const plugin of parsed) {
      assert.strictEqual(plugin.manifest.type, 'output');
    }
  });

  test('plugin:status shows details for an existing plugin', async () => {
    const { code, stdout } = await runCli(['plugin:status', 'telegram']);

    assert.strictEqual(code, 0);
    assert.ok(stdout.includes('telegram'));
    assert.ok(stdout.includes('output'));
  });

  test('plugin:status exits non-zero for an unknown plugin', async () => {
    const { code, stderr } = await runCli(['plugin:status', 'does-not-exist']);

    assert.strictEqual(code, 1);
    assert.ok(stderr.includes('not found'));
  });

  test('plugin:disable persists enabled:false to plugins.yaml', async () => {
    const { code } = await runCli(['plugin:disable', 'telegram']);
    assert.strictEqual(code, 0);

    const configText = readConfigText();
    assert.ok(configText.includes('telegram'), 'expected telegram in plugins.yaml');
    assert.ok(configText.includes('enabled: false'), 'expected enabled: false');

    // The disabled state must be reflected back in the listing.
    const list = await runCli(['plugin:list', '--json']);
    const parsed = JSON.parse(list.stdout);
    const telegram = parsed.find((p: any) => p?.manifest?.name === 'telegram');
    assert.strictEqual(telegram.config.enabled, false);
  });

  test('plugin:list --enabled-only hides disabled plugins', async () => {
    await runCli(['plugin:disable', 'telegram']);

    const { code, stdout } = await runCli(['plugin:list', '--enabled-only', '--json']);
    assert.strictEqual(code, 0);

    const parsed = JSON.parse(stdout);
    const telegram = parsed.find((p: any) => p?.manifest?.name === 'telegram');
    assert.strictEqual(telegram, undefined, 'disabled telegram must be filtered out');
  });

  test('plugin:enable re-enables a plugin', async () => {
    await runCli(['plugin:disable', 'telegram']);

    const { code } = await runCli(['plugin:enable', 'telegram']);
    assert.strictEqual(code, 0);
    assert.ok(readConfigText().includes('enabled: true'));

    const list = await runCli(['plugin:list', '--json']);
    const parsed = JSON.parse(list.stdout);
    const telegram = parsed.find((p: any) => p?.manifest?.name === 'telegram');
    assert.strictEqual(telegram.config.enabled, true);
  });

  test('plugin:enable exits non-zero for an unknown plugin', async () => {
    const { code } = await runCli(['plugin:enable', 'does-not-exist']);
    assert.strictEqual(code, 1);
  });

  test('plugin:create scaffolds a loadable plugin', async () => {
    const name = 'cli-test-fetcher';
    rmSync(join(PLUGINS_DIR, name), { recursive: true, force: true });

    const { code, stdout } = await runCli(['plugin:create', name, '--type', 'fetcher']);
    assert.strictEqual(code, 0);
    assert.ok(stdout.includes('Created'));

    const dir = join(PLUGINS_DIR, name);
    for (const file of ['plugin.json', 'index.js', 'config.json', 'README.md']) {
      assert.ok(existsSync(join(dir, file)), `expected ${file} to exist`);
    }

    const manifest = JSON.parse(readFileSync(join(dir, 'plugin.json'), 'utf-8'));
    assert.strictEqual(manifest.name, name);
    assert.strictEqual(manifest.type, 'fetcher');
    assert.strictEqual(manifest.main, 'index.js');

    // The scaffold must be valid JavaScript, not TypeScript.
    const source = readFileSync(join(dir, 'index.js'), 'utf-8');
    assert.ok(!source.includes('config: any'), 'scaffold must not contain TS annotations');
    assert.ok(
      source.includes('CliTestFetcherFetcherPlugin'),
      'expected a sanitized PascalCase class name (hyphens stripped)'
    );
    assert.ok(!/export class \w*-/.test(source), 'class name must not contain hyphens');
  });

  test('plugin:create rejects an invalid type', async () => {
    const { code, stderr } = await runCli(['plugin:create', 'bad-plugin', '--type', 'nope']);

    assert.strictEqual(code, 1);
    assert.ok(stderr.includes('Invalid plugin type'));
  });

  test('plugin:create refuses to overwrite an existing directory', async () => {
    const name = 'cli-test-fetcher';
    mkdirSync(join(PLUGINS_DIR, name), { recursive: true });

    const { code, stderr } = await runCli(['plugin:create', name, '--type', 'fetcher']);
    assert.strictEqual(code, 1);
    assert.ok(stderr.includes('already exists'));
  });

  test('plugin:remove requires --force', async () => {
    const name = 'cli-test-output';
    mkdirSync(join(PLUGINS_DIR, name), { recursive: true });
    writeFileSync(join(PLUGINS_DIR, name, 'plugin.json'), JSON.stringify({ name }));

    const { code } = await runCli(['plugin:remove', name]);
    assert.strictEqual(code, 1);
    assert.ok(existsSync(join(PLUGINS_DIR, name)), 'plugin must survive without --force');
  });

  test('plugin:remove --force deletes the plugin directory', async () => {
    const name = 'cli-test-output';
    mkdirSync(join(PLUGINS_DIR, name), { recursive: true });
    writeFileSync(join(PLUGINS_DIR, name, 'plugin.json'), JSON.stringify({ name }));

    const { code, stdout } = await runCli(['plugin:remove', name, '--force']);
    assert.strictEqual(code, 0);
    assert.ok(stdout.includes('Removed'));
    assert.ok(!existsSync(join(PLUGINS_DIR, name)), 'directory must be gone');
  });
});
