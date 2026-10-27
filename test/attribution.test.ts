import assert from 'node:assert';
import { describe, test } from 'node:test';
import { ensureSourceAttribution, sourceLabels } from '../services/attribution.js';

const item = (overrides: Record<string, unknown> = {}) => ({
  title: 'Título da notícia',
  source: 'TechCrunch',
  link: 'https://example.com/artigo',
  ...overrides,
});

describe('source attribution', () => {
  test('appends the source when the model left the link out', () => {
    const out = ensureSourceAttribution('Um post sobre o assunto.', [item()]);
    assert.strictEqual(
      out,
      'Um post sobre o assunto.\n\nFonte: TechCrunch — [https://example.com/artigo](https://example.com/artigo)'
    );
  });

  test('returns the content untouched when the link is already there', () => {
    const content = 'Post com link no final\n\nhttps://example.com/artigo';
    assert.strictEqual(ensureSourceAttribution(content, [item()]), content);
  });

  test('a markdown link in the body also counts as present', () => {
    const content = 'Leia em [o artigo](https://example.com/artigo).';
    assert.strictEqual(ensureSourceAttribution(content, [item()]), content);
  });

  test('appends only the missing links for multiple items', () => {
    const items = [
      item({ link: 'https://example.com/um', title: 'Primeira' }),
      item({ link: 'https://example.com/dois', title: 'Segunda' }),
    ];
    const out = ensureSourceAttribution('Nenhuma fonte citada ainda.', items);
    assert.ok(out.includes('Fontes:'));
    assert.ok(out.includes('• Primeira — [https://example.com/um](https://example.com/um)'));
    assert.ok(out.includes('• Segunda — [https://example.com/dois](https://example.com/dois)'));
  });

  test('when only one link is missing it uses the single-item form', () => {
    const items = [
      item({ link: 'https://example.com/um', title: 'Primeira' }),
      item({ link: 'https://example.com/dois', title: 'Segunda' }),
    ];
    const out = ensureSourceAttribution('Já citada: https://example.com/um', items);
    assert.ok(out.includes('Fonte: TechCrunch — [https://example.com/dois]'));
    assert.ok(!out.includes('[https://example.com/um]'), 'present link must not be repeated');
  });

  test('ignores items without a link', () => {
    const out = ensureSourceAttribution('Só texto.', [item({ link: null })]);
    assert.strictEqual(out, 'Só texto.');
  });

  test('appends to empty content without leading blank lines', () => {
    const out = ensureSourceAttribution('', [item()]);
    assert.strictEqual(
      out,
      'Fonte: TechCrunch — [https://example.com/artigo](https://example.com/artigo)'
    );
  });

  test('uses English labels for language en', () => {
    const out = ensureSourceAttribution('Post text.', [item()], sourceLabels('en'));
    assert.ok(out.includes('Source: TechCrunch —'));
  });
});
