import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { createUser } from '../services/auth.service.js';
import { bearer, request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

async function createUserToken(role = 'user'): Promise<string> {
  const email = `user-settings-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.com`;
  await createUser(email, 'senha12345', `User Settings ${role}`, role);
  const login = await request('POST', '/api/auth/login', { email, password: 'senha12345' });
  assert.strictEqual(login.status, 200, login.raw);
  return login.json.data.accessToken;
}

async function createAdminToken(): Promise<string> {
  return createUserToken('admin');
}

describe('User Settings API (per-user self-service)', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
  });

  test('GET /api/me/settings requires authentication', async () => {
    const res = await request('GET', '/api/me/settings');
    assert.strictEqual(res.status, 401, res.raw);
  });

  test('GET /api/me/settings returns overview with fallback flags', async () => {
    const token = await createUserToken();
    const res = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(res.status, 200, res.raw);
    const { data } = res.json;
    assert.ok(data.ai, 'ai area exists');
    assert.ok(data.telegram, 'telegram area exists');
    assert.ok(data.email, 'email area exists');
    assert.ok(data.newsletter, 'newsletter area exists');
    assert.ok(data.digest, 'digest area exists');
    // Sem override do usuário → hasUserOverride = false
    assert.strictEqual(data.ai.hasUserOverride, false);
    assert.strictEqual(data.telegram.hasUserOverride, false);
    assert.strictEqual(data.email.hasUserOverride, false);
    assert.strictEqual(data.newsletter.hasUserOverride, false);
    assert.strictEqual(data.digest.hasUserOverride, false);
  });

  test('PUT /api/me/settings/ai saves user override and returns hasUserOverride=true', async () => {
    const token = await createUserToken();
    const res = await request(
      'PUT',
      '/api/me/settings/ai',
      {
        sensenova: { apiKey: 'my-custom-key', model: 'custom-model' },
      },
      bearer(token)
    );
    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.hasUserOverride, true);

    // Verifica via GET que a config foi persistida
    const overview = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(overview.json.data.ai.hasUserOverride, true);
    assert.strictEqual(overview.json.data.ai.providers[0].configured, true);
    assert.strictEqual(overview.json.data.ai.providers[0].model, 'custom-model');
  });

  test('PUT /api/me/settings/telegram saves botToken encrypted', async () => {
    const token = await createUserToken();
    const res = await request(
      'PUT',
      '/api/me/settings/telegram',
      {
        botToken: 'my-bot-token-123',
        chatId: '999888777',
      },
      bearer(token)
    );
    assert.strictEqual(res.status, 200, res.raw);

    const overview = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(overview.json.data.telegram.hasUserOverride, true);
    assert.strictEqual(overview.json.data.telegram.botTokenSet, true);
    assert.strictEqual(overview.json.data.telegram.chatId, '999888777');
  });

  test('PUT /api/me/settings/email saves SMTP config', async () => {
    const token = await createUserToken();
    const res = await request(
      'PUT',
      '/api/me/settings/email',
      {
        host: 'smtp.gmail.com',
        port: 587,
        secure: true,
        user: 'user@gmail.com',
        pass: 'app-password',
        from: 'user@gmail.com',
        recipients: ['dest@example.com'],
      },
      bearer(token)
    );
    assert.strictEqual(res.status, 200, res.raw);

    const overview = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(overview.json.data.email.hasUserOverride, true);
    assert.strictEqual(overview.json.data.email.host, 'smtp.gmail.com');
    assert.strictEqual(overview.json.data.email.passwordSet, true);
  });

  test('DELETE /api/me/settings/:area removes override and restores fallback', async () => {
    const token = await createUserToken();

    // Salva override
    await request(
      'PUT',
      '/api/me/settings/telegram',
      {
        botToken: 'my-bot-token',
        chatId: '12345',
      },
      bearer(token)
    );

    let overview = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(overview.json.data.telegram.hasUserOverride, true);

    // Remove override
    const del = await request('DELETE', '/api/me/settings/telegram', undefined, bearer(token));
    assert.strictEqual(del.status, 200, del.raw);

    overview = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(overview.json.data.telegram.hasUserOverride, false);
  });

  test('PUT /api/me/settings/:area rejects invalid area', async () => {
    const token = await createUserToken();
    const res = await request('PUT', '/api/me/settings/invalid-area', {}, bearer(token));
    assert.strictEqual(res.status, 400, res.raw);
  });

  test('PUT /api/me/settings/:area requires authentication', async () => {
    const res = await request('PUT', '/api/me/settings/ai', { sensenova: { apiKey: 'x' } });
    assert.strictEqual(res.status, 401, res.raw);
  });

  test('Admin can also use per-user settings (not admin-only)', async () => {
    const token = await createAdminToken();
    const res = await request('GET', '/api/me/settings', undefined, bearer(token));
    assert.strictEqual(res.status, 200, res.raw);
  });

  test('Per-user AI override does not affect global config', async () => {
    const userToken = await createUserToken();
    // Usuário salva sua própria key
    await request(
      'PUT',
      '/api/me/settings/ai',
      {
        openai: { apiKey: 'user-specific-key' },
      },
      bearer(userToken)
    );

    // Admin vê config global (não afetada)
    const adminToken = await createAdminToken();
    const adminOverview = await request('GET', '/api/me/settings', undefined, bearer(adminToken));
    assert.strictEqual(adminOverview.json.data.ai.hasUserOverride, false);

    // Usuário vê sua própria config
    const userOverview = await request('GET', '/api/me/settings', undefined, bearer(userToken));
    assert.strictEqual(userOverview.json.data.ai.hasUserOverride, true);
    const openaiProvider = userOverview.json.data.ai.providers.find((p: any) => p.id === 'openai');
    assert.strictEqual(openaiProvider.configured, true);
  });

  // A conta restrita recebe a mesma realidade que o resolver dá a ela: só a
  // própria override. Antes o overview devolvia a visão mesclada, dizendo a um
  // usuário comum quais providers o dono configurou, o chat id do Telegram do
  // dono, o host de SMTP e o cron do newsletter do sistema.
  test('a non-admin overview does not reflect the system configuration', async () => {
    const adminToken = await createAdminToken();

    const ai = await request(
      'PUT',
      '/api/settings/ai',
      { deepseek: { apiKey: 'sk-system-secret', model: 'deepseek-reasoner' } },
      bearer(adminToken)
    );
    assert.strictEqual(ai.status, 200, ai.raw);

    const tg = await request(
      'PUT',
      '/api/settings/telegram',
      { botToken: '123456:AA-system-secret', chatId: '-100999' },
      bearer(adminToken)
    );
    assert.strictEqual(tg.status, 200, tg.raw);

    // O admin continua enxergando o que o sistema tem.
    const adminOverview = await request('GET', '/api/me/settings', undefined, bearer(adminToken));
    const adminDeepseek = adminOverview.json.data.ai.providers.find(
      (p: any) => p.id === 'deepseek'
    );
    assert.strictEqual(adminDeepseek.configured, true, adminOverview.raw);
    assert.strictEqual(adminOverview.json.data.telegram.chatId, '-100999');

    // Quem não é admin enxerga o vazio: nada configurado, nada alheio.
    const userToken = await createUserToken();
    const res = await request('GET', '/api/me/settings', undefined, bearer(userToken));
    assert.strictEqual(res.status, 200, res.raw);
    const { data } = res.json;
    for (const provider of data.ai.providers) {
      assert.strictEqual(provider.configured, false, `${provider.id}: ${res.raw}`);
    }
    assert.strictEqual(data.telegram.chatId, '');
    assert.strictEqual(data.telegram.botTokenSet, false);
    assert.strictEqual(data.email.host, '');
    assert.strictEqual(data.email.passwordSet, false);
    assert.strictEqual(data.newsletter.cron, '');
  });
});
