import { setDefaultResultOrder } from 'node:dns';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import {
  authenticateRequest,
  requireAdmin,
  requireUser,
  requireViewer,
} from './middleware/auth.js';
import { handleAuthRoutes } from './routes/auth.routes.js';
import { handleMetricsRoutes } from './routes/metrics.routes.js';
import { handlePushRoutes } from './routes/push.routes.js';
import { email, newsletterConfig, PORT, telegram } from './server.config.js';
import {
  buildNewsUserContent,
  buildSystemPrompt,
  chat,
  chatStream,
  stripEditorialMeta,
} from './services/ai.service.js';
import {
  ensureDefaultFeeds,
  generateFeedId,
  readFeedsConfig,
  readVisibleFeedsConfig,
  validateFeedUrl,
  writeFeedsConfig,
} from './services/config.service.js';
import {
  generateAndQueueMissedDigest,
  generateAndSendDigest,
  generateDigestPreview,
  getDigestConfig,
  getDigestStatus,
  getMissedDigestStatus,
  refreshMissedDigestJob,
  startAllMissedDigestJobs,
  updateDigestConfig,
} from './services/digest.service.js';
import { sendEmail, verifyEmailConfig } from './services/email.service.js';
import { createError, ErrorCode } from './services/errors.js';
import {
  exportJSON,
  exportMarkdown,
  exportOPML,
  generateFilename,
  getMimeType,
  getNewsByIds,
} from './services/export.service.js';
import { fetchFeedByUrl, parseRSS } from './services/fetch.service.js';
import { getHealth } from './services/health.service.js';
import { fetchAndScoreFeeds } from './services/ingest.service.js';
import { createRequestLogger } from './services/logger.js';
import { renderEmailHtml } from './services/markdown.js';
import { recordRequest } from './services/metrics.service.js';
import { addNews, readNews, readNewsPage, setNewsRead } from './services/news.service.js';
import { generateOpenApiSpec } from './services/openapi.js';
import { rateLimitMiddleware } from './services/rate-limiter.js';
import {
  getRetentionStatus,
  runRetentionCleanup,
  startRetentionJob,
} from './services/retention.service.js';
import {
  getStatus as getSchedulerStatus,
  setIntervalMs as setSchedulerInterval,
  startNewsletterJob,
  start as startScheduler,
  stopNewsletterJob,
  stop as stopScheduler,
  trigger as triggerScheduler,
} from './services/scheduler.service.js';
import {
  getProviderList,
  getPublicSettings,
  initSettings,
  persistDigestSettings,
  persistNewsletterSettings,
  updateAiSettings,
  updateEmailSettings,
  updateRetentionSettings,
  updateTelegramSettings,
} from './services/settings.service.js';
import { getFeedHealth, getStatsAsync } from './services/stats.service.js';
import { telegramSend } from './services/telegram.service.js';
import {
  getTelegramQueueWorkerStatus,
  startTelegramQueueWorker,
  stopTelegramQueueWorker,
} from './services/telegram-worker.js';
import { getTemplateSystemPrompt } from './services/templates.js';
import {
  deleteUserSetting,
  getUserSettingsOverview,
  resolveTelegramConfig,
  saveUserSetting,
} from './services/user-config.service.js';
import { schemas, validateBody } from './services/validation.js';
import { createConfigWatcher } from './src/plugins/config-watcher.js';

setDefaultResultOrder('ipv4first');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Raiz do build do frontend (Vite escreve em public/). O override por env
// existe para os testes apontarem para um diretório temporário.
const PUBLIC_DIR = resolve(process.env.RSS_PUBLIC_DIR || './public');

// Rate limiters
const aiGenerateLimiter = rateLimitMiddleware({
  maxRequests: 10,
  windowMs: 60000,
  keyPrefix: 'ai:generate:',
});
const telegramSendLimiter = rateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60000,
  keyPrefix: 'tg:send:',
});
const emailSendLimiter = rateLimitMiddleware({
  maxRequests: 5,
  windowMs: 60000,
  keyPrefix: 'email:send:',
});
const fetchLimiter = rateLimitMiddleware({ maxRequests: 2, windowMs: 60000, keyPrefix: 'fetch:' });

// Rotas com trecho variável e classificações de erro: compiladas uma vez no
// módulo em vez de recriar a regex a cada requisição (usar .test/.match com
// regex sem flag `g` não guarda estado entre chamadas).
const FEED_ITEM_PATH = /^\/api\/feeds\/[^/]+$/;
const FEED_TEST_PATH = /^\/api\/feeds\/[^/]+\/test$/;
const ME_SETTINGS_PATH = /^\/api\/me\/settings\/([\w-]+)$/;
const TELEGRAM_QUEUE_ITEM_PATH = /^\/api\/telegram\/queue\/[^/]+$/;
const TEMPLATE_ITEM_PATH = /^\/api\/templates\/[^/]+$/;
const TEMPLATE_TEST_PATH = /^\/api\/templates\/[^/]+\/test$/;
const UPSTREAM_NETWORK_ERROR = /network|timeout/i;
const UPSTREAM_SMTP_ERROR = /network|timeout|ECONN|EAUTH|getaddrinfo/i;

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function sendFile(res, path, headers = {}) {
  try {
    const ext = path.split('.').pop() || '';
    const content = await readFile(path);
    res.writeHead(200, {
      'Content-Type': MIME[`.` + ext] || 'application/octet-stream',
      ...headers,
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

// Serve um arquivo de public/ se ele existir. Devolve false para o chamador
// cair no SPA fallback (rotas do React Router, por exemplo).
async function tryServePublicFile(res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;

  // `.` + pathname mantém o caminho relativo; o startsWith impede que
  // `..`/`%2e%2e` escapem da raiz pública e leiam .env ou o banco.
  const filePath = resolve(PUBLIC_DIR, `.${decoded}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) return false;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
  } catch {
    return false;
  }

  const headers = {};
  if (decoded === '/sw.js' || decoded === '/manifest.webmanifest' || decoded === '/index.html') {
    // O service worker e o manifest precisam ser revalidados a cada deploy.
    headers['Cache-Control'] = 'no-cache';
  } else if (decoded.startsWith('/assets/')) {
    // Nomes com hash: cache de 1 ano é seguro.
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  await sendFile(res, filePath, headers);
  return true;
}

async function handleHealthCheck(req, res, log) {
  const _startTime = Date.now();

  // Check data/news.json readable
  let dbStatus = 'ok';
  try {
    await readNews();
  } catch {
    dbStatus = 'error';
  }

  // Check Telegram configured
  const telegramStatus = telegram?.botToken && telegram?.chatId ? 'ok' : 'not_configured';

  // Check AI provider configured
  const { ai } = await import('./server.config.js');
  const aiProviders = Object.values(ai).filter((p) => p.apiKey).length;
  const aiStatus = aiProviders > 0 ? 'ok' : 'not_configured';

  // Check scheduler
  const { getStatus: getSchedulerStatus } = await import('./services/scheduler.service.js');
  const schedulerStatus = getSchedulerStatus();
  const schedulerState = schedulerStatus.running ? 'running' : 'stopped';

  const checks = {
    database: dbStatus,
    telegram: telegramStatus,
    ai: aiStatus,
    scheduler: schedulerState,
  };

  const overallStatus = Object.values(checks).every(
    (c) => c === 'ok' || c === 'running' || c === 'stopped'
  )
    ? 'ok'
    : 'degraded';
  const httpStatus = overallStatus === 'ok' ? 200 : 503;

  const health = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    checks,
  };

  log.debug({ checks }, 'Health check completed');
  sendJSON(res, httpStatus, health);
}

export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Track request metrics for Prometheus /metrics endpoint
  const startTime = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = (chunk, encoding, cb) => {
    const duration = Date.now() - startTime;
    try {
      recordRequest(req.method, path, res.statusCode || 200, duration);
    } catch {
      // Ignore metric errors
    }
    return originalEnd(chunk, encoding, cb);
  };

  // Request ID for correlation
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.reqId = reqId;
  res.setHeader('x-request-id', reqId);
  const log = createRequestLogger(reqId);

  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint (no auth, no rate limit)
  if (path === '/health' && req.method === 'GET') {
    return handleHealthCheck(req, res, log);
  }

  // OpenAPI spec endpoint (no auth)
  if (path === '/openapi.json' && req.method === 'GET') {
    const spec = generateOpenApiSpec();
    return sendJSON(res, 200, spec);
  }

  // Swagger UI (no auth)
  if (path === '/docs' && req.method === 'GET') {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>RSS News Hub API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
      });
    };
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Parse JSON body for POST/PUT requests. This must happen before the auth
  // routes are dispatched, otherwise their validators see req.body as
  // undefined and every payload is rejected.
  // Multipart (OPML import) is left untouched: whoever handles it reads the
  // stream itself. Sem essa excecao o corpo e consumido aqui e o import
  // responde sempre "No file uploaded".
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      req.body = {};
    } else {
      await new Promise((resolve) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            req.body = body ? JSON.parse(body) : {};
          } catch {
            req.body = {};
          }
          resolve();
        });
      });
    }
  } else {
    req.body = {};
  }

  // Auth routes. Credentials (Bearer token / API key) are resolved first so
  // handlers like GET /api/auth/me and the API-key routes see req.user;
  // anonymous requests simply leave req.user unset for the handler to check.
  // /api/users (admin user management) also lives in the auth router.
  if (path.startsWith('/api/auth/') || path === '/api/users' || path.startsWith('/api/users/')) {
    try {
      await authenticateRequest(req, res);
      const handled = await handleAuthRoutes(req, res, path);
      if (handled) return;
    } catch (err) {
      log.error({ err }, 'Auth route failed');
      return sendJSON(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  // Push notification routes
  if (path.startsWith('/api/push/')) {
    try {
      await authenticateRequest(req, res);
      const handled = await handlePushRoutes(req, res, path);
      if (handled) return;
    } catch (err) {
      log.error({ err }, 'Push route failed');
      return sendJSON(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  // Prometheus metrics endpoint (admin only)
  if (path === '/api/metrics' && req.method === 'GET') {
    try {
      await authenticateRequest(req, res);
      const handled = await handleMetricsRoutes(req, res, path);
      if (handled) return;
    } catch (err) {
      log.error({ err }, 'Metrics route failed');
      return sendJSON(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  try {
    // GET /api/health - liveness/readiness probe (public, no secrets)
    if (path === '/api/health' && req.method === 'GET') {
      const health = await getHealth(false);
      return sendJSON(res, health.ok ? 200 : 503, health);
    }

    // GET /api/health/detail - detailed system metrics (admin only)
    if (path === '/api/health/detail' && req.method === 'GET') {
      requireAdmin()(req, res, async () => {
        const health = await getHealth(true);
        return sendJSON(res, health.ok ? 200 : 503, health);
      });
      return;
    }

    // GET / - serve index.html
    if (path === '/' && req.method === 'GET') {
      return sendFile(res, './public/index.html');
    }

    // GET /api/news - paginated list (readAt reflects the caller's own state).
    // Query: limit (1..100, default 48), offset, q, source,
    // sort=newest|oldest|relevance, read=all|unread|read.
    if (path === '/api/news' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const intParam = (name, fallback, min, max) => {
            const value = Number.parseInt(url.searchParams.get(name) ?? '', 10);
            if (!Number.isFinite(value)) return fallback;
            return Math.min(Math.max(value, min), max);
          };

          const limit = intParam('limit', 48, 1, 100);
          const offset = intParam('offset', 0, 0, Number.MAX_SAFE_INTEGER);
          const q = (url.searchParams.get('q') || '').trim().slice(0, 200);
          const source = (url.searchParams.get('source') || '').trim();
          const sortParam = url.searchParams.get('sort');
          const sort = ['newest', 'oldest', 'relevance'].includes(sortParam) ? sortParam : 'newest';
          const readParam = url.searchParams.get('read');
          const read = ['all', 'unread', 'read'].includes(readParam) ? readParam : 'all';

          const page = await readNewsPage({
            userId: req.user?.id,
            limit,
            offset,
            query: q || undefined,
            source: source || undefined,
            sort,
            read,
          });

          // Short private cache: a refresh right after a fetch still hits the
          // DB, but repeated loads/re-renders do not.
          res.setHeader('Cache-Control', 'private, max-age=15');
          return sendJSON(res, 200, { ok: true, data: { ...page, limit, offset } });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // PATCH /api/news/:id/read - mark/unmark as read (idempotent)
    // News ids can be URLs, so the id is sliced out instead of matched with a
    // path segment regex; clients URL-encode it.
    if (path.startsWith('/api/news/') && path.endsWith('/read') && req.method === 'PATCH') {
      requireViewer()(req, res, () => {
        validateBody(schemas.markNewsReadSchema)(req, res, async () => {
          // A malformed escape (e.g. /api/news/%E0%A4%A/read) makes
          // decodeURIComponent throw; without this guard the request hangs
          // and the rejection goes unhandled.
          let newsId;
          try {
            newsId = decodeURIComponent(path.slice('/api/news/'.length, -'/read'.length));
          } catch {
            return sendJSON(res, 400, { ok: false, error: 'Invalid news id' });
          }
          try {
            const result = await setNewsRead(req.user.id, newsId, req.body.read);
            if (!result) {
              return sendJSON(res, 404, { ok: false, error: 'News item not found' });
            }
            return sendJSON(res, 200, { ok: true, data: result });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // GET /api/news/search - full-text search news
    if (path === '/api/news/search' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const query = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const minScoreParam = url.searchParams.get('minScore');
        const minScore = minScoreParam ? parseInt(minScoreParam, 10) : undefined;
        const feedId = url.searchParams.get('feedId') || undefined;
        const category = url.searchParams.get('category') || undefined;
        const dateFromParam = url.searchParams.get('dateFrom');
        const dateFrom = dateFromParam ? new Date(dateFromParam) : undefined;
        const dateToParam = url.searchParams.get('dateTo');
        const dateTo = dateToParam ? new Date(dateToParam) : undefined;

        if (!query) {
          return sendJSON(res, 400, { ok: false, error: 'Query parameter "q" is required' });
        }

        const { searchNews, searchNewsCount } = await import(
          './src/db/repositories/search.repository.js'
        );

        const [results, total] = await Promise.all([
          searchNews({
            query,
            limit,
            offset,
            minRelevanceScore: minScore,
            feedId,
            category,
            dateFrom,
            dateTo,
          }),
          searchNewsCount({
            query,
            minRelevanceScore: minScore,
            feedId,
            category,
            dateFrom,
            dateTo,
          }),
        ]);

        return sendJSON(res, 200, { ok: true, data: { results, total, limit, offset } });
      });
      return;
    }

    // GET /api/news/search/suggestions - get search suggestions
    if (path === '/api/news/search/suggestions' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const partial = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);

        if (!partial || partial.length < 2) {
          return sendJSON(res, 200, { ok: true, data: [] });
        }

        const { getSearchSuggestions } = await import('./src/db/repositories/search.repository.js');
        const suggestions = await getSearchSuggestions(partial, limit);

        return sendJSON(res, 200, { ok: true, data: suggestions });
      });
      return;
    }

    // POST /api/news/search/rebuild - rebuild search index
    if (path === '/api/news/search/rebuild' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        const { rebuildSearchIndex } = await import('./src/db/repositories/search.repository.js');
        await rebuildSearchIndex();
        return sendJSON(res, 200, { ok: true, data: { rebuilt: true } });
      });
      return;
    }

    // POST /api/news - add a single news item (manual)
    if (path === '/api/news' && req.method === 'POST') {
      requireUser()(req, res, () => {
        validateBody(schemas.addNewsSchema)(req, res, async () => {
          const item = req.body;
          const saved = await addNews({
            ...item,
            id: item.id || item.link,
            source: item.source || 'Manual',
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            description: item.description || '',
            content: item.content || '',
          });
          return sendJSON(res, 200, { ok: true, data: saved });
        });
      });
      return;
    }

    // GET /api/news/export - export selected news as Markdown/JSON/OPML
    if (path === '/api/news/export' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const idsParam = url.searchParams.get('ids') || '';
          const format = url.searchParams.get('format') || 'md';

          if (!idsParam) {
            return sendJSON(res, 400, { ok: false, error: 'Parameter "ids" is required' });
          }

          const ids = idsParam
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);
          if (!ids.length) {
            return sendJSON(res, 400, { ok: false, error: 'At least one news ID is required' });
          }

          const validFormats = ['md', 'json', 'opml'];
          if (!validFormats.includes(format)) {
            return sendJSON(res, 400, {
              ok: false,
              error: 'Invalid format. Use: md, json, or opml',
            });
          }

          const items = await getNewsByIds(ids);
          if (!items.length) {
            return sendJSON(res, 404, {
              ok: false,
              error: 'No news items found for the given IDs',
            });
          }

          let content;
          switch (format) {
            case 'json':
              content = exportJSON(items);
              break;
            case 'opml':
              content = exportOPML(items);
              break;
            case 'md':
            default:
              content = exportMarkdown(items);
              break;
          }

          const filename = generateFilename(format);
          const mimeType = getMimeType(format);

          res.writeHead(200, {
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'no-store',
          });
          res.end(content);
        } catch (err) {
          console.error('Export error:', err);
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/fetch - trigger RSS fetch
    if (path === '/api/fetch' && req.method === 'POST') {
      // A fetch cycle also scores the new items, i.e. it spends the configured
      // AI credits: it must never be reachable anonymously.
      requireViewer()(req, res, () =>
        fetchLimiter(req, res, async () => {
          try {
            // Fetch + score in the same cycle, otherwise items that arrive here
            // stay unscored until the scheduler or a digest touches them.
            const result = await fetchAndScoreFeeds();
            return sendJSON(res, 200, { ok: true, data: result });
          } catch (err) {
            console.error('Fetch error:', err);
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        })
      );
      return;
    }

    // GET /api/scheduler/status - get scheduler status
    if (path === '/api/scheduler/status' && req.method === 'GET') {
      return requireViewer()(req, res, () =>
        sendJSON(res, 200, { ok: true, data: getSchedulerStatus() })
      );
    }

    // POST /api/scheduler/trigger - manual trigger
    if (path === '/api/scheduler/trigger' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const result = await triggerScheduler(fetchAndScoreFeeds);
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/scheduler/config - update scheduler interval
    if (path === '/api/scheduler/config' && req.method === 'POST') {
      // The interval is process-wide: a caller must be authenticated as admin
      // before it can make the app refetch on any cadence it likes.
      requireAdmin()(req, res, () => {
        const { intervalMs } = req.body || {};
        if (typeof intervalMs !== 'number' || intervalMs < 1000) {
          return sendJSON(res, 400, { ok: false, error: 'intervalMs must be number >= 1000' });
        }
        setSchedulerInterval(intervalMs);
        return sendJSON(res, 200, { ok: true, data: { intervalMs } });
      });
      return;
    }

    // GET /api/stats - get aggregated stats
    if (path === '/api/stats' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const { getStatus: getSchedulerStatus } = await import('./services/scheduler.service.js');
          const stats = await getStatsAsync();
          const schedulerStatus = getSchedulerStatus();
          stats.scheduler = schedulerStatus;
          return sendJSON(res, 200, { ok: true, data: stats });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/feeds - list all feeds with stats
    if (path === '/api/feeds' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const feeds = await readVisibleFeedsConfig(req.user);
          const stats = await getStatsAsync();
          const feedsWithStats = feeds.map((feed) => {
            const feedStat = stats.feeds?.find((f) => f.feedId === feed.id) || {};
            return {
              ...feed,
              lastFetch: feedStat.lastFetch?.getTime() || null,
              lastError: feedStat.lastError || null,
              itemCount: feedStat.itemsFetched || 0,
              etagHits: feedStat.etagHits || 0,
              status: feedStat.lastError ? 'error' : feedStat.lastFetch ? 'ok' : 'unknown',
            };
          });
          return sendJSON(res, 200, { ok: true, data: feedsWithStats });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/feeds/health - feed health dashboard
    if (path === '/api/feeds/health' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const feeds = await readVisibleFeedsConfig(req.user);
          const health = getFeedHealth();
          // Merge with feed config for URL and enabled status
          const healthWithConfig = health.map((h) => {
            const feedConfig = feeds.find((f) => f.id === h.feedId);
            return {
              ...h,
              url: feedConfig?.url || '',
              enabled: feedConfig?.enabled ?? true,
            };
          });
          return sendJSON(res, 200, { ok: true, data: healthWithConfig });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/feeds - add new feed
    if (path === '/api/feeds' && req.method === 'POST') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.addFeedSchema)(req, res, async () => {
          const { name, url, enabled, category } = req.body;

          if (!validateFeedUrl(url)) {
            return sendJSON(res, 400, { ok: false, error: 'invalid URL' });
          }

          try {
            const feeds = await readFeedsConfig();
            const existingIds = feeds.map((f) => f.id);
            const id = generateFeedId(name, existingIds);

            const newFeed = {
              id,
              name,
              url,
              enabled: enabled !== false,
              category: category || 'General',
            };

            feeds.push(newFeed);
            writeFeedsConfig(feeds);

            return sendJSON(res, 200, { ok: true, data: newFeed });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // PUT /api/feeds/:id - update feed
    if (path.match(FEED_ITEM_PATH) && req.method === 'PUT') {
      const id = path.split('/')[3];
      requireAdmin()(req, res, () => {
        validateBody(schemas.updateFeedSchema)(req, res, async () => {
          const updates = req.body;

          try {
            const feeds = await readFeedsConfig();
            const index = feeds.findIndex((f) => f.id === id);
            if (index === -1) {
              const err = createError(ErrorCode.FEED_NOT_FOUND, 'Feed not found');
              return sendJSON(res, err.statusCode, {
                ok: false,
                error: err.message,
                code: err.code,
              });
            }

            if (updates.url && !validateFeedUrl(updates.url)) {
              return sendJSON(res, 400, { ok: false, error: 'invalid URL' });
            }

            feeds[index] = { ...feeds[index], ...updates, id };
            writeFeedsConfig(feeds);

            return sendJSON(res, 200, { ok: true, data: feeds[index] });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // DELETE /api/feeds/:id - delete feed
    if (path.match(FEED_ITEM_PATH) && req.method === 'DELETE') {
      const id = path.split('/')[3];
      requireAdmin()(req, res, async () => {
        try {
          const feeds = await readFeedsConfig();
          const index = feeds.findIndex((f) => f.id === id);
          if (index === -1) {
            const err = createError(ErrorCode.FEED_NOT_FOUND, 'Feed not found');
            return sendJSON(res, err.statusCode, { ok: false, error: err.message, code: err.code });
          }

          // Delete associated data first (foreign key constraints)
          const { newsRepository } = await import('./src/db/repositories/index.js');
          const db = (await import('./src/db/index.js')).getDb();
          const { feedCache, feedStats } = await import('./src/db/schema.js');
          const { eq } = await import('drizzle-orm');

          await Promise.all([
            newsRepository.deleteByFeedId(id),
            db.delete(feedCache).where(eq(feedCache.feedId, id)),
            db.delete(feedStats).where(eq(feedStats.feedId, id)),
          ]);

          feeds.splice(index, 1);
          writeFeedsConfig(feeds);

          return sendJSON(res, 200, { ok: true, data: { id } });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/feeds/:id/test - test fetch a single feed
    if (path.match(FEED_TEST_PATH) && req.method === 'POST') {
      const id = path.split('/')[3];
      requireUser()(req, res, async () => {
        try {
          const feeds = await readVisibleFeedsConfig(req.user);
          const feed = feeds.find((f) => f.id === id);
          if (!feed) {
            const err = createError(ErrorCode.FEED_NOT_FOUND, 'Feed not found');
            return sendJSON(res, err.statusCode, { ok: false, error: err.message, code: err.code });
          }

          const xml = await fetchFeedByUrl(feed.url, { bypassCache: true });
          const items = parseRSS(xml, feed.name)
            .slice(0, 5)
            .map((item) => ({
              title: item.title,
              link: item.link,
              pubDate: item.pubDate,
            }));

          return sendJSON(res, 200, {
            ok: true,
            data: {
              success: true,
              itemCount: items.length,
              preview: items,
            },
          });
        } catch (err) {
          return sendJSON(res, 200, {
            ok: true,
            data: {
              success: false,
              error: err.message,
              itemCount: 0,
              preview: [],
            },
          });
        }
      });
      return;
    }

    // POST /api/feeds/reload - reload config from disk
    if (path === '/api/feeds/reload' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const feeds = await readFeedsConfig();
          return sendJSON(res, 200, { ok: true, data: feeds });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/feeds/opml - export feeds as OPML
    if (path === '/api/feeds/opml' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const { generateOPML } = await import('./services/opml.service.js');
          const opml = generateOPML(await readVisibleFeedsConfig(req.user));
          res.writeHead(200, {
            'Content-Type': 'application/xml; charset=utf-8',
            'Content-Disposition': 'attachment; filename="rss-news-hub-feeds.opml"',
          });
          res.end(opml);
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/feeds/opml - import feeds from OPML
    if (path === '/api/feeds/opml' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const { importOPML } = await import('./services/opml.service.js');

          const contentType = req.headers['content-type'] || '';
          if (!contentType.includes('multipart/form-data')) {
            return sendJSON(res, 400, {
              ok: false,
              error: 'Content-Type must be multipart/form-data',
            });
          }

          const boundary = contentType.split('boundary=')[1];
          if (!boundary) {
            return sendJSON(res, 400, { ok: false, error: 'Missing boundary' });
          }

          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const body = Buffer.concat(chunks);

          const _boundaryBytes = Buffer.from('\r\n--' + boundary);
          const parts = body.toString('binary').split('--' + boundary + '\r\n');

          let fileBuffer = null;
          for (const part of parts) {
            if (part.includes('filename=') && part.includes('Content-Type:')) {
              const headerEnd = part.indexOf('\r\n\r\n');
              if (headerEnd !== -1) {
                const content = part.slice(headerEnd + 4);
                const endBoundary = content.lastIndexOf('\r\n--');
                if (endBoundary !== -1) {
                  fileBuffer = Buffer.from(content.slice(0, endBoundary), 'binary');
                }
              }
            }
          }

          if (!fileBuffer) {
            return sendJSON(res, 400, { ok: false, error: 'No file uploaded' });
          }

          const results = await importOPML(fileBuffer);
          return sendJSON(res, 200, { ok: true, data: results });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/newsletter/config - get newsletter config
    if (path === '/api/newsletter/config' && req.method === 'GET') {
      requireAdmin()(req, res, () => {
        return sendJSON(res, 200, { ok: true, data: newsletterConfig });
      });
      return;
    }

    // PUT /api/newsletter/config - update newsletter config
    if (path === '/api/newsletter/config' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.updateNewsletterConfigSchema)(req, res, async () => {
          const updates = req.body;

          try {
            Object.assign(newsletterConfig, updates);
            await persistNewsletterSettings();
            startNewsletterJob(newsletterConfig, { telegram, email });
            return sendJSON(res, 200, { ok: true, data: newsletterConfig });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // POST /api/newsletter/trigger - manual newsletter generation
    // Admin-only: this spends AI credits and posts to the owner's Telegram bot,
    // so it must not be reachable by an anonymous visitor.
    if (path === '/api/newsletter/trigger' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const { generateAndSendNewsletter } = await import('./services/newsletter.service.js');
          const result = await generateAndSendNewsletter(newsletterConfig, { telegram, email });
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/newsletter/history - get newsletter history
    if (path === '/api/newsletter/history' && req.method === 'GET') {
      requireAdmin()(req, res, async () => {
        try {
          const { readHistory } = await import('./services/newsletter.service.js');
          const history = await readHistory();
          return sendJSON(res, 200, { ok: true, data: history.slice(0, 10) });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/digest/config - get digest config
    if (path === '/api/digest/config' && req.method === 'GET') {
      requireAdmin()(req, res, () => {
        return sendJSON(res, 200, { ok: true, data: getDigestConfig() });
      });
      return;
    }

    // GET /api/digest/status - computed schedule status (next run)
    if (path === '/api/digest/status' && req.method === 'GET') {
      requireAdmin()(req, res, () => {
        return sendJSON(res, 200, { ok: true, data: getDigestStatus() });
      });
      return;
    }

    // PUT /api/digest/config - update digest config
    if (path === '/api/digest/config' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.updateDigestConfigSchema)(req, res, async () => {
          const updates = req.body;
          try {
            const config = updateDigestConfig(updates);
            await persistDigestSettings();
            return sendJSON(res, 200, { ok: true, data: config });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // POST /api/digest/trigger - manual digest generation (works even when the
    // scheduled digest is disabled)
    if (path === '/api/digest/trigger' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const result = await generateAndSendDigest({ telegram }, { force: true });
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/digest/preview - preview digest content
    if (path === '/api/digest/preview' && req.method === 'GET') {
      requireAdmin()(req, res, async () => {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const config = {};
          const lookbackDays = url.searchParams.get('lookbackDays');
          if (lookbackDays) config.lookbackDays = parseInt(lookbackDays, 10);
          const minRelevanceScore = url.searchParams.get('minRelevanceScore');
          if (minRelevanceScore) config.minRelevanceScore = parseInt(minRelevanceScore, 10);
          const maxItems = url.searchParams.get('maxItems');
          if (maxItems) config.maxItems = parseInt(maxItems, 10);
          const format = url.searchParams.get('format');
          if (format) config.format = format;
          const language = url.searchParams.get('language');
          if (language) config.language = language;
          const provider = url.searchParams.get('provider');
          if (provider) config.provider = provider;

          const preview = await generateDigestPreview(config);
          return sendJSON(res, 200, { ok: true, data: preview });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/digest/start - start digest job
    if (path === '/api/digest/start' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const config = updateDigestConfig({ enabled: true });
          await persistDigestSettings();
          return sendJSON(res, 200, { ok: true, data: config });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/digest/stop - stop digest job
    if (path === '/api/digest/stop' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const config = updateDigestConfig({ enabled: false });
          await persistDigestSettings();
          return sendJSON(res, 200, { ok: true, data: config });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/digest/missed/status - get missed digest jobs status (admin)
    if (path === '/api/digest/missed/status' && req.method === 'GET') {
      requireAdmin()(req, res, () => {
        return sendJSON(res, 200, { ok: true, data: getMissedDigestStatus() });
      });
      return;
    }

    // POST /api/digest/missed/trigger - manual trigger missed digest for a user (admin)
    if (path === '/api/digest/missed/trigger' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        const { userId } = req.body || {};
        if (!userId) {
          return sendJSON(res, 400, { ok: false, error: 'userId required' });
        }
        try {
          const result = await generateAndQueueMissedDigest(userId);
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/me/digest/missed/trigger - manual trigger missed digest for current user
    if (path === '/api/me/digest/missed/trigger' && req.method === 'POST') {
      requireUser()(req, res, async () => {
        try {
          const result = await generateAndQueueMissedDigest(req.user.id);
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // ── Per-user self-service settings ───────────────────────────────────
    // Qualquer usuário autenticado pode configurar seus próprios provedores,
    // Telegram, email e newsletters sem precisar de admin. As credenciais do
    // env são usadas apenas como fallback quando o usuário não definiu nada.

    // GET /api/me/settings - visão geral das configs do usuário
    if (path === '/api/me/settings' && req.method === 'GET') {
      requireUser()(req, res, async () => {
        try {
          const overview = await getUserSettingsOverview(req.user.id);
          return sendJSON(res, 200, { ok: true, data: overview });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // PUT /api/me/settings/:area - salva override do usuário
    const meSettingsMatch = path.match(ME_SETTINGS_PATH);
    if (meSettingsMatch && req.method === 'PUT') {
      requireUser()(req, res, async () => {
        const area = meSettingsMatch[1];
        const allowedAreas = ['ai', 'telegram', 'email', 'newsletter', 'digest', 'ui', 'searches'];
        if (!allowedAreas.includes(area)) {
          return sendJSON(res, 400, { ok: false, error: `Invalid area: ${area}` });
        }
        try {
          const result = await saveUserSetting(req.user.id, area, req.body || {});
          // Refresh missed digest job when digest settings change
          if (area === 'digest') {
            await refreshMissedDigestJob(req.user.id);
          }
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // DELETE /api/me/settings/:area - remove override (volta ao fallback)
    if (meSettingsMatch && req.method === 'DELETE') {
      requireUser()(req, res, async () => {
        const area = meSettingsMatch[1];
        const allowedAreas = ['ai', 'telegram', 'email', 'newsletter', 'digest', 'ui', 'searches'];
        if (!allowedAreas.includes(area)) {
          return sendJSON(res, 400, { ok: false, error: `Invalid area: ${area}` });
        }
        try {
          const result = await deleteUserSetting(req.user.id, area);
          // Refresh missed digest job when digest settings change
          if (area === 'digest') {
            await refreshMissedDigestJob(req.user.id);
          }
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/settings - admin settings (secrets masked)
    if (path === '/api/settings' && req.method === 'GET') {
      requireAdmin()(req, res, async () => {
        try {
          const settings = await getPublicSettings();
          return sendJSON(res, 200, { ok: true, data: settings });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // PUT /api/settings/ai - update AI provider settings (admin)
    if (path === '/api/settings/ai' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.aiSettingsSchema)(req, res, async () => {
          try {
            const aiSettings = await updateAiSettings(req.body);
            return sendJSON(res, 200, { ok: true, data: aiSettings });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // PUT /api/settings/telegram - update Telegram settings (admin)
    if (path === '/api/settings/telegram' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.telegramSettingsSchema)(req, res, async () => {
          try {
            const telegramSettings = await updateTelegramSettings(req.body);
            return sendJSON(res, 200, { ok: true, data: telegramSettings });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // PUT /api/settings/email - update email/SMTP settings (admin)
    if (path === '/api/settings/email' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.emailSettingsSchema)(req, res, async () => {
          try {
            const emailSettings = await updateEmailSettings(req.body);
            return sendJSON(res, 200, { ok: true, data: emailSettings });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // GET /api/settings/retention - news retention config (admin)
    if (path === '/api/settings/retention' && req.method === 'GET') {
      requireAdmin()(req, res, async () => {
        return sendJSON(res, 200, { ok: true, data: getRetentionStatus() });
      });
      return;
    }

    // PUT /api/settings/retention - update the retention window (admin)
    if (path === '/api/settings/retention' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.retentionSettingsSchema)(req, res, async () => {
          try {
            const config = await updateRetentionSettings(req.body);
            startRetentionJob();
            return sendJSON(res, 200, { ok: true, data: { ...config, ...getRetentionStatus() } });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // POST /api/news/prune - run the retention cleanup now (admin)
    if (path === '/api/news/prune' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const days = req.body?.retentionDays;
          const result = await runRetentionCleanup(typeof days === 'number' ? days : undefined);
          return sendJSON(res, 200, { ok: true, data: result });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/ai/providers - available AI providers (configured flags)
    if (path === '/api/ai/providers' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const providers = await getProviderList();
          return sendJSON(res, 200, { ok: true, data: providers });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/ai/test - quick provider connectivity check (admin)
    if (path === '/api/ai/test' && req.method === 'POST') {
      requireAdmin()(req, res, () => {
        aiGenerateLimiter(req, res, () => {
          validateBody(schemas.aiTestSchema)(req, res, async () => {
            const provider = req.body.provider || 'auto';
            try {
              const reply = await chat(
                'You are a connectivity check. Answer with a single word.',
                'Reply with the single word OK.',
                provider
              );
              return sendJSON(res, 200, {
                ok: true,
                data: {
                  provider,
                  reply: String(reply || '')
                    .trim()
                    .slice(0, 200),
                },
              });
            } catch (err) {
              log.error({ err }, 'AI test failed');
              return sendJSON(res, 502, { ok: false, error: err.message });
            }
          });
        });
      });
      return;
    }

    // GET /api/bookmarks - list all bookmarks
    if (path === '/api/bookmarks' && req.method === 'GET') {
      requireUser()(req, res, async () => {
        try {
          const { readBookmarks } = await import('./services/bookmark.service.js');
          const bookmarks = await readBookmarks(req.user.id);
          return sendJSON(res, 200, { ok: true, data: bookmarks });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/bookmarks - add bookmark
    if (path === '/api/bookmarks' && req.method === 'POST') {
      requireUser()(req, res, async () => {
        try {
          const { readNews } = await import('./services/news.service.js');
          const { addBookmark } = await import('./services/bookmark.service.js');
          const { newsId } = req.body || {};
          if (!newsId) {
            return sendJSON(res, 400, { ok: false, error: 'newsId required' });
          }
          const news = await readNews();
          const item = news.find((n) => n.id === newsId);
          if (!item) {
            const err = createError(ErrorCode.NEWS_NOT_FOUND, 'News item not found');
            return sendJSON(res, err.statusCode, { ok: false, error: err.message, code: err.code });
          }
          const bookmark = await addBookmark(req.user.id, item);
          return sendJSON(res, 200, { ok: true, data: bookmark });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // DELETE /api/bookmarks/:newsId - remove bookmark
    if (path.startsWith('/api/bookmarks/') && req.method === 'DELETE') {
      requireUser()(req, res, async () => {
        try {
          const encodedNewsId = path.split('/api/bookmarks/')[1];
          const newsId = decodeURIComponent(encodedNewsId);
          const { removeBookmark } = await import('./services/bookmark.service.js');
          const removed = await removeBookmark(req.user.id, newsId);
          return sendJSON(res, 200, { ok: true, data: { removed } });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/ai/profile - get interest profile
    if (path === '/api/ai/profile' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const { readProfile } = await import('./services/relevance.service.js');
          const profile = await readProfile();
          return sendJSON(res, 200, { ok: true, data: profile });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // PUT /api/ai/profile - update interest profile
    if (path === '/api/ai/profile' && req.method === 'PUT') {
      // The interest profile is shared scoring config, so writing it is a
      // user-level action (viewer is read-only), never an anonymous one.
      requireUser()(req, res, () =>
        validateBody(schemas.updateProfileSchema)(req, res, async () => {
          try {
            const { writeProfile } = await import('./services/relevance.service.js');
            const updates = req.body;
            const { readProfile } = await import('./services/relevance.service.js');
            const current = await readProfile();
            const profile = { ...current, ...updates };
            await writeProfile(profile);
            return sendJSON(res, 200, { ok: true, data: profile });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        })
      );
      return;
    }

    // POST /api/ai/score - score news items for relevance
    if (path === '/api/ai/score' && req.method === 'POST') {
      // Scoring calls the AI provider, so it is gated exactly like
      // /api/ai/generate: authenticated user, then the AI rate limiter.
      requireUser()(req, res, () =>
        aiGenerateLimiter(req, res, () =>
          validateBody(schemas.scoreItemsSchema)(req, res, async () => {
            try {
              const { scoreItems, readProfile } = await import('./services/relevance.service.js');
              const { items, profile } = req.body;
              const scoringProfile = profile || (await readProfile());
              const scored = await scoreItems(items, scoringProfile);
              return sendJSON(res, 200, { ok: true, data: scored });
            } catch (err) {
              return sendJSON(res, 500, { ok: false, error: err.message });
            }
          })
        )
      );
      return;
    }

    // POST /api/ai/score-new - score unscored news items
    if (path === '/api/ai/score-new' && req.method === 'POST') {
      requireUser()(req, res, () =>
        aiGenerateLimiter(req, res, async () => {
          try {
            const { scoreNewItems, readProfile } = await import('./services/relevance.service.js');
            const profile = await readProfile();
            const result = await scoreNewItems(profile);
            return sendJSON(res, 200, { ok: true, data: result });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        })
      );
      return;
    }

    // POST /api/ai/generate - generate content with AI
    if (path === '/api/ai/generate' && req.method === 'POST') {
      requireUser()(req, res, () => {
        aiGenerateLimiter(req, res, () => {
          validateBody(schemas.generateContentSchema)(req, res, async () => {
            try {
              const { news, type, language, provider, templateId, templateVariables } = req.body;

              const templatePrompt = templateId
                ? await getTemplateSystemPrompt(templateId, {
                    ...news,
                    type,
                    language: language || 'en',
                    ...templateVariables,
                  })
                : buildSystemPrompt(type, language || 'en');

              const systemPrompt = templatePrompt;
              const userContent = buildNewsUserContent(news);

              const result = await chat(systemPrompt, userContent, provider, req.user.id);
              // Never let the editorial analysis sections leak into the post.
              const content = type === 'linkedin' ? stripEditorialMeta(result) : result;
              return sendJSON(res, 200, { ok: true, data: { content, type, language } });
            } catch (err) {
              const msg = err?.message || 'AI generation failed';
              log.error({ err }, 'AI generation failed');
              if (!res.headersSent) {
                // `code` lets the client explain a missing personal key in the
                // user's language instead of echoing this English message.
                return sendJSON(res, 502, {
                  ok: false,
                  error: msg,
                  ...(err?.code ? { code: err.code } : {}),
                });
              }
            }
          });
        });
      });
      return;
    }

    // POST /api/ai/generate/stream - streaming AI generation (SSE)
    if (path === '/api/ai/generate/stream' && req.method === 'POST') {
      requireUser()(req, res, () => {
        aiGenerateLimiter(req, res, () => {
          validateBody(schemas.generateContentSchema)(req, res, async () => {
            const { news, type, language, provider, templateId, templateVariables } = req.body;

            let systemPrompt;
            try {
              systemPrompt = templateId
                ? await getTemplateSystemPrompt(templateId, {
                    ...news,
                    type,
                    language: language || 'en',
                    ...templateVariables,
                  })
                : buildSystemPrompt(type, language || 'en');
            } catch (err) {
              // Antes de abrir o SSE ainda dá para responder JSON normal.
              return sendJSON(res, 400, { ok: false, error: err.message });
            }

            const userContent = buildNewsUserContent(news);

            // SSE headers
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            });

            const abortController = new AbortController();
            req.on('close', () => abortController.abort());

            try {
              await chatStream(
                systemPrompt,
                userContent,
                provider,
                (token) => {
                  res.write(`data: ${JSON.stringify({ token, done: false })}\n\n`);
                },
                { signal: abortController.signal },
                req.user.id
              );

              res.write(`data: ${JSON.stringify({ token: '', done: true })}\n\n`);
              res.end();
            } catch (err) {
              if (err.name !== 'AbortError') {
                res.write(`data: ${JSON.stringify({ error: err.message, done: true })}\n\n`);
              }
              res.end();
            }
          });
        });
      });
      return;
    }

    // POST /api/telegram/send - send message to Telegram
    if (path === '/api/telegram/send' && req.method === 'POST') {
      requireUser()(req, res, () => {
        telegramSendLimiter(req, res, () => {
          validateBody(schemas.telegramSendSchema)(req, res, async () => {
            try {
              const {
                text,
                parseMode,
                messageThreadId,
                replyToMessageId,
                inlineKeyboard,
                linkButton,
                linkUrl,
                scheduleAt,
              } = req.body;

              // Resolve Telegram config per-user (fallback para global/env)
              const tgConfig = await resolveTelegramConfig(req.user.id);

              if (scheduleAt) {
                // Queue for scheduled send
                const { queueTelegramMessage } = await import('./services/telegram.service.js');
                const msg = await queueTelegramMessage({
                  text,
                  parseMode: parseMode || 'Markdown',
                  scheduledAt: scheduleAt,
                  userId: req.user.id,
                  options: {
                    messageThreadId,
                    replyToMessageId,
                    inlineKeyboard,
                    linkButton,
                    linkUrl,
                  },
                });
                return sendJSON(res, 200, {
                  ok: true,
                  data: { queued: true, messageId: msg.id, scheduledAt: msg.scheduledAt },
                });
              }

              const result = await telegramSend(text, parseMode || 'Markdown', tgConfig, {
                messageThreadId,
                replyToMessageId,
                inlineKeyboard,
                linkButton,
                linkUrl,
              });
              return sendJSON(res, 200, { ok: true, data: result });
            } catch (err) {
              const msg = err?.message || 'Telegram send failed';
              log.error({ err }, 'Telegram send failed');
              if (!res.headersSent) {
                // Network/API failures are upstream errors, not client errors.
                const status = UPSTREAM_NETWORK_ERROR.test(msg) ? 502 : 400;
                return sendJSON(res, status, {
                  ok: false,
                  error: msg,
                  // `code` distinguishes "this account has no bot of its own"
                  // from a generic Telegram failure so the UI can localize it.
                  ...(err?.code ? { code: err.code } : {}),
                });
              }
            }
          });
        });
      });
      return;
    }

    // POST /api/email/send - send an arbitrary email (newsletter builder, etc.)
    if (path === '/api/email/send' && req.method === 'POST') {
      requireUser()(req, res, () => {
        emailSendLimiter(req, res, () => {
          validateBody(schemas.emailSendSchema)(req, res, async () => {
            try {
              // Render the markdown body to HTML when the client only sends text.
              const payload = { ...req.body };
              if (!payload.html && payload.text) payload.html = renderEmailHtml(payload.text);
              const result = await sendEmail(payload, email);
              return sendJSON(res, 200, { ok: true, data: result });
            } catch (err) {
              const msg = err?.message || 'Email send failed';
              log.error({ err }, 'Email send failed');
              if (!res.headersSent) {
                const status = UPSTREAM_SMTP_ERROR.test(msg) ? 502 : 400;
                return sendJSON(res, status, {
                  ok: false,
                  error: msg,
                  // `code` distinguishes "this account has no bot of its own"
                  // from a generic Telegram failure so the UI can localize it.
                  ...(err?.code ? { code: err.code } : {}),
                });
              }
            }
          });
        });
      });
      return;
    }

    // POST /api/email/test - verify SMTP connection and send a test message (admin)
    if (path === '/api/email/test' && req.method === 'POST') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.emailTestSchema)(req, res, async () => {
          try {
            await verifyEmailConfig(email);
            const recipients = req.body.to?.length ? req.body.to : email.recipients;
            if (!recipients?.length) {
              return sendJSON(res, 400, {
                ok: false,
                error: 'Nenhum destinatário configurado',
              });
            }
            const result = await sendEmail(
              {
                to: recipients,
                subject: 'RSS News Hub — teste de conexão',
                text: 'Conexão SMTP OK! Este é um e-mail de teste do RSS News Hub.',
                html: '<p>Conexão SMTP OK! Este é um e-mail de teste do <strong>RSS News Hub</strong>.</p>',
              },
              email
            );
            return sendJSON(res, 200, { ok: true, data: { ...result, verified: true } });
          } catch (err) {
            const msg = err?.message || 'Email test failed';
            log.error({ err }, 'Email test failed');
            return sendJSON(res, 502, { ok: false, error: msg });
          }
        });
      });
      return;
    }

    // POST /api/telegram/schedule - schedule a message for later
    if (path === '/api/telegram/schedule' && req.method === 'POST') {
      // Same gate as POST /api/telegram/send: queueing posts through the bot
      // eventually configured on this instance is an authenticated action.
      requireUser()(req, res, () =>
        telegramSendLimiter(req, res, () =>
          validateBody(schemas.telegramScheduleSchema)(req, res, async () => {
            const {
              text,
              parseMode,
              scheduledAt,
              messageThreadId,
              replyToMessageId,
              inlineKeyboard,
              linkButton,
              linkUrl,
            } = req.body;

            const { queueTelegramMessage } = await import('./services/telegram.service.js');
            const msg = await queueTelegramMessage({
              text,
              parseMode: parseMode || 'Markdown',
              scheduledAt,
              options: { messageThreadId, replyToMessageId, inlineKeyboard, linkButton, linkUrl },
            });
            return sendJSON(res, 200, {
              ok: true,
              data: { messageId: msg.id, scheduledAt: msg.scheduledAt, status: 'pending' },
            });
          })
        )
      );
      return;
    }

    // GET /api/telegram/queue - list scheduled messages
    if (path === '/api/telegram/queue' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        const { getTelegramQueue } = await import('./services/telegram.service.js');
        const queue = await getTelegramQueue();
        return sendJSON(res, 200, { ok: true, data: queue });
      });
      return;
    }

    // DELETE /api/telegram/queue/:id - cancel scheduled message
    if (path.match(TELEGRAM_QUEUE_ITEM_PATH) && req.method === 'DELETE') {
      requireUser()(req, res, async () => {
        const messageId = path.split('/').pop();
        const { cancelTelegramMessage } = await import('./services/telegram.service.js');
        const cancelled = await cancelTelegramMessage(messageId);
        if (!cancelled) {
          const err = createError(ErrorCode.TELEGRAM_MESSAGE_NOT_FOUND, 'Message not found');
          return sendJSON(res, err.statusCode, { ok: false, error: err.message, code: err.code });
        }
        return sendJSON(res, 200, { ok: true, data: { cancelled: true } });
      });
      return;
    }

    // POST /api/telegram/queue/process - manually trigger queue processing
    if (path === '/api/telegram/queue/process' && req.method === 'POST') {
      requireUser()(req, res, async () => {
        const { processTelegramQueue } = await import('./services/telegram.service.js');
        await processTelegramQueue(telegram);
        const { getTelegramQueue } = await import('./services/telegram.service.js');
        const queue = await getTelegramQueue();
        return sendJSON(res, 200, { ok: true, data: { processed: true, queue } });
      });
      return;
    }

    // GET /api/telegram/worker/status - get worker status
    if (path === '/api/telegram/worker/status' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        const status = await getTelegramQueueWorkerStatus();
        return sendJSON(res, 200, { ok: true, data: status });
      });
      return;
    }

    // POST /api/telegram/worker/start - start worker
    if (path === '/api/telegram/worker/start' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        startTelegramQueueWorker(telegram, 60000);
        const status = await getTelegramQueueWorkerStatus();
        return sendJSON(res, 200, { ok: true, data: status });
      });
      return;
    }

    // POST /api/telegram/worker/stop - stop worker
    if (path === '/api/telegram/worker/stop' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        stopTelegramQueueWorker();
        const status = await getTelegramQueueWorkerStatus();
        return sendJSON(res, 200, { ok: true, data: status });
      });
      return;
    }

    // GET /api/templates - list all templates
    if (path === '/api/templates' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        const { loadTemplates } = await import('./services/templates.js');
        const templates = await loadTemplates();
        return sendJSON(res, 200, { ok: true, data: templates });
      });
      return;
    }

    // POST /api/templates - create new template
    if (path === '/api/templates' && req.method === 'POST') {
      requireUser()(req, res, () =>
        validateBody(schemas.templateSchema)(req, res, async () => {
          const { createTemplate } = await import('./services/templates.js');
          try {
            const template = await createTemplate(req.body);
            return sendJSON(res, 201, { ok: true, data: template });
          } catch (err) {
            return sendJSON(res, 400, { ok: false, error: err.message });
          }
        })
      );
      return;
    }

    // PUT /api/templates/:id - update template
    if (path.match(TEMPLATE_ITEM_PATH) && req.method === 'PUT') {
      const templateId = path.split('/').pop();
      requireUser()(req, res, () =>
        validateBody(schemas.updateTemplateSchema)(req, res, async () => {
          const { updateTemplate } = await import('./services/templates.js');
          try {
            const template = await updateTemplate(templateId, req.body);
            return sendJSON(res, 200, { ok: true, data: template });
          } catch (err) {
            const status = err.message.includes('not found') ? 404 : 400;
            return sendJSON(res, status, { ok: false, error: err.message });
          }
        })
      );
      return;
    }

    // DELETE /api/templates/:id - delete template
    if (path.match(TEMPLATE_ITEM_PATH) && req.method === 'DELETE') {
      const templateId = path.split('/').pop();
      requireUser()(req, res, async () => {
        const { deleteTemplate } = await import('./services/templates.js');
        try {
          await deleteTemplate(templateId);
          return sendJSON(res, 200, { ok: true, data: { deleted: true } });
        } catch (err) {
          const status = err.message.includes('not found') ? 404 : 400;
          return sendJSON(res, status, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/templates/:id/test - test template with sample data
    if (path.match(TEMPLATE_TEST_PATH) && req.method === 'POST') {
      const templateId = path.split('/')[3];
      requireUser()(req, res, () =>
        validateBody(schemas.testTemplateSchema)(req, res, async () => {
          const { getTemplateSystemPrompt, getDefaultTemplateId } = await import(
            './services/templates.js'
          );
          try {
            const { templateId: bodyTemplateId, variables, type, news } = req.body;

            const effectiveTemplateId =
              bodyTemplateId || templateId || (type ? getDefaultTemplateId(type) : null);

            if (!effectiveTemplateId) {
              return sendJSON(res, 400, { ok: false, error: 'templateId or type required' });
            }

            // Build variables from news + custom variables
            const testVariables = {
              language: variables?.language || 'en',
              title: news?.title || 'Sample Article Title',
              source: news?.source || 'Sample Source',
              link: news?.link || 'https://example.com/article',
              content: news?.content || 'Sample article content goes here...',
              description: news?.description || 'Sample description',
              pubDate: news?.pubDate || new Date().toISOString(),
              ...variables,
            };

            const systemPrompt = await getTemplateSystemPrompt(effectiveTemplateId, testVariables);

            return sendJSON(res, 200, {
              ok: true,
              data: {
                templateId: effectiveTemplateId,
                systemPrompt,
                variables: testVariables,
              },
            });
          } catch (err) {
            return sendJSON(res, 400, { ok: false, error: err.message });
          }
        })
      );
      return;
    }

    // Static files do build (assets hasheados, manifest, service worker,
    // ícones). Se o caminho não existir em public/, cai no SPA fallback.
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (await tryServePublicFile(res, path)) return;
    }

    // SPA fallback - serve index.html for non-API routes
    if (!path.startsWith('/api/')) {
      return sendFile(res, resolve(PUBLIC_DIR, 'index.html'), { 'Cache-Control': 'no-cache' });
    }

    sendJSON(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error('Server error:', err);
    sendJSON(res, 500, { ok: false, error: err.message });
  }
}

export function createServerInstance() {
  return createServer(handleRequest);
}

// Only start the server when running directly (not imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  // Create default admin user
  const { createDefaultAdmin } = await import('./services/auth.service.js');
  await createDefaultAdmin();

  // Load persisted admin settings (AI keys, Telegram, newsletter/digest config)
  // and apply them on top of the .env defaults before jobs start.
  await initSettings();

  // Fresh database: persist the RSS_FEEDS defaults so the feed manager can
  // edit/delete them and the first fetch satisfies its foreign keys. A seed
  // failure must not block boot; the fetch pipeline retries it.
  try {
    await ensureDefaultFeeds();
  } catch (err) {
    console.warn(`Default feed seed failed: ${err.message}`);
  }

  try {
    // Reconcilia o índice FTS com a tabela (primeira migração, base legada ou
    // poda feita fora do app) — sem isso a busca devolve resultado velho até o
    // próximo rebuild manual.
    const { ensureSearchIndex } = await import('./src/db/repositories/index.js');
    await ensureSearchIndex();
  } catch (err) {
    console.warn(`Search index backfill failed: ${err.message}`);
  }

  // Start scheduler: fetch now and then every 30 minutes
  startScheduler(30 * 60 * 1000, fetchAndScoreFeeds, { runNow: true });
  // Start newsletter job if enabled
  startNewsletterJob(newsletterConfig, { telegram, email });
  // Start Telegram queue worker (every minute)
  startTelegramQueueWorker(telegram, 60000);
  // Start the news retention job (no-op unless a retention window is set)
  startRetentionJob();
  // Start per-user missed digest jobs ("You missed?" daily notification)
  await startAllMissedDigestJobs();

  // Global handlers to prevent crashes from network errors
  process.on('unhandledRejection', (reason, promise) => {
    const msg = reason?.message || String(reason);
    // Suppress noisy network errors but log others
    if (
      msg.includes('ETIMEDOUT') ||
      msg.includes('ENETUNREACH') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed')
    ) {
      console.warn('Unhandled rejection (network):', msg);
    } else {
      console.error('Unhandled rejection:', reason);
    }
  });

  process.on('uncaughtException', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes('ETIMEDOUT') || msg.includes('ENETUNREACH') || msg.includes('ECONNREFUSED')) {
      console.warn('Uncaught exception (network):', msg);
    } else {
      console.error('Uncaught exception:', err);
      process.exit(1);
    }
  });

  // Start plugin config watcher (hot reload of config/plugins.yaml + plugins/)
  const pluginWatcher = createConfigWatcher({
    configPath: resolve(process.cwd(), 'config/plugins.yaml'),
    pluginsDir: resolve(process.cwd(), 'plugins'),
    onPluginLoad: (plugin) =>
      console.log(`[plugins] loaded: ${plugin.manifest.name} (${plugin.manifest.type})`),
    onPluginUnload: (name) => console.log(`[plugins] unloaded: ${name}`),
    onError: (error) => console.warn(`[plugins] ${error.message}`),
  });
  await pluginWatcher.start();
  const loadedPluginNames = pluginWatcher.getCurrentConfig().plugins.map((p) => p.name);
  console.log(
    `[plugins] watcher ativo (${loadedPluginNames.length} carregados: ${loadedPluginNames.join(', ') || 'nenhum'})`
  );

  const server = createServerInstance();
  server.listen(PORT, () => {
    console.log(`
  RSS News Hub running at http://localhost:${PORT}
  
  Endpoints:
  GET  /                  - Main page
  GET  /api/news          - List all news
  POST /api/news          - Add news manually
  POST /api/ai/generate   - Generate content (thread/summary/linkedin)
  POST /api/telegram/send - Send to Telegram bot
  POST /api/telegram/schedule - Schedule Telegram message
  GET  /api/telegram/queue - List scheduled messages
  DELETE /api/telegram/queue/:id - Cancel scheduled message
  POST /api/telegram/queue/process - Process queue now
  GET  /api/templates     - List all templates
  POST /api/templates     - Create template
  PUT  /api/templates/:id - Update template
  DELETE /api/templates/:id - Delete template
  POST /api/templates/:id/test - Test template
  
  Auth:
  POST /api/auth/register     - Register new user
  POST /api/auth/login        - Login
  POST /api/auth/refresh      - Refresh access token
  GET  /api/auth/me           - Current user profile
  PUT  /api/auth/me           - Update profile
  POST /api/auth/change-password - Change password
  POST /api/auth/api-key      - Create API key
  GET  /api/auth/api-keys     - List API keys
  DELETE /api/auth/api-key/:id - Revoke API key

  Plugins:
  config/plugins.yaml        - Habilitados/desabilitados (hot reload automatico)
  npm run cli -- plugin:list - Gerenciar plugins
    `);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    pluginWatcher.stop();
    pluginWatcher.unloadAll().catch(() => {});
    stopScheduler();
    stopNewsletterJob();
    stopTelegramQueueWorker();
    server.close(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    pluginWatcher.stop();
    pluginWatcher.unloadAll().catch(() => {});
    stopScheduler();
    stopNewsletterJob();
    stopTelegramQueueWorker();
    server.close(() => process.exit(0));
  });
}
