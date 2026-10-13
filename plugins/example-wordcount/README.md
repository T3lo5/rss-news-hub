# example-wordcount

Exemplo de **transformer**: anexa contagem de palavras/caracteres ao conteúdo
gerado. Serve de referência para criar seus próprios plugins — ver
[`docs/plugin-sdk.md`](../../../docs/plugin-sdk.md).

## Uso

Habilite em `config/plugins.yaml`:

```yaml
plugins:
  transformers:
    - name: example-wordcount
      enabled: true
      config:
        maxWords: 500   # 0 desativa o aviso de limite
```

## Interface

| Método | Papel |
| --- | --- |
| `init(config)` | recebe o `PluginConfig` mesclado pelo registry |
| `transform(content, context)` | devolve o texto transformado |
| `shutdown()` | limpeza ao descarregar |
| `validateConfig(config)` | validação leve das settings |
