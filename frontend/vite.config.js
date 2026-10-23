import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Gera o service worker final depois do build: injeta a lista de assets
// hasheados no precache e uma versão derivada do próprio build. Assim todo
// deploy invalida o cache antigo (sem isso o usuário fica preso no shell
// anterior) e o SW não precisa de Workbox nem de lista manual.
function pwaServiceWorker() {
  return {
    name: 'rss-pwa-sw',
    apply: 'build',
    async closeBundle() {
      const outDir = path.resolve(import.meta.dirname, '../public');
      const buildManifest = JSON.parse(
        await readFile(path.join(outDir, '.vite/manifest.json'), 'utf8')
      );

      const assets = new Set([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-512.png',
        '/icons/apple-touch-icon-180.png',
      ]);

      for (const entry of Object.values(buildManifest)) {
        if (entry.file) assets.add(`/${entry.file}`);
        for (const css of entry.css || []) assets.add(`/${css}`);
      }

      const precache = [...assets].sort();
      const swPath = path.join(outDir, 'sw.js');
      const template = await readFile(swPath, 'utf8');
      const version = createHash('sha256')
        .update(`${precache.join('|')}\n${template}`)
        .digest('hex')
        .slice(0, 12);

      const sw = template
        .replaceAll('__BUILD_VERSION__', version)
        .replaceAll('__PRECACHE__', JSON.stringify(precache, null, 2));

      await writeFile(swPath, sw);
      console.log(`[pwa] sw.js gerado (versão ${version}, ${precache.length} assets)`);
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaServiceWorker()],
  base: '/',
  build: {
    outDir: path.resolve(import.meta.dirname, '../public'),
    emptyOutDir: true,
    manifest: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
