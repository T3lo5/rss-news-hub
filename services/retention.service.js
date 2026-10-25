// Automatic pruning of old news items.
//
// The SQLite database grows unbounded as feeds are fetched, so an admin can
// set a retention window (in days) and the app deletes anything older than the
// cutoff — once at boot and then every 24h. retentionDays = 0 disables it.
//
// A second, faster rule clears junk early: items scoring below
// `lowScoreThreshold` that are older than `lowScoreDays` go first, so the
// irrelevant tier never accumulates while the relevant news keeps aging into
// the main window. lowScoreDays = 0 disables that rule.
//
// Bookmarked items are exempt from both (see `notBookmarked()` in the news
// repository): a bookmark is a deliberate user choice, not an heuristic input.

import { retention } from '../server.config.js';
import { newsRepository } from '../src/db/repositories/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let timer = null;

function asDays(value) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

// Delete news whose pubDate is older than `retentionDays`, then any item that
// is both low-scoring and past the junk window. Passing days <= 0 skips the age
// rule so a misconfigured value can never wipe the whole table; the score rule
// is governed independently by `retention.lowScoreDays`.
export async function runRetentionCleanup(retentionDays = retention.retentionDays) {
  const ageDays = asDays(retentionDays);
  const scoreDays = asDays(retention.lowScoreDays);
  const scoreThreshold = Number(retention.lowScoreThreshold) || 0;
  const scoreEnabled = scoreDays > 0 && scoreThreshold > 0;

  if (ageDays <= 0 && !scoreEnabled) {
    return {
      skipped: true,
      deleted: 0,
      retentionDays: ageDays,
      lowScoreDays: scoreDays,
      lowScoreThreshold: scoreThreshold,
    };
  }

  const now = Date.now();
  let ageDeleted = 0;
  let scoreDeleted = 0;

  if (ageDays > 0) {
    ageDeleted = await newsRepository.deleteOlderThan(new Date(now - ageDays * DAY_MS));
  }
  if (scoreEnabled) {
    scoreDeleted = await newsRepository.deleteLowRelevanceOlderThan(
      new Date(now - scoreDays * DAY_MS),
      scoreThreshold
    );
  }

  return {
    skipped: false,
    deleted: ageDeleted + scoreDeleted,
    ageDeleted,
    scoreDeleted,
    retentionDays: ageDays,
    lowScoreDays: scoreDays,
    lowScoreThreshold: scoreThreshold,
    cutoff: new Date(now - (ageDays || scoreDays) * DAY_MS).toISOString(),
  };
}

async function runScheduled() {
  try {
    const result = await runRetentionCleanup();
    if (!result.skipped && result.deleted > 0) {
      console.log(
        `[retention] removed ${result.deleted} news item(s) ` +
          `(age: ${result.ageDeleted}, low score: ${result.scoreDeleted})`
      );
    }
  } catch (err) {
    console.error('[retention] cleanup failed:', err);
  }
}

export function startRetentionJob() {
  stopRetentionJob();
  // Either rule alone is enough to justify the daily timer.
  if (!asDays(retention.retentionDays) && !asDays(retention.lowScoreDays)) return;

  runScheduled();
  timer = setInterval(runScheduled, DAY_MS);
  timer.unref?.();
}

export function stopRetentionJob() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getRetentionStatus() {
  return {
    retentionDays: retention.retentionDays,
    lowScoreThreshold: retention.lowScoreThreshold,
    lowScoreDays: retention.lowScoreDays,
    running: Boolean(timer),
  };
}
