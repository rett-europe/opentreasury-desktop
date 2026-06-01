// SPEC-028 WI-1 (Tier 0) — Enriching EventLog wrapper.
//
// The single append-time enrichment choke-point (decision neo-028, OQ3). Wraps
// any EventLog so every event that flows through `append` / `appendBatch` is
// stamped with the who/what/when attribution envelope (actorUserId,
// actorDeviceId, actorIdentitySource, datasetId, createdAt) when it lacks it.
// Reads (`load`) are forwarded unchanged.
//
// Mirrors the transparent-wrapper shape of `eventLog-readonly-wrapper.ts`.
// Wired into `bootstrap.getEventLog()` so EVERY production mutation path —
// which sources its event log from `getEventLog()` at IPC handler registration
// — is covered without per-handler or per-schema changes.
//
// `getAttribution` is read lazily on each append so profile/identity updates
// that happen after handler registration are reflected, and `now` is injectable
// for deterministic tests.

import type { DomainEvent, EventLog } from '../core/eventLog/EventLog';
import { enrichEvent, type EventAttribution } from '../core/eventLog/enrichEvent';

/**
 * Wrap `inner` so writes are enriched with attribution at the append boundary.
 *
 * @param inner - The underlying EventLog (raw, un-enriched).
 * @param getAttribution - Resolves the current actor/device/dataset identity.
 *   Called once per `append` and once per `appendBatch` (not per event) so a
 *   batch shares a single consistent snapshot.
 * @param now - Clock used to fill `createdAt` when an event lacks it. Defaults
 *   to wall-clock; injectable for tests.
 * @returns An EventLog that enriches writes and forwards reads unchanged.
 */
export function createEnrichingEventLog(
  inner: EventLog,
  getAttribution: () => EventAttribution,
  now: () => Date = () => new Date(),
): EventLog {
  return {
    async append(event: DomainEvent): Promise<void> {
      const attribution = getAttribution();
      const nowIso = now().toISOString();
      await inner.append(enrichEvent(event, attribution, nowIso));
    },

    async appendBatch(events: readonly DomainEvent[]): Promise<void> {
      const attribution = getAttribution();
      const nowIso = now().toISOString();
      const enriched = events.map((event) => enrichEvent(event, attribution, nowIso));
      await inner.appendBatch(enriched);
    },

    async load(): Promise<DomainEvent[]> {
      return inner.load();
    },
  };
}
