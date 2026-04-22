// Saldo API client — thin wrapper over the window.opentreasury.saldo IPC
// bridge. Validates the response with Zod (belt-and-suspenders alongside
// the main-side validation in `handlers.ts`).

import {
  saldoComparisonResponseSchema,
  type SaldoComparisonRequest,
  type SaldoComparisonResponse,
} from '../../shared/ipc-contracts/saldo';

/**
 * Fetch the Saldo comparison payload for the given period + anchor.
 * Server computes all derived fields (including partial-period projection)
 * — renderer renders them verbatim (server-derived-fields pattern).
 */
export async function getSaldoComparison(
  req: SaldoComparisonRequest,
): Promise<SaldoComparisonResponse> {
  const raw = await window.opentreasury.saldo.getComparison(req);
  return saldoComparisonResponseSchema.parse(raw);
}
