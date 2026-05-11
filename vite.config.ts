import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

// Vite config for Electron + React renderer (ADR-002 §4, §11).
// `vite-plugin-electron` wires main + renderer. The preload is built directly
// with esbuild (below) because vite-plugin-electron's dev-mode double-build
// concatenates outputs and produces broken preload files.
async function buildPreload() {
  await esbuild({
    entryPoints: [resolve(__dirname, 'app/src/preload/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    outfile: resolve(__dirname, 'dist/preload/index.cjs'),
    sourcemap: true,
    logLevel: 'info',
  });
}

export default defineConfig({
  root: resolve(__dirname, 'app/src/renderer'),
  base: './',
  plugins: [
    react(),
    {
      name: 'opentreasury-preload-esbuild',
      async buildStart() {
        await buildPreload();
      },
      async handleHotUpdate({ file, server }) {
        if (file.includes('app/src/preload/') || file.includes('app\\src\\preload\\')) {
          await buildPreload();
          server.ws.send({ type: 'full-reload' });
        }
      },
    },
    electron([
      {
        // Main process entry (relative to project root)
        entry: resolve(__dirname, 'app/src/main/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'dist/main'),
            sourcemap: true,
            rollupOptions: {
              // Native modules must be external — Electron's asar-aware require() resolves
              // them from app.asar.unpacked at runtime. (Main is post-processed to CJS by
              // scripts/build-main-cjs.mjs so require() works.)
              external: ['electron', 'sodium-native', 'argon2', '@napi-rs/keyring'],
            },
          },
        },
      },
    ]),
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
