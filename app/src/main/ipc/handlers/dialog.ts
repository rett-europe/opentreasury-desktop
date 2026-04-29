// dialog:pickFolder IPC handler — folder picker for data directory selection.
//
// Wraps Electron's dialog.showOpenDialog to let the renderer pick a folder.
// Used by Settings screen for the "Change folder" button (P2-4 #156).

import { dialog, BrowserWindow } from 'electron';
import {
  dialogPickFolderRequestSchema,
  type DialogPickFolderResponse,
} from '../../../shared/ipc-contracts/dialog.js';

export async function handleDialogPickFolder(raw: unknown): Promise<DialogPickFolderResponse> {
  // Validate request (empty but belt-and-suspenders)
  dialogPickFolderRequestSchema.parse(raw);

  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(focusedWindow ?? undefined!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select data folder',
    });

    if (result.canceled) {
      return { ok: true, path: null, cancelled: true };
    }

    // filePaths is an array; we only allow single selection
    const selectedPath = result.filePaths[0];
    if (!selectedPath) {
      return { ok: true, path: null, cancelled: true };
    }

    return { ok: true, path: selectedPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
