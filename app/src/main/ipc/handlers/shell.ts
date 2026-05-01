// shell:openPath IPC handler — opens a folder/file in the OS file explorer.
//
// Lives in main because Electron's `shell` module is stripped/undefined in
// sandboxed preloads; the renderer therefore cannot call it directly across
// contextBridge. Refuses to reveal anything inside the app's userData.

import { app, shell } from 'electron';
import * as path from 'node:path';
import {
  shellOpenPathRequestSchema,
  type ShellOpenPathResponse,
} from '../../../shared/ipc-contracts/shell.js';

export async function handleShellOpenPath(raw: unknown): Promise<ShellOpenPathResponse> {
  const parsed = shellOpenPathRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid request' };
  }

  const target = path.resolve(parsed.data.path);
  const userData = path.resolve(app.getPath('userData'));

  if (target === userData || target.startsWith(userData + path.sep)) {
    return { ok: false, error: 'Refused to open application data folder.' };
  }

  const result = await shell.openPath(target);
  if (result) {
    return { ok: false, error: result };
  }
  return { ok: true };
}
