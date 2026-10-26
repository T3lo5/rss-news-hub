import assert from 'node:assert';
import { beforeEach, describe, test } from 'node:test';
import { addHistoryEntry, readHistory } from '../services/newsletter.service.js';
import { getTestDb, resetTestDb } from './setup.js';

// The scheduled run builds its history entry with `Date.now()`, but
// `newsletter_history.timestamp` is a drizzle `timestamp_ms` column, which maps
// through `Date.prototype.getTime()`. Passing the raw number made every run
// throw "value.getTime is not a function" — after the edition had already been
// delivered — and left the history permanently empty.
describe('newsletter history persistence', () => {
  beforeEach(async () => {
    resetTestDb();
    await getTestDb();
  });

  test('stores an entry whose timestamp is a plain number', async () => {
    const timestamp = Date.now();

    const saved = await addHistoryEntry({
      id: 'nl-number',
      timestamp,
      success: true,
      itemCount: 3,
      error: null,
      contentPreview: 'preview',
    });

    assert.strictEqual(saved.timestamp.getTime(), timestamp);
    assert.strictEqual(saved.success, true);

    const history = await readHistory(10);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].itemCount, 3);
  });

  test('stores an entry that carries a Date instead', async () => {
    const timestamp = new Date();

    const saved = await addHistoryEntry({
      id: 'nl-date',
      timestamp,
      success: false,
      itemCount: 0,
      error: 'No news items match filters',
      contentPreview: '',
    });

    assert.strictEqual(saved.timestamp.getTime(), timestamp.getTime());
  });

  test('stores an entry with no timestamp at all', async () => {
    const saved = await addHistoryEntry({
      id: 'nl-missing',
      success: false,
      itemCount: 0,
      error: 'boom',
      contentPreview: '',
    });

    assert.ok(Number.isFinite(saved.timestamp.getTime()));
    assert.ok(Date.now() - saved.timestamp.getTime() < 60_000);
  });

  test('a failed run still leaves a row behind for the history screen', async () => {
    await addHistoryEntry({
      id: 'nl-failed',
      timestamp: Date.now(),
      success: false,
      itemCount: 12,
      error: 'No AI provider configured',
      contentPreview: '',
    });

    const history = await readHistory(10);
    assert.strictEqual(history.length, 1);
    assert.match(history[0].error ?? '', /No AI provider/);
  });
});
