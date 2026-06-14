// SPEC-030 (WI-3) — ReportsScreen constants.

/**
 * Confirmation-token TTL mirror (WI-2 contract: token TTL ≤ 60s, single-use).
 * The renderer arms a matching timer after a successful build so the Generate
 * action is disabled in-place once the token can no longer be valid; the main
 * process remains the source of truth and still rejects a stale token.
 */
export const TOKEN_TTL_MS = 60_000;
