// Main-process runtime ULID generator — WI-12.
//
// P1-1 trial-readiness: The `DATASET_ID` and `ACTOR_DEVICE_ID` constants have
// been removed. These values are now sourced from:
//   - device.json (per-laptop device ID) — loaded at bootstrap
//   - dataset.json (per-data-folder dataset ID) — loaded at bootstrap
//   - profile.json (per-user actor ID) — loaded at bootstrap (P0-2)
//
// `newUlid()` returns a real 26-char Crockford-base32 ULID (ADR-001 C11):
// 10 timestamp chars + 16 cryptographically random chars. Kept in main/ since
// it depends on node:crypto which is unavailable in the renderer (C7).

import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

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
