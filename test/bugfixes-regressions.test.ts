import assert from 'node:assert';
import { after, beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { updateTelegramSettings } from '../services/settings.service.js';
import {
  resolveAiConfig,
  resolveEmailConfig,
  resolveNewsletterConfig,
  resolveTelegramConfig,
  saveUserSetting,
} from '../services/user-config.service.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

async function createUserRecord(role = 'user') {
  const email = `regression-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  return createUser(email, 'senha12345', `Regression ${role}`, role);
}

async function createUserToken(role = 'user') {
  const email = `regression-token-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await createUser(email, 'senha12345', `Regression Token ${role}`, role);
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken as string;
}

describe('Regressions: per-user config resolution', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
  });

  after(async () => {
    // updateTelegramSettings mutates the shared global config object.
    await updateTelegramSettings({ botToken: null, chatId: '' });
  });

  test('resolve*Config does not throw when the user has no settings row', async () => {
    const user = await createUserRecord();

    const [telegram, ai, email, newsletter] = await Promise.all([
      resolveTelegramConfig(user.id),
      resolveAiConfig(user.id),
      resolveEmailConfig(user.id),
      resolveNewsletterConfig(user.id),
    ]);

    assert.ok(telegram && typeof telegram === 'object');
    assert.ok(ai && typeof ai === 'object');
    assert.ok(email && typeof email === 'object');
    assert.ok(newsletter && typeof newsletter === 'object');
  });

  test('telegram falls back to the admin/global token when the user has no override', async () => {
    const user = await createUserRecord();

    // Exatamente o cenário reportado: token salvo pela tela de Settings
    // (global), sem nenhuma linha em user_settings para esse usuário.
    await updateTelegramSettings({ botToken: 'global-bot-token', chatId: '123456' });

    const config = await resolveTelegramConfig(user.id);
    assert.strictEqual(config.botToken, 'global-bot-token');
    assert.strictEqual(config.chatId, '123456');
  });

  test('POST /api/telegram/send uses the global token instead of crashing', async () => {
    const user = await createUserRecord();
    await updateTelegramSettings({ botToken: 'global-bot-token', chatId: '123456' });

    const login = await request('POST', '/api/auth/login', {
      email: user.email,
      password: 'senha12345',
    });
    assert.strictEqual(login.status, 200, login.raw);
    const token = login.json.data.accessToken as string;

    const originalFetch = globalThis.fetch;
    let calledUrl = '';
    let calledBody: any = null;
    globalThis.fetch = (async (url: any, init: any) => {
      calledUrl = String(url);
      calledBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, result: { message_id: 1 } }),
        text: async () => '',
      } as any;
    }) as any;

    try {
      const res = await request('POST', '/api/telegram/send', { text: 'olá' }, bearer(token));
      assert.strictEqual(res.status, 200, res.raw);
      assert.match(calledUrl, /\/sendMessage$/);
      assert.strictEqual(calledBody.chat_id, '123456');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Regressions: AI generation with a custom template', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
  });

  test('POST /api/ai/generate sends the interpolated template prompt (not a Promise)', async () => {
    const token = await createUserToken();
    const me = await request('GET', '/api/auth/me', undefined, bearer(token));
    assert.strictEqual(me.status, 200, me.raw);
    const userId = me.json.data.id as string;

    // Provider fake: baseUrl do usuário vence o .env e a chamada é interceptada.
    await saveUserSetting(userId, 'ai', {
      deepseek: { apiKey: 'fake-key', baseUrl: 'http://ai.invalid', model: 'fake-model' },
    });

    const originalFetch = globalThis.fetch;
    let captured: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      captured = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'texto gerado' } }] }),
      } as any;
    }) as any;

    try {
      const res = await request(
        'POST',
        '/api/ai/generate',
        {
          news: {
            title: 'Um artigo',
            link: 'https://example.com/a',
            source: 'Example',
            description: 'Descrição',
          },
          type: 'summary',
          language: 'pt',
          provider: 'deepseek',
          templateId: 'summary-default',
        },
        bearer(token)
      );

      assert.strictEqual(res.status, 200, res.raw);
      assert.strictEqual(res.json.data.content, 'texto gerado');
      assert.ok(captured, 'AI provider was not called');

      const systemPrompt = captured.messages[0].content;
      assert.strictEqual(
        typeof systemPrompt,
        'string',
        'system prompt must be a string, not a serialized Promise'
      );
      assert.ok(systemPrompt.length > 0, 'system prompt must not be empty');
      assert.ok(!systemPrompt.includes('{{language}}'), 'template variables must be interpolated');
      assert.match(systemPrompt, /in pt/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
