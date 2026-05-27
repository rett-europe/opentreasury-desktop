// query:rehydrate IPC handler factory.
//
// Thin orchestration over `rehydrateFromDisk()`: validate the (empty) request,
// run the rehydrate, and re-validate the response so the renderer always
// receives a schema-conformant payload. Surfaces failure as a typed
// `{ ok: false, error }` discriminant rather than throwing — the renderer's
// Refresh button branches on this to show a toast instead of crashing the
// view.

import {
  queryRehydrateRequestSchema,
  queryRehydrateResponseSchema,
  type QueryRehydrateResponse,
} from '../../../shared/ipc-contracts/query.js';

export interface QueryRehydrateDeps {
  readonly rehydrateFromDisk: () => Promise<QueryRehydrateResponse>;
}

export function createQueryRehydrateHandler(
  deps: QueryRehydrateDeps,
): (raw: unknown) => Promise<QueryRehydrateResponse> {
  return async function handleQueryRehydrate(raw: unknown): Promise<QueryRehydrateResponse> {
    queryRehydrateRequestSchema.parse(raw ?? {});
    const result = await deps.rehydrateFromDisk();
    return queryRehydrateResponseSchema.parse(result);
  };
}
