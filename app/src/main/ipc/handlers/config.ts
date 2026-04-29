// config:get IPC handler — P0-3 trial-readiness.
//
// Exposes the loaded app config to the renderer. The config is loaded at
// bootstrap and cached in memory. The `config:setDataDir` handler (P1-2 #149)
// will handle writes + relaunch logic.

import {
  configGetRequestSchema,
  type ConfigGetResponse,
} from '../../../shared/ipc-contracts/config.js';
import { getAppConfig } from '../../bootstrap.js';

export async function handleConfigGet(raw: unknown): Promise<ConfigGetResponse> {
  // Validate request (even though it's empty, belt-and-suspenders)
  configGetRequestSchema.parse(raw);

  const config = getAppConfig();
  return { ok: true, config };
}
