import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');

interface ChildResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run `node --import tsx` importing the real jwt service in a child process.
 * Module-load-time behavior (like the missing production secret) can only be
 * observed in a fresh process.
 */
function loadJwtService(env: Record<string, string | undefined>): Promise<ChildResult> {
  const childEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) childEnv[key] = value;
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }

  return new Promise((resolvePromise, reject) => {
    execFile(
      'node',
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        "await import('./services/jwt.service.js'); console.log('JWT_SERVICE_LOADED')",
      ],
      { cwd: PROJECT_ROOT, env: childEnv, timeout: 30_000, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolvePromise({
          code: error ? (error.code as number) : 0,
          stdout,
          stderr,
        });
      }
    );
  });
}

describe('JWT secret resolution', () => {
  test('production without JWT_SECRET fails fast with a clear error', async () => {
    const { code, stderr } = await loadJwtService({
      NODE_ENV: 'production',
      JWT_SECRET: undefined,
    });

    assert.notStrictEqual(code, 0, 'process must not boot without a secret in production');
    assert.ok(stderr.includes('JWT_SECRET'), `error should mention JWT_SECRET, got: ${stderr}`);
  });

  test('production with JWT_SECRET boots normally', async () => {
    const { code, stdout, stderr } = await loadJwtService({
      NODE_ENV: 'production',
      JWT_SECRET: 'prod-secret-0123456789abcdef0123456789abcdef',
    });

    assert.strictEqual(code, 0, `stderr: ${stderr}`);
    assert.ok(stdout.includes('JWT_SERVICE_LOADED'));
  });

  test('development without JWT_SECRET boots with a warning (no fallback breakage)', async () => {
    const { code, stderr } = await loadJwtService({ NODE_ENV: undefined, JWT_SECRET: undefined });

    assert.strictEqual(code, 0, `stderr: ${stderr}`);
    assert.ok(
      /development fallback/i.test(stderr),
      `expected a dev fallback warning, got: ${stderr}`
    );
  });
});
