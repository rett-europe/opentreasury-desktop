import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vite config for the renderer (ADR-002 §4, SD1).
// Electron main/preload are compiled separately via `tsc -b`.
// TODO(ADR-001 C7): once wired into Electron, inject strict CSP headers via a plugin
//   and verify `base: './'` for file:// loading in production.
export default defineConfig({
  root: resolve(__dirname, 'app/src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'app/src/shared'),
    },
  },
});
