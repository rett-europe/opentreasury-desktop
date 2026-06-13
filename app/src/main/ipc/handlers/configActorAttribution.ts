// #388 — Shared actor/device stamping for the config/taxonomy command handlers
// (accounts / categories / subcategories / tags).
//
// The PascalCase config event stream historically recorded *what* + *when* but
// not *who* — so the Audit & Evidence change-history viewer rendered those rows
// as `author: unknown` / device `—` even when the current user performed the
// action. This helper stamps `actorUserId` / `actorDeviceId` onto each config
// event at append time, sourced from the active profile/device exactly like the
// `tx.*` handlers, so newly written events become attributable.
//
// Fields are OPTIONAL on the wire (see schemas.ts `configActorAttributionFields`)
// and are only stamped when the wiring supplies them, so the bootstrap path and
// unit tests that omit them keep producing valid, backward-compatible events.

export interface ActorAttributionSource {
  readonly actorUserId?: string;
  readonly actorDeviceId?: string;
}

/**
 * Return a copy of `event` with `actorUserId` / `actorDeviceId` stamped from
 * `source` when present. Never overwrites fields the event already carries and
 * never adds a field the source does not provide, so legacy/no-actor callers
 * are unaffected.
 */
export function stampActorAttribution<E extends object>(
  source: ActorAttributionSource,
  event: E,
): E {
  return {
    ...event,
    ...(source.actorUserId !== undefined ? { actorUserId: source.actorUserId } : {}),
    ...(source.actorDeviceId !== undefined ? { actorDeviceId: source.actorDeviceId } : {}),
  } as E;
}
