// SPEC-027 — renderer-side export constants.
//
// The mistype lockout state machine lives in the renderer because the typed
// confirmation word is validated client-side and never crosses IPC (it must
// never be logged or transmitted). Main remains authoritative for the
// rate-limit (3 exports / 15 min), which is persisted MK-encrypted; these
// renderer constants only govern the *typed-confirmation* lockout UX.

/** FR9 — v1 hard cap on exported rows (after split expansion in main). */
export const MAX_EXPORT_ROWS = 100_000;

/** Gate condition 4 — consecutive mistypes before a cooldown is imposed. */
export const MISTYPE_LOCKOUT_THRESHOLD = 5;

/** Gate condition 4 — cooldown duration after the threshold is reached. */
export const MISTYPE_LOCKOUT_MS = 5 * 60 * 1000;

/** The locale-specific word the treasurer must type to confirm an export. */
export const CONFIRM_WORD = {
  es: 'EXPORTAR',
  en: 'EXPORT',
} as const;
