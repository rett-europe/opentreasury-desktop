# Skill: Electron + Vite Dev Loop Integration

**Created:** 2026-04-19  
**Author:** Morpheus  
**Context:** Wiring Electron + Vite for unified dev/build workflow  
**Confidence:** HIGH (verified in production dev loop, commit 3c376fd)  

## Problem

Electron apps with Vite renderers need:
1. Vite dev server for renderer (HMR)
2. Main process compilation (TypeScript → JS)
3. Preload script compilation (TypeScript → JS)
4. Auto-restart Electron on main/preload changes
5. Single command to orchestrate all of the above

## Solution Pattern

Use **`vite-plugin-electron`** for integrated Electron + Vite workflow. **⚠️ Exception: preload must use an inline Vite plugin with esbuild (see Common Pitfalls §1).**

### Installation

```bash
npm install -D vite-plugin-electron vite-plugin-electron-renderer
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'app/src/renderer'),
  base: './',
  plugins: [
    react(),
    electron([
      {
        // Main process entry — use resolve() for correct path resolution
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
        // Preload script
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
});
```

### Main Process (app/src/main/index.ts)

Load from Vite dev server in dev, file:// in production:

```typescript
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  // vite-plugin-electron injects VITE_DEV_SERVER_URL during dev
  const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // Production: load from file://
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  win.once('ready-to-show', () => win.show());
  return win;
}
```

### CSP for Dev Mode

Update CSP to allow WebSocket and HTTP connections to Vite dev server:

```typescript
const isDev = !!process.env['VITE_DEV_SERVER_URL'];
const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  (isDev
    ? "connect-src 'self' ws://localhost:5173 http://localhost:5173; "
    : "connect-src 'self'; ") +
  "object-src 'none'; " +
  // ... rest of CSP
```

### Navigation Guard for Dev

Allow dev server navigation while blocking external URLs:

```typescript
win.webContents.on('will-navigate', (event, url) => {
  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl && url.startsWith(devServerUrl)) return;
  if (!url.startsWith('file://')) event.preventDefault();
});
```

### package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "dev:electron": "vite",
    "build": "npm run typecheck && vite build"
  }
}
```

The plugin handles:
- Starting Vite dev server
- Building main + preload via esbuild
- Launching Electron
- Auto-restart on main/preload changes

## Benefits

1. **Single command:** `npm run dev:electron` starts everything
2. **Fast rebuilds:** esbuild compiles main/preload in ~100ms
3. **HMR:** Renderer hot-reloads on changes (React state preserved)
4. **Auto-restart:** Electron restarts when main/preload changes
5. **Production build:** `npm run build` produces all artifacts
6. **Type safety:** Full TypeScript support across all processes

## Common Pitfalls

1. **Preload via vite-plugin-electron (UNRELIABLE):** `vite-plugin-electron` runs two parallel rollup builds for preload in dev mode. Both write to the same outdir and concatenate on disk, creating invalid CJS syntax (two valid bundles joined mid-statement). `emptyOutDir: true` only clears on first build, not subsequent rebuilds. **Fix: implement an inline Vite plugin that calls esbuild directly with format=cjs, external:electron, and handleHotUpdate for dev reload.** Example:
   ```typescript
   {
     name: 'opentreasury-preload-esbuild',
     apply: 'serve',
     async handleHotUpdate(ctx) {
       if (ctx.file.includes('preload')) {
         await esbuild.build({
           entryPoints: [resolve(__dirname, 'app/src/preload/index.ts')],
           outfile: resolve(__dirname, 'dist/preload/index.cjs'),
           format: 'cjs',
           external: ['electron'],
         });
         ctx.server.ws.send({ type: 'full', event: 'full-reload' });
       }
     },
   }
   ```
   Preload is production-ready; it's only dev mode that needs the bypass.

2. **Path resolution:** Use `resolve(__dirname, 'path')` for entry paths, not relative strings
3. **CSP:** Must allow ws:// and http:// to localhost:5173 for HMR to work
4. **External modules:** Mark 'electron' as external in rollupOptions
5. **Navigation guard:** Update to allow dev server URLs during development
6. **Dev-loop validation:** Dev loop is NOT done until an Electron window actually renders content. Build success ≠ working app. Add console.log to preload and verify it fires. Check the renderer visually. Don't trust "build succeeded".

## Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` produces dist/main, dist/preload, dist/renderer
- [ ] `npm run dev:electron` launches Electron with HMR working
- [ ] Preload script runs (add console.log to verify)
- [ ] Window loads renderer from dev server (check URL in DevTools)

## References

- [vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)
- Implemented in: commit 2243f78 (OpenTreasury Desktop)
- ADR-002 §11 (deferred Electron + Vite integration task)
