import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { email, newsletterConfig, telegram } from '../server.config.js';
import { __getAiConfig, __setAiConfig } from '../services/ai.service.js';
import { createUser } from '../services/auth.service.js';
import { __resetTransport, __setCreateTransport } from '../services/email.service.js';
import { __settingsInternals, initSettings } from '../services/settings.service.js';
import { settingsRepository } from '../src/db/repositories/index.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

async function createAdminToken(): Promise<string> {
  const email = `settings-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await createUser(email, 'senha12345', 'Settings Admin', 'admin');
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

async function createUserToken(): Promise<string> {
  const res = await request('POST', '/api/auth/register', {
    email: `settings-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`,
    password: 'senha12345',
    name: 'Settings User',
  });
  assert.strictEqual(res.status, 201, res.raw);
  return res.json.data.accessToken;
}

describe('Settings API', () => {
  let sentEmails: any[] = [];

  beforeEach(() => {
    resetTestDb();
    getTestDb();
    // Restore the env-derived runtime config so tests do not leak into each other.
    __setAiConfig(structuredClone(__settingsInternals.ENV_AI));
    Object.assign(telegram, __settingsInternals.ENV_TELEGRAM);
    Object.assign(newsletterConfig, __settingsInternals.ENV_NEWSLETTER);
    Object.assign(email, structuredClone(__settingsInternals.ENV_EMAIL));

    // Never hit real SMTP in tests.
    sentEmails = [];
    __setCreateTransport(() => ({
      sendMail: async (opts: any) => {
        sentEmails.push(opts);
        return { messageId: 'test-msg', accepted: [opts.to], rejected: [], response: '250 OK' };
      },
      verify: async () => true,
    }));
    __resetTransport();
  });

  test('GET /api/settings requires authentication', async () => {
    const res = await request('GET', '/api/settings');
    assert.strictEqual(res.status, 401, res.raw);
  });

  test('GET /api/settings is admin-only', async () => {
    const token = await createUserToken();
    const res = await request('GET', '/api/settings', undefined, bearer(token));
    assert.strictEqual(res.status, 403, res.raw);
  });

  test('GET /api/settings returns masked config for admin', async () => {
    const token = await createAdminToken();
    const res = await request('GET', '/api/settings', undefined, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.ai.providers.length, 3);
    for (const provider of res.json.data.ai.providers) {
      assert.strictEqual(typeof provider.apiKeySet, 'boolean');
      assert.strictEqual(provider.apiKey, undefined);
    }
    assert.strictEqual(typeof res.json.data.telegram.botTokenSet, 'boolean');
    assert.strictEqual(typeof res.json.data.email.passwordSet, 'boolean');
    assert.ok(Array.isArray(res.json.data.email.recipients));
    assert.ok(res.json.data.newsletter);
    assert.ok(res.json.data.digest);
  });

  test('PUT /api/settings/ai stores the key encrypted and applies it', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/settings/ai',
      {
        defaultProvider: 'deepseek',
        deepseek: { apiKey: 'sk-secret-settings-test', model: 'deepseek-reasoner' },
      },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.defaultProvider, 'deepseek');
    const deepseek = res.json.data.providers.find((p: any) => p.id === 'deepseek');
    assert.strictEqual(deepseek.apiKeySet, true);
    assert.strictEqual(deepseek.model, 'deepseek-reasoner');

    // Persisted encrypted at rest.
    const raw = await settingsRepository.get('ai');
    assert.ok(raw);
    assert.ok(raw.includes('enc:v1:'));
    assert.ok(!raw.includes('sk-secret-settings-test'));

    // Applied to the runtime AI config.
    assert.strictEqual(__getAiConfig().deepseek.apiKey, 'sk-secret-settings-test');

    // GET never leaks the secret.
    const get = await request('GET', '/api/settings', undefined, bearer(token));
    assert.ok(!get.raw.includes('sk-secret-settings-test'));
  });

  test('PUT /api/settings/ai with null clears a stored key', async () => {
    const token = await createAdminToken();
    await request('PUT', '/api/settings/ai', { openai: { apiKey: 'sk-clear-me' } }, bearer(token));

    const res = await request(
      'PUT',
      '/api/settings/ai',
      { openai: { apiKey: null } },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    const stored = JSON.parse((await settingsRepository.get('ai')) || '{}');
    assert.strictEqual(stored.openai?.apiKey, undefined);
  });

  test('PUT /api/settings/ai rejects an invalid baseUrl', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/settings/ai',
      { openai: { baseUrl: 'not-a-url' } },
      bearer(token)
    );
    assert.strictEqual(res.status, 400, res.raw);
  });

  test('PUT /api/settings/telegram stores the token encrypted and applies the chat id', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/settings/telegram',
      { botToken: '123456:AA-telegram-secret', chatId: '-100123456' },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.botTokenSet, true);
    assert.strictEqual(res.json.data.chatId, '-100123456');
    assert.strictEqual(telegram.chatId, '-100123456');
    assert.strictEqual(telegram.botToken, '123456:AA-telegram-secret');

    const raw = await settingsRepository.get('telegram');
    assert.ok(raw?.includes('enc:v1:'));
    assert.ok(!raw?.includes('123456:AA-telegram-secret'));
  });

  test('GET /api/ai/providers lists providers for any authenticated user', async () => {
    const token = await createUserToken();
    const res = await request('GET', '/api/ai/providers', undefined, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.providers.length, 3);
    assert.strictEqual(typeof res.json.data.defaultProvider, 'string');
  });

  test('newsletter config is persisted', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/newsletter/config',
      { lookbackDays: 3, language: 'pt' },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    const stored = JSON.parse((await settingsRepository.get('newsletter')) || '{}');
    assert.strictEqual(stored.lookbackDays, 3);
    assert.strictEqual(stored.language, 'pt');
  });

  test('digest config is persisted', async () => {
    const token = await createAdminToken();
    const res = await request('PUT', '/api/digest/config', { lookbackDays: 14 }, bearer(token));

    assert.strictEqual(res.status, 200, res.raw);
    const stored = JSON.parse((await settingsRepository.get('digest')) || '{}');
    assert.strictEqual(stored.lookbackDays, 14);
  });

  test('initSettings applies persisted AI keys on boot', async () => {
    const token = await createAdminToken();
    await request('PUT', '/api/settings/ai', { openai: { apiKey: 'sk-boot-key' } }, bearer(token));

    // Simulate a fresh boot: drop runtime overrides, then re-apply from the DB.
    __setAiConfig(structuredClone(__settingsInternals.ENV_AI));
    await initSettings();

    assert.strictEqual(__getAiConfig().openai.apiKey, 'sk-boot-key');
  });

  test('PUT /api/settings/email stores the password encrypted and applies the config', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/settings/email',
      {
        enabled: true,
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        user: 'mailer@example.com',
        pass: 'smtp-super-secret',
        from: 'News <noreply@example.com>',
        recipients: ['one@example.com', 'two@example.com'],
      },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.host, 'smtp.example.com');
    assert.strictEqual(res.json.data.passwordSet, true);
    assert.deepStrictEqual(res.json.data.recipients, ['one@example.com', 'two@example.com']);

    // Applied to the runtime config.
    assert.strictEqual(email.host, 'smtp.example.com');
    assert.strictEqual(email.pass, 'smtp-super-secret');
    assert.strictEqual(email.secure, true);

    // Persisted encrypted at rest, never in plain text.
    const raw = await settingsRepository.get('email');
    assert.ok(raw?.includes('enc:v1:'));
    assert.ok(!raw?.includes('smtp-super-secret'));

    // GET never leaks the secret.
    const get = await request('GET', '/api/settings', undefined, bearer(token));
    assert.ok(!get.raw.includes('smtp-super-secret'));
  });

  test('PUT /api/settings/email with null clears the stored password', async () => {
    const token = await createAdminToken();
    await request(
      'PUT',
      '/api/settings/email',
      { host: 'smtp.example.com', from: 'a@example.com', pass: 'to-be-cleared' },
      bearer(token)
    );

    const res = await request('PUT', '/api/settings/email', { pass: null }, bearer(token));
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.passwordSet, false);

    const stored = JSON.parse((await settingsRepository.get('email')) || '{}');
    assert.strictEqual(stored.pass, undefined);
  });

  test('PUT /api/settings/email rejects an invalid recipient', async () => {
    const token = await createAdminToken();
    const res = await request(
      'PUT',
      '/api/settings/email',
      { recipients: ['not-an-email'] },
      bearer(token)
    );
    assert.strictEqual(res.status, 400, res.raw);
  });

  test('POST /api/email/send requires authentication', async () => {
    const res = await request('POST', '/api/email/send', { subject: 'x', text: 'y' });
    assert.strictEqual(res.status, 401, res.raw);
  });

  test('POST /api/email/send validates the payload', async () => {
    const token = await createUserToken();
    const res = await request('POST', '/api/email/send', { text: 'no subject' }, bearer(token));
    assert.strictEqual(res.status, 400, res.raw);
  });

  test('POST /api/email/send delivers using the configured SMTP settings', async () => {
    const admin = await createAdminToken();
    await request(
      'PUT',
      '/api/settings/email',
      {
        enabled: true,
        host: 'smtp.example.com',
        from: 'a@example.com',
        recipients: ['dest@example.com'],
      },
      bearer(admin)
    );

    const token = await createUserToken();
    const res = await request(
      'POST',
      '/api/email/send',
      { subject: 'Minha newsletter', text: 'Conteúdo', html: '<p>Conteúdo</p>' },
      bearer(token)
    );

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(sentEmails.length, 1);
    assert.strictEqual(sentEmails[0].to, 'dest@example.com');
    assert.strictEqual(sentEmails[0].subject, 'Minha newsletter');
  });

  test('POST /api/email/test is admin-only and sends a test message', async () => {
    const user = await createUserToken();
    const denied = await request('POST', '/api/email/test', {}, bearer(user));
    assert.strictEqual(denied.status, 403, denied.raw);

    const admin = await createAdminToken();
    await request(
      'PUT',
      '/api/settings/email',
      {
        enabled: true,
        host: 'smtp.example.com',
        from: 'a@example.com',
        recipients: ['dest@example.com'],
      },
      bearer(admin)
    );

    const res = await request('POST', '/api/email/test', {}, bearer(admin));
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.verified, true);
    assert.strictEqual(sentEmails.length, 1);
  });

  test('initSettings applies persisted email settings on boot', async () => {
    const token = await createAdminToken();
    await request(
      'PUT',
      '/api/settings/email',
      { host: 'smtp.boot.test', from: 'boot@example.com', pass: 'boot-pass' },
      bearer(token)
    );

    Object.assign(email, structuredClone(__settingsInternals.ENV_EMAIL));
    await initSettings();

    assert.strictEqual(email.host, 'smtp.boot.test');
    assert.strictEqual(email.pass, 'boot-pass');
  });

  test('POST /api/ai/test is admin-only and runs a provider call', async () => {
    const token = await createAdminToken();
    const saved = structuredClone(__getAiConfig());
    __setAiConfig({
      ...saved,
      sensenova: { ...saved.sensenova, apiKey: '' },
      deepseek: { ...saved.deepseek, apiKey: '' },
      openai: {
        ...saved.openai,
        apiKey: 'sk-test',
        baseUrl: 'http://ai.test',
        model: 'test-model',
      },
    });

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }),
    })) as any;

    try {
      const user = await createUserToken();
      const denied = await request('POST', '/api/ai/test', { provider: 'openai' }, bearer(user));
      assert.strictEqual(denied.status, 403, denied.raw);

      const res = await request('POST', '/api/ai/test', { provider: 'openai' }, bearer(token));
      assert.strictEqual(res.status, 200, res.raw);
      assert.strictEqual(res.json.data.provider, 'openai');
      assert.strictEqual(res.json.data.reply, 'OK');
    } finally {
      global.fetch = originalFetch;
      __setAiConfig(saved);
    }
  });

  test('POST /api/ai/test reports a failure when the provider errors', async () => {
    const token = await createAdminToken();
    const saved = structuredClone(__getAiConfig());
    __setAiConfig({
      ...saved,
      sensenova: { ...saved.sensenova, apiKey: '' },
      deepseek: { ...saved.deepseek, apiKey: '' },
      openai: { ...saved.openai, apiKey: 'sk-test', baseUrl: 'http://ai.test', model: 'm' },
    });

    const originalFetch = global.fetch;
    global.fetch = (async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid key',
    })) as any;

    try {
      const res = await request('POST', '/api/ai/test', { provider: 'openai' }, bearer(token));
      assert.strictEqual(res.status, 502, res.raw);
      assert.match(res.json.error, /401/);
    } finally {
      global.fetch = originalFetch;
      __setAiConfig(saved);
    }
  });
});
