// SPEC-027 §12 / OQ1 (Option A) — Export gate state machine (pure).
//
// Two independent throttles, modelled as pure transitions over an explicit
// state object so they can be unit-tested and persisted (MK-encrypted) by the
// main process:
//
//   - Rate limit: at most 3 export RUNS per rolling 15-minute window.
//   - Lockout: 5 consecutive confirmation mistypes → 5-minute cooldown.
//
// This module never sees the typed confirmation word — callers compare the word
// and only report "correct" / "mistype". No timers here; `now` is injected.

export const RATE_LIMIT_MAX = 3;
export const RATE_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

export interface GateState {
  /** Epoch-ms timestamps of recent export run attempts (rolling window). */
  readonly attempts: readonly number[];
  /** Consecutive confirmation mistypes since the last success/lockout. */
  readonly mistypes: number;
  /** Epoch-ms until which exports are locked out, or null. */
  readonly lockedUntil: number | null;
}

export function emptyGateState(): GateState {
  return { attempts: [], mistypes: 0, lockedUntil: null };
}

export type GateDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly code: 'EXPORT_RATE_LIMITED' | 'EXPORT_LOCKED_OUT';
      readonly retryAfterMs: number;
    };

/** Drop attempts that have aged out of the rolling window. */
function prune(attempts: readonly number[], now: number): number[] {
  const cutoff = now - RATE_WINDOW_MS;
  return attempts.filter((t) => t > cutoff);
}

/** Clear an expired lockout. Returns possibly-updated state. */
export function clearExpiredLockout(state: GateState, now: number): GateState {
  if (state.lockedUntil !== null && now >= state.lockedUntil) {
    return { ...state, lockedUntil: null };
  }
  return state;
}

/**
 * Whether an export RUN may start now. Does not mutate; call
 * `recordExportAttempt` once the run is actually permitted to proceed.
 */
export function canStartExport(state: GateState, now: number): GateDecision {
  if (state.lockedUntil !== null && now < state.lockedUntil) {
    return { allowed: false, code: 'EXPORT_LOCKED_OUT', retryAfterMs: state.lockedUntil - now };
  }
  const recent = prune(state.attempts, now);
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = Math.min(...recent);
    return {
      allowed: false,
      code: 'EXPORT_RATE_LIMITED',
      retryAfterMs: Math.max(0, oldest + RATE_WINDOW_MS - now),
    };
  }
  return { allowed: true };
}

/** Record that an export run attempt occurred (counts toward the rate limit). */
export function recordExportAttempt(state: GateState, now: number): GateState {
  return { ...state, attempts: [...prune(state.attempts, now), now] };
}

/** Record a confirmation mistype; trips the lockout at the threshold. */
export function recordMistype(state: GateState, now: number): GateState {
  const mistypes = state.mistypes + 1;
  if (mistypes >= LOCKOUT_THRESHOLD) {
    return { ...state, mistypes: 0, lockedUntil: now + LOCKOUT_MS };
  }
  return { ...state, mistypes };
}

/** Record a correct confirmation; resets the mistype counter. */
export function recordCorrectConfirmation(state: GateState): GateState {
  if (state.mistypes === 0) return state;
  return { ...state, mistypes: 0 };
}
