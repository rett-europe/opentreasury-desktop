# Session — Crypto spec v1.0 + ADR-001 sign-off

**Date:** 2026-04-19T09:04:31Z
**Requested by:** Pedro (perocha)
**Lead agent:** Switch

## Summary

Pedro closed the six open security questions from v0.1. Switch published the implementable crypto spec, bumped requirements to v0.2, and signed off ADR-001 (Proposed → Accepted) with 15 binding conditions. Option A (React + append-only JSON event log + SQLite read model) stands, but `age` is superseded by `sodium-native` XChaCha20-Poly1305 with a custom versioned envelope, Argon2id passphrase flow is rejected for v1 (OS-keychain only), `keytar` is forbidden in favor of `@napi-rs/keyring`, and filenames switch to ULID.

Key rulings: AR9 (Windows SmartScreen unsigned installers accepted), AR10 (macOS binary distribution deferred — source build only), update payload signing (R13.1) remains mandatory even though commercial-CA installer signing (R13.2) is deferred.

Neo, Morpheus, and Trinity are unblocked for implementation ticket breakdown. One non-blocking spike remains (Neo): 10k event files OneDrive stress test before GA.
