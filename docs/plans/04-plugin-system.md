# Plan: Plugin System

## Objective
Implement a flexible plugin architecture allowing custom AI providers, RSS fetchers, output handlers, and content transformers without forking the codebase.

## Requirements

### Plugin Types
1. **AI Provider Plugins** - Custom LLM backends (Ollama, LocalAI, Anthropic, custom)
2. **Fetcher Plugins** - Custom RSS/Atom/JSON feed parsers (GraphQL, REST APIs, custom formats)
3. **Output Plugins** - Custom destinations (Discord, Slack, Matrix, Email, Webhooks, Mastodon, Bluesky)
4. **Transformer Plugins** - Content filters, enrichers, formatters (summarization, translation, PII redaction)

### Plugin Interface
```typescript
interface Plugin {
  name: string;
  version: string;
  type: 'ai-provider' | 'fetcher' | 'output' | 'transformer';
  init(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;
}

interface AIProviderPlugin extends Plugin {
  type: 'ai-provider';
  chat(messages: Message[], options: ChatOptions): Promise<string>;
  stream(messages: Message[], options: ChatOptions): AsyncIterable<string>;
  listModels(): string[];
  validateConfig(config: unknown): boolean;
}

interface FetcherPlugin extends Plugin {
  type: 'fetcher';
  fetch(feed: FeedConfig): Promise<RawItem[]>;
  parse(xml: string, feed: FeedConfig): ParsedItem[];
  validateConfig(config: unknown): boolean;
}

interface OutputPlugin extends Plugin {
  type: 'output';
  send(content: string, options: OutputOptions): Promise<void>;
  validateConfig(config: unknown): boolean;
}

interface TransformerPlugin extends Plugin {
  type: 'transformer';
  transform(content: string, context: TransformContext): Promise<string>;
  validateConfig(config: unknown): boolean;
}
```

### Configuration
```yaml
# config/plugins.yaml
plugins:
  ai-providers:
    - name: ollama
      enabled: true
      config:
        baseUrl: "http://localhost:11434"
        model: "llama3.2"
    - name: anthropic
      enabled: true
      config:
        apiKey: "${ANTHROPIC_API_KEY}"
        model: "claude-3.5-sonnet"
  fetchers:
    - name: json-api
      enabled: true
      config:
        defaultHeaders:
          Accept: "application/json"
  outputs:
    - name: discord
      enabled: true
      config:
        webhookUrl: "${DISCORD_WEBHOOK}"
    - name: slack
      enabled: false
  transformers:
    - name: pii-redactor
      enabled: true
      config:
        patterns:
          - "email"
          - "phone"
          - "credit-card"
```

## Implementation Phases

### Phase 1: Core Plugin Infrastructure (TDD) ✅ COMPLETE
- [x] Plugin types and interfaces (`src/plugins/types.ts`)
- [x] Plugin registry with CRUD (`src/plugins/registry.ts`)
- [x] Plugin config validation with JSON Schema (`src/plugins/config.ts`)
- [x] Plugin loader for dynamic loading (`src/plugins/loader.ts`)
- [x] Config merging with defaults (`src/plugins/config.ts`)
- [x] Integration tests for registry (`test/plugin-registry-integration.test.ts`)
- [x] Unit tests for config validation (`test/plugin-registry.test.ts`)

### Phase 2: AI Provider Plugin Interface (TDD) ✅ COMPLETE
- [x] Base AI provider plugin class (`src/plugins/builtin/ai-providers.ts`)
- [x] Built-in providers as plugins (OpenAI, DeepSeek, SenseNova)
- [x] Plugin registration for AI providers
- [x] Tests for chat, stream, model listing (integration with existing tests)

### Phase 3: Fetcher Plugin Interface (TDD) ✅ COMPLETE
- [x] Base fetcher plugin class (`src/plugins/builtin/fetchers.ts`)
- [x] Built-in RSS/Atom fetcher as plugin (`src/plugins/builtin/fetchers.ts`)
- [x] Plugin registration for fetchers
- [x] Tests for fetch, parse, validation (integration with existing tests)

### Phase 4: Output Plugin Interface (TDD) ✅ COMPLETE
- [x] Base output plugin class (`src/plugins/builtin/outputs.ts`)
- [x] Built-in Telegram, Discord, Slack as plugins (`src/plugins/builtin/outputs.ts`)
- [x] Plugin registration for outputs
- [x] Tests for send, validation (integration with existing tests)

### Phase 5: Transformer Plugin Interface (TDD) ✅ COMPLETE
- [x] Base transformer plugin class (`src/plugins/builtin/transformers.ts`)
- [x] Built-in transformers (PII redactor, summarizer, translator)
- [x] Pipeline composition support
- [x] Tests for transform, pipeline (integration with existing tests)

### Phase 6: Plugin Configuration & Discovery (TDD) ✅ COMPLETE
- [x] YAML config loader (`src/plugins/config-loader.ts`)
- [x] Plugin discovery (npm packages, local paths) (`src/plugins/discovery.ts`)
- [x] Hot reload support (`src/plugins/config-watcher.ts`)
- [x] Tests for config loading, discovery (`test/plugin-config-loader.test.ts`)

### Phase 7: CLI & Management (TDD) ✅ COMPLETE
- [x] `rsshub plugin list` (`plugin:list`, supports `--type`, `--enabled-only`, `--json`)
- [x] `rsshub plugin install <pkg>` (`plugin:install`, supports `--version`, `--save`)
- [x] `rsshub plugin enable/disable <name>` (`plugin:enable` / `plugin:disable`, persists to `config/plugins.yaml`)
- [x] `rsshub plugin create <name> --type <type>` (`plugin:create`, scaffolds valid-JS plugin)
- [x] `rsshub plugin remove <name>` (`plugin:remove`, requires `--force`)
- [x] `rsshub plugin status <name>` (`plugin:status`, exits 1 when unknown)
- [x] CLI test suite: `test/cli.test.ts` (15 integration tests, run CLI as child process)

**Notes:** Commands are declared with `plugin:` prefixes rather than a nested
`rsshub plugin <sub>` group, matching the existing commander setup. The CLI
discovers plugins through `discoverAllPlugins()` (discovery + `plugins.yaml`
overlay) instead of the in-memory registry, since the registry is only populated
at runtime by the server.

## Acceptance Criteria
- [x] All existing tests pass with plugin system (402 tests, 118 suites)
- [x] New plugin types can be added without core changes (4 types: ai-provider, fetcher, output, transformer)
- [x] Plugins can be enabled/disabled via config (`config/plugins.yaml` + `plugin:enable` / `plugin:disable`)
- [x] Plugin hot reload works in development (`src/plugins/config-watcher.ts`, covered by E2E tests)
- [x] Plugin SDK documentation complete (`docs/plugin-sdk.md`)
- [x] Example plugins provided (`plugins/example-wordcount`, `plugins/example-webhook-output`)

## File Structure
```
src/
  plugins/
    index.ts                 # Plugin registry, loader
    types.ts                 # Plugin interfaces
    registry.ts              # Plugin registry implementation
    loader.ts                # Dynamic loader
    config.ts                # Config schema, loader
    builtin/
      ai-providers.ts        # OpenAI, DeepSeek, SenseNova as plugins
      fetchers.ts            # RSS/Atom fetcher plugin
      outputs.ts             # Telegram, Discord, Slack plugins
      transformers.ts        # PII, summarizer plugins
  plugins/                   # Plugin discovery, hot reload
config/
  plugins.yaml               # Plugin configuration (hot reloaded)
plugins/
  example-wordcount/         # Example plugin (transformer)
  example-webhook-output/    # Example plugin (output)
docs/
  plugin-sdk.md              # Plugin SDK docs
```

## Testing Strategy
- Unit tests for each plugin type interface
- Integration tests for plugin loading, config
- E2E tests for plugin composition
- Contract tests for plugin interfaces

## Closure record (2026-10-12)

Phase 7 finished. The hot-reload E2E work found and fixed two more real bugs:

- `src/plugins/loader.ts` `loadFromPath()`: `JSON.parse(manifestPath)` parsed
  the **path** instead of the manifest content — local plugins never loaded.
- `src/plugins/registry.ts` `register()`: stored a `{...plugin}` **copy**,
  which loses prototype methods — `unregister()` always failed
  (`plugin.shutdown is not a function`) and registered instances were inert.

Also fixed while wiring the watcher into the server:
- the watcher bound `fs.watch` to the config **file**: atomic saves
  (editors, `sed -i` rename the inode) killed it after the first change — now
  watches the directory instead (covered by a dedicated E2E test);
- `watchPluginsDir` crashed when `plugins/` did not exist — now guarded;
- `config-loader` built the builtin manifest `type` from the plugin name
  (`rss-fetcher` → `rss`) instead of the YAML section.

`config/plugins.yaml` + `plugins/` now ship in the Docker image (the config
volume seeds from it on first run); `docker-compose.yml` unchanged.