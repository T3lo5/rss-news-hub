#!/usr/bin/env node

/**
 * RSS News Hub CLI - Plugin Management Commands
 */

import { spawn } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { BUILTIN_PLUGINS, createBuiltinPlugin } from '../plugins/builtin/index.js';
import {
  discoverLocalPlugins,
  loadPluginConfig,
  PluginYAMLConfig,
  PluginYAMLEntry,
} from '../plugins/config-loader.js';
import { createConfigWatcher } from '../plugins/config-watcher.js';
import { discoverPlugins as discoverPluginsFn } from '../plugins/discovery.js';
import { pluginLoader } from '../plugins/loader.js';
import { pluginRegistry } from '../plugins/registry.js';
import { PluginConfig, PluginManifest, PluginType } from '../plugins/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CONFIG_FILE = resolve(PROJECT_ROOT, 'config', 'plugins.yaml');
const PLUGINS_DIR = resolve(PROJECT_ROOT, 'plugins');

const program = new Command();

program.name('rsshub').description('RSS News Hub - Plugin Management CLI').version('1.0.0');

program
  .command('plugin:list')
  .description('List all installed plugins')
  .option('--type <type>', 'Filter by plugin type (ai-provider, fetcher, output, transformer)')
  .option('--enabled-only', 'Show only enabled plugins')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const { plugins, errors } = await discoverAllPlugins({
      pluginsDir: resolve(PROJECT_ROOT, 'plugins'),
      npmPackages: [],
      includeBuiltin: true,
    });

    let pluginsList = plugins;

    if (options.type) {
      pluginsList = pluginsList.filter((p) => p.manifest.type === options.type);
    }

    if (options.enabledOnly) {
      pluginsList = pluginsList.filter((p) => p.config.enabled !== false);
    }

    if (options.json) {
      console.log(JSON.stringify(pluginsList, null, 2));
      return;
    }

    if (pluginsList.length === 0) {
      console.log(chalk.yellow('No plugins found.'));
      return;
    }

    console.log(chalk.bold('\nInstalled Plugins:\n'));

    for (const plugin of pluginsList) {
      const status = plugin.config.enabled !== false ? chalk.green('●') : chalk.red('○');
      const source = chalk.gray(`[${plugin.source}]`);
      const type = chalk.cyan(`[${plugin.manifest.type}]`);

      console.log(`${status} ${chalk.bold(plugin.manifest.name)} ${type} ${source}`);
      if (plugin.manifest.version) {
        console.log(`  Version: ${chalk.gray(plugin.manifest.version)}`);
      }
      if (plugin.manifest.description) {
        console.log(`  Description: ${chalk.gray(plugin.manifest.description)}`);
      }
      if (plugin.config && Object.keys(plugin.config).length > 1) {
        const configKeys = Object.keys(plugin.config).filter((k) => k !== 'enabled');
        if (configKeys.length > 0) {
          console.log(`  Config: ${chalk.gray(JSON.stringify(configKeys))}`);
        }
      }
      console.log('');
    }
  });

program
  .command('plugin:install <package>')
  .description('Install a plugin from npm')
  .option('--save', 'Save to plugins.yaml config', true)
  .option('--version <version>', 'Specific version to install')
  .action(async (packageName, options) => {
    console.log(chalk.blue(`Installing plugin: ${packageName}...`));

    try {
      // Check if already installed
      const { plugins } = await discoverAllPlugins();
      const existing = plugins.find((p) => p.manifest.name === packageName);

      if (existing && existing.source === 'npm') {
        console.log(chalk.yellow(`Plugin ${packageName} is already installed.`));
        return;
      }

      // Install via npm
      const installCommand = `npm install ${packageName}${options.version ? `@${options.version}` : ''} --save`;
      console.log(chalk.gray(`Running: ${installCommand}`));

      const child = spawn(
        'npm',
        ['install', packageName + (options.version ? `@${options.version}` : ''), '--save'],
        {
          cwd: resolve(PROJECT_ROOT),
          stdio: 'inherit',
        }
      );

      await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`npm install failed with code ${code}`));
        });
        child.on('error', reject);
      });

      console.log(chalk.green(`✓ Installed ${packageName} successfully`));

      if (options.save) {
        await savePluginToConfig(packageName, 'npm');
        console.log(chalk.green('✓ Saved to plugins.yaml'));
      }
    } catch (error) {
      console.error(chalk.red(`✗ Failed to install ${packageName}:`), error);
      process.exit(1);
    }
  });

program
  .command('plugin:enable <name>')
  .description('Enable a plugin')
  .action(async (name) => {
    try {
      const plugin = await findPlugin(name);
      if (!plugin) {
        console.error(chalk.red(`Plugin ${name} not found`));
        process.exit(1);
      }

      plugin.config.enabled = true;
      console.log(chalk.green(`✓ Enabled plugin: ${name}`));

      // Update config file if it exists
      await updatePluginInConfig(name, { enabled: true });
      console.log(chalk.green('✓ Updated plugins.yaml'));
    } catch (error) {
      console.error(chalk.red('✗ Failed to enable plugin:'), error);
      process.exit(1);
    }
  });

program
  .command('plugin:disable <name>')
  .description('Disable a plugin')
  .action(async (name) => {
    try {
      const plugin = await findPlugin(name);
      if (!plugin) {
        console.error(chalk.red(`Plugin ${name} not found`));
        process.exit(1);
      }

      plugin.config.enabled = false;
      console.log(chalk.green(`✓ Disabled plugin: ${name}`));

      await updatePluginInConfig(name, { enabled: false });
      console.log(chalk.green('✓ Updated plugins.yaml'));
    } catch (error) {
      console.error(chalk.red('✗ Failed to disable plugin:'), error);
      process.exit(1);
    }
  });

program
  .command('plugin:create <name>')
  .description('Create a new plugin scaffold')
  .requiredOption('--type <type>', 'Plugin type (ai-provider, fetcher, output, transformer)')
  .option('--author <author>', 'Plugin author', 'Your Name')
  .option('--description <description>', 'Plugin description', '')
  .option('--output <path>', 'Output directory', './plugins')
  .action(async (name, options) => {
    const { type, author, description, output } = options;

    const validTypes = ['ai-provider', 'fetcher', 'output', 'transformer'];
    if (!['ai-provider', 'fetcher', 'output', 'transformer'].includes(type)) {
      console.error(chalk.red(`Invalid plugin type. Must be one of: ${validTypes.join(', ')}`));
      process.exit(1);
    }

    const pluginDir = resolve(output, name);

    if (existsSync(pluginDir)) {
      console.error(chalk.red(`Directory ${pluginDir} already exists`));
      process.exit(1);
    }

    console.log(chalk.blue(`Creating plugin: ${name} (${type})`));

    // Create directory structure
    mkdirSync(pluginDir, { recursive: true });

    // Create plugin.json manifest
    const manifest = {
      name,
      version: '1.0.0',
      type: options.type,
      description: description || `Custom ${type} plugin`,
      author: author || 'Unknown',
      license: 'MIT',
      main: 'index.js',
      configSchema: getDefaultConfigSchema(options.type),
    };

    writeFileSync(resolve(output, name, 'plugin.json'), JSON.stringify(manifest, null, 2));

    // Create index.js scaffold
    const scaffold = generateScaffold(name, options.type);
    writeFileSync(resolve(output, name, 'index.js'), scaffold);

    // Create config.json template
    const configTemplate = generateConfigTemplate(options.type);
    writeFileSync(resolve(output, name, 'config.json'), JSON.stringify(configTemplate, null, 2));

    // Create README
    const readme = generateReadme(name, options.type, description || '');
    writeFileSync(resolve(output, name, 'README.md'), readme);

    console.log(chalk.green(`✓ Created plugin: ${name}`));
    console.log(chalk.gray(`Location: ${pluginDir}`));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  1. Edit index.js to implement your plugin logic'));
    console.log(chalk.gray('  2. Configure plugin in config/plugins.yaml'));
    console.log(chalk.gray(`  3. Run: rsshub plugin:enable ${name}`));
  });

program
  .command('plugin:remove <name>')
  .description('Remove a plugin (uninstall)')
  .option('--force', 'Force removal without confirmation')
  .action(async (name, options) => {
    if (!options.force) {
      console.log(chalk.yellow(`This will remove plugin: ${name}`));
      console.log(chalk.gray('Use --force to skip confirmation'));
      process.exit(1);
    }

    try {
      // Unregister from registry when the plugin is loaded there
      if (pluginRegistry.get(name)) {
        await pluginRegistry.unregister(name);
      }

      // Remove from plugins directory
      const pluginDir = resolve(PLUGINS_DIR, name);
      if (existsSync(pluginDir)) {
        rmSync(pluginDir, { recursive: true, force: true });
      }

      // Remove from config
      await removePluginFromConfig(name);

      console.log(chalk.green(`✓ Removed plugin: ${name}`));
    } catch (error) {
      console.error(chalk.red('✗ Failed to remove plugin:'), error);
      process.exit(1);
    }
  });

program
  .command('plugin:status <name>')
  .description('Show detailed status of a plugin')
  .action(async (name) => {
    const plugin = await findPlugin(name);
    if (!plugin) {
      console.error(chalk.red(`Plugin ${name} not found`));
      process.exit(1);
    }

    console.log(chalk.bold(`\nPlugin: ${plugin.manifest.name}`));
    console.log(`  Version: ${plugin.manifest.version}`);
    console.log(`  Type: ${plugin.manifest.type}`);
    console.log(
      `  Status: ${plugin.config.enabled !== false ? chalk.green('Enabled') : chalk.red('Disabled')}`
    );
    console.log(`  Source: ${(plugin as any).source || 'unknown'}`);
    if ((plugin as any).path) console.log(`  Path: ${(plugin as any).path}`);
    if (plugin.manifest.description) console.log(`  Description: ${plugin.manifest.description}`);
    if (plugin.manifest.author) console.log(`  Author: ${plugin.manifest.author}`);
    if (plugin.manifest.license) console.log(`  License: ${plugin.manifest.license}`);
    if (plugin.config && Object.keys(plugin.config).length > 0) {
      console.log(`\nConfig:`);
      console.log(JSON.stringify(plugin.config, null, 2));
    }
  });

// Helper functions
async function discoverAllPlugins(
  options: { pluginsDir?: string; npmPackages?: string[]; includeBuiltin?: boolean } = {}
) {
  const result = await discoverPluginsFn({
    pluginsDir: options.pluginsDir ?? resolve(PROJECT_ROOT, 'plugins'),
    npmPackages: options.npmPackages ?? [],
    includeBuiltin: options.includeBuiltin ?? true,
  });

  // Overlay config/plugins.yaml onto the discovered plugins so that
  // enabled/disabled state and settings survive across CLI runs. npm
  // entries that are not discovered locally are appended, which makes
  // `plugin:list` reflect everything installed via `plugin:install`.
  try {
    const { plugins: configured } = await loadPluginConfig(CONFIG_FILE);
    for (const entry of configured) {
      const name = entry.manifest?.name;
      if (!name) continue;

      const target = result.plugins.find((p: any) => p?.manifest?.name === name);
      if (target) {
        target.config = {
          ...target.config,
          ...entry.config,
          enabled: target.config?.enabled !== false && entry.config?.enabled !== false,
        };
      } else if (entry.source === 'npm') {
        result.plugins.push(entry);
      }
    }
  } catch {
    // A missing or unreadable config file must not break discovery.
  }

  return result;
}

/**
 * Find a single plugin by name across builtin, local and npm sources.
 * Returns undefined when the plugin does not exist.
 */
async function findPlugin(name: string) {
  const { plugins } = await discoverAllPlugins();
  return plugins.find((p: any) => p?.manifest?.name === name);
}

function getDefaultConfigSchema(type: string): object {
  const schemas: Record<string, object> = {
    'ai-provider': {
      type: 'object',
      properties: {
        apiKey: { type: 'string', minLength: 1 },
        baseUrl: { type: 'string', format: 'url' },
        model: { type: 'string' },
      },
      required: ['apiKey'],
    },
    fetcher: {
      type: 'object',
      properties: {
        timeout: { type: 'integer', minimum: 1000, default: 15000 },
        userAgent: { type: 'string' },
        maxItemsPerFeed: { type: 'integer', minimum: 1, default: 5 },
      },
    },
    output: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', format: 'url' },
        apiKey: { type: 'string' },
      },
    },
    transformer: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
      },
    },
  };
  return schemas[type] || {};
}

/**
 * Build a valid JS class name from a plugin name ("my-fetcher" -> "MyFetcher").
 * Hyphens and other non-identifier characters are stripped so the generated
 * scaffold parses as valid JavaScript.
 */
function pluginClassName(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function generateScaffold(name: string, type: string): string {
  const className = pluginClassName(name);
  const templates: Record<string, string> = {
    'ai-provider': `/**
 * ${name} - Custom AI Provider Plugin
 */
import { BaseAIProviderPlugin } from '@rsshub/plugins/builtin/ai-providers.js';
import { PluginManifest, ChatMessage, ChatOptions } from '@rsshub/plugins/types.js';

export class ${className}ProviderPlugin {
  manifest = {
    name: '${name}',
    version: '1.0.0',
    type: 'ai-provider',
    description: 'Custom AI Provider Plugin',
    author: 'Your Name',
    license: 'MIT',
    main: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', minLength: 1 },
        baseUrl: { type: 'string', format: 'url' },
        model: { type: 'string', default: 'default-model' },
      },
      required: ['apiKey'],
    },
  };

  config = {
    enabled: true,
    config: {
      apiKey: '',
      baseUrl: 'https://api.example.com',
      model: 'default-model',
    },
  };

  getDefaultModel() {
    return this.config.config.model || 'default-model';
  }

  async init(config) {
    this.config = config;
    // Initialize your API client here
  }

  async chat(messages, options) {
    // Implement chat completion
    // Return the generated response
    return 'Response from ${name}';
  }

  async *stream(messages, options) {
    // Implement streaming
    yield 'Streaming response from ${name}';
  }

  async listModels() {
    return ['model-1', 'model-2'];
  }

  async shutdown() {
    // Cleanup
  }
}

export default ${className}ProviderPlugin;
`,

    fetcher: `/**
 * ${name} - Custom Fetcher Plugin
 */
import { FetcherPlugin } from '@rsshub/plugins/types.js';
import { FeedConfig, RawFeedItem, ParsedFeedItem } from '@rsshub/plugins/types.js';

export class ${className}FetcherPlugin {
  manifest = {
    name: '${name}',
    version: '1.0.0',
    type: 'fetcher',
    description: 'Custom Fetcher Plugin',
    author: 'Your Name',
    license: 'MIT',
    main: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        timeout: { type: 'integer', minimum: 1000, default: 15000 },
        userAgent: { type: 'string' },
        maxItemsPerFeed: { type: 'integer', minimum: 1, default: 5 },
      },
    },
  };

  config = {
    enabled: true,
    config: {
      timeout: 15000,
      userAgent: 'Mozilla/5.0 (compatible; RSSHub/${name})',
      maxItemsPerFeed: 5,
    },
  };

  async init(config) {
    this.config = config;
  }

  async fetch(feed) {
    // Implement feed fetching
    // Return array of RawFeedItem
    return [];
  }

  parse(xml, sourceName) {
    // Implement XML parsing
    // Return array of ParsedFeedItem
    return [];
  }

  validateConfig(config) {
    return true;
  }

  async shutdown() {}
}

export default ${className}FetcherPlugin;
`,

    output: `/**
 * ${name} - Custom Output Plugin
 */
import { OutputPlugin } from '@rsshub/plugins/types.js';
import { OutputOptions } from '@rsshub/plugins/types.js';

export class ${className}OutputPlugin {
  manifest = {
    name: '${name}',
    version: '1.0.0',
    type: 'output',
    description: 'Custom Output Plugin',
    author: 'Your Name',
    license: 'MIT',
    main: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', format: 'url' },
        apiKey: { type: 'string' },
      },
    },
  };

  config = {
    enabled: true,
    config: {
      endpoint: '',
      apiKey: '',
    },
  };

  async init(config) {
    this.config = config;
  }

  async send(content, options = {}) {
    // Implement sending logic
  }

  validateConfig(config) {
    return true;
  }

  async shutdown() {}
}

export default ${className}OutputPlugin;
`,

    transformer: `/**
 * ${name} - Custom Transformer Plugin
 */
import { TransformerPlugin } from '@rsshub/plugins/types.js';
import { TransformContext } from '@rsshub/plugins/types.js';

export class ${className}TransformerPlugin {
  manifest = {
    name: '${name}',
    version: '1.0.0',
    type: 'transformer',
    description: 'Custom Transformer Plugin',
    author: 'Your Name',
    license: 'MIT',
    main: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
      },
    },
  };

  config = {
    enabled: true,
    config: {
      enabled: true,
    },
  };

  async init(config) {
    this.config = config;
  }

  async transform(content, context) {
    // Implement transformation logic
    return content;
  }

  validateConfig(config) {
    return true;
  }

  async shutdown() {}
}

export default ${className}TransformerPlugin;
`,
  };

  return templates[type] || templates['transformer'];
}

function generateConfigTemplate(type: string): object {
  const templates: Record<string, object> = {
    'ai-provider': {
      apiKey: '',
      baseUrl: 'https://api.example.com',
      model: 'default-model',
    },
    fetcher: {
      timeout: 15000,
      userAgent: 'Mozilla/5.0 (compatible; RSSHub)',
      maxItemsPerFeed: 5,
    },
    output: {
      endpoint: 'https://api.example.com/webhook',
      apiKey: '',
    },
    transformer: {
      enabled: true,
    },
  };
  return templates[type] || {};
}

function generateReadme(name: string, type: string, description: string): string {
  return `# ${name}

${description || 'Custom plugin for RSS News Hub'}

## Type: ${type}

## Installation

\`\`\`bash
npm install
\`\`\`

## Configuration

Edit \`config.json\` to configure the plugin.

## Development

\`\`\`bash
npm run dev
\`\`\`

## License

MIT
`;
}

const CONFIG_TYPES = ['ai-providers', 'fetchers', 'outputs', 'transformers'];

function readPluginConfig(): any {
  if (!existsSync(CONFIG_FILE)) return { plugins: {} };
  const config = parseYAML(readFileSync(CONFIG_FILE, 'utf-8'));
  return config || { plugins: {} };
}

function writePluginConfig(config: any): void {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  writeFileSync(CONFIG_FILE, stringifyYAML(config));
}

async function updatePluginInConfig(name: string, updates: Record<string, unknown>): Promise<void> {
  const config = readPluginConfig();
  if (!config.plugins) config.plugins = {};

  let found = false;

  for (const type of CONFIG_TYPES) {
    const entries = config.plugins[type] || [];
    for (const entry of entries) {
      if (entry.name === name) {
        // Only real plugin settings belong in `config`, not bookkeeping keys.
        const { enabled, source, ...settings } = updates;
        entry.config = { ...entry.config, ...settings };
        if (enabled !== undefined) entry.enabled = enabled;
        if (source !== undefined) entry.source = source;
        found = true;
      }
    }
  }

  // Upsert: the plugin was not listed yet, so create its entry now.
  if (!found) {
    const { manifest, source } = (await findPlugin(name)) || ({} as any);
    const type = typeOfPlugin(manifest?.type, name);
    if (!config.plugins[type]) config.plugins[type] = [];
    config.plugins[type].push({
      name,
      source: source || 'unknown',
      enabled: updates.enabled !== false,
      config: {},
    });
  }

  writePluginConfig(config);
}

/** Map a discovery manifest type (or the plugin name) to a config section. */
function typeOfPlugin(manifestType?: string, name?: string): string {
  const typeAliases: Record<string, string> = {
    'ai-provider': 'ai-providers',
    fetcher: 'fetchers',
    output: 'outputs',
    transformer: 'transformers',
  };
  if (manifestType && typeAliases[manifestType]) return typeAliases[manifestType];

  const typeMap: Record<string, string> = {
    openai: 'ai-providers',
    deepseek: 'ai-providers',
    sensenova: 'ai-providers',
    'rss-fetcher': 'fetchers',
    telegram: 'outputs',
    discord: 'outputs',
    slack: 'outputs',
    'pii-redactor': 'transformers',
    summarizer: 'transformers',
    translator: 'transformers',
  };
  return typeMap[name || ''] || 'ai-providers';
}

async function removePluginFromConfig(name: string): Promise<void> {
  const config = readPluginConfig();
  if (!config.plugins) return;

  for (const type of CONFIG_TYPES) {
    config.plugins[type] = (config.plugins[type] || []).filter((e: any) => e.name !== name);
  }

  writePluginConfig(config);
}

async function savePluginToConfig(name: string, source: string): Promise<void> {
  const config = readPluginConfig();
  if (!config.plugins) config.plugins = {};

  const type = typeOfPlugin(undefined, name);
  if (!config.plugins[type]) config.plugins[type] = [];

  if (!config.plugins[type].find((e: any) => e.name === name)) {
    config.plugins[type].push({
      name,
      source,
      enabled: true,
      config: {},
    });
  }

  writePluginConfig(config);
}

async function main(): Promise<void> {
  await program.parseAsync();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
