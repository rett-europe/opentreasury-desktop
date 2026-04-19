# `app/src/crypto/` — Crypto Primitives

**Audit target.** Switch (Security Engineer) reviews this folder as a single unit.

## Contract

- **No `electron` imports.** Ever.
- **No `node:fs` imports.** Ever.
- **Allowlisted deps only:** `sodium-native`, `@napi-rs/keyring`, `node:crypto`, `node:buffer`. Anything else = Switch review (ADR-001 C15).
- Pure functions: `Uint8Array` in → `Uint8Array` out. Side effects isolated to the single keychain adapter.

## Implementation bar

Every module in this folder must satisfy `docs/security/crypto-spec.md` v1.0.

| File (planned)  | Purpose                                                                                                      | Spec section       |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ------------------ |
| `envelope.ts`   | XChaCha20-Poly1305 AEAD envelope with AAD binding `record_type` / `record_id` / `dataset_id` / `dek_version` | §2.1 (C1, C2, C3)  |
| `sealed-box.ts` | X25519 sealed-box DEK wrapping                                                                               | §1                 |
| `signatures.ts` | Ed25519 sign / verify for escrow + audit entries                                                             | §3, §8 (C8, C10)   |
| `hash.ts`       | BLAKE2b helpers for audit chain                                                                              | §8                 |
| `keychain.ts`   | `@napi-rs/keyring` adapter — the ONLY file in this folder that imports it                                    | (C4)               |
| `escrow.ts`     | `escrow.json` read / write / canonical-JSON signing                                                          | §3, §4–§7 (C8, C9) |

## Rules for contributors

1. No roll-your-own crypto. Use the primitives from the spec.
2. Nonces are always 192-bit random via `crypto.randomBytes`. No counters. (C3)
3. DEK material stays in main-process memory — never crosses IPC, never logged. (C5)
4. Every public function covered by unit tests with AEAD round-trip + tamper-reject assertions.
5. Any change to this folder: PR flagged for Switch review (branch prefix `sec/*`).

## Traceability

- ADR-001 §9 conditions C1–C5, C14, C15
- `docs/security/crypto-spec.md` v1.0
- `docs/security/security-requirements-v0.1.md` v0.2 (R2, R3, R4)
