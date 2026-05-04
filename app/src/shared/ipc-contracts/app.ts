// App IPC contract — application-level queries.
// Provides read-only access to Electron app metadata (version, etc.).

import { z } from 'zod';

export const IPC_APP_GET_VERSION = 'app:get-version';

// app:get-version — returns the application version string from package.json
export const appGetVersionRequestSchema = z.object({});

export type AppGetVersionRequest = z.infer<typeof appGetVersionRequestSchema>;

export const appGetVersionResponseSchema = z.object({
  version: z.string(),
});

export type AppGetVersionResponse = z.infer<typeof appGetVersionResponseSchema>;
