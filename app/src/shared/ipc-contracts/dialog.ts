// Dialog IPC contract — folder picker for data directory selection.
//
// Exposes a simple folder picker dialog via the main process. Used by the
// Settings screen to select a new data folder (P2-4 #156).

import { z } from 'zod';

export const IPC_DIALOG_PICK_FOLDER = 'dialog:pickFolder';

// dialog:pickFolder — no request payload
export const dialogPickFolderRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export type DialogPickFolderRequest = z.infer<typeof dialogPickFolderRequestSchema>;

// Response: either a path was selected, user cancelled, or an error occurred
export const dialogPickFolderResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    path: z.string(),
  }),
  z.object({
    ok: z.literal(true),
    path: z.null(),
    cancelled: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
]);

export type DialogPickFolderResponse = z.infer<typeof dialogPickFolderResponseSchema>;
