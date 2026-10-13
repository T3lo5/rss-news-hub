import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: path.resolve(__dirname, '../public'),
    emptyOutDir: true,
    manifest: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
