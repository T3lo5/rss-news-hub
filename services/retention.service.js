// Automatic pruning of old news items.
//
// The SQLite database grows unbounded as feeds are fetched, so an admin can
// set a retention window (in days) and the app deletes anything older than the
// cutoff — once at boot and then every 24h. retentionDays = 0 disables it.

import { retention } from '../server.config.js';
import { newsRepository } from '../src/db/repositories/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let timer = null;

// Delete news whose pubDate is older than `retentionDays`. Passing days <= 0
// is a no-op so a misconfigured value can never wipe the whole table.
export async function runRetentionCleanup(retentionDays = retention.retentionDays) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) {
    return { skipped: true, deleted: 0, retentionDays: days || 0 };
  }

  const cutoff = new Date(Date.now() - days * DAY_MS);
  const deleted = await newsRepository.deleteOlderThan(cutoff);
  return { skipped: false, deleted, retentionDays: days, cutoff: cutoff.toISOString() };
}

async function runScheduled() {
  try {
    const result = await runRetentionCleanup();
    if (!result.skipped && result.deleted > 0) {
      console.log(
        `[retention] removed ${result.deleted} news item(s) older than ${result.retentionDays}d`
      );
    }
  } catch (err) {
    console.error('[retention] cleanup failed:', err);
  }
}

export function startRetentionJob() {
  stopRetentionJob();
  if (!retention.retentionDays || retention.retentionDays <= 0) return;

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
    running: Boolean(timer),
  };
}
