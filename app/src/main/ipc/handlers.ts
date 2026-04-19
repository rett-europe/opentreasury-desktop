// IPC handler registry (ADR-001 C6, C13 / ADR-002 §4.1).
// Every handler validates its request with the Zod schema in schemas.ts BEFORE any logic runs.
// Validation failure = throw; never silently coerce.
//
// Scaffold only — only a ping handler wired.
import type { IpcMain } from 'electron';
import { IpcSchemas } from './schemas.js';

export function registerIpcHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('app:ping', (_event, raw: unknown) => {
    const parsed = IpcSchemas['app:ping'].request.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Invalid app:ping payload: ${parsed.error.message}`);
    }
    const response = { ok: true as const, ts: Date.now() };
    // TODO(C13): validate the response too — belt-and-suspenders on the main side.
    return IpcSchemas['app:ping'].response.parse(response);
  });

  // TODO: wire real handlers from src/core/commands/ as features ship.
}
