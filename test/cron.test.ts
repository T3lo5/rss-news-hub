import assert from 'node:assert';
import { describe, test } from 'node:test';
import { getNextCronRun, isValidCron, parseCron } from '../services/cron.js';

// Reference instant: Friday 2026-10-16 10:30 local time.
const FRI_1030 = new Date(2026, 9, 16, 10, 30, 0, 0).getTime();

function at(y: number, mo: number, d: number, h = 0, mi = 0) {
  return new Date(y, mo, d, h, mi, 0, 0).getTime();
}

describe('cron.isValidCron', () => {
  test('accepts common expressions', () => {
    for (const expr of [
      '* * * * *',
      '0 9 * * *',
      '0 9 * * 1-5',
      '*/15 * * * *',
      '0 0 1 * *',
      '0 0 1 JAN *',
      '30 4 * * sun',
      '0 0,12 * * 1,3,5',
      '0 0 1-7/2 * *',
    ]) {
      assert.strictEqual(isValidCron(expr), true, `expected valid: ${expr}`);
    }
  });

  test('rejects malformed expressions', () => {
    for (const expr of [
      '',
      '0 9 * *',
      '0 9 * * * * *',
      '60 9 * * *',
      '0 24 * * *',
      '0 9 0 * *',
      '0 9 * 13 *',
      '0 9 * * 8',
      'a b c d e',
      '0 9 * * 1-',
      '*/0 * * * *',
      '0 9 * * mon-fri-',
    ]) {
      assert.strictEqual(isValidCron(expr), false, `expected invalid: ${expr}`);
    }
  });
});

describe('cron.parseCron', () => {
  test('treats "*" as any (null) and expands ranges', () => {
    const parsed = parseCron('0 9 * * 1-5');
    assert.deepStrictEqual([...parsed.minute], [0]);
    assert.deepStrictEqual([...parsed.hour], [9]);
    assert.strictEqual(parsed.dayOfMonth, null);
    assert.strictEqual(parsed.month, null);
    assert.deepStrictEqual([...parsed.dayOfWeek].sort(), [1, 2, 3, 4, 5]);
    assert.strictEqual(parsed.dayOfMonthAny, true);
    assert.strictEqual(parsed.dayOfWeekAny, false);
  });

  test('expands steps and normalises 7 -> Sunday', () => {
    assert.deepStrictEqual(
      [...parseCron('*/15 * * * *').minute].sort((a, b) => a - b),
      [0, 15, 30, 45]
    );
    assert.deepStrictEqual([...parseCron('0 0 * * 7').dayOfWeek], [0]);
  });

  test('accepts month and weekday names', () => {
    assert.deepStrictEqual([...parseCron('0 0 1 jan *').month], [1]);
    assert.deepStrictEqual([...parseCron('0 0 * * sun').dayOfWeek], [0]);
  });
});

describe('cron.getNextCronRun', () => {
  test('daily at 09:00 (before and after the time)', () => {
    assert.strictEqual(getNextCronRun('0 9 * * *', FRI_1030), at(2026, 9, 17, 9));
    assert.strictEqual(getNextCronRun('0 9 * * *', at(2026, 9, 16, 8, 0)), at(2026, 9, 16, 9));
  });

  test('weekdays 09:00 skips the weekend (regression for the interval approximation)', () => {
    // Friday 10:30 -> next weekday occurrence is Monday 09:00.
    assert.strictEqual(getNextCronRun('0 9 * * 1-5', FRI_1030), at(2026, 9, 19, 9));
    // Friday 08:00 -> still the same Friday 09:00.
    assert.strictEqual(getNextCronRun('0 9 * * 1-5', at(2026, 9, 16, 8)), at(2026, 9, 16, 9));
  });

  test('hourly / every 15 minutes', () => {
    assert.strictEqual(getNextCronRun('0 * * * *', FRI_1030), at(2026, 9, 16, 11));
    assert.strictEqual(getNextCronRun('*/15 * * * *', FRI_1030), at(2026, 9, 16, 10, 45));
  });

  test('monthly on the 1st', () => {
    assert.strictEqual(getNextCronRun('0 0 1 * *', FRI_1030), at(2026, 10, 1));
  });

  test('weekly on Sunday', () => {
    assert.strictEqual(getNextCronRun('5 4 * * sun', FRI_1030), at(2026, 9, 18, 4, 5));
  });

  test('month name', () => {
    assert.strictEqual(getNextCronRun('0 0 1 jan *', FRI_1030), at(2027, 0, 1));
  });

  test('day-of-month OR day-of-week when both are restricted', () => {
    // "1st of the month OR Monday": Monday 19 Oct is sooner than 1 Nov.
    assert.strictEqual(getNextCronRun('0 0 1 * 1', FRI_1030), at(2026, 9, 19));
  });

  test('is strictly after the reference instant', () => {
    // Exactly at 09:00 -> next day.
    assert.strictEqual(getNextCronRun('0 9 * * *', at(2026, 9, 16, 9)), at(2026, 9, 17, 9));
  });

  test('throws for an impossible expression', () => {
    assert.throws(() => getNextCronRun('0 0 30 feb *', FRI_1030), /No upcoming run/);
  });

  test('accepts an optional leading seconds field', () => {
    assert.strictEqual(getNextCronRun('0 0 9 * * *', FRI_1030), at(2026, 9, 17, 9));
  });
});
