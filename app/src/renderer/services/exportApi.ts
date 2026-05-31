// Export API client — thin wrapper over window.opentreasury.export.*
// SPEC-027 (Trinity). The renderer never receives plaintext rows or file
// paths: `prepare` opens the OS save dialog in main and returns only a
// one-shot confirmation token + metadata; `run` carries only that token.

import type {
  ExportPrepareRequest,
  ExportPrepareResponse,
  ExportRunResponse,
  ExportRevealResponse,
  ExportProgress,
} from '../../shared/ipc-contracts/export.js';

export async function prepareExport(req: ExportPrepareRequest): Promise<ExportPrepareResponse> {
  return window.opentreasury.export.prepare(req);
}

export async function runExport(confirmationToken: string): Promise<ExportRunResponse> {
  return window.opentreasury.export.run({ confirmationToken });
}

export async function revealLastExport(): Promise<ExportRevealResponse> {
  return window.opentreasury.export.reveal();
}

/** Subscribe to main→renderer export progress. Returns an unsubscribe fn. */
export function onExportProgress(cb: (progress: ExportProgress) => void): () => void {
  return window.opentreasury.export.onProgress(cb);
}
