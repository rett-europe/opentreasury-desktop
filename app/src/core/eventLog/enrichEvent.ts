// SPEC-028 WI-1 (Tier 0) — Append-time event attribution enrichment.
//
// Pure, Electron-free helper (ADR-002 §2.4: core/eventLog stays transport-free)
// that turns the append-only event log into a complete who/what/when ledger.
//
// The resolved decision (.squad/decisions/neo-028-anchor-dont-resign.md, OQ3)
// mandates a SINGLE append-time enrichment choke-point at the event-log
// boundary rather than per-schema edits. Enrichment is ADDITIVE and
// back-compatible:
//   - It only fills attribution fields that are missing/empty.
//   - It NEVER overwrites a value an event already carries.
//   - It NEVER changes the meaning of existing fields, so existing readers /
//     projections / reducers that ignore the new fields keep working.
//
// Five attribution fields make up the who/what/when envelope:
//   actorUserId, actorDeviceId, actorIdentitySource  → who
//   datasetId                                         → which dataset
//   createdAt                                         → when (append time when
//                                                       the event carries only
//                                                       updatedAt/archivedAt/…)

import type { DomainEvent } from '../events/schemas';

/**
 * Identity stamped onto events that lack it. Sourced at append time from the
 * main-process bootstrap (device id, dataset id, loaded profile).
 */
export interface EventAttribution {
  actorUserId: string;
  actorDeviceId: string;
  actorIdentitySource: 'local' | 'aad';
  datasetId: string;
}

/**
 * Sentinel actor used when a data mutation is appended before a user profile
 * exists (profile pending, e.g. early in onboarding). Matches the placeholder
 * the transaction IPC handlers already use so attribution stays consistent
 * across the whole log. The choke-point stamps this rather than blocking the
 * write (SPEC-028 WI-1 decision: never block mutations).
 */
export const PROFILE_PENDING_USER_ID = 'PROFILE_PENDING000000000';

/** The five attribution fields that make an event a complete who/what/when entry. */
export const ATTRIBUTION_FIELDS = [
  'actorUserId',
  'actorDeviceId',
  'actorIdentitySource',
  'datasetId',
  'createdAt',
] as const;

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Return a copy of `event` with any missing attribution field filled from
 * `attribution` (and `createdAt` filled with `nowIso` when absent). Present
 * values are preserved verbatim — enrichment is fill-if-missing, never
 * overwrite. The `type` discriminator and every payload field are untouched.
 */
export function enrichEvent(
  event: DomainEvent,
  attribution: EventAttribution,
  nowIso: string,
): DomainEvent {
  const record = event as unknown as Record<string, unknown>;
  const enriched: Record<string, unknown> = { ...record };

  if (isMissing(record.actorUserId)) enriched.actorUserId = attribution.actorUserId;
  if (isMissing(record.actorDeviceId)) enriched.actorDeviceId = attribution.actorDeviceId;
  if (isMissing(record.actorIdentitySource)) {
    enriched.actorIdentitySource = attribution.actorIdentitySource;
  }
  if (isMissing(record.datasetId)) enriched.datasetId = attribution.datasetId;
  if (isMissing(record.createdAt)) enriched.createdAt = nowIso;

  return enriched as unknown as DomainEvent;
}

function isUlidShaped(value: unknown): value is string {
  return typeof value === 'string' && value.length === 26;
}

/**
 * Strict predicate: does `event` carry a complete, well-formed who/what/when
 * envelope? Requires 26-char ULID-shaped actor/device/dataset ids, a valid
 * `actorIdentitySource` enum, and a parseable ISO `createdAt`. Used by the
 * full-union coverage test so a bogus/sentinel value cannot produce a false
 * pass under a real identity provider.
 */
export function eventHasAttribution(event: DomainEvent): boolean {
  const record = event as unknown as Record<string, unknown>;
  return (
    isUlidShaped(record.actorUserId) &&
    isUlidShaped(record.actorDeviceId) &&
    isUlidShaped(record.datasetId) &&
    (record.actorIdentitySource === 'local' || record.actorIdentitySource === 'aad') &&
    typeof record.createdAt === 'string' &&
    record.createdAt.length > 0 &&
    !Number.isNaN(Date.parse(record.createdAt))
  );
}
