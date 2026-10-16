import assert from 'node:assert';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import {
  __getAiConfig,
  __setAiConfig,
  buildNewsUserContent,
  buildSystemPrompt,
  chat,
  pickProvider,
  stripEditorialMeta,
} from '../services/ai.service.js';

describe('stripEditorialMeta', () => {
  test('returns clean post unchanged', () => {
    const post = 'Abertura forte.\n\nDesenvolvimento.\n\nLink: https://example.com';
    assert.strictEqual(stripEditorialMeta(post), post);
  });

  test('removes leak of 4-section delivery format', () => {
    const raw = [
      '**Ângulo escolhido:** Um ângulo específico sobre o tema.',
      '',
      '---',
      '',
      'Mais código, menos entrega.',
      '',
      'Corpo do post com detalhes e exemplos.',
      '',
      'Link: https://arstechnica.com/x',
      '',
      '---',
      '',
      '**Por que pode funcionar:**',
      '- Ponto A',
      '- Ponto B',
      '',
      '**Pontos a confirmar:**',
      '- Nada.',
    ].join('\n');

    const cleaned = stripEditorialMeta(raw);
    assert.ok(cleaned.startsWith('Mais código, menos entrega.'));
    assert.ok(cleaned.includes('Link: https://arstechnica.com/x'));
    assert.ok(!cleaned.includes('Ângulo escolhido'));
    assert.ok(!cleaned.includes('Por que pode funcionar'));
    assert.ok(!cleaned.includes('Pontos a confirmar'));
  });

  test('handles "## Post final" heading marking', () => {
    const raw = [
      '### Ângulo escolhido',
      'Algo.',
      '',
      '## Post final',
      '',
      'O post.',
      '',
      '## Por que pode funcionar',
      'Motivo.',
    ].join('\n');
    const cleaned = stripEditorialMeta(raw);
    assert.strictEqual(cleaned, 'O post.');
  });

  test('returns original text when stripping would empty it', () => {
    const raw = 'Por que pode funcionar';
    assert.strictEqual(stripEditorialMeta(raw), raw);
  });
});

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
      assert.ok(prompt.includes('LinkedIn'));
      assert.ok(prompt.includes('DIRETRIZ EDITORIAL'));
      assert.ok(prompt.includes('ESTRATEGISTA DE CONTEÚDO'));
      assert.ok(prompt.includes('FORMATO OBRIGATÓRIO DA RESPOSTA'));
      assert.ok(!prompt.includes('**Ângulo escolhido:**'));
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

    test('auto cascades to the next provider when one fails', async () => {
      __setAiConfig({
        sensenova: {
          apiKey: '',
          baseUrl: 'https://api.sensenova.ai',
          model: 'model1',
          sdk: 'openai',
        },
        deepseek: { apiKey: 'key2', baseUrl: 'https://api.deepseek.com', model: 'deepseek-model' },
        openai: { apiKey: 'key3', baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
      });

      global.fetch = mock.fn(async (url: string) => {
        if (String(url).includes('deepseek')) {
          return { ok: false, status: 500, text: async () => 'deepseek down' };
        }
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: 'from openai' } }] }),
        };
      });

      const result = await chat('System prompt', 'User content', 'auto');
      assert.strictEqual(result, 'from openai');
      assert.strictEqual(global.fetch.mock.callCount(), 2);
    });

    test('explicit provider does not cascade to others', async () => {
      global.fetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'boom',
      }));

      await assert.rejects(() => chat('System prompt', 'User content', 'openai'), {
        message: /AI API error 500/,
      });
      assert.strictEqual(global.fetch.mock.callCount(), 1);
    });
  });
});

describe('buildNewsUserContent', () => {
  const item = (overrides = {}) => ({
    title: 'Title A',
    link: 'https://example.com/a',
    source: 'Src',
    description: 'Desc',
    content: '',
    ...overrides,
  });

  test('formats a single item', () => {
    const text = buildNewsUserContent(item());
    assert.match(text, /^Title: Title A\nSource: Src\nLink: https:\/\/example\.com\/a\n\nDesc$/);
  });

  test('joins multiple items with a separator (regression: no "undefined")', () => {
    const text = buildNewsUserContent([
      item({ title: 'First', link: 'https://example.com/1' }),
      item({ title: 'Second', link: 'https://example.com/2' }),
    ]);

    assert.ok(text.includes('Title: First'));
    assert.ok(text.includes('Title: Second'));
    assert.ok(text.includes('\n\n---\n\n'));
    assert.ok(!text.includes('undefined'));
  });

  test('prefers content over description and tolerates missing fields', () => {
    const text = buildNewsUserContent([
      item({ title: 'Has content', description: 'desc', content: 'full body' }),
      { title: 'Only title', link: 'https://example.com/x' },
    ]);

    assert.ok(text.includes('full body'));
    assert.ok(!text.includes('desc'));
    assert.ok(text.includes('Title: Only title'));
  });
});
