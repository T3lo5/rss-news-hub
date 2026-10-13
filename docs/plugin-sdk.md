# Plugin SDK

Guia para criar plugins para o RSS News Hub. Plugins Estendem o hub sem
alterar o core: novos providers de IA, fetchers, saídas de distribuição e
transformadores de conteúdo.

## Tipos de plugin

| Tipo | Interface | Método principal |
| --- | --- | --- |
| `ai-provider` | `AIProviderPlugin` | `chat(messages, options)` / `stream(...)` |
| `fetcher` | `FetcherPlugin` | `fetch(feed)` → itens brutos |
| `output` | `OutputPlugin` | `send(content, options)` |
| `transformer` | `TransformerPlugin` | `transform(content, context)` |

Todos herdam de `Plugin`:

```ts
interface Plugin {
  manifest: PluginManifest;
  config: PluginConfig;                 // { name, enabled, config }
  init(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Anatomia de um plugin

Um plugin é um diretório com `plugin.json` + o entry point (JS ESM):

```
plugins/meu-plugin/
├── plugin.json      # manifest
├── index.js         # entry point (export default)
└── README.md        # opcional
```

### plugin.json

```json
{
  "name": "meu-plugin",
  "version": "1.0.0",
  "type": "transformer",
  "description": "O que faz",
  "author": "eu",
  "license": "MIT",
  "main": "index.js",
  "configSchema": {
    "type": "object",
    "properties": {
      "limite": { "type": "integer", "default": 100 }
    },
    "required": []
  }
}
```

O `configSchema` (JSON Schema) é validado no registro. Suportado: `type`
(object/string/integer/number/boolean), `properties`, `required`,
`enum`, `minimum`, `maximum`, `default`, `additionalProperties: false`.
Os `default`s são aplicados automaticamente sobre a config do YAML.

### index.js

```js
export class MeuPlugin {
  manifest = {
    name: "meu-plugin",
    version: "1.0.0",
    type: "transformer",
    main: "index.js",
  };

  config = { name: "meu-plugin", enabled: true, config: {} };

  async init(pluginConfig) {
    // Recebe a PluginConfig já mesclada (YAML + defaults do schema)
    this.config = pluginConfig;
  }

  async shutdown() {
    // Limpeza: conexões, timers, buffers
  }

  validateConfig(config) {
    return true; // validação leve opcional
  }

  async transform(content, context) {
    // context: { type, language, news, ... }
    return content.toUpperCase();
  }
}

export default MeuPlugin;
```

O `name` do `plugin.json` **precisa** ser igual ao usado no YAML e ao
`manifest.name` da classe (o watcher erro em divergências).

## Habilitando um plugin

Em `config/plugins.yaml`:

```yaml
plugins:
  transformers:
    - name: meu-plugin            # nome do plugin.json
      source: local               # builtin (padrão) | local | npm
      path: plugins/meu-plugin    # relativo ao config/plugins.yaml
      enabled: true
      config:
        limite: 250               # validado contra o configSchema
```

O servidor assiste esse arquivo (e o diretório `plugins/`) com **hot reload**:
salvar o YAML carrega plugins novos, recarrega os que mudaram de config e
descarrega os removidos/desabilitados. Saves atômicos (editores, `sed -i`)
são suportados.

`enabled: false` mantém a entrada no arquivo sem carregar o plugin.

## Ciclo de vida

```
loadPluginConfig(YAML)          // discovery: lê as 4 seções
  → instantiate(entry)          // builtin: fábrica | local: loadFromPath
  → registry.register(plugin)   // valida manifest + configSchema
  → plugin.init(mergedConfig)   // inicialização
  → guarda no registry
```

No hot reload, mudanças de config fazem `unregister` (chama `shutdown()`)
seguido de um novo `register`. Erros de um plugin **não** derrubam os outros:
são reportados via callback `onError`.

## CLI

```bash
npm run cli -- plugin:create meu-plugin --type transformer  # scaffold
npm run cli -- plugin:install ./plugins/meu-plugin          # copia p/ plugins/
npm run cli -- plugin:list                                  # descobre builtin+npm+local
npm run cli -- plugin:enable meu-plugin                     # grava no plugins.yaml
npm run cli -- plugin:disable meu-plugin
npm run cli -- plugin:status meu-plugin
npm run cli -- plugin:remove meu-plugin
```

## Exemplos

- [`plugins/example-wordcount`](../../plugins/example-wordcount) — transformer
- [`plugins/example-webhook-output`](../../plugins/example-webhook-output) — output

Os 10 builtins em `src/plugins/builtin/` servem de referência completa
(openai/deepseek/sensenova, rss-fetcher, telegram/discord/slack,
pii-redactor/summarizer/translator).
