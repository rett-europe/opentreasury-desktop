// Electron main process entry.
// Scaffold only — no real handlers yet. See ADR-002 §4 and ADR-001 C1–C15.
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  session,
  Menu,
  shell,
  dialog,
  type MenuItemConstructorOptions,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { registerIpcHandlers } from './ipc/handlers.js';
import { initializeApp } from './bootstrap.js';
import { isHeadlessSeedRequested, runHeadlessSeed } from './headlessSeed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Allow CI / dev to force Electron's safeStorage backend. The actual switch
// is passed on the Electron command line (see scripts/perf-seed.mjs and
// tests/e2e/movements-perf.spec.ts) because Chromium reads it during early
// init before JS would call appendSwitch. This env-driven appendSwitch is a
// belt-and-suspenders fallback for entry points that don't set the CLI flag.
const passwordStoreOverride = process.env['OT_PASSWORD_STORE']?.trim();
if (passwordStoreOverride && !app.commandLine.hasSwitch('password-store')) {
  app.commandLine.appendSwitch('password-store', passwordStoreOverride);
}

// Production-only adjustments — keep dev workflow intact.
if (app.isPackaged) {
  // Isolate production userData from dev sessions.
  // Without this, %APPDATA%\opentreasury-desktop\ is shared between dev and prod,
  // and the packaged installer inherits the dev's app-config.json (skipping onboarding).
  app.setName('OpenTreasury');
}

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

function buildHelpMenu(): void {
  if (!app.isPackaged) return; // No Help menu in dev mode

  const guidesPath = join(process.resourcesPath, 'guides');
  const menuTemplate: MenuItemConstructorOptions[] = [
    {
      label: 'Help',
      submenu: [
        {
          label: 'User Guide (English)',
          click: () => {
            void shell.openPath(join(guidesPath, 'user-guide-en.html'));
          },
        },
        {
          label: 'User Guide (Español)',
          click: () => {
            void shell.openPath(join(guidesPath, 'user-guide-es.html'));
          },
        },
        { type: 'separator' },
        {
          label: 'About OpenTreasury',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'About OpenTreasury',
              message: 'OpenTreasury',
              detail: `Version ${app.getVersion()}\n\nOpen-source treasury management for NGOs.`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// SPEC-026 Option B — headless seed mode for the e2e perf gate. When
// OT_HEADLESS_SEED=1, scripts/perf-seed.mjs has spawned us solely to write
// an encrypted workspace and exit. Branching here (before app.whenReady())
// keeps the normal `npm run dev` path completely untouched: no IPC handlers,
// no BrowserWindow, no CSP header — just seed and quit.
if (isHeadlessSeedRequested()) {
  runHeadlessSeed().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[headlessSeed] failed:', err);
    process.exit(1);
  });
} else {
  void app.whenReady().then(async () => {
    // When --password-store=basic is active (CI / headless Linux),
    // safeStorage.isEncryptionAvailable() returns false by design unless we
    // explicitly opt into plaintext mode. The perf-seed wrote its workspace
    // with the same opt-in, so we need to match it here to silent-unlock.
    // Dev/test only — packaged builds never pass --password-store=basic.
    if (
      app.commandLine.getSwitchValue('password-store') === 'basic' &&
      typeof safeStorage.setUsePlainTextEncryption === 'function'
    ) {
      safeStorage.setUsePlainTextEncryption(true);
      // eslint-disable-next-line no-console
      console.log('[main] safeStorage plaintext mode enabled (--password-store=basic)');
    }

    installCspHeader();
    buildHelpMenu();
    // WI-4′ — hydrate the read model from the local NDJSON event log BEFORE
    // handlers are registered, so the first IPC query sees real data (and the
    // dev-seed has run on first launch).
    //
    // #242: If bootstrap fails (corrupt dataset.json, schema mismatch, hydration
    // error), catch the error and register IPC handlers anyway so the renderer
    // can query boot status and show the BootErrorPage. The app remains in a
    // "boot failed" state; getEventLog() will throw if called.
    try {
      await initializeApp();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[main] Bootstrap failed:', err);
      // Continue to register IPC handlers so the renderer can query boot status
    }
    registerIpcHandlers(ipcMain);
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
