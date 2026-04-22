// Saldo IPC handlers — WI-22.
// Thin projection over `core/query/saldo.getSaldoComparison`. Request + response
// Zod validation lives alongside the other handler registrations in
// `main/ipc/handlers.ts` (ADR-001 C13, belt-and-suspenders on both sides).

import type {
  SaldoComparisonRequest,
  SaldoComparisonResponse,
} from '../../../shared/ipc-contracts/saldo.js';
import { getSaldoComparison as coreGetSaldoComparison } from '../../../core/query/index.js';

export async function handleGetSaldoComparison(
  request: SaldoComparisonRequest,
): Promise<SaldoComparisonResponse> {
  return coreGetSaldoComparison(request);
}
