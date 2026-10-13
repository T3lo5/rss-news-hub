import assert from 'node:assert';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { __getAiConfig, __setAiConfig, chatStream } from '../services/ai.service.js';

describe('AI Service - Streaming', () => {
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

  test('chatStream yields tokens incrementally', async () => {
    const streamChunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    global.fetch = mock.fn(async () => ({
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              if (chunkIndex >= streamChunks.length) {
                return { done: true, value: undefined };
              }
              const chunk = streamChunks[chunkIndex++];
              return { done: false, value: new TextEncoder().encode(chunk) };
            },
            releaseLock() {},
          };
        },
      },
    }));

    const tokens = [];
    await chatStream('System', 'User', 'openai', (token) => {
      tokens.push(token);
    });

    assert.deepStrictEqual(tokens, ['Hello', ' world', '!']);
  });

  test('chatStream handles errors', async () => {
    global.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));

    let errorCaught = false;
    try {
      await chatStream('System', 'User', 'openai', () => {});
    } catch (e) {
      errorCaught = true;
      assert.ok(e.message.includes('AI API error 500'));
    }
    assert.ok(errorCaught);
  });

  test('chatStream works with deepseek provider', async () => {
    const streamChunks = [
      'data: {"choices":[{"delta":{"content":"Deep"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Seek"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    let chunkIndex = 0;
    global.fetch = mock.fn(async () => ({
      ok: true,
      body: {
        getReader() {
          return {
            async read() {
              if (chunkIndex >= streamChunks.length) {
                return { done: true, value: undefined };
              }
              const chunk = streamChunks[chunkIndex++];
              return { done: false, value: new TextEncoder().encode(chunk) };
            },
            releaseLock() {},
          };
        },
      },
    }));

    const tokens = [];
    await chatStream('System', 'User', 'deepseek', (token) => {
      tokens.push(token);
    });

    assert.deepStrictEqual(tokens, ['Deep', 'Seek']);
  });

  test('chatStream aborts on signal', async () => {
    let _aborted = false;
    global.fetch = mock.fn(async (url, options) => {
      if (options?.signal?.aborted) {
        _aborted = true;
        throw new DOMException('Aborted', 'AbortError');
      }
      return {
        ok: true,
        body: {
          async *[Symbol.asyncIterator]() {
            yield `data: ${JSON.stringify({ choices: [{ delta: { content: 'test' } }] })}\n\n`;
            yield `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`;
          },
        },
      };
    });

    const controller = new AbortController();
    controller.abort();

    try {
      await chatStream('System', 'User', 'openai', () => {}, { signal: controller.signal });
    } catch (e) {
      assert.strictEqual(e.name, 'AbortError');
    }
  });
});

describe('SSE Endpoint Integration', () => {
  let _mockReq, mockRes, _next;

  beforeEach(() => {
    _mockReq = {
      method: 'POST',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        news: { id: '1', title: 'Test', link: 'https://example.com', source: 'Test' },
        type: 'blog',
        language: 'en',
        provider: 'auto',
      },
    };
    mockRes = {
      statusCode: 200,
      headers: {},
      writeHead: mock.fn((code, h) => {
        mockRes.statusCode = code;
        Object.assign(mockRes.headers, h);
      }),
      write: mock.fn(),
      end: mock.fn(),
      setHeader: mock.fn((k, v) => {
        mockRes.headers[k] = v;
      }),
      getHeader: mock.fn((k) => mockRes.headers[k]),
    };
    _next = mock.fn();
  });

  // This test will be expanded once the SSE handler is implemented
  test('placeholder for SSE handler test', () => {
    assert.ok(true);
  });
});
