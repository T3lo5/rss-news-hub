import {
  feedRepository,
  feedStatsRepository,
  globalStatsRepository,
} from '../src/db/repositories/index.js';

export async function recordFetchStart() {
  await globalStatsRepository.incrementFetches();
}

export async function recordFetchResult({ total, errors }) {
  await globalStatsRepository.recordFetchResult(total, errors);
}

export async function recordFeedResult(
  name,
  {
    success,
    items = 0,
    itemsNew = 0,
    itemsDuplicate = 0,
    etagHit = false,
    error = null,
    latencyMs = null,
  }
) {
  // Find feed by name to get ID
  const feeds = await feedRepository.findAll();
  const feed = feeds.find((f) => f.name === name);
  if (!feed) {
    console.warn(`Feed not found for stats: ${name}`);
    return;
  }

  await feedStatsRepository.recordFeedResult(feed.id, name, {
    success,
    items,
    itemsNew,
    itemsDuplicate,
    etagHit,
    error,
    latencyMs,
  });
}

export function getStats() {
  // This is a synchronous function but we need async data
  // The API layer will call the async versions
  return {
    scheduler: {
      running: false,
      intervalMs: 0,
      nextRun: null,
    },
    feeds: {},
    totals: { totalFetches: 0, totalItems: 0, totalErrors: 0, lastFullFetch: null },
  };
}

export async function getStatsAsync() {
  const [feedStats, globalStats, _feeds] = await Promise.all([
    feedStatsRepository.getAll(),
    globalStatsRepository.get(),
    feedRepository.findAll(),
  ]);

  const feedsObj = {};
  for (const f of feedStats) {
    const latencies = JSON.parse(f.latencies || '[]');
    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;
    feedsObj[f.feedId] = {
      ...f,
      avgLatencyMs,
      latencies: undefined,
    };
  }

  return {
    scheduler: {
      running: false,
      intervalMs: 0,
      nextRun: null,
    },
    feeds: feedsObj,
    totals: {
      totalFetches: globalStats.totalFetches,
      totalItems: globalStats.totalItems,
      totalErrors: globalStats.totalErrors,
      lastFullFetch: globalStats.lastFullFetch,
    },
  };
}

export async function getFeedHealth() {
  return feedStatsRepository.getHealthStatus();
}

export function __resetStats() {
  // This would need to clear the database tables
  // For now, just a placeholder
  globalStatsRepository.reset();
  // Note: feed stats would need individual clearing
}
