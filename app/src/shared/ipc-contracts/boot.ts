// Boot status IPC contract (#242).
//
// Exposes `app:bootStatus` so the renderer can check whether bootstrap/
// hydration succeeded or failed. If boot failed (corrupt dataset.json, schema
// mismatch, hydration error), the response includes error details so the
// renderer can show a full-screen BootErrorPage with actionable recovery steps.

import { z } from 'zod';

export const IPC_APP_BOOT_STATUS = 'app:bootStatus';

export const appBootStatusRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const bootErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  filePath: z.string().optional(),
  folderSchemaVersion: z.number().int().optional(),
  appSchemaVersion: z.number().int().optional(),
});

export const appBootStatusResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: bootErrorSchema,
  }),
]);

export type BootError = z.infer<typeof bootErrorSchema>;
export type AppBootStatusResponse = z.infer<typeof appBootStatusResponseSchema>;
