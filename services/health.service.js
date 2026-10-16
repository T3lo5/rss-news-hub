// Aggregated health/status snapshot for the /api/health endpoint and the
// container healthcheck. Kept separate from server.js so it is easy to test.

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

export async function getHealth() {
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

  return {
    ok: db.ok,
    uptime: process.uptime(),
    version: packageVersion,
    timestamp: Date.now(),
    db,
    schedulers,
    providers: { configured: configuredProviders },
  };
}
