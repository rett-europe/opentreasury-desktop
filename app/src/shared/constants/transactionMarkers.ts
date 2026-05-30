// Reusable markers embedded in transaction `details` so future search/filter
// code can recognise specially-authored transactions without parsing copy.
//
// Initially used by the account balance-adjustment flow (CuentasTab →
// BalanceAdjustmentModal): the modal creates a regular transaction carrying
// this marker so it can later be detected without a dedicated event flag.
// If a structured `isBalanceAdjustment` flag is added to the transaction
// event in the future, this marker remains as a backward-compatible fallback
// for events written before the flag existed.

/** Sentinel substring stored in `Transaction.details` for balance-adjustment txs. */
export const ADJUSTMENT_DETAILS_MARKER = '[balance-adjustment]';
