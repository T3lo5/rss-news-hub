# example-webhook-output

Exemplo de **output**: envia o conteúdo gerado via `POST` JSON para qualquer
webhook. Serve de referência para criar seus próprios plugins — ver
[`docs/plugin-sdk.md`](../../../docs/plugin-sdk.md).

## Uso

Habilite em `config/plugins.yaml`:

```yaml
plugins:
  outputs:
    - name: example-webhook-output
      enabled: true
      config:
        webhookUrl: https://example.com/hook
        extraHeaders:
          Authorization: Bearer token
```

## Interface

| Método | Papel |
| --- | --- |
| `init(config)` | recebe o `PluginConfig` mesclado pelo registry |
| `send(content, options)` | entrega o texto (aqui: `fetch` POST) |
| `shutdown()` | limpeza ao descarregar |
| `validateConfig(config)` | validação leve das settings |
