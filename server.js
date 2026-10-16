import { setDefaultResultOrder } from 'node:dns';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import {
  authenticateRequest,
  requireAdmin,
  requireUser,
  requireViewer,
} from './middleware/auth.js';
import { handleAuthRoutes } from './routes/auth.routes.js';
import { newsletterConfig, PORT, telegram } from './server.config.js';
import { buildSystemPrompt, chat, chatStream, stripEditorialMeta } from './services/ai.service.js';
import {
  generateFeedId,
  readFeedsConfig,
  validateFeedUrl,
  writeFeedsConfig,
} from './services/config.service.js';
import {
  generateAndSendDigest,
  generateDigestPreview,
  getDigestConfig,
  updateDigestConfig,
} from './services/digest.service.js';
import { createError, ErrorCode } from './services/errors.js';
import { fetchAllFeeds, fetchFeedByUrl, parseRSS } from './services/fetch.service.js';
import { createRequestLogger } from './services/logger.js';
import { addNews, readNews } from './services/news.service.js';
import { generateOpenApiSpec } from './services/openapi.js';
import { rateLimitMiddleware } from './services/rate-limiter.js';
import {
  getStatus as getSchedulerStatus,
  setIntervalMs as setSchedulerInterval,
  startNewsletterJob,
  start as startScheduler,
  stopNewsletterJob,
  stop as stopScheduler,
  trigger as triggerScheduler,
} from './services/scheduler.service.js';
import { getFeedHealth, getStats, getStatsAsync } from './services/stats.service.js';
import { telegramSend } from './services/telegram.service.js';
import {
  getTelegramQueueWorkerStatus,
  startTelegramQueueWorker,
  stopTelegramQueueWorker,
} from './services/telegram-worker.js';
import { getTemplateSystemPrompt } from './services/templates.js';
import { schemas, validateBody } from './services/validation.js';
import { createConfigWatcher } from './src/plugins/config-watcher.js';

setDefaultResultOrder('ipv4first');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

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
const fetchLimiter = rateLimitMiddleware({ maxRequests: 2, windowMs: 60000, keyPrefix: 'fetch:' });

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function sendFile(res, path) {
  try {
    const ext = path.split('.').pop() || '';
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[`.` + ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
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
  if (['POST', 'PUT'].includes(req.method)) {
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
  } else {
    req.body = {};
  }

  // Auth routes. Credentials (Bearer token / API key) are resolved first so
  // handlers like GET /api/auth/me and the API-key routes see req.user;
  // anonymous requests simply leave req.user unset for the handler to check.
  if (path.startsWith('/api/auth/')) {
    try {
      await authenticateRequest(req, res);
      const handled = await handleAuthRoutes(req, res, path);
      if (handled) return;
    } catch (err) {
      log.error({ err }, 'Auth route failed');
      return sendJSON(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  try {
    // GET / - serve index.html
    if (path === '/' && req.method === 'GET') {
      return sendFile(res, './public/index.html');
    }

    // GET /api/news - list all news
    if (path === '/api/news' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        const news = await readNews();
        return sendJSON(res, 200, { ok: true, data: news });
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

    // POST /api/fetch - trigger RSS fetch
    if (path === '/api/fetch' && req.method === 'POST') {
      fetchLimiter(req, res, async () => {
        try {
          const { total, results } = await fetchAllFeeds();

          // Score new articles after fetch if AI is configured
          try {
            const { scoreNewItems, readProfile } = await import('./services/relevance.service.js');
            const profile = await readProfile();
            await scoreNewItems(profile);
          } catch (scoreErr) {
            console.warn('Relevance scoring skipped:', scoreErr.message);
          }

          return sendJSON(res, 200, { ok: true, data: { total, results } });
        } catch (err) {
          console.error('Fetch error:', err);
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // GET /api/scheduler/status - get scheduler status
    if (path === '/api/scheduler/status' && req.method === 'GET') {
      return sendJSON(res, 200, { ok: true, data: getSchedulerStatus() });
    }

    // POST /api/scheduler/trigger - manual trigger
    if (path === '/api/scheduler/trigger' && req.method === 'POST') {
      try {
        const result = await triggerScheduler(fetchAllFeeds);

        // Score new articles after scheduled fetch
        try {
          const { scoreNewItems, readProfile } = await import('./services/relevance.service.js');
          const profile = await readProfile();
          await scoreNewItems(profile);
        } catch (scoreErr) {
          console.warn('Relevance scoring skipped:', scoreErr.message);
        }

        return sendJSON(res, 200, { ok: true, data: result });
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
    }

    // POST /api/scheduler/config - update scheduler interval
    if (path === '/api/scheduler/config' && req.method === 'POST') {
      const { intervalMs } = req.body || {};
      if (typeof intervalMs !== 'number' || intervalMs < 1000) {
        return sendJSON(res, 400, { ok: false, error: 'intervalMs must be number >= 1000' });
      }
      setSchedulerInterval(intervalMs);
      return sendJSON(res, 200, { ok: true, data: { intervalMs } });
    }

    // GET /api/stats - get aggregated stats
    if (path === '/api/stats' && req.method === 'GET') {
      try {
        const { getStatsAsync } = await import('./services/stats.service.js');
        const { getStatus: getSchedulerStatus } = await import('./services/scheduler.service.js');
        const stats = await getStatsAsync();
        const schedulerStatus = getSchedulerStatus();
        stats.scheduler = schedulerStatus;
        return sendJSON(res, 200, { ok: true, data: stats });
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
    }

    // GET /api/feeds - list all feeds with stats
    if (path === '/api/feeds' && req.method === 'GET') {
      requireViewer()(req, res, async () => {
        try {
          const feeds = await readFeedsConfig();
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
          const feeds = await readFeedsConfig();
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
      requireUser()(req, res, () => {
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
    if (path.match(/^\/api\/feeds\/[^/]+$/) && req.method === 'PUT') {
      const id = path.split('/')[3];
      requireUser()(req, res, () => {
        validateBody(schemas.updateFeedSchema)(req, res, async () => {
          const updates = req.body;

          try {
            const feeds = await readFeedsConfig();
            const index = feeds.findIndex((f) => f.id === id);
            if (index === -1) {
              const err = createError(ErrorCode.FEED_NOT_FOUND, 'Feed not found');
              return sendJSON(res, err.statusCode, { ok: false, error: err.message, code: err.code });
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
    if (path.match(/^\/api\/feeds\/[^/]+$/) && req.method === 'DELETE') {
      const id = path.split('/')[3];
      requireUser()(req, res, async () => {
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
    if (path.match(/^\/api\/feeds\/[^/]+\/test$/) && req.method === 'POST') {
      const id = path.split('/')[3];
      requireUser()(req, res, async () => {
        try {
          const feeds = await readFeedsConfig();
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
      try {
        const { exportOPML } = await import('./services/opml.service.js');
        const opml = await exportOPML();
        res.writeHead(200, {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': 'attachment; filename="rss-news-hub-feeds.opml"',
        });
        res.end(opml);
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
      return;
    }

    // POST /api/feeds/opml - import feeds from OPML
    if (path === '/api/feeds/opml' && req.method === 'POST') {
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
      return;
    }

    // GET /api/newsletter/config - get newsletter config
    if (path === '/api/newsletter/config' && req.method === 'GET') {
      return sendJSON(res, 200, { ok: true, data: newsletterConfig });
    }

    // PUT /api/newsletter/config - update newsletter config
    if (path === '/api/newsletter/config' && req.method === 'PUT') {
      validateBody(schemas.updateNewsletterConfigSchema)(req, res, async () => {
        const updates = req.body;

        try {
          Object.assign(newsletterConfig, updates);
          startNewsletterJob(newsletterConfig, { telegram });
          return sendJSON(res, 200, { ok: true, data: newsletterConfig });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
      });
      return;
    }

    // POST /api/newsletter/trigger - manual newsletter generation
    if (path === '/api/newsletter/trigger' && req.method === 'POST') {
      try {
        const { generateAndSendNewsletter } = await import('./services/newsletter.service.js');
        const result = await generateAndSendNewsletter(newsletterConfig, { telegram });
        return sendJSON(res, 200, { ok: true, data: result });
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
    }

    // GET /api/newsletter/history - get newsletter history
    if (path === '/api/newsletter/history' && req.method === 'GET') {
      try {
        const { readHistory } = await import('./services/newsletter.service.js');
        const history = await readHistory();
        return sendJSON(res, 200, { ok: true, data: history.slice(0, 10) });
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
    }

    // GET /api/digest/config - get digest config
    if (path === '/api/digest/config' && req.method === 'GET') {
      return sendJSON(res, 200, { ok: true, data: getDigestConfig() });
    }

    // PUT /api/digest/config - update digest config
    if (path === '/api/digest/config' && req.method === 'PUT') {
      requireAdmin()(req, res, () => {
        validateBody(schemas.updateDigestConfigSchema)(req, res, async () => {
          const updates = req.body;
          try {
            const config = updateDigestConfig(updates);
            return sendJSON(res, 200, { ok: true, data: config });
          } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
          }
        });
      });
      return;
    }

    // POST /api/digest/trigger - manual digest generation
    if (path === '/api/digest/trigger' && req.method === 'POST') {
      requireAdmin()(req, res, async () => {
        try {
          const result = await generateAndSendDigest({ telegram });
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
          return sendJSON(res, 200, { ok: true, data: config });
        } catch (err) {
          return sendJSON(res, 500, { ok: false, error: err.message });
        }
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
      try {
        const { readProfile } = await import('./services/relevance.service.js');
        const profile = await readProfile();
        return sendJSON(res, 200, { ok: true, data: profile });
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
    }

    // PUT /api/ai/profile - update interest profile
    if (path === '/api/ai/profile' && req.method === 'PUT') {
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
      });
      return;
    }

    // POST /api/ai/score - score news items for relevance
    if (path === '/api/ai/score' && req.method === 'POST') {
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
      });
      return;
    }

    // POST /api/ai/score-new - score unscored news items
    if (path === '/api/ai/score-new' && req.method === 'POST') {
      try {
        const { scoreNewItems, readProfile } = await import('./services/relevance.service.js');
        const profile = await readProfile();
        const result = await scoreNewItems(profile);
        return sendJSON(res, 200, { ok: true, data: result });
      } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
      }
    }

    // POST /api/ai/generate - generate content with AI
    if (path === '/api/ai/generate' && req.method === 'POST') {
      requireUser()(req, res, () => {
        aiGenerateLimiter(req, res, () => {
          validateBody(schemas.generateContentSchema)(req, res, async () => {
            try {
              const { news, type, language, provider, templateId, templateVariables } = req.body;

              const templatePrompt = templateId
                ? getTemplateSystemPrompt(templateId, {
                    ...news,
                    type,
                    language: language || 'en',
                    ...templateVariables,
                  })
                : buildSystemPrompt(type, language || 'en');

              const systemPrompt = templatePrompt;
              const userContent = `Title: ${news.title}\nSource: ${news.source}\nLink: ${news.link}\n\n${news.content || news.description || ''}`;

              const result = await chat(systemPrompt, userContent, provider);
              // Never let the editorial analysis sections leak into the post.
              const content = type === 'linkedin' ? stripEditorialMeta(result) : result;
              return sendJSON(res, 200, { ok: true, data: { content, type, language } });
            } catch (err) {
              const msg = err?.message || 'AI generation failed';
              log.error({ err }, 'AI generation failed');
              if (!res.headersSent) {
                return sendJSON(res, 502, { ok: false, error: msg });
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

            const templatePrompt = templateId
              ? getTemplateSystemPrompt(templateId, {
                  ...news,
                  type,
                  language: language || 'en',
                  ...templateVariables,
                })
              : buildSystemPrompt(type, language || 'en');

            const systemPrompt = templatePrompt;
            const userContent = `Title: ${news.title}\nSource: ${news.source}\nLink: ${news.link}\n\n${news.content || news.description || ''}`;

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
                { signal: abortController.signal }
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

              if (scheduleAt) {
                // Queue for scheduled send
                const { queueTelegramMessage } = await import('./services/telegram.service.js');
                const msg = await queueTelegramMessage({
                  text,
                  parseMode: parseMode || 'Markdown',
                  scheduledAt: scheduleAt,
                  options: { messageThreadId, replyToMessageId, inlineKeyboard, linkButton, linkUrl },
                });
                return sendJSON(res, 200, {
                  ok: true,
                  data: { queued: true, messageId: msg.id, scheduledAt: msg.scheduledAt },
                });
              }

              const result = await telegramSend(text, parseMode || 'Markdown', telegram, {
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
                const status = /network|timeout/i.test(msg) ? 502 : 400;
                return sendJSON(res, status, { ok: false, error: msg });
              }
            }
          });
        });
      });
      return;
    }

    // POST /api/telegram/schedule - schedule a message for later
    if (path === '/api/telegram/schedule' && req.method === 'POST') {
      telegramSendLimiter(req, res, () => {
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
          const msg = queueTelegramMessage({
            text,
            parseMode: parseMode || 'Markdown',
            scheduledAt,
            options: { messageThreadId, replyToMessageId, inlineKeyboard, linkButton, linkUrl },
          });
          return sendJSON(res, 200, {
            ok: true,
            data: { messageId: msg.id, scheduledAt: msg.scheduledAt, status: 'pending' },
          });
        });
      });
      return;
    }

    // GET /api/telegram/queue - list scheduled messages
    if (path === '/api/telegram/queue' && req.method === 'GET') {
      const { getTelegramQueue } = await import('./services/telegram.service.js');
      const queue = getTelegramQueue();
      return sendJSON(res, 200, { ok: true, data: queue });
    }

    // DELETE /api/telegram/queue/:id - cancel scheduled message
    if (path.match(/^\/api\/telegram\/queue\/[^/]+$/) && req.method === 'DELETE') {
      const messageId = path.split('/').pop();
      const { cancelTelegramMessage } = await import('./services/telegram.service.js');
      const cancelled = cancelTelegramMessage(messageId);
      if (!cancelled) {
        const err = createError(ErrorCode.TELEGRAM_MESSAGE_NOT_FOUND, 'Message not found');
        return sendJSON(res, err.statusCode, { ok: false, error: err.message, code: err.code });
      }
      return sendJSON(res, 200, { ok: true, data: { cancelled: true } });
    }

    // POST /api/telegram/queue/process - manually trigger queue processing
    if (path === '/api/telegram/queue/process' && req.method === 'POST') {
      const { processTelegramQueue } = await import('./services/telegram.service.js');
      await processTelegramQueue(telegram);
      const { getTelegramQueue } = await import('./services/telegram.service.js');
      const queue = getTelegramQueue();
      return sendJSON(res, 200, { ok: true, data: { processed: true, queue } });
    }

    // GET /api/telegram/worker/status - get worker status
    if (path === '/api/telegram/worker/status' && req.method === 'GET') {
      const status = getTelegramQueueWorkerStatus();
      return sendJSON(res, 200, { ok: true, data: status });
    }

    // POST /api/telegram/worker/start - start worker
    if (path === '/api/telegram/worker/start' && req.method === 'POST') {
      startTelegramQueueWorker(telegram, 60000);
      const status = getTelegramQueueWorkerStatus();
      return sendJSON(res, 200, { ok: true, data: status });
    }

    // POST /api/telegram/worker/stop - stop worker
    if (path === '/api/telegram/worker/stop' && req.method === 'POST') {
      stopTelegramQueueWorker();
      const status = getTelegramQueueWorkerStatus();
      return sendJSON(res, 200, { ok: true, data: status });
    }

    // GET /api/templates - list all templates
    if (path === '/api/templates' && req.method === 'GET') {
      const { loadTemplates } = await import('./services/templates.js');
      const templates = await loadTemplates();
      return sendJSON(res, 200, { ok: true, data: templates });
    }

    // POST /api/templates - create new template
    if (path === '/api/templates' && req.method === 'POST') {
      validateBody(schemas.templateSchema)(req, res, async () => {
        const { createTemplate } = await import('./services/templates.js');
        try {
          const template = await createTemplate(req.body);
          return sendJSON(res, 201, { ok: true, data: template });
        } catch (err) {
          return sendJSON(res, 400, { ok: false, error: err.message });
        }
      });
      return;
    }

    // PUT /api/templates/:id - update template
    if (path.match(/^\/api\/templates\/[^/]+$/) && req.method === 'PUT') {
      const templateId = path.split('/').pop();
      validateBody(schemas.updateTemplateSchema)(req, res, async () => {
        const { updateTemplate } = await import('./services/templates.js');
        try {
          const template = await updateTemplate(templateId, req.body);
          return sendJSON(res, 200, { ok: true, data: template });
        } catch (err) {
          const status = err.message.includes('not found') ? 404 : 400;
          return sendJSON(res, status, { ok: false, error: err.message });
        }
      });
      return;
    }

    // DELETE /api/templates/:id - delete template
    if (path.match(/^\/api\/templates\/[^/]+$/) && req.method === 'DELETE') {
      const templateId = path.split('/').pop();
      const { deleteTemplate } = await import('./services/templates.js');
      try {
        await deleteTemplate(templateId);
        return sendJSON(res, 200, { ok: true, data: { deleted: true } });
      } catch (err) {
        const status = err.message.includes('not found') ? 404 : 400;
        return sendJSON(res, status, { ok: false, error: err.message });
      }
    }

    // POST /api/templates/:id/test - test template with sample data
    if (path.match(/^\/api\/templates\/[^/]+\/test$/) && req.method === 'POST') {
      const templateId = path.split('/')[3];
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
      });
      return;
    }

    // Static files - serve from public directory (Vite build output)
    if (path.startsWith('/assets/') || path.startsWith('/favicon')) {
      return sendFile(res, './public' + path);
    }

    // SPA fallback - serve index.html for non-API routes
    if (!path.startsWith('/api/')) {
      return sendFile(res, './public/index.html');
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

  // Start scheduler: fetch every 30 minutes
  startScheduler(30 * 60 * 1000, fetchAllFeeds);
  // Start newsletter job if enabled
  startNewsletterJob(newsletterConfig, { telegram });
  // Start Telegram queue worker (every minute)
  startTelegramQueueWorker(telegram, 60000);

  // Global handlers to prevent crashes from network errors
  process.on('unhandledRejection', (reason, promise) => {
    const msg = reason?.message || String(reason);
    // Suppress noisy network errors but log others
    if (msg.includes('ETIMEDOUT') || msg.includes('ENETUNREACH') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
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
