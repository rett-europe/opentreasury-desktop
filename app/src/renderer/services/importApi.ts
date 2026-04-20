// Import API client — thin wrapper over window.opentreasury.import.*
// Mirrors accountsApi pattern. Part of WI-17 (Trinity).

import type {
  StageFileRequest,
  StageFileResponse,
  DryRunRequest,
  DryRunResponse,
  CommitImportRequest,
  CommitImportResponse,
  LastMappingRequest,
  LastMappingResponse,
} from '../../shared/ipc-contracts/import.js';

/** Stage a file for import (reads file, detects sheets/columns). */
export async function stageFile(input: StageFileRequest): Promise<StageFileResponse> {
  return window.opentreasury.import.stageFile(input);
}

/** Run dry-run preview with column mapping. */
export async function dryRun(input: DryRunRequest): Promise<DryRunResponse> {
  return window.opentreasury.import.dryRun(input);
}

/** Commit the import after user confirms. */
export async function commit(input: CommitImportRequest): Promise<CommitImportResponse> {
  return window.opentreasury.import.commit(input);
}

/** Retrieve last-used column mapping for an account. */
export async function getLastMapping(input: LastMappingRequest): Promise<LastMappingResponse> {
  return window.opentreasury.import.getLastMapping(input);
}
