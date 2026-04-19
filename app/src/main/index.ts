// Electron main process entry.
// Scaffold only — no real handlers yet. See ADR-002 §4 and ADR-001 C1–C15.
import { app, BrowserWindow, ipcMain, session } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpcHandlers } from './ipc/handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ADR-001 C7 — strict CSP. No 'unsafe-inline', no 'unsafe-eval', no CDN.
// TODO(C7): tighten once renderer dev server URL is finalized. For production file:// loading
//   this baseline is adequate; dev mode may need `connect-src 'self' ws://localhost:5173` added.
const CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " + // TODO(C7): remove 'unsafe-inline' once CSS-in-JS strategy picked
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
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  // TODO(C7): load the built renderer in production; wire Vite dev server URL in development.
  // For now, a placeholder data URL keeps the shell bootable until real wiring lands.
  void win.loadURL(
    'data:text/html,<!doctype html><meta charset="utf-8"><title>OpenTreasury</title>' +
      '<body style="font-family:system-ui;padding:2rem">Renderer not wired yet — scaffold.</body>',
  );

  win.once('ready-to-show', () => win.show());

  // ADR-001 C7 — block all new-window / navigation that is not file://.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
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

void app.whenReady().then(() => {
  installCspHeader();
  registerIpcHandlers(ipcMain);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
