/**
 * Built-in Transformer Plugins - PII redactor, summarizer, etc.
 */

import {
  PluginConfig,
  PluginManifest,
  type TransformContext,
  type TransformerPlugin,
} from '../types.js';

export class PIIRedactorPlugin implements TransformerPlugin {
  manifest = {
    name: 'pii-redactor',
    version: '1.0.0',
    type: 'transformer' as const,
    description: 'Redacts personally identifiable information from text',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'pii-redactor.js',
    configSchema: {
      type: 'object',
      properties: {
        redactEmails: { type: 'boolean', default: true },
        redactPhones: { type: 'boolean', default: true },
        redactCreditCards: { type: 'boolean', default: true },
        redactSSN: { type: 'boolean', default: true },
        redactIPs: { type: 'boolean', default: false },
        replacement: { type: 'string', default: '[REDACTED]' },
      },
    },
  };

  config: any = {
    enabled: true,
    config: {
      redactEmails: true,
      redactPhones: true,
      redactCreditCards: true,
      redactSSN: true,
      redactIPs: false,
      replacement: '[REDACTED]',
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async transform(content: string, context: TransformContext): Promise<string> {
    const options = this.config.config;
    let result = content;

    if (options.redactEmails) {
      result = result.replace(
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        options.replacement
      );
    }

    if (options.redactPhones) {
      // US phone numbers
      result = result.replace(
        /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
        options.replacement
      );
      // International format
      result = result.replace(
        /\b\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g,
        options.replacement
      );
    }

    if (options.redactCreditCards) {
      // Credit card patterns (Luhn-validated would be better but regex is simpler)
      result = result.replace(/\b(?:\d[ -]*?){13,16}\b/g, (match) => {
        // Simple Luhn check could be added here
        return options.replacement;
      });
    }

    if (options.redactSSN) {
      // US SSN format
      result = result.replace(/\b\d{3}-\d{2}-\d{4}\b/g, options.replacement);
    }

    if (options.redactIPs) {
      // IPv4
      result = result.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, options.replacement);
      // IPv6 (simplified)
      result = result.replace(/\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, options.replacement);
    }

    return result;
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    return true;
  }

  async shutdown(): Promise<void> {}
}

export class SummarizerPlugin implements TransformerPlugin {
  manifest = {
    name: 'summarizer',
    version: '1.0.0',
    type: 'transformer' as const,
    description: 'Creates summaries of articles using AI',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'summarizer.js',
    configSchema: {
      type: 'object',
      properties: {
        maxLength: { type: 'integer', minimum: 50, maximum: 500, default: 200 },
        style: { type: 'string', enum: ['bullet', 'paragraph', 'tldr'], default: 'paragraph' },
        aiProvider: { type: 'string', default: 'auto' },
      },
    },
  };

  config: any = {
    enabled: true,
    config: {
      maxLength: 200,
      style: 'paragraph',
      aiProvider: 'auto',
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async transform(content: string, context: TransformContext): Promise<string> {
    // This would use an AI provider to generate a summary
    // For now, return a simple truncation as placeholder
    const maxLength = this.config.config.maxLength || 200;
    const style = this.config.config.style || 'paragraph';

    if (content.length <= maxLength) return content;

    const truncated = content.slice(0, maxLength).trim();
    const lastPeriod = truncated.lastIndexOf('.');

    if (lastPeriod > maxLength * 0.5) {
      return truncated.slice(0, lastPeriod + 1);
    }

    return truncated + '...';
  }

  validateConfig(config: unknown): boolean {
    return true;
  }

  async shutdown(): Promise<void> {}
}

export class TranslationPlugin implements TransformerPlugin {
  manifest = {
    name: 'translator',
    version: '1.0.0',
    type: 'transformer' as const,
    description: 'Translates content to target language',
    author: 'RSS News Hub Team',
    license: 'MIT',
    main: 'translator.js',
    configSchema: {
      type: 'object',
      properties: {
        targetLanguage: { type: 'string', default: 'en' },
        sourceLanguage: { type: 'string', default: 'auto' },
        aiProvider: { type: 'string', default: 'auto' },
      },
      required: ['targetLanguage'],
    },
  };

  config: any = {
    enabled: true,
    config: {
      targetLanguage: 'en',
      sourceLanguage: 'auto',
      aiProvider: 'auto',
    },
  };

  async init(config: any): Promise<void> {
    this.config = config;
  }

  async transform(content: string, context: TransformContext): Promise<string> {
    // Would use AI provider to translate
    // Placeholder implementation
    return content;
  }

  validateConfig(config: unknown): boolean {
    if (!config || typeof config !== 'object') return false;
    const cfg = config as Record<string, unknown>;
    return typeof cfg.targetLanguage === 'string' && cfg.targetLanguage.length > 0;
  }

  async shutdown(): Promise<void> {}
}
