// SPEC-030 §8 — Report PDF renderer + atomic writer (main process).
//
// `renderHtmlToPdf(html)` renders a self-contained HTML document to a PDF Buffer
// using an OFFSCREEN, sandboxed BrowserWindow + `webContents.printToPDF`:
//   - `show: false` (never visible), `sandbox: true`, `nodeIntegration: false`,
//     `contextIsolation: true`, `webSecurity: true`, NO preload.
//   - The HTML is loaded via a `data:text/html` URL — no temp file, no remote
//     content, no file:// access. Combined with the template's strict CSP this
//     keeps the render context inert.
//
// `writeReportPdf(buffer, destPath)` performs the SPEC-027 atomic write:
// write to a hidden `.partial` temp file in the destination directory, then
// `fs.rename` into place (rename is atomic within a directory).
//
// Electron is imported lazily so unit tests of the pure pieces (template/model)
// don't need the electron mock, and integration tests can `vi.mock('electron')`.

import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';

/** A4 portrait with 18mm top/bottom + 20mm left/right print margins (design §4). */
const PRINT_TO_PDF_OPTIONS = {
  pageSize: 'A4' as const,
  landscape: false,
  printBackground: true,
  margins: {
    // electron printToPDF margins are in INCHES. 18mm ≈ 0.709", 20mm ≈ 0.787".
    top: 18 / 25.4,
    bottom: 18 / 25.4,
    left: 20 / 25.4,
    right: 20 / 25.4,
  },
};

/**
 * Render a self-contained HTML string to a PDF buffer. The HTML MUST inline all
 * assets (CSS + logo data URL) — no external/remote resources are loadable.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  // Lazy import so importing this module doesn't require electron at load time.
  const { BrowserWindow } = await import('electron');

  const win = new BrowserWindow({
    show: false,
    width: 794, // ~A4 @96dpi, purely the offscreen layout viewport
    height: 1123,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      offscreen: true,
      javascript: false,
    },
  });

  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await win.loadURL(dataUrl);
    const pdf = await win.webContents.printToPDF(PRINT_TO_PDF_OPTIONS);
    return pdf;
  } finally {
    win.destroy();
  }
}

function tempPathFor(destPath: string): string {
  const dir = nodePath.dirname(destPath);
  const base = nodePath.basename(destPath);
  return nodePath.join(dir, `.${base}.${process.pid}.${Date.now()}.partial`);
}

/** Atomically write the PDF bytes to `destPath` (temp file → rename). */
export async function writeReportPdf(buffer: Buffer, destPath: string): Promise<void> {
  const tmpPath = tempPathFor(destPath);
  await fs.writeFile(tmpPath, buffer, { mode: 0o600 });
  try {
    await fs.rename(tmpPath, destPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}
