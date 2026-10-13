import assert from 'node:assert';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import {
  __getAiConfig,
  __setAiConfig,
  buildSystemPrompt,
  chat,
  pickProvider,
} from '../services/ai.service.js';

describe('ai.service', () => {
  let originalFetch;
  let originalAiConfig;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalAiConfig = __getAiConfig();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    __setAiConfig(originalAiConfig);
    mock.restoreAll();
  });

  describe('buildSystemPrompt', () => {
    test('returns thread prompt in English', () => {
      const prompt = buildSystemPrompt('thread', 'en');
      assert.ok(prompt.includes('Twitter (X) thread'));
      assert.ok(prompt.includes('exactly 3 tweets'));
      assert.ok(prompt.includes('English'));
      assert.ok(prompt.includes('{"title":"...","tweets":["...","...","..."],"link":"..."}'));
    });

    test('returns thread prompt in Portuguese', () => {
      const prompt = buildSystemPrompt('thread', 'pt');
      assert.ok(prompt.includes('Português'));
    });

    test('returns summary prompt', () => {
      const prompt = buildSystemPrompt('summary', 'en');
      assert.ok(prompt.includes('Summarize the following article'));
      assert.ok(prompt.includes('2-3 concise paragraphs'));
    });

    test('returns linkedin prompt', () => {
      const prompt = buildSystemPrompt('linkedin', 'en');
      assert.ok(prompt.includes('LinkedIn post'));
      assert.ok(prompt.includes('Title:'));
      assert.ok(prompt.includes('TLDR:'));
      assert.ok(prompt.includes('Body:'));
      assert.ok(prompt.includes('Link:'));
      assert.ok(prompt.includes('CTA:'));
    });

    test('returns default prompt for unknown type', () => {
      const prompt = buildSystemPrompt('unknown', 'en');
      assert.ok(prompt.includes('Answer the following in English'));
    });
  });

  describe('pickProvider', () => {
    const testAi = {
      sensenova: {
        apiKey: 'key1',
        baseUrl: 'https://api.sensenova.ai',
        model: 'model1',
        sdk: 'openai',
      },
      deepseek: { apiKey: 'key2', baseUrl: 'https://api.deepseek.com', model: 'model2' },
      openai: { apiKey: 'key3', baseUrl: 'https://api.openai.com', model: 'model3' },
    };

    beforeEach(() => {
      __setAiConfig(testAi);
    });

    test('returns sensenova when preferred and configured', () => {
      const result = pickProvider('sensenova');
      assert.deepStrictEqual(result, testAi.sensenova);
    });

    test('returns deepseek when preferred and configured', () => {
      const result = pickProvider('deepseek');
      assert.deepStrictEqual(result, testAi.deepseek);
    });

    test('returns openai when preferred and configured', () => {
      const result = pickProvider('openai');
      assert.deepStrictEqual(result, testAi.openai);
    });

    test('falls back to sensenova when no preference and sensenova configured', () => {
      const result = pickProvider('auto');
      assert.deepStrictEqual(result, testAi.sensenova);
    });

    test('falls back to deepseek when sensenova not configured', () => {
      __setAiConfig({
        sensenova: {
          apiKey: '',
          baseUrl: 'https://api.sensenova.ai',
          model: 'model1',
          sdk: 'openai',
        },
        deepseek: { apiKey: 'key2', baseUrl: 'https://api.deepseek.com', model: 'model2' },
        openai: { apiKey: 'key3', baseUrl: 'https://api.openai.com', model: 'model3' },
      });
      const result = pickProvider('auto');
      assert.deepStrictEqual(result, testAi.deepseek);
    });

    test('falls back to openai when only openai configured', () => {
      __setAiConfig({
        sensenova: {
          apiKey: '',
          baseUrl: 'https://api.sensenova.ai',
          model: 'model1',
          sdk: 'openai',
        },
        deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'model2' },
        openai: { apiKey: 'key3', baseUrl: 'https://api.openai.com', model: 'model3' },
      });
      const result = pickProvider('auto');
      assert.deepStrictEqual(result, testAi.openai);
    });

    test('returns null when no provider configured', () => {
      __setAiConfig({
        sensenova: {
          apiKey: '',
          baseUrl: 'https://api.sensenova.ai',
          model: 'model1',
          sdk: 'openai',
        },
        deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'model2' },
        openai: { apiKey: '', baseUrl: 'https://api.openai.com', model: 'model3' },
      });
      const result = pickProvider('auto');
      assert.strictEqual(result, null);
    });
  });

  describe('chat', () => {
    const testAi = {
      sensenova: {
        apiKey: 'key1',
        baseUrl: 'https://api.sensenova.ai',
        model: 'sensenova-model',
        sdk: 'openai',
      },
      deepseek: { apiKey: 'key2', baseUrl: 'https://api.deepseek.com', model: 'deepseek-model' },
      openai: { apiKey: 'key3', baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
    };

    beforeEach(() => {
      __setAiConfig(testAi);
    });

    test('calls AI provider and returns content', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Generated response' } }],
        }),
      };
      global.fetch = mock.fn(async () => mockResponse);

      const result = await chat('System prompt', 'User content', 'openai');

      assert.strictEqual(result, 'Generated response');
      assert.strictEqual(global.fetch.mock.callCount(), 1);
    });

    test('throws error when no provider configured', async () => {
      __setAiConfig({
        sensenova: {
          apiKey: '',
          baseUrl: 'https://api.sensenova.ai',
          model: 'model1',
          sdk: 'openai',
        },
        deepseek: { apiKey: '', baseUrl: 'https://api.deepseek.com', model: 'model2' },
        openai: { apiKey: '', baseUrl: 'https://api.openai.com', model: 'model3' },
      });

      await assert.rejects(() => chat('System prompt', 'User content', 'auto'), {
        message: /No AI provider configured/,
      });
    });

    test('throws error on API failure', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      };
      global.fetch = mock.fn(async () => mockResponse);

      await assert.rejects(() => chat('System prompt', 'User content', 'openai'), {
        message: /AI API error 500/,
      });
    });

    test('includes correct headers and body in request', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      };
      global.fetch = mock.fn(async () => mockResponse);

      await chat('System prompt', 'User content', 'openai');

      const call = global.fetch.mock.calls[0];
      const [url, options] = call.arguments;
      assert.ok(url.includes('/v1/chat/completions'));
      assert.strictEqual(options.method, 'POST');
      assert.ok(options.headers.Authorization.startsWith('Bearer '));
      assert.strictEqual(options.headers['Content-Type'], 'application/json');
      const body = JSON.parse(options.body);
      assert.strictEqual(body.model, 'gpt-4o-mini');
      assert.deepStrictEqual(body.messages, [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User content' },
      ]);
      assert.strictEqual(body.temperature, 0.7);
    });

    test('uses deepseek model when provider is deepseek', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      };
      global.fetch = mock.fn(async () => mockResponse);

      await chat('System prompt', 'User content', 'deepseek');

      const call = global.fetch.mock.calls[0];
      const [url, options] = call.arguments;
      assert.ok(url.includes('deepseek'));
      const body = JSON.parse(options.body);
      assert.strictEqual(body.model, 'deepseek-model');
    });
  });
});
