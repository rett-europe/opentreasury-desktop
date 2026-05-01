// Shell IPC contract — open a filesystem path in the OS file explorer.
//
// Provides the shell:openPath channel, a thin IPC wrapper around Electron's
// shell.openPath. Lives in main because shell APIs are stripped from
// sandboxed preloads when imported renderer-side.
//
// Used by Preferences → Dataset → Export → "Open folder" button.

import { z } from 'zod';

export const IPC_SHELL_OPEN_PATH = 'shell:openPath';

export const shellOpenPathRequestSchema = z.object({
  path: z.string().min(1),
});
export type ShellOpenPathRequest = z.infer<typeof shellOpenPathRequestSchema>;

// shell.openPath returns "" on success and a non-empty error string on
// failure; we normalise that into a discriminated union for the renderer.
export const shellOpenPathResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type ShellOpenPathResponse = z.infer<typeof shellOpenPathResponseSchema>;
