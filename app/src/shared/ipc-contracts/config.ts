// App config IPC contract — P0-3 / P1-2 trial-readiness.
// Channels + Zod schemas for `config:get` and `config:setDataDir`.
//
// The app config is stored in userData/app-config.json and loaded at bootstrap.
// `config:setDataDir` (P1-2 #149) validates a candidate folder, persists the
// new dataDir, and schedules an app relaunch so the next boot picks up the
// new directory cleanly. Events are NOT migrated (fresh-start by design).

import { z } from 'zod';

export const IPC_CONFIG_GET = 'config:get';
export const IPC_CONFIG_SET_DATA_DIR = 'config:setDataDir';

// App config schema — mirrors app/src/main/config.ts appConfigSchema
export const appConfigSchema = z.object({
  version: z.number().int().positive().default(1),
  dataDir: z.string().nullable().default(null),
  previousDataDir: z.string().nullable().optional(),
  readOnly: z.boolean().default(false),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

// config:get — no request payload
export const configGetRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const configGetResponseSchema = z.object({
  ok: z.literal(true),
  config: appConfigSchema,
  effectiveDataDir: z.string(),
});

export type ConfigGetResponse = z.infer<typeof configGetResponseSchema>;

// config:setDataDir — caller supplies the candidate absolute path.
export const configSetDataDirRequestSchema = z.object({
  newDir: z.string().min(1),
  confirmDatasetSwitch: z.boolean().optional(),
});

export type ConfigSetDataDirRequest = z.infer<typeof configSetDataDirRequestSchema>;

// Error codes the renderer can pattern-match on.
// See docs/specs/error-codes.md for full catalogue with user-facing copy.
//
//   SCHEMA_INVALID               — request payload failed schema validation
//   SAME_DIR                     — newDir is the same as the currently-active dataDir
//   INVALID_LOCATION             — path is under userData (data must be external)
//   NOT_WRITABLE                 — directory cannot be created or written to
//   DATASET_MISMATCH             — target folder already contains a workspace whose
//                                   datasetId differs from the current one. Bypassable
//                                   via `confirmDatasetSwitch: true` when the folder
//                                   carries a valid dataset.json. Also fires for foreign
//                                   events without dataset.json (NOT bypassable).
//   SCHEMA_TOO_NEW               — target folder's dataset.json declares a schemaVersion
//                                   higher than this app build supports. NOT bypassable —
//                                   user must update the app.
//   SCHEMA_TOO_OLD_NO_MIGRATION  — target folder's dataset.json declares a schemaVersion
//                                   lower than this app build, but no migration path exists.
//                                   NOT bypassable (may become bypassable if migration added).
//   SCHEMA_MIGRATION_AVAILABLE   — target folder's dataset.json declares a schemaVersion
//                                   lower than this app build AND migration(s) exist.
//                                   Bypassable (user confirms migration or keeps old schema).
//   DATASET_CORRUPT              — target folder has a dataset.json that cannot be
//                                   parsed (invalid JSON or fails schema validation).
//                                   NOT bypassable.
//   WRITE_FAILED                 — persisting app-config.json failed (disk full, etc.)
export const configSetDataDirErrorCodeSchema = z.enum([
  'SCHEMA_INVALID',
  'SAME_DIR',
  'INVALID_LOCATION',
  'NOT_WRITABLE',
  'DATASET_MISMATCH',
  'SCHEMA_TOO_NEW',
  'SCHEMA_TOO_OLD_NO_MIGRATION',
  'SCHEMA_MIGRATION_AVAILABLE',
  'DATASET_CORRUPT',
  'WRITE_FAILED',
]);

export type ConfigSetDataDirErrorCode = z.infer<typeof configSetDataDirErrorCodeSchema>;

export const configSetDataDirResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: configSetDataDirErrorCodeSchema,
      message: z.string(),
      details: z
        .object({
          currentDatasetId: z.string().optional(),
          newDatasetId: z.string().optional(),
          schemaVersion: z.number().int().optional(),
          folderSchemaVersion: z.number().int().optional(),
          appSchemaVersion: z.number().int().optional(),
        })
        .optional(),
    }),
  }),
]);

export type ConfigSetDataDirResponse = z.infer<typeof configSetDataDirResponseSchema>;
