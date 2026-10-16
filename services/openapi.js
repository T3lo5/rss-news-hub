import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { schemas } from './validation.js';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

registry.registerComponent('securitySchemes', 'ApiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'Authorization',
  description: 'API Key (format: Bearer <key>)',
});

function registerPath(method, path, summary, description, requestSchema, responses, security = []) {
  const pathObj = {
    [method]: {
      summary,
      description,
      operationId: `${method}${path.replace(/\//g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`,
      security,
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: responses.success,
            },
          },
        },
        400: {
          description: 'Bad Request',
          content: {
            'application/json': {
              schema: responses.error,
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: responses.error,
            },
          },
        },
        403: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: responses.error,
            },
          },
        },
        500: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: responses.error,
            },
          },
        },
      },
    },
  };

  if (requestSchema) {
    pathObj[method].requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: requestSchema,
        },
      },
    };
  }

  registry.registerPath({
    method,
    path,
    ...pathObj[method],
  });
}

const OkResponse = z.object({ ok: z.literal(true), data: z.unknown() });
const ErrorResponse = z.object({
  ok: z.literal(false),
  error: z.string(),
  details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
});

registerPath(
  'get',
  '/api/news',
  'List all news',
  'Retrieve all news items from the database',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/news',
  'Add news manually',
  'Add a single news item manually',
  schemas.addNewsSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/fetch',
  'Trigger RSS fetch',
  'Fetch all configured RSS feeds and store new items',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/scheduler/status',
  'Get scheduler status',
  'Get the current status of the feed fetch scheduler',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/scheduler/trigger',
  'Trigger scheduler manually',
  'Manually trigger a feed fetch',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/scheduler/config',
  'Update scheduler interval',
  'Update the scheduler fetch interval',
  z.object({ intervalMs: z.number().int().min(1000) }),
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/stats',
  'Get aggregated stats',
  'Get aggregated statistics for feeds and news',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/feeds',
  'List all feeds',
  'List all configured RSS feeds with their stats',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/feeds/health',
  'Feed health dashboard',
  'Get health status for all feeds',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/feeds',
  'Add new feed',
  'Add a new RSS feed',
  schemas.addFeedSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/feeds/{id}',
  'Update feed',
  'Update an existing feed',
  schemas.updateFeedSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'delete',
  '/api/feeds/{id}',
  'Delete feed',
  'Delete a feed',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/feeds/{id}/test',
  'Test feed',
  'Test fetch a single feed',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/feeds/reload',
  'Reload feeds config',
  'Reload feeds configuration from disk',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/feeds/opml',
  'Export feeds as OPML',
  'Export all feeds as OPML format',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/feeds/opml',
  'Import feeds from OPML',
  'Import feeds from an OPML file',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/newsletter/config',
  'Get newsletter config',
  'Get the current newsletter configuration',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/newsletter/config',
  'Update newsletter config',
  'Update the newsletter configuration',
  schemas.updateNewsletterConfigSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/newsletter/trigger',
  'Trigger newsletter',
  'Manually generate and send newsletter',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/newsletter/history',
  'Get newsletter history',
  'Get recent newsletter history',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/digest/config',
  'Get digest config',
  'Get the automatic "Best News" digest configuration',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/digest/config',
  'Update digest config',
  'Update the digest configuration (admin)',
  schemas.updateDigestConfigSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/digest/trigger',
  'Trigger digest',
  'Generate and send the digest now (admin). Works even when the schedule is disabled.',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/digest/status',
  'Get digest status',
  'Get the computed digest schedule status (enabled, cron, nextRun)',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/digest/preview',
  'Preview digest',
  'Preview the digest content without sending (admin)',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/digest/start',
  'Start digest job',
  'Enable and start the scheduled digest job (admin)',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/digest/stop',
  'Stop digest job',
  'Disable and stop the scheduled digest job (admin)',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/settings',
  'Get settings',
  'Get admin settings (AI providers, Telegram, newsletter, digest). Secrets are masked.',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/settings/ai',
  'Update AI settings',
  'Update AI provider settings (admin). apiKey omitted = keep, null = clear.',
  schemas.aiSettingsSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/settings/telegram',
  'Update Telegram settings',
  'Update Telegram bot token and chat id (admin). botToken omitted = keep, null = clear.',
  schemas.telegramSettingsSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/settings/email',
  'Update email settings',
  'Update SMTP settings for newsletter/digest delivery (admin). pass omitted = keep, null = clear.',
  schemas.emailSettingsSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/email/send',
  'Send email',
  'Send an email using the configured SMTP server. to defaults to the configured recipients.',
  schemas.emailSendSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/email/test',
  'Test email',
  'Verify the SMTP connection and send a test message (admin).',
  schemas.emailTestSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/bookmarks',
  'List bookmarks',
  'List all bookmarked news items',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/bookmarks',
  'Add bookmark',
  'Bookmark a news item',
  z.object({ newsId: z.string() }),
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'delete',
  '/api/bookmarks/{newsId}',
  'Remove bookmark',
  'Remove a bookmark',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/ai/profile',
  'Get interest profile',
  'Get the user interest profile for relevance scoring',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/ai/profile',
  'Update interest profile',
  'Update the user interest profile',
  schemas.updateProfileSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/ai/providers',
  'List AI providers',
  'List available AI providers and whether each is configured',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/ai/test',
  'Test AI provider',
  'Run a tiny completion against a provider to verify the configuration (admin)',
  schemas.aiTestSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/ai/score',
  'Score news items',
  'Score news items for relevance',
  schemas.scoreItemsSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/ai/score-new',
  'Score unscored items',
  'Score all unscored news items',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/ai/generate',
  'Generate content',
  'Generate content (thread/summary/linkedin/blog/newsletter) using AI',
  schemas.generateContentSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/ai/generate/stream',
  'Generate content (stream)',
  'Generate content with streaming response (SSE)',
  schemas.generateContentSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/telegram/send',
  'Send Telegram message',
  'Send a message to Telegram',
  schemas.telegramSendSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/telegram/schedule',
  'Schedule Telegram message',
  'Schedule a message for later delivery',
  schemas.telegramScheduleSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/telegram/queue',
  'List scheduled messages',
  'List all scheduled Telegram messages',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'delete',
  '/api/telegram/queue/{id}',
  'Cancel scheduled message',
  'Cancel a scheduled message',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/telegram/queue/process',
  'Process queue',
  'Manually process the Telegram queue',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/telegram/worker/status',
  'Get worker status',
  'Get Telegram queue worker status',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/telegram/worker/start',
  'Start worker',
  'Start the Telegram queue worker',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/telegram/worker/stop',
  'Stop worker',
  'Stop the Telegram queue worker',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/users',
  'List users',
  'List all users (admin)',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/users',
  'Create user',
  'Create a user with an explicit role (admin)',
  schemas.adminCreateUserSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/users/{id}',
  'Update user',
  'Update a user name/role or reset their password (admin)',
  schemas.updateUserSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'delete',
  '/api/users/{id}',
  'Delete user',
  'Delete a user (admin, cannot delete yourself)',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'get',
  '/api/templates',
  'List templates',
  'List all content templates',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/templates',
  'Create template',
  'Create a new content template',
  schemas.templateSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'put',
  '/api/templates/{id}',
  'Update template',
  'Update an existing template',
  schemas.updateTemplateSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'delete',
  '/api/templates/{id}',
  'Delete template',
  'Delete a template',
  null,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);
registerPath(
  'post',
  '/api/templates/{id}/test',
  'Test template',
  'Test a template with sample data',
  schemas.testTemplateSchema,
  { success: OkResponse, error: ErrorResponse },
  [{ BearerAuth: [] }, { ApiKeyAuth: [] }]
);

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'Check service health status',
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: OkResponse } } },
    503: { description: 'Degraded', content: { 'application/json': { schema: ErrorResponse } } },
  },
});

export function generateOpenApiSpec() {
  return registry.generateOpenApiDocument({
    openapi: '3.0.3',
    info: {
      title: 'RSS News Hub API',
      version: '1.0.0',
      description:
        'API for RSS News Hub - RSS scraper + AI content generator + Telegram distributor',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local development server' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'Authorization' },
      },
    },
    security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
  });
}
