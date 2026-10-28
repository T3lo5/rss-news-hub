import { requireAdmin } from '../middleware/auth.js';
import { getPrometheusMetrics } from '../services/metrics.service.js';

/**
 * Prometheus metrics endpoint handler.
 * GET /api/metrics - Prometheus exposition format metrics (admin only)
 */
function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
  res.end(text);
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleMetricsRoutes(req, res, path) {
  // GET /api/metrics - Prometheus metrics (admin only)
  if (path === '/api/metrics' && req.method === 'GET') {
    // Require admin role
    const adminCheck = requireAdmin();

    // Create a mock next function that just continues
    const next = async () => {
      try {
        const includeSystem = req.query?.detailed === 'true';
        const metricsText = await getPrometheusMetrics(includeSystem);
        sendText(res, 200, metricsText);
      } catch (err) {
        sendJSON(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to collect metrics',
        });
      }
    };

    // Wrap in middleware
    adminCheck(req, res, next);
    return true;
  }

  return false;
}
