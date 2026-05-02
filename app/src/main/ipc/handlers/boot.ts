// app:bootStatus IPC handler (#242).
//
// Returns whether bootstrap/hydration succeeded or failed. If boot failed
// (corrupt dataset.json, schema version mismatch, events.ndjson corruption,
// or hydration logic error), returns the error details so the renderer can
// show a BootErrorPage with actionable recovery steps (restore from backup,
// pick a different folder, contact support).

import {
  appBootStatusRequestSchema,
  type AppBootStatusResponse,
} from '../../../shared/ipc-contracts/boot.js';
import { getBootstrapError } from '../../bootstrap.js';

export function createAppBootStatusHandler() {
  return async function handleAppBootStatus(raw: unknown): Promise<AppBootStatusResponse> {
    appBootStatusRequestSchema.parse(raw);

    const error = getBootstrapError();

    if (error) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          filePath: error.filePath,
          folderSchemaVersion: error.folderSchemaVersion,
          appSchemaVersion: error.appSchemaVersion,
        },
      };
    }

    return { ok: true };
  };
}
