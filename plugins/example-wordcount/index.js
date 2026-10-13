/**
 * Example transformer plugin — word/character counts.
 *
 * Demonstrates the plugin contract:
 *   - manifest: declared class property (also present in plugin.json)
 *   - init(config): receives the merged PluginConfig from the registry
 *   - transform(content, context): returns the transformed text
 *   - shutdown(): cleanup hook
 *   - validateConfig(config): cheap config sanity check
 */

export class ExampleWordcountPlugin {
  manifest = {
    name: 'example-wordcount',
    version: '1.0.0',
    type: 'transformer',
    main: 'index.js',
    description: 'Example transformer: appends word/character counts',
  };

  config = {
    name: 'example-wordcount',
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
    const maxWords = config?.maxWords;
    return maxWords === undefined || (Number.isInteger(maxWords) && maxWords >= 0);
  }

  async transform(content, context = {}) {
    const text = String(content ?? '');
    const words = text.split(/\s+/).filter(Boolean).length;
    const footer = `\n\n— ${words} palavras · ${text.length} caracteres`;

    const maxWords = this.config.config?.maxWords || 0;
    const note =
      maxWords > 0 && words > maxWords ? `\n⚠️ excede o limite de ${maxWords} palavras` : '';

    // `context` carries metadata about the generation (type, language, news...)
    void context;
    return text + footer + note;
  }
}

export default ExampleWordcountPlugin;
