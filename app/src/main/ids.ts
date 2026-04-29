// Main-process runtime IDs + ULID generator — WI-12.
//
// `datasetId` / `actorDeviceId` are stable per-app identifiers that stamp every
// DomainEvent envelope. Until M2 ships proper account provisioning these use
// the same deterministic "fake ULID" values that devSeed.ts writes, so new
// transactions sit in the same dataset as the seeded ones.
//
// `newUlid()` returns a real 26-char Crockford-base32 ULID (ADR-001 C11):
// 10 timestamp chars + 16 cryptographically random chars. Kept in main/ since
// it depends on node:crypto which is unavailable in the renderer (C7).

import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function fakeUlid(seedKey: string): string {
  const upper = seedKey.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

export const DATASET_ID = fakeUlid('DATASET01');
export const ACTOR_DEVICE_ID = fakeUlid('DEVICE01');
// P0-1 trial-readiness — temporary placeholder until P0-2 profile.json loads this
export const ACTOR_USER_ID = fakeUlid('USER01');

export function newUlid(): string {
  let time = Date.now();
  let timeChars = '';
  for (let i = 0; i < 10; i++) {
    timeChars = CROCKFORD[time % 32] + timeChars;
    time = Math.floor(time / 32);
  }

  const rand = randomBytes(16);
  let randChars = '';
  for (let i = 0; i < 16; i++) {
    randChars += CROCKFORD[rand[i]! % 32];
  }

  return timeChars + randChars;
}
