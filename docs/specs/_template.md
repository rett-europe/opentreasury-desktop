# SPEC-NNN — {Feature Name}

> **Status:** Draft · **Owner:** {Agent} · **Last updated:** YYYY-MM-DD
> **Paired PRD:** `docs/product/prds/{feature}.md`
> **Paired UX:** `docs/ux/NNN-{feature}.md`
> **Paired Design:** `docs/design/NNN-{feature}.md`

---

## 1. Summary

One paragraph. What this feature does from the user's perspective and why it exists in v1.

## 2. Problem

The user pain this solves. Cite PRD evidence.

## 3. Users & Scenarios

Primary persona(s) and the concrete scenarios this spec covers. Reference
[`docs/product/vision.md`](../product/vision.md) §2 personas where applicable.

**Scenario A:** …
**Scenario B:** …

## 4. Requirements

### 4.1 Functional

- FR1 — …
- FR2 — …

### 4.2 Non-functional

- NFR1 — performance / latency bounds.
- NFR2 — offline behavior (vision §7 Principle 5).
- NFR3 — accessibility.

## 5. UX Notes

High-level UX intent. Full flows live in the paired UX spec. Call out anything that
constrains architecture (e.g., "list must render 10k rows without pagination — implies
virtualized scrolling and indexed read model").

## 6. Data Model

### 6.1 Domain events

List every event type this feature produces or consumes. Reference Zod schemas in
`app/src/shared/events/`.

| Event type | Fields | Produced by | Consumed by |
|---|---|---|---|
| `tx.created` | `{ id, account_id, … }` | Command `createTransaction` | Read-model reducer, audit log |

### 6.2 Read-model projections

Which derived read-model tables this feature touches (in `app/src/read-model/`).

### 6.3 File layout on OneDrive

If the feature writes new file categories under `{dataset-root}/`, describe them.
Filenames MUST be opaque (ULID — see ADR-001 C11 / R3).

## 7. IPC Surface

List every IPC channel this feature adds or modifies. Every entry MUST reference the
Zod schema in `app/src/shared/ipc-contracts/`.

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `tx:create` | renderer → main | `TxCreateRequest` | `TxCreateResponse` |

Schema violations MUST be rejected at the boundary (R12, C13).

## 8. Security Considerations

Explicit mapping, not "we'll think about it later":

- **AEAD envelope:** every new file type uses the envelope from
  [`crypto-spec.md`](../security/crypto-spec.md) §2.1. AAD binds `record_type`, `record_id`,
  `dataset_id`, `dek_version`. (C1, C2)
- **Nonces:** 192-bit random via `crypto.randomBytes`. (C3)
- **Audit entries:** list every action this feature produces an audit entry for,
  matching the `action` enum in crypto-spec §8.2. (C10, R8)
- **Renderer isolation:** confirm no new code imports from `src/main/` or `src/crypto/`
  into `src/renderer/`. (C6, R11)
- **PII in logs:** list any fields this feature touches that must be redacted. (R15)
- **Input validation:** all external inputs (CSV, user forms) validated with Zod
  before reaching core. (R17)

If the feature does NOT touch encrypted data, crypto, keys, IPC, fs, or logging, say so
explicitly: *"This spec does not interact with Switch-owned domains."*

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- …

### 9.2 Integration (Vitest, in-memory storage adapter)

- Round-trip: command → event → read-model → query produces expected results.
- AEAD envelope round-trip with tampered ciphertext → decrypt fails.

### 9.3 E2E (Playwright against built Electron binary)

- Happy path from UI click to persisted event to UI re-render.
- Offline path (storage adapter in degraded mode).

## 10. Acceptance Criteria

Testable, binary outcomes. Each maps to a test.

- [ ] AC1 — …
- [ ] AC2 — …

## 11. Traceability

- **PRD:** `docs/product/prds/{feature}.md`
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md)
- **ADR-001 conditions satisfied:** C{list}
- **Security requirements satisfied:** R{list}
- **Crypto-spec sections:** §{list} (if applicable)
- **Paired UX:** `docs/ux/NNN-{feature}.md`
- **Paired Design:** `docs/design/NNN-{feature}.md`
- **Supersedes / Superseded by:** —

## 12. Open Questions

Numbered for easy reply. These block moving this spec from In Review → Accepted.

1. …
2. …

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| YYYY-MM-DD | Draft | {Agent} | Initial draft |
