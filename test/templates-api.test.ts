import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { templateRepository } from '../src/db/repositories/index.js';
import { request } from './helpers/auth-http.js';
import { getTestDb, resetTestDb } from './setup.js';

function newTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: `api-tpl-${Math.random().toString(36).slice(2, 10)}`,
    name: 'API Template',
    type: 'summary',
    systemPrompt: 'Summarize: {{title}}',
    variables: ['title'],
    ...overrides,
  };
}

describe('Templates API (HTTP-level)', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
    templateRepository.reset();
  });

  test('GET /api/templates lists templates', async () => {
    const res = await request('GET', '/api/templates');

    assert.strictEqual(res.status, 200, res.raw);
    assert.ok(Array.isArray(res.json.data));
  });

  test('POST /api/templates creates a template (201)', async () => {
    const res = await request('POST', '/api/templates', newTemplate());

    assert.strictEqual(res.status, 201, res.raw);
    assert.strictEqual(res.json.ok, true);
    assert.ok(res.json.data.id);
    assert.strictEqual(res.json.data.name, 'API Template');
  });

  test('POST /api/templates rejects an invalid payload with 400', async () => {
    const res = await request('POST', '/api/templates', { name: 'missing type and prompt' });

    assert.strictEqual(res.status, 400, res.raw);
    assert.strictEqual(res.json.ok, false);
  });

  test('PUT /api/templates/:id updates a template', async () => {
    const created = await request('POST', '/api/templates', newTemplate());
    const id = created.json.data.id;

    const res = await request('PUT', `/api/templates/${id}`, { name: 'Renamed' });

    assert.strictEqual(res.status, 200, res.raw);
    assert.strictEqual(res.json.data.name, 'Renamed');
  });

  test('PUT /api/templates/:id returns 404 for unknown ids', async () => {
    const res = await request('PUT', '/api/templates/definitely-missing', { name: 'X' });

    assert.strictEqual(res.status, 404, res.raw);
  });

  test('DELETE /api/templates/:id removes the template', async () => {
    const created = await request('POST', '/api/templates', newTemplate());
    const id = created.json.data.id;

    const res = await request('DELETE', `/api/templates/${id}`);

    assert.strictEqual(res.status, 200, res.raw);
    assert.deepStrictEqual(res.json.data, { deleted: true });

    const list = await request('GET', '/api/templates');
    assert.ok(!list.json.data.find((t: any) => t.id === id), 'template must be gone');
  });

  test('POST /api/templates/:id/test renders the system prompt', async () => {
    const created = await request(
      'POST',
      '/api/templates',
      newTemplate({ systemPrompt: 'Topic: {{title}}' })
    );
    const id = created.json.data.id;

    const res = await request('POST', `/api/templates/${id}/test`, {
      variables: { title: 'Docker' },
    });

    assert.strictEqual(res.status, 200, res.raw);
    assert.ok(res.json.data.systemPrompt.includes('Docker'), res.raw);
  });

  test('POST /api/templates/:id/test falls back to the default template for unknown ids', async () => {
    const res = await request('POST', '/api/templates/unknown-id/test', { variables: {} });

    assert.strictEqual(res.status, 200, res.raw);
    assert.ok(res.json.data.systemPrompt.length > 0, res.raw);
  });
});
