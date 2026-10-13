import { z } from 'zod';
import { ErrorCode, createError } from './errors.js';

const NewsItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(500),
  link: z.string().url(),
  source: z.string().max(100).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  pubDate: z.string().datetime().optional(),
});

export const addNewsSchema = z.object({
  title: z.string().min(1).max(500),
  link: z.string().url(),
  source: z.string().max(100).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  pubDate: z.string().datetime().optional(),
  id: z.string().optional(),
});

export const generateContentSchema = z.object({
  news: z.union([NewsItemSchema, z.array(NewsItemSchema)]),
  type: z.enum(['thread', 'summary', 'linkedin', 'blog', 'newsletter']),
  language: z.enum(['en', 'pt']).optional(),
  provider: z.enum(['auto', 'sensenova', 'deepseek', 'openai']).optional(),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string()).optional(),
});

export const telegramSendSchema = z.object({
  text: z.string().min(1).max(4096),
  parseMode: z.enum(['Markdown', 'HTML', 'MarkdownV2']).optional(),
  messageThreadId: z.number().int().positive().optional(),
  replyToMessageId: z.number().int().positive().optional(),
  inlineKeyboard: z
    .array(
      z.array(
        z.object({
          text: z.string(),
          url: z.string().url().optional(),
          callback_data: z.string().optional(),
        })
      )
    )
    .optional(),
  linkButton: z.boolean().optional(),
  linkUrl: z.string().url().optional(),
  scheduleAt: z.number().int().positive().optional(),
});

export const telegramScheduleSchema = z.object({
  text: z.string().min(1).max(4096),
  parseMode: z.enum(['Markdown', 'HTML', 'MarkdownV2']).optional(),
  scheduledAt: z.number().int().positive(),
  messageThreadId: z.number().int().positive().optional(),
  replyToMessageId: z.number().int().positive().optional(),
  inlineKeyboard: z
    .array(
      z.array(
        z.object({
          text: z.string(),
          url: z.string().url().optional(),
          callback_data: z.string().optional(),
        })
      )
    )
    .optional(),
  linkButton: z.boolean().optional(),
  linkUrl: z.string().url().optional(),
});

export const updateFeedSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  enabled: z.boolean().optional(),
  category: z.string().max(50).optional(),
});

export const addFeedSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  enabled: z.boolean().optional(),
  category: z.string().max(50).optional(),
});

export const updateNewsletterConfigSchema = z.object({
  enabled: z.boolean().optional(),
  cron: z.string().optional(),
  lookbackDays: z.number().int().min(1).max(30).optional(),
  sources: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  language: z.enum(['en', 'pt']).optional(),
  provider: z.enum(['auto', 'sensenova', 'deepseek', 'openai']).optional(),
  telegramEnabled: z.boolean().optional(),
});

export const updateDigestConfigSchema = z.object({
  enabled: z.boolean().optional(),
  cron: z.string().optional(),
  lookbackDays: z.number().int().min(1).max(30).optional(),
  minRelevanceScore: z.number().int().min(0).max(100).optional(),
  maxItems: z.number().int().min(1).max(50).optional(),
  provider: z.enum(['auto', 'sensenova', 'deepseek', 'openai']).optional(),
  format: z.enum(['thread', 'summary', 'linkedin']).optional(),
  language: z.enum(['en', 'pt']).optional(),
});

export const updateProfileSchema = z.object({
  keywords: z.array(z.string()).optional(),
  topics: z.array(z.string()).optional(),
  preferredSources: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
});

export const scoreItemsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        link: z.string().url(),
        source: z.string(),
        pubDate: z.string(),
        description: z.string().optional(),
        content: z.string().optional(),
      })
    )
    .min(1),
  profile: z
    .object({
      keywords: z.array(z.string()).optional(),
      topics: z.array(z.string()).optional(),
      preferredSources: z.array(z.string()).optional(),
      excludedKeywords: z.array(z.string()).optional(),
    })
    .optional(),
});

export const templateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  type: z.enum(['thread', 'summary', 'linkedin', 'blog', 'newsletter']),
  systemPrompt: z.string().min(1).max(10000),
  variables: z.array(z.string()).optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['thread', 'summary', 'linkedin', 'blog', 'newsletter']).optional(),
  systemPrompt: z.string().min(1).max(10000).optional(),
  variables: z.array(z.string()).optional(),
});

export const testTemplateSchema = z.object({
  templateId: z.string().optional(),
  variables: z.record(z.string()).optional(),
  type: z.enum(['thread', 'summary', 'linkedin', 'blog', 'newsletter']).optional(),
  news: z
    .object({
      title: z.string(),
      link: z.string().url(),
      source: z.string(),
      description: z.string().optional(),
      content: z.string().optional(),
      pubDate: z.string().optional(),
    })
    .optional(),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const updateUserProfileSchema = z.object({
  name: z.string().max(100).optional(),
  email: z.string().email().optional(),
});

export const schemas = {
  addNewsSchema,
  generateContentSchema,
  telegramSendSchema,
  telegramScheduleSchema,
  updateFeedSchema,
  addFeedSchema,
  updateNewsletterConfigSchema,
  updateDigestConfigSchema,
  updateProfileSchema,
  scoreItemsSchema,
  templateSchema,
  updateTemplateSchema,
  testTemplateSchema,
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  createApiKeySchema,
  updateUserProfileSchema,
};

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const error = createError(ErrorCode.VALIDATION_FAILED, 'Validation failed', result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })));
      
      res.writeHead(error.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details,
      }));
      return;
    }

    // Replace body with validated/parsed data (strips unknown fields)
    req.body = result.data;

    if (next) next();
  };
}
