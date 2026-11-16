import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { swPrecachePlugin } from './scripts/vite-sw-plugin';

// Relative base so the static `dist` works from any sub-path (GitHub Pages, Netlify, Vercel).
export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [swPrecachePlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true, port: 5173, strictPort: false },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
