// App config IPC contract — P0-3 trial-readiness.
// Channel + Zod schemas for `config:get`.
//
// The app config is stored in userData/app-config.json and loaded at bootstrap.
// The `config:setDataDir` handler (P1-2 #149) will handle writes + relaunch.

import { z } from 'zod';

export const IPC_CONFIG_GET = 'config:get';

// App config schema — mirrors app/src/main/config.ts appConfigSchema
export const appConfigSchema = z.object({
  version: z.number().int().positive().default(1),
  dataDir: z.string().nullable().default(null),
  readOnly: z.boolean().default(false),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// config:get — no request payload
export const configGetRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const configGetResponseSchema = z.object({
  ok: z.literal(true),
  config: appConfigSchema,
});

export type ConfigGetResponse = z.infer<typeof configGetResponseSchema>;
