import assert from 'node:assert';
import { describe, test } from 'node:test';
import { fetchAndScoreFeeds } from '../services/ingest.service.js';

const fetched = {
  total: 2,
  results: [{ source: 'Ars Technica', count: 2, error: null }],
};

describe('fetchAndScoreFeeds', () => {
  test('scores the items in the same cycle as the fetch', async () => {
    const calls: string[] = [];
    const profile = { keywords: ['AI'], topics: [], preferredSources: [], excludedKeywords: [] };

    const result = await fetchAndScoreFeeds({
      fetchFeeds: async () => {
        calls.push('fetch');
        return fetched;
      },
      getProfile: async () => {
        calls.push('profile');
        return profile;
      },
      scorePending: async (received: unknown) => {
        calls.push('score');
        assert.deepStrictEqual(received, profile);
        return { scored: 2, total: 2 };
      },
    });

    assert.deepStrictEqual(calls, ['fetch', 'profile', 'score']);
    assert.deepStrictEqual(result, { ...fetched, scoring: { scored: 2, total: 2 } });
  });

  test('keeps the fetched news when scoring fails', async () => {
    const warnings: string[] = [];

    const result = await fetchAndScoreFeeds({
      fetchFeeds: async () => fetched,
      getProfile: async () => ({ keywords: [] }),
      scorePending: async () => {
        throw new Error('No AI provider configured');
      },
      warn: (message: string) => warnings.push(message),
    });

    assert.deepStrictEqual(result, fetched);
    assert.match(warnings[0], /No AI provider configured/);
  });
});
