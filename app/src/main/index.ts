// Electron main process entry.
// Scaffold only — no real handlers yet. See ADR-002 §4 and ADR-001 C1–C15.
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpcHandlers } from './ipc/handlers.js';
import { initializeApp } from './bootstrap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = !!process.env['VITE_DEV_SERVER_URL'];
const CSP = isDev
  ? // Dev: Vite injects an inline React-Refresh preamble and uses eval for HMR.
    // We relax script-src only in dev; production keeps strict 'self'.
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws://localhost:5173 http://localhost:5173; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'none'; " +
    "frame-ancestors 'none';"
  : "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " + // TODO(C7): remove once CSS-in-JS strategy picked
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'none'; " +
    "frame-ancestors 'none';";

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      // ADR-001 C7 — Electron hardening, non-negotiable.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // No @electron/remote. Forbidden by C7.
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  // Load from Vite dev server in dev, built files in production (ADR-002 §11).
  // vite-plugin-electron injects VITE_DEV_SERVER_URL during dev.
  const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from file://
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Surface load failures so we don't stare at a blank window.
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[main] did-fail-load: ${code} ${desc} (${url})`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone:', details);
  });

  win.once('ready-to-show', () => win.show());
  // Fallback: if ready-to-show never fires (e.g. module load blocked), still show after 2s.
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show();
  }, 2000);

  // ADR-001 C7 — block all new-window / navigation that is not file:// or dev server.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
    if (devServerUrl && url.startsWith(devServerUrl)) return; // Allow dev server navigation
    if (!url.startsWith('file://')) event.preventDefault();
  });

  return win;
}

function installCspHeader(): void {
  // ADR-001 C7 — inject CSP at the response layer (belt-and-suspenders with renderer meta tag).
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });
}

void app.whenReady().then(async () => {
  installCspHeader();
  // WI-4′ — hydrate the read model from the local NDJSON event log BEFORE
  // handlers are registered, so the first IPC query sees real data (and the
  // dev-seed has run on first launch).
  await initializeApp();
  registerIpcHandlers(ipcMain);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
