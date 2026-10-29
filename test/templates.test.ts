import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import {
  createTemplate,
  deleteTemplate,
  getDefaultTemplateId,
  getTemplateSystemPrompt,
  loadTemplates,
  updateTemplate,
} from '../services/templates.js';
import { templateRepository } from '../src/db/repositories/index.js';
import { getTestDb, resetTestDb } from './setup.js';

function newTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: `tpl-${Math.random().toString(36).slice(2, 10)}`,
    name: 'Test Template',
    type: 'summary',
    systemPrompt: 'Summarize: {{title}} in {{language}}',
    variables: ['title', 'language'],
    ...overrides,
  };
}

describe('Templates service (DB-backed)', () => {
  beforeEach(() => {
    resetTestDb();
    getTestDb();
    templateRepository.reset();
  });

  test('createTemplate persists a template and findAll returns it', async () => {
    const created = await createTemplate(newTemplate({ id: 'tpl-1', name: 'First' }));

    assert.strictEqual(created.id, 'tpl-1');
    assert.strictEqual(created.isBuiltin, false);

    const all = await loadTemplates();
    const found = all.find((t) => t.id === 'tpl-1');
    assert.ok(found, 'created template should be listed');
    assert.strictEqual(found.name, 'First');
  });

  test('createTemplate rejects duplicate ids', async () => {
    await createTemplate(newTemplate({ id: 'tpl-dup' }));

    await assert.rejects(() => createTemplate(newTemplate({ id: 'tpl-dup' })), /already exists/);
  });

  test('updateTemplate changes fields', async () => {
    await createTemplate(newTemplate({ id: 'tpl-upd', name: 'Before' }));

    const updated = await updateTemplate('tpl-upd', { name: 'After' });

    assert.strictEqual(updated.name, 'After');
    assert.strictEqual(updated.id, 'tpl-upd');
  });

  test('updateTemplate refuses unknown ids and builtin templates', async () => {
    await assert.rejects(() => updateTemplate('nope', { name: 'X' }), /not found/);

    const [builtin] = templateRepository.getBuiltinTemplates();
    await assert.rejects(() => updateTemplate(builtin.id, { name: 'X' }), /built-in/);
  });

  test('deleteTemplate removes the template', async () => {
    await createTemplate(newTemplate({ id: 'tpl-del' }));

    await deleteTemplate('tpl-del');

    const all = await loadTemplates();
    assert.ok(!all.find((t) => t.id === 'tpl-del'), 'deleted template must be gone');
  });

  test('deleteTemplate refuses unknown ids and builtin templates', async () => {
    await assert.rejects(() => deleteTemplate('nope'), /not found/);

    const [builtin] = templateRepository.getBuiltinTemplates();
    await assert.rejects(() => deleteTemplate(builtin.id), /built-in/);
  });

  test('getTemplateSystemPrompt interpolates {{variables}}', async () => {
    await createTemplate(newTemplate({ id: 'tpl-var' }));

    const prompt = await getTemplateSystemPrompt('tpl-var', {
      title: 'Hello',
      language: 'pt-BR',
    });

    assert.ok(prompt.startsWith('Summarize: Hello in pt-BR'));
    assert.ok(prompt.includes('DIRETRIZES DE VOZ HUMANA'));
  });

  test('getTemplateSystemPrompt falls back to the type default for unknown ids', async () => {
    const prompt = await getTemplateSystemPrompt('does-not-exist', { type: 'summary' });

    assert.ok(typeof prompt === 'string' && prompt.length > 0, 'expected a default prompt');
  });

  test('getDefaultTemplateId returns a builtin id per type', () => {
    const id = getDefaultTemplateId('thread');
    assert.ok(typeof id === 'string' && id.length > 0);
  });
});
