import assert from 'node:assert';
import { describe, test } from 'node:test';
import { filterNewsByConfig } from '../services/newsletter.service.js';

const DAY = 24 * 60 * 60 * 1000;

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Item ${id}`,
    source: 'Example',
    link: `https://example.com/${id}`,
    pubDate: new Date(Date.now() - DAY),
    relevanceScore: 50,
    ...overrides,
  };
}

const base = {
  lookbackDays: 7,
  sources: [] as string[],
  categories: [] as string[],
  minRelevanceScore: 0,
  maxItems: 15,
};

describe('newsletter selection', () => {
  test('keeps everything when no score gate or cap is set', () => {
    const news = [item('a', { relevanceScore: 5 }), item('b', { relevanceScore: 95 })];
    const result = filterNewsByConfig(news, { ...base });
    assert.strictEqual(result.length, 2);
  });

  test('minRelevanceScore drops items below it, unscored included', () => {
    const news = [
      item('low', { relevanceScore: 10 }),
      item('mid', { relevanceScore: 50 }),
      item('high', { relevanceScore: 90 }),
      item('unscored', { relevanceScore: null }),
    ];
    const result = filterNewsByConfig(news, { ...base, minRelevanceScore: 50 });
    // Highest score first — the same order the cap relies on.
    assert.deepStrictEqual(
      result.map((n) => n.id),
      ['high', 'mid']
    );
  });

  test('0 keeps everything, including unscored items', () => {
    const news = [item('low', { relevanceScore: 1 }), item('unscored', { relevanceScore: null })];
    const result = filterNewsByConfig(news, { ...base, minRelevanceScore: 0 });
    assert.strictEqual(result.length, 2);
  });

  test('maxItems caps the edition to the best-ranked, then newest', () => {
    const news = [
      item('worst', { relevanceScore: 10 }),
      item('older', { relevanceScore: 80, pubDate: new Date(Date.now() - 6 * DAY) }),
      item('newer', { relevanceScore: 80, pubDate: new Date(Date.now() - Number(DAY)) }),
      item('middle', { relevanceScore: 50 }),
    ];
    const result = filterNewsByConfig(news, { ...base, maxItems: 2 });
    assert.deepStrictEqual(
      result.map((n) => n.id),
      ['newer', 'older']
    );
  });

  test('lookback, sources and categories still apply before the cap', () => {
    const news = [
      item('stale', { pubDate: new Date(Date.now() - 10 * DAY), relevanceScore: 99 }),
      item('other-source', { source: 'Elsewhere', relevanceScore: 99 }),
      item('kept', { relevanceScore: 60 }),
    ];
    const result = filterNewsByConfig(news, {
      ...base,
      sources: ['Example'],
      lookbackDays: 7,
      maxItems: 15,
    });
    assert.deepStrictEqual(
      result.map((n) => n.id),
      ['kept']
    );
  });
});
