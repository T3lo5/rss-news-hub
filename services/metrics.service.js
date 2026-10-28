import { sql } from 'drizzle-orm';
import { getDb, schema } from '../src/db/index.js';
import { getHealth } from './health.service.js';

// In-memory counters for request metrics
const requestCounters = {
  total: 0,
  byMethod: {},
  byPath: {},
  byStatus: {},
};

const requestDurationBuckets = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const requestDurationSum = 0;
const requestDurationCounts = {};

// Initialize duration buckets
requestDurationBuckets.forEach((bucket) => {
  requestDurationCounts[bucket] = 0;
});

/**
 * Record a request for metrics collection.
 * @param {string} method - HTTP method
 * @param {string} path - Request path (normalized, without IDs)
 * @param {number} status - HTTP status code
 * @param {number} durationMs - Request duration in milliseconds
 */
export function recordRequest(method, path, status, durationMs) {
  requestCounters.total++;

  // By method
  requestCounters.byMethod[method] = (requestCounters.byMethod[method] || 0) + 1;

  // By path (normalize paths with IDs)
  const normalizedPath = normalizePath(path);
  requestCounters.byPath[normalizedPath] = (requestCounters.byPath[normalizedPath] || 0) + 1;

  // By status code group (2xx, 3xx, 4xx, 5xx)
  const statusGroup = `${Math.floor(status / 100)}xx`;
  requestCounters.byStatus[statusGroup] = (requestCounters.byStatus[statusGroup] || 0) + 1;

  // Duration histogram
  requestDurationBuckets.forEach((bucket) => {
    if (durationMs / 1000 <= bucket) {
      requestDurationCounts[bucket]++;
    }
  });
}

/**
 * Normalize path by replacing IDs with placeholders.
 * @param {string} path - Request path
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  // Replace UUIDs
  let normalized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );
  // Replace numeric IDs
  normalized = normalized.replace(/\/\d+/g, '/:id');
  // Replace URL-encoded IDs in paths like /api/bookmarks/:id
  normalized = normalized.replace(/\/[^/]+%[0-9A-F]{2}/gi, '/:id');
  return normalized;
}

/**
 * Get current request metrics.
 * @returns {object} Request counters
 */
export function getRequestMetrics() {
  return {
    total: requestCounters.total,
    byMethod: { ...requestCounters.byMethod },
    byPath: { ...requestCounters.byPath },
    byStatus: { ...requestCounters.byStatus },
    duration: {
      buckets: [...requestDurationBuckets],
      counts: { ...requestDurationCounts },
      sum: requestDurationSum,
    },
  };
}

/**
 * Reset request metrics (for testing).
 */
export function resetRequestMetrics() {
  requestCounters.total = 0;
  requestCounters.byMethod = {};
  requestCounters.byPath = {};
  requestCounters.byStatus = {};
  requestDurationBuckets.forEach((bucket) => {
    requestDurationCounts[bucket] = 0;
  });
}

/**
 * Get database metrics.
 * @returns {Promise<object>} Database metrics
 */
export async function getDbMetrics() {
  const db = getDb();
  try {
    // Count items in main tables
    const [newsCount, usersCount, feedsCount, bookmarksCount, sessionsCount] = await Promise.all([
      db.select({ count: sql < number > `count(*)` }).from(schema.newsItems),
      db.select({ count: sql < number > `count(*)` }).from(schema.users),
      db.select({ count: sql < number > `count(*)` }).from(schema.feeds),
      db.select({ count: sql < number > `count(*)` }).from(schema.bookmarks),
      db.select({ count: sql < number > `count(*)` }).from(schema.sessions),
    ]);

    return {
      news_items: Number(newsCount[0]?.count ?? 0),
      users: Number(usersCount[0]?.count ?? 0),
      feeds: Number(feedsCount[0]?.count ?? 0),
      bookmarks: Number(bookmarksCount[0]?.count ?? 0),
      sessions: Number(sessionsCount[0]?.count ?? 0),
    };
  } catch (err) {
    return {
      error: err.message,
    };
  }
}

/**
 * Get application metrics (version, uptime, etc).
 * @returns {object} Application metrics
 */
export function getAppMetrics() {
  return {
    uptime_seconds: Math.round(process.uptime()),
    memory_rss_bytes: process.memoryUsage().rss,
    memory_heap_used_bytes: process.memoryUsage().heapUsed,
    memory_heap_total_bytes: process.memoryUsage().heapTotal,
    node_version: process.version,
  };
}

/**
 * Format metrics in Prometheus exposition format.
 * @param {object} metrics - Metrics object
 * @returns {string} Prometheus-formatted metrics
 */
export function formatPrometheusMetrics(metrics) {
  const lines = [];

  // HELP and TYPE for each metric
  lines.push('# HELP rss_news_hub_requests_total Total number of HTTP requests');
  lines.push('# TYPE rss_news_hub_requests_total counter');
  lines.push(`rss_news_hub_requests_total ${metrics.requests.total}`);

  lines.push('# HELP rss_news_hub_requests_by_method HTTP requests by method');
  lines.push('# TYPE rss_news_hub_requests_by_method counter');
  for (const [method, count] of Object.entries(metrics.requests.byMethod)) {
    lines.push(`rss_news_hub_requests_by_method{method="${method}"} ${count}`);
  }

  lines.push('# HELP rss_news_hub_requests_by_status HTTP requests by status code group');
  lines.push('# TYPE rss_news_hub_requests_by_status counter');
  for (const [status, count] of Object.entries(metrics.requests.byStatus)) {
    lines.push(`rss_news_hub_requests_by_status{status="${status}"} ${count}`);
  }

  lines.push('# HELP rss_news_hub_requests_by_path HTTP requests by path');
  lines.push('# TYPE rss_news_hub_requests_by_path counter');
  for (const [path, count] of Object.entries(metrics.requests.byPath).slice(0, 20)) {
    // Limit to top 20 paths
    const safePath = path.replace(/"/g, '\\"');
    lines.push(`rss_news_hub_requests_by_path{path="${safePath}"} ${count}`);
  }

  lines.push('# HELP rss_news_hub_request_duration_seconds HTTP request duration in seconds');
  lines.push('# TYPE rss_news_hub_request_duration_seconds histogram');
  for (const [bucket, count] of Object.entries(metrics.requests.duration.counts)) {
    lines.push(`rss_news_hub_request_duration_seconds_bucket{le="${bucket}"} ${count}`);
  }
  lines.push(
    `rss_news_hub_request_duration_seconds_bucket{le="+Inf"} ${metrics.requests.duration.counts[10] || 0}`
  );
  lines.push(`rss_news_hub_request_duration_seconds_sum ${metrics.requests.duration.sum}`);
  lines.push(`rss_news_hub_request_duration_seconds_count ${metrics.requests.total}`);

  // Database metrics
  lines.push('# HELP rss_news_hub_db_items Number of items in database tables');
  lines.push('# TYPE rss_news_hub_db_items gauge');
  lines.push(`rss_news_hub_db_items{table="news_items"} ${metrics.db.news_items}`);
  lines.push(`rss_news_hub_db_items{table="users"} ${metrics.db.users}`);
  lines.push(`rss_news_hub_db_items{table="feeds"} ${metrics.db.feeds}`);
  lines.push(`rss_news_hub_db_items{table="bookmarks"} ${metrics.db.bookmarks}`);
  lines.push(`rss_news_hub_db_items{table="sessions"} ${metrics.db.sessions}`);

  // Application metrics
  lines.push('# HELP rss_news_hub_uptime_seconds Application uptime in seconds');
  lines.push('# TYPE rss_news_hub_uptime_seconds gauge');
  lines.push(`rss_news_hub_uptime_seconds ${metrics.app.uptime_seconds}`);

  lines.push('# HELP rss_news_hub_memory_bytes Memory usage in bytes');
  lines.push('# TYPE rss_news_hub_memory_bytes gauge');
  lines.push(`rss_news_hub_memory_bytes{type="rss"} ${metrics.app.memory_rss_bytes}`);
  lines.push(`rss_news_hub_memory_bytes{type="heap_used"} ${metrics.app.memory_heap_used_bytes}`);
  lines.push(`rss_news_hub_memory_bytes{type="heap_total"} ${metrics.app.memory_heap_total_bytes}`);

  // System metrics (if available)
  if (metrics.system) {
    lines.push('# HELP rss_news_hub_system_memory_used_percent System memory usage percentage');
    lines.push('# TYPE rss_news_hub_system_memory_used_percent gauge');
    lines.push(
      `rss_news_hub_system_memory_used_percent ${metrics.system.memory?.system?.used_percent || 0}`
    );

    lines.push('# HELP rss_news_hub_system_disk_used_percent System disk usage percentage');
    lines.push('# TYPE rss_news_hub_system_disk_used_percent gauge');
    lines.push(`rss_news_hub_system_disk_used_percent ${metrics.system.disk?.used_percent || 0}`);

    lines.push('# HELP rss_news_hub_system_load System load average (1, 5, 15 minutes)');
    lines.push('# TYPE rss_news_hub_system_load gauge');
    if (metrics.system.load) {
      lines.push(`rss_news_hub_system_load{period="1m"} ${metrics.system.load[0] || 0}`);
      lines.push(`rss_news_hub_system_load{period="5m"} ${metrics.system.load[1] || 0}`);
      lines.push(`rss_news_hub_system_load{period="15m"} ${metrics.system.load[2] || 0}`);
    }
  }

  // Scheduler status
  lines.push('# HELP rss_news_hub_scheduler_running Whether a scheduler is running');
  lines.push('# TYPE rss_news_hub_scheduler_running gauge');
  lines.push(
    `rss_news_hub_scheduler_running{name="fetch"} ${metrics.schedulers.fetch?.running ? 1 : 0}`
  );
  lines.push(
    `rss_news_hub_scheduler_running{name="digest"} ${metrics.schedulers.digest?.enabled ? 1 : 0}`
  );
  lines.push(
    `rss_news_hub_scheduler_running{name="retention"} ${metrics.schedulers.retention?.running ? 1 : 0}`
  );
  lines.push(
    `rss_news_hub_scheduler_running{name="telegram"} ${metrics.schedulers.telegram?.running ? 1 : 0}`
  );

  // AI providers
  lines.push('# HELP rss_news_hub_ai_provider_configured Whether an AI provider is configured');
  lines.push('# TYPE rss_news_hub_ai_provider_configured gauge');
  metrics.providers.configured.forEach((provider) => {
    lines.push(`rss_news_hub_ai_provider_configured{provider="${provider}"} 1`);
  });

  return lines.join('\n');
}

/**
 * Get all metrics in Prometheus format.
 * @param {boolean} includeSystem - Include system metrics (requires admin)
 * @returns {Promise<string>} Prometheus-formatted metrics string
 */
export async function getPrometheusMetrics(includeSystem = false) {
  const [dbMetrics, health] = await Promise.all([
    getDbMetrics(),
    includeSystem ? getHealth(true) : getHealth(false),
  ]);

  const metrics = {
    requests: getRequestMetrics(),
    db: dbMetrics,
    app: getAppMetrics(),
    schedulers: health.schedulers,
    providers: health.providers,
  };

  if (includeSystem && health.system) {
    metrics.system = health.system;
  }

  return formatPrometheusMetrics(metrics);
}
