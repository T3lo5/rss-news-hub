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

  const feedsArray = [];
  for (const f of feedStats) {
    const latencies = JSON.parse(f.latencies || '[]');
    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;
    feedsArray.push({
      ...f,
      avgLatencyMs,
      latencies: undefined,
    });
  }

  return {
    scheduler: {
      running: false,
      intervalMs: 0,
      nextRun: null,
    },
    feeds: feedsArray,
    totals: {
      totalFetches: globalStats.totalFetches,
      totalItems: globalStats.totalItems,
      totalErrors: globalStats.totalErrors,
      lastFullFetch: globalStats.lastFullFetch,
    },
  };
}

function computeHealthScore(stats) {
  const { successfulFetches, failedFetches, lastSuccess, latencies, itemsNew, itemsDuplicate, itemsFetched } = stats;

  // Availability (0-40)
  const total = successfulFetches + failedFetches;
  const availability = total > 0 ? (successfulFetches / total) * 40 : 20;

  // Freshness (0-30) — days since last success
  // lastSuccess is already a timestamp (number) from getHealthStatus
  const daysSinceSuccess = lastSuccess ? (Date.now() - lastSuccess) / 864e5 : 999;
  const freshness = Math.max(0, 30 - daysSinceSuccess * 3);

  // Latency (0-15) — p95 < 5s = 15, > 30s = 0
  let latencyScore = 0;
  if (latencies && latencies.length > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Idx = Math.ceil(sorted.length * 0.95) - 1;
    const p95 = sorted[Math.max(0, p95Idx)] || 0;
    latencyScore = Math.max(0, 15 - p95 / 2000);
  }

  // Yield (0-15) — new items per fetch
  const avgNew = successfulFetches > 0 ? itemsNew / successfulFetches : 0;
  const yieldScore = Math.min(15, avgNew * 1.5);

  return Math.round(availability + freshness + latencyScore + yieldScore); // 0-100
}

export async function getFeedHealth() {
  const health = await feedStatsRepository.getHealthStatus();
  // Add healthScore to each feed
  return health.map((h) => ({
    ...h,
    healthScore: computeHealthScore(h),
  }));
}

export function __resetStats() {
  // This would need to clear the database tables
  // For now, just a placeholder
  globalStatsRepository.reset();
  // Note: feed stats would need individual clearing
}
