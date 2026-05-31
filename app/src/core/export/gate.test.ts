// SPEC-027 §12 (Option A) — Export gate state-machine unit tests (Cypher).

import { describe, it, expect } from 'vitest';
import {
  LOCKOUT_MS,
  LOCKOUT_THRESHOLD,
  RATE_LIMIT_MAX,
  RATE_WINDOW_MS,
  canStartExport,
  clearExpiredLockout,
  emptyGateState,
  recordCorrectConfirmation,
  recordExportAttempt,
  recordMistype,
  type GateState,
} from './gate.js';

const T0 = 1_700_000_000_000;

describe('rate limit (3 runs / 15 min)', () => {
  it('allows up to RATE_LIMIT_MAX attempts in the window', () => {
    let state: GateState = emptyGateState();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(canStartExport(state, T0).allowed).toBe(true);
      state = recordExportAttempt(state, T0);
    }
    const decision = canStartExport(state, T0);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe('EXPORT_RATE_LIMITED');
      expect(decision.retryAfterMs).toBe(RATE_WINDOW_MS);
    }
  });

  it('frees a slot once the oldest attempt ages out of the window', () => {
    let state: GateState = emptyGateState();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) state = recordExportAttempt(state, T0);
    // Just past the window relative to the first attempt.
    const later = T0 + RATE_WINDOW_MS + 1;
    expect(canStartExport(state, later).allowed).toBe(true);
  });

  it('reports a positive retryAfterMs while still throttled', () => {
    let state: GateState = emptyGateState();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) state = recordExportAttempt(state, T0);
    const mid = T0 + RATE_WINDOW_MS / 2;
    const decision = canStartExport(state, mid);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.retryAfterMs).toBeGreaterThan(0);
  });
});

describe('lockout (5 mistypes → 5 min)', () => {
  it('trips a lockout at the threshold', () => {
    let state: GateState = emptyGateState();
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      state = recordMistype(state, T0);
      expect(state.lockedUntil).toBeNull();
    }
    state = recordMistype(state, T0);
    expect(state.lockedUntil).toBe(T0 + LOCKOUT_MS);
    expect(state.mistypes).toBe(0);

    const decision = canStartExport(state, T0);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe('EXPORT_LOCKED_OUT');
  });

  it('clears an expired lockout', () => {
    let state: GateState = emptyGateState();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) state = recordMistype(state, T0);
    const after = clearExpiredLockout(state, T0 + LOCKOUT_MS);
    expect(after.lockedUntil).toBeNull();
    expect(canStartExport(after, T0 + LOCKOUT_MS).allowed).toBe(true);
  });

  it('keeps an unexpired lockout intact', () => {
    let state: GateState = emptyGateState();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) state = recordMistype(state, T0);
    const after = clearExpiredLockout(state, T0 + LOCKOUT_MS - 1);
    expect(after.lockedUntil).toBe(T0 + LOCKOUT_MS);
  });

  it('resets the mistype counter on a correct confirmation', () => {
    let state: GateState = emptyGateState();
    state = recordMistype(state, T0);
    state = recordMistype(state, T0);
    expect(state.mistypes).toBe(2);
    state = recordCorrectConfirmation(state);
    expect(state.mistypes).toBe(0);
  });

  it('does not create a new object when there is nothing to reset', () => {
    const state = emptyGateState();
    expect(recordCorrectConfirmation(state)).toBe(state);
  });
});
