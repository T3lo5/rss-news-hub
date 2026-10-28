// Aggregated health/status snapshot for the /api/health endpoint and the
// container healthcheck. Kept separate from server.js so it is easy to test.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newsRepository } from '../src/db/repositories/index.js';
import { getDigestStatus } from './digest.service.js';
import { getRetentionStatus } from './retention.service.js';
import { getStatus as getSchedulerStatus } from './scheduler.service.js';
import { getProviderList } from './settings.service.js';
import { getTelegramQueueWorkerStatus } from './telegram-worker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let packageVersion = '0.0.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  packageVersion = pkg.version || packageVersion;
} catch {
  // Non-fatal: the health endpoint still works without a version.
}

async function checkDb() {
  try {
    const newsCount = await newsRepository.count();
    return { ok: true, newsCount };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

import { freemem, loadavg, totalmem } from 'node:os';

function getMemoryInfo() {
  const total = process.memoryUsage();
  const sysTotal = totalmem();
  const sysFree = freemem();
  return {
    process: {
      rss_mb: Math.round(total.rss / 1024 / 1024),
      heap_used_mb: Math.round(total.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(total.heapTotal / 1024 / 1024),
      external_mb: Math.round(total.external / 1024 / 1024),
    },
    system: {
      total_mb: Math.round(sysTotal / 1024 / 1024),
      free_mb: Math.round(sysFree / 1024 / 1024),
      used_percent: Math.round((1 - sysFree / sysTotal) * 100),
    },
  };
}

function getDiskInfo() {
  try {
    // Use df for cross-platform disk info (works on Linux/macOS)
    const output = execSync('df -k /', { encoding: 'utf8', timeout: 1000 }).trim();
    const lines = output.split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const totalKb = parseInt(parts[1], 10);
      const usedKb = parseInt(parts[2], 10);
      const freeKb = parseInt(parts[3], 10);
      return {
        total_mb: Math.round(totalKb / 1024),
        used_mb: Math.round(usedKb / 1024),
        free_mb: Math.round(freeKb / 1024),
        used_percent: Math.round((usedKb / totalKb) * 100),
      };
    }
  } catch {
    // Fallback: return null if df fails
  }
  return null;
}

function getLoadInfo() {
  try {
    return loadavg();
  } catch {
    return [0, 0, 0];
  }
}

export async function getHealth(detailed = false) {
  const db = await checkDb();

  let configuredProviders = [];
  try {
    const list = await getProviderList();
    configuredProviders = list.providers.filter((p) => p.configured).map((p) => p.id);
  } catch {
    // Ignore: provider configuration is informational for the health check.
  }

  const schedulers = {
    fetch: getSchedulerStatus(),
    digest: getDigestStatus(),
    retention: getRetentionStatus(),
  };

  try {
    schedulers.telegram = await getTelegramQueueWorkerStatus();
  } catch {
    schedulers.telegram = { running: false };
  }

  const base = {
    ok: db.ok,
    uptime: process.uptime(),
    version: packageVersion,
    timestamp: Date.now(),
    db,
    schedulers,
    providers: { configured: configuredProviders },
  };

  if (!detailed) {
    return base;
  }

  // Detailed metrics (admin only)
  return {
    ...base,
    system: {
      memory: getMemoryInfo(),
      disk: getDiskInfo(),
      load: getLoadInfo(),
    },
  };
}
