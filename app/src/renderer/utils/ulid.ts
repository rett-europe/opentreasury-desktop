// Renderer-safe ULID generator — WI-31b.
//
// The main-process generator in `app/src/main/ids.ts` relies on `node:crypto`,
// which is unavailable in the renderer (ADR-002 §4.1). Here we use the Web
// Crypto API (`crypto.getRandomValues`), which ships with every Electron
// renderer and every modern browser, to produce a 26-char Crockford-base32
// ULID compatible with the wire-level `z.string().length(26)` schemas.
//
// Layout (per the spec used by `main/ids.ts`):
//   - 10 chars of timestamp (ms since epoch, big-endian base32)
//   - 16 chars of cryptographic randomness
//
// Used to mint `correlationId` for bulk-update IPC calls (WI-31a/WI-31b).

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newUlid(): string {
  let time = Date.now();
  let timeChars = '';
  for (let i = 0; i < 10; i += 1) {
    timeChars = CROCKFORD[time % 32] + timeChars;
    time = Math.floor(time / 32);
  }

  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  let randChars = '';
  for (let i = 0; i < 16; i += 1) {
    randChars += CROCKFORD[rand[i]! % 32];
  }

  return timeChars + randChars;
}
