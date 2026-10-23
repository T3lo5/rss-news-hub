import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PUBLIC = join(ROOT, 'frontend', 'public');
const BUILT_PUBLIC = join(ROOT, 'public');

// O servidor resolve public/ no import. Apontamos para um diretório
// temporário antes do import dinâmico, assim o teste não depende de o build
// do frontend ter rodado (no CI o job de testes não builda).
const PUBLIC_DIR = await mkdtemp(join(tmpdir(), 'rss-pwa-'));
process.env.RSS_PUBLIC_DIR = PUBLIC_DIR;

const SECRET_MARKER = 'do-not-leak-this-secret';
const OUTSIDE_FILE = join(PUBLIC_DIR, '..', `rss-pwa-secret-${process.pid}.txt`);
await writeFile(OUTSIDE_FILE, SECRET_MARKER);
await writeFile(
  join(PUBLIC_DIR, 'index.html'),
  '<!doctype html><html><body><div id="root"></div></body></html>'
);
await writeFile(join(PUBLIC_DIR, 'sw.js'), 'self.addEventListener("install", () => {});');
await writeFile(join(PUBLIC_DIR, 'manifest.webmanifest'), '{"name":"RSS News Hub"}');
await mkdir(join(PUBLIC_DIR, 'assets'));
await writeFile(join(PUBLIC_DIR, 'assets', 'index-abc123.js'), 'console.log("app");');

const { request } = await import('./helpers/auth-http.js');

after(async () => {
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await rm(OUTSIDE_FILE, { force: true });
});

function header(res: { headers: Record<string, string> }, name: string) {
  const key = Object.keys(res.headers).find((entry) => entry.toLowerCase() === name);
  return key ? res.headers[key] : '';
}

function pngSize(buffer: Buffer) {
  assert.strictEqual(buffer.subarray(1, 4).toString('ascii'), 'PNG', 'not a PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('PWA manifest and assets', () => {
  test('manifest has the fields browsers require to install', async () => {
    const manifest = JSON.parse(
      await readFile(join(SOURCE_PUBLIC, 'manifest.webmanifest'), 'utf8')
    );

    assert.strictEqual(manifest.name, 'RSS News Hub');
    assert.strictEqual(manifest.short_name, 'News Hub');
    assert.strictEqual(manifest.start_url, '/');
    assert.strictEqual(manifest.scope, '/');
    assert.strictEqual(manifest.display, 'standalone');
    assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
    assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);

    const icons = manifest.icons as Array<{ src: string; sizes: string; purpose: string }>;
    assert.ok(
      icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'),
      'missing 192x192 any icon'
    );
    assert.ok(
      icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'),
      'missing 512x512 any icon'
    );
    assert.ok(
      icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'),
      'missing maskable icon'
    );

    for (const icon of icons) {
      assert.ok(
        existsSync(join(SOURCE_PUBLIC, icon.src.replace(/^\//, ''))),
        `icon not found: ${icon.src}`
      );
    }
  });

  test('icon files have the dimensions declared in the manifest', async () => {
    const expected: Array<[string, number]> = [
      ['icons/icon-192.png', 192],
      ['icons/icon-512.png', 512],
      ['icons/icon-maskable-512.png', 512],
      ['icons/apple-touch-icon-180.png', 180],
    ];

    for (const [file, size] of expected) {
      const { width, height } = pngSize(await readFile(join(SOURCE_PUBLIC, file)));
      assert.deepStrictEqual({ width, height }, { width: size, height: size }, file);
    }
  });

  test('index.html links the manifest, the touch icon and the theme color', async () => {
    const html = await readFile(join(ROOT, 'frontend', 'index.html'), 'utf8');

    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon"/);
    assert.match(html, /name="theme-color"/);
    assert.match(html, /content="width=device-width, initial-scale=1\.0, viewport-fit=cover"/);
  });

  test('service worker template never caches the API or non-GET requests', async () => {
    const template = await readFile(join(SOURCE_PUBLIC, 'sw.js'), 'utf8');

    assert.match(template, /__BUILD_VERSION__/);
    assert.match(template, /__PRECACHE__/);
    assert.match(template, /request\.method !== 'GET'/);
    assert.match(template, /url\.pathname\.startsWith\('\/api\/'\)/);
  });

  test('built service worker has a real version and a complete precache list', {
    skip: !existsSync(join(BUILT_PUBLIC, 'sw.js')) && 'frontend build not present',
  }, async () => {
    const sw = await readFile(join(BUILT_PUBLIC, 'sw.js'), 'utf8');

    assert.ok(!sw.includes('__BUILD_VERSION__'), 'version placeholder was not replaced');
    assert.ok(!sw.includes('__PRECACHE__'), 'precache placeholder was not replaced');

    const version = sw.match(/const VERSION = '([0-9a-f]{12})';/);
    assert.ok(version, 'build version must be a 12-char hex hash');

    const precache = JSON.parse(
      sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)?.[1] ?? 'null'
    ) as string[];
    assert.ok(Array.isArray(precache), 'PRECACHE is not a JSON array');
    assert.ok(precache.includes('/'), 'shell route missing from precache');
    assert.ok(precache.includes('/index.html'), 'index.html missing from precache');
    assert.ok(
      precache.some((entry) => entry.startsWith('/assets/') && entry.endsWith('.js')),
      'hashed JS bundle missing from precache'
    );
    assert.ok(
      precache.some((entry) => entry.startsWith('/assets/') && entry.endsWith('.css')),
      'hashed CSS bundle missing from precache'
    );

    for (const entry of precache) {
      const file = entry === '/' ? 'index.html' : entry.replace(/^\//, '');
      assert.ok(existsSync(join(BUILT_PUBLIC, file)), `precache entry not built: ${entry}`);
    }
  });
});

describe('static file serving', () => {
  test('GET /sw.js is served as JS and revalidated', async () => {
    const res = await request('GET', '/sw.js');

    assert.strictEqual(res.status, 200, res.raw);
    assert.match(header(res, 'content-type'), /^text\/javascript/);
    assert.strictEqual(header(res, 'cache-control'), 'no-cache');
  });

  test('GET /manifest.webmanifest uses the PWA MIME type', async () => {
    const res = await request('GET', '/manifest.webmanifest');

    assert.strictEqual(res.status, 200, res.raw);
    assert.match(header(res, 'content-type'), /^application\/manifest\+json/);
    assert.strictEqual(header(res, 'cache-control'), 'no-cache');
  });

  test('hashed assets are cached for a year', async () => {
    const res = await request('GET', '/assets/index-abc123.js');

    assert.strictEqual(res.status, 200, res.raw);
    assert.match(header(res, 'cache-control'), /immutable/);
  });

  test('client routes still fall back to index.html', async () => {
    const res = await request('GET', '/feeds/some/deep/route');

    assert.strictEqual(res.status, 200, res.raw);
    assert.match(header(res, 'content-type'), /^text\/html/);
    assert.strictEqual(header(res, 'cache-control'), 'no-cache');
    assert.match(res.raw, /<div id="root">/);
  });

  test('path traversal does not expose files outside public/', async () => {
    for (const path of ['/%2e%2e%2f' + OUTSIDE_FILE.split('/').pop(), '/..%2f..%2fetc%2fpasswd']) {
      const res = await request('GET', path);
      assert.ok(!res.raw.includes(SECRET_MARKER), `leaked secret via ${path}`);
      assert.ok(!res.raw.includes('root:x:0:0'), `leaked /etc/passwd via ${path}`);
    }
  });

  test('unknown API routes are not swallowed by the SPA fallback', async () => {
    const res = await request('GET', '/api/does-not-exist');

    assert.strictEqual(res.status, 404, res.raw);
    assert.strictEqual(res.json.ok, false);
  });
});
