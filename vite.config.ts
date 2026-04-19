import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'node:path';

// Vite config for Electron + React renderer (ADR-002 §4, §11).
// `vite-plugin-electron` wires main + preload + renderer in a single dev loop.
// Main/preload compile via esbuild (fast); renderer via Vite (HMR).
export default defineConfig({
  root: resolve(__dirname, 'app/src/renderer'),
  base: './',
  plugins: [
    react(),
    electron([
      {
        // Main process entry (relative to project root)
        entry: resolve(__dirname, 'app/src/main/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            sourcemap: true,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      {
        // Preload script (ADR-001 C6 — narrow, audited bridge)
        entry: resolve(__dirname, 'app/src/preload/index.ts'),
        onstart(options) {
          // Reload renderer on preload rebuild
          options.reload();
        },
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/preload'),
            sourcemap: true,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    // Optional: enables nodeIntegration-like imports in renderer (we don't need it — ADR-001 C7)
    // renderer(),
  ],
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
