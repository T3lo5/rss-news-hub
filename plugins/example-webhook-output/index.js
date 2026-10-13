/**
 * Example output plugin — webhook delivery.
 *
 * Shows the output contract:
 *   - send(content, options): delivers the generated text somewhere
 *   - `options` carries OutputOptions (parseMode, etc.)
 */

export class ExampleWebhookOutputPlugin {
  manifest = {
    name: 'example-webhook-output',
    version: '1.0.0',
    type: 'output',
    main: 'index.js',
    description: 'Example output plugin: POSTs generated content to a webhook',
  };

  config = {
    name: 'example-webhook-output',
    enabled: true,
    config: {},
  };

  async init(pluginConfig) {
    this.config = pluginConfig;
  }

  async shutdown() {
    // Nothing to clean up
  }

  validateConfig(config) {
    if (!config) return false;
    const url = config.webhookUrl;
    return typeof url === 'string' && /^https?:\/\//.test(url);
  }

  async send(content, options = {}) {
    const { webhookUrl, extraHeaders } = this.config.config || {};

    if (!webhookUrl) {
      throw new Error('example-webhook-output is not configured (webhookUrl missing)');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(extraHeaders || {}),
      },
      body: JSON.stringify({
        text: String(content ?? ''),
        parseMode: options.parseMode || 'Markdown',
        source: 'rss-news-hub',
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded ${response.status}: ${await response.text()}`);
    }
  }
}

export default ExampleWebhookOutputPlugin;
