import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      }
    : undefined,
  base: {
    service: 'rss-news-hub',
    version: process.env.npm_package_version || '1.0.0',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createModuleLogger(module) {
  return logger.child({ module });
}

export function createRequestLogger(reqId) {
  return logger.child({ reqId });
}
