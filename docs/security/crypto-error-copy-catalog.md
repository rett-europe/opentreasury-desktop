# OpenTreasury Desktop — Crypto / Trust / Integrity Error Copy Catalog

> **Status:** v1.0 (Ratified) · **Owner:** Switch (Security Engineer, final say) · **Date:** 2026-04-19
> **Scope:** Authoritative catalog of user-facing strings (ES + EN) for every crypto-, trust-, and integrity-related failure mode in v1. Every UX spec that surfaces one of these failures MUST reference a scenario ID here (CE-XXX) rather than inventing copy inline.
> **Authority:** Per team decision 2026-04-19, Switch has non-negotiable final say on security. This catalog is the rule for error copy in the surfaces it covers. Deviations require Switch approval.
> **Companion docs:** [`crypto-spec.md`](./crypto-spec.md) v1.0, [`security-requirements-v0.1.md`](./security-requirements-v0.1.md) v0.2.

---

## 0. Design principles (normative)

These five principles are the tie-breakers for every copy decision in this catalog. Any new error surface MUST be evaluated against them before shipping.

### P1 — Actionable to volunteers, opaque to attackers.

Every user-facing message MUST tell the treasurer what to do next. It MUST NOT reveal *which* crypto layer failed. Specifically, the UI MUST NOT distinguish between:

- wrong key vs. wrong algorithm vs. wrong AAD vs. tampered ciphertext vs. truncated ciphertext vs. corrupt nonce — all surface as **"couldn't be read"**;
- missing signature vs. bad signature vs. signature by unknown device vs. signature by revoked device — all surface as **"couldn't be verified"**;
- chain break vs. entry gap vs. entry-hash mismatch vs. genesis anchor mismatch — all surface as **"integrity check failed"**.

An attacker probing for a weakness learns nothing from error copy. A treasurer learns what button to press.

### P2 — Never leak internals to the UI.

The UI surface (and any i18n string table) MUST NOT contain:

- filenames, file paths, ULIDs, UUIDs, dataset IDs, device IDs;
- key fingerprints, public keys, signature bytes, nonces;
- internal error codes, stack frames, library names (`sodium-native`, `@napi-rs/keyring`, etc.);
- algorithm names (`XChaCha20-Poly1305`, `Ed25519`, `BLAKE2b`);
- free-form error messages from libraries.

Those fields go **only** into the diagnostic bundle (§4), which the user exports on request. That's also what Switch/Pedro use to investigate.

### P3 — Partial failure gets partial messaging.

Severity of copy is bounded by blast radius:

- **Row-level** (one event unreadable) → inline footnote on the affected row only. Not a banner.
- **View-level** (some events in the current view unreadable) → banner scoped to the view.
- **Treasury-level** (escrow, audit chain, DEK) → app-wide banner or blocking screen.

Never escalate row-level failures to app-wide banners. Never downgrade treasury-level failures to footnotes.

### P4 — Integrity-class errors are BLOCKING.

The user MUST NOT have a "continue anyway" affordance for:

- invalid `escrow.json` signature (CE-001);
- audit log chain break (CE-006);
- audit entry signature invalid (CE-007);
- update payload signature invalid (CE-009).

These are the four cases where crypto-spec already says "refuse to open". UI copy MUST offer only: (a) recover from snapshot, (b) contact the admin, (c) export diagnostic. No "skip verification", no "proceed at my own risk".

### P5 — Copy tone: treasurer-first, plain language, no jargon.

- **Spanish is primary** (Rett Spain pilot). English must be equivalent register — same word count band, same calm directness.
- No: *"clave", "firma", "cifrado", "descifrar", "hash", "cadena", "verificación criptográfica"* in user-surface copy. Those live in this catalog's What-NOT-to-say columns and in the diagnostic bundle.
- Yes: *"no pudo leerse", "no podemos verificar", "contacta al administrador", "ver detalles"*.
- Never alarmist (*"¡Atención!"*, *"¡Peligro!"*), never congratulatory, never condescending.

---

## 1. Shared behaviours (normative)

### 1.1 Route-out: "Ver detalles"

Every non-blocking copy in this catalog ends with a "Ver detalles" / "See details" link that opens a single in-app help surface (owned by UX-009) explaining in plain language what "couldn't be read" means and offering one action: **Export diagnostic bundle**. That help surface links outward to (a) admin contact, (b) snapshot recovery, (c) this catalog for the internally-curious. It does NOT explain the specific layer that failed.

### 1.2 No renderer-side logging of failure details

Per R15 + P2, the renderer MUST NOT `console.log` or otherwise emit the failure reason, the failed record ID, the failed key fingerprint, or the library exception. The main process writes structured logs (redacted per R15) and produces the diagnostic bundle on export (§4).

### 1.3 Counts are honest

Banners with `{count}` MUST reflect the actual number of failed items in the current view. Do not round, do not cap (except at one digit precision for very large numbers — show "99+" above 99).

### 1.4 i18n keys

All keys live under the `ux.errors.crypto.*` namespace with sub-domains matching the scenario ID (e.g., `ux.errors.crypto.ce-001.*`). Each scenario section below lists the exact keys. ES and EN MUST be populated on ship (day-0 i18n).

---

## 2. Scenario catalog

### CE-001 — Treasury can't be verified (escrow missing / bad signature / unknown admin)

**Trigger:** On first-run or on any subsequent session open, one of:
- `escrow.json` is present but its Ed25519 signature fails to verify;
- `escrow.json` is present but `signed_by_device_id` is not an `active` device entry in the file itself;
- `escrow.json` is present but structurally invalid (parse failure, missing required field from crypto-spec §3.1);
- `escrow.json` is present but `admin_device_id` is not in the device list.

All four surface as the same copy (P1).

**Surface:** UX-001 state `branch-damaged` (E4). Never inside running app — session cannot proceed past this screen.

**Severity:** BLOCKING (P4). No "continue anyway".

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-001.title` | "No podemos verificar esta tesorería" | "We can't verify this treasury" |
| `ux.errors.crypto.ce-001.body` | "Esta carpeta contiene una tesorería, pero no podemos confirmar que esté intacta. Puede haberse dañado al copiarse, o haberse alterado. **No continúes.** Contacta a quien administra esta tesorería." | "This folder contains a treasury, but we can't confirm it's intact. It may have been damaged when copied, or it may have been altered. **Don't continue.** Contact your treasury's admin." |
| `ux.errors.crypto.ce-001.cta.snapshot` | "Restaurar desde copia de seguridad" | "Restore from snapshot" |
| `ux.errors.crypto.ce-001.cta.export` | "Exportar diagnóstico" | "Export diagnostic" |
| `ux.errors.crypto.ce-001.cta.back` | "Volver" | "Back" |

**User action:** back out (no override), contact admin, restore from snapshot (per crypto-spec §9.3), or export diagnostic.

**What NOT to say:** do NOT distinguish the four triggers; do NOT name the signing key or admin UPN; do NOT say "signature" / "firma"; do NOT say "tampered" / "alterada" as the primary cause (frame it as "may have been damaged OR altered" — both possibilities).

**Diagnostic-bundle fields (exported only):**
- `ce_id: "CE-001"`
- `sub_reason`: one of `escrow_missing_signature | escrow_bad_signature | escrow_signer_not_active | escrow_structural_invalid | escrow_admin_not_in_devices`
- `escrow_path` (relative to dataset root)
- `escrow_size_bytes`
- `dataset_id` if parseable
- `expected_signer_device_id` if known
- `actual_signer_device_id` if readable
- `library_error` (raw exception message, last 256 chars)
- `timestamp`

**Deviation from Niobe's proposed copy (UX-001 Q7):** Niobe proposed *"La firma de esta tesorería no coincide con un administrador conocido. No continúes: puede estar dañada o alterada."* **ADJUSTED:** Switch removed "firma" and "administrador conocido" from the primary copy — it leaked both the failing layer (signature specifically) AND the identity concept (admin identity). Ratified copy stays honest ("couldn't verify", "damaged or altered") while opaque about the mechanism. The "contact the admin" action survives in the second sentence.

---

### CE-002 — Device not yet approved (enrollment pending)

**Trigger:** This device has published a `pending_enrollments` entry, and either (a) no admin has approved yet, or (b) no `active` admin is currently online to approve.

**Surface:** UX-002 state `requester.pending` (primary) and `requester.stuck-no-admin` (after the configurable soft threshold, default 5 min).

**Severity:** NOT an error. This is a normal state of the enrollment protocol. Copy tone is calm-informational, never red.

**Approved copy:**

Niobe's existing UX-002 strings at `ux.enroll.requester.pending.*` are **approved as proposed**. No change. Listed here for catalog completeness.

| Key | ES | EN |
|---|---|---|
| `ux.enroll.requester.pending.title` | "Esperando aprobación" | "Waiting for approval" |
| `ux.enroll.requester.pending.code-label` | "Tu código de enrolamiento" | "Your enrollment code" |
| `ux.enroll.requester.pending.help` | "Comparte este código con un administrador por un canal de confianza — llamada, Teams, en persona. Lo confirmará antes de aprobarte." | "Share this code with an admin through a channel you already trust — phone, Teams, in person. They'll confirm it before approving." |
| `ux.enroll.requester.stuck-no-admin` | "Estamos esperando a que un administrador te apruebe. Esto puede tardar unos minutos o unas horas — depende de cuándo abra la app." | "We're waiting for an admin to approve you. This can take a few minutes or a few hours — it depends on when the admin next opens the app." |

**User action:** wait (out-of-band readback happens by phone/Teams/in-person), cancel own pending entry.

**What NOT to say:** do NOT name the admin (preserves rejection-privacy if the request is eventually declined, CE-002b below).

**Diagnostic-bundle fields:** none — this is not an error state.

---

### CE-002b — Enrollment rejected

**Trigger:** Admin opens the approval modal and clicks Reject — because the out-of-band code readback does not match, or because the admin doesn't recognise the requester.

**Surface:** UX-002 state `requester.rejected`.

**Severity:** Requester-side: neutral informational (never accusatory — could be an innocent mismatch). Admin-side: writes an elevated audit entry (see "Admin-side audit & escalation" below).

**Approved copy (requester side):**

| Key | ES | EN |
|---|---|---|
| `ux.enroll.requester.rejected.title` | "Tu solicitud de enrolamiento fue rechazada" | "Your enrollment request was declined" |
| `ux.enroll.requester.rejected.body` | "Si no lo esperabas, contacta directamente a la persona que administra esta tesorería." | "If this was unexpected, reach out to whoever administers this treasury." |
| `ux.enroll.requester.rejected.cta.retry` | "Solicitar de nuevo" | "Try again" |

**User action:** contact the admin by out-of-band channel; optionally submit a fresh request (generates new keypair → new `device_id` → new enrollment code, per crypto-spec §5).

**What NOT to say:** do NOT reveal which admin rejected (privacy), do NOT reveal the reason the admin selected, do NOT reveal whether this was a code mismatch vs a "don't recognise" rejection. All rejection paths surface as the same copy.

**Admin-side audit & escalation — RATIFIED policy (UX-002 Q2):**

Option (a) — elevated audit entry, no forced rotation — is ratified. Forced rotation (option b) is rejected as it creates a denial-of-service vector (an attacker who can plant `pending_enrollments` entries could trigger rotation cascades). Admin-prompt-to-rotate (option c) is adopted as a soft secondary: if a second rejection occurs in the same admin session, prompt the admin to consider rotation. First rejection: audit-only. Second rejection in-session: soft prompt.

**Rationale from threat model:** A single mismatch is most likely an innocent failure — wrong device picked up, user misread the OOB code, readback noise, transient input mistake. Making the default response heavyweight (rotation) punishes the common case and trains admins to ignore the prompt. A PATTERN of mismatches is materially different — it's the observable fingerprint of a pubkey-substitution attempt. The default assumption drives the default response: **default to "innocent until repeated"** matches the actual base rate in NGO treasury workflows. The elevated audit entry is the forensic record; rotation is the response when the pattern emerges.

**Audit log entry format (emitted on every rejection):**

```json
{
  "seq": <monotonic>,
  "timestamp": "<ISO 8601 UTC>",
  "dataset_id": "<uuid>",
  "actor_device_id": "<admin device id>",
  "actor_user_identity": "<admin UPN>",
  "action": "device.enrollment.rejected",
  "severity": "elevated",
  "target_ref": {
    "type": "pending_enrollment",
    "id": "<pending device_id>"
  },
  "reason_class": "code_mismatch" | "unrecognised_requester" | "other",
  "before_hash": null,
  "after_hash": null,
  "prev_entry_hash": "<...>",
  "signature": { "alg": "ed25519", "signing_device_id": "<admin>", "value": "<base64>" }
}
```

`reason_class` is an enumerated field (three values only — no free text, no PII). The admin picks from three radio options in the reject modal; the app writes the enum verbatim.

**Admin-side second-rejection-in-session soft prompt copy:**

| Key | ES | EN |
|---|---|---|
| `ux.enroll.admin.repeat-reject.title` | "Dos rechazos seguidos en esta sesión" | "Two rejections in a row this session" |
| `ux.enroll.admin.repeat-reject.body` | "Un rechazo aislado suele ser un error inocente. Dos seguidos pueden indicar que algo no va bien. ¿Quieres rotar las claves de la tesorería por precaución?" | "A single rejection is usually an innocent mistake. Two in a row may mean something's wrong. Want to rotate the treasury's keys as a precaution?" |
| `ux.enroll.admin.repeat-reject.cta.rotate` | "Rotar ahora" | "Rotate now" |
| `ux.enroll.admin.repeat-reject.cta.later` | "Más tarde" | "Later" |

The soft prompt is informational only — "Later" is a valid choice and MUST NOT block the admin from other work.

**Diagnostic-bundle fields (requester side — what goes into the export only):**
- `ce_id: "CE-002b"`
- `own_device_id`, `own_public_key_x25519_b64` (these are the requester's own keys — they can export them)
- `enrollment_code_shown` (derived from own pubkey)
- `rejected_at_timestamp`
- NO admin identity is included in the requester's diagnostic bundle.

---

### CE-003 — Single transaction row failed to decrypt

**Trigger:** A single event file in the currently-loaded Movements range cannot be decrypted. Any decrypt-layer failure — bad AEAD tag, AAD mismatch, wrong `dek_version` reference, missing DEK version (device was never wrapped to this DEK version — should not happen but belt-and-suspenders), truncated ciphertext, corrupt nonce, or structural envelope failure — surfaces as the same copy (P1).

**Surface:** UX-003 state `row-decrypt-failed` (per-row) plus totals-strip footnote aggregating the count for the current range.

**Severity:** Row-level (P3). Other rows in the same view render normally.

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-003.row-placeholder` | "⚠ No pudo leerse" | "⚠ Couldn't be read" |
| `ux.errors.crypto.ce-003.row-sublabel` | "Ver detalles" | "See details" |
| `ux.errors.crypto.ce-003.footnote` | "{count, plural, one {# movimiento no pudo leerse} other {# movimientos no pudieron leerse}}. [Ver detalles]" | "{count, plural, one {# transaction couldn't be read} other {# transactions couldn't be read}}. [See details]" |

Niobe's proposed UX-003 Q9 copy (`ux.movements.row.decrypt-failed` = *"1 movimiento no pudo leerse. Ver detalles."*) is **approved as proposed** for the singular case. The new catalog-canonical key is `ux.errors.crypto.ce-003.footnote` with ICU plural forms — UX-003's existing key remains as an alias on the row itself. (Niobe: your key survives; Mouse: use the catalog key for the aggregated footnote.)

**User action:** click "Ver detalles" → UX-009 help surface → optionally Export diagnostic → contact admin.

**What NOT to say:** do NOT reveal the affected record's date, amount, category, or description (that PII is exactly what failed to decrypt — inferring it violates P2). The row renders a neutral ⚠ placeholder in every data column. Do NOT distinguish the decrypt failure subclass. Do NOT say "wrong key" or "revoked".

**Totals-strip behaviour:** the unreadable row is **excluded from the totals** (sum, count, average). The footnote below totals discloses the exclusion count. Do NOT include a "force-include with zero" hack — totals must reflect what's actually readable.

**Diagnostic-bundle fields:**
- `ce_id: "CE-003"`
- `failed_record_ulids` (list)
- `sub_reasons` (per-ulid enum: `aead_tag_mismatch | aad_binding_mismatch | missing_dek_version | envelope_parse_failed | ciphertext_truncated | nonce_invalid | unknown`)
- `dek_versions_available_on_device`
- `dek_version_expected_per_file`
- `aad_expected_vs_actual` (hashes only — never the PII inside)

---

### CE-004 — Saldo view: some events in range failed to decrypt

**Trigger:** Saldo's aggregation query encounters ≥1 event in the current period (or prior comparison period) that fails to decrypt. Same decrypt-failure subclasses as CE-003.

**Surface:** UX-004 state `partial-decrypt-failed` — view-level banner above the comparison panels, plus per-category asterisk on categories whose totals would otherwise be affected.

**Severity:** View-level (P3). The screen remains usable; totals are honest about incompleteness.

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-004.banner` | "{count, plural, one {# movimiento no pudo leerse en este periodo} other {# movimientos no pudieron leerse en este periodo}} — los totales pueden ser incompletos. [Ver detalles]" | "{count, plural, one {# transaction couldn't be read in this period} other {# transactions couldn't be read in this period}} — totals may be incomplete. [See details]" |
| `ux.errors.crypto.ce-004.category-asterisk.tooltip` | "Esta categoría incluye movimientos que no pudimos leer. El total puede estar incompleto." | "This category includes transactions we couldn't read. Its total may be incomplete." |

Niobe's proposed UX-004 Q10 copy (`ux.saldo.decrypt-partial` = *"{count} movimientos no pudieron leerse — los totales pueden ser incompletos. Ver detalles."*) is **approved with a minor enhancement:** adding *"en este periodo"* anchors the claim to the current Saldo view, avoiding confusion when the user switches periods and the banner disappears/reappears. The plural form is also normalised to ICU to match the catalog convention.

The existing UX-004 key `ux.saldo.decrypt-partial` is retained as an alias pointing to the same ES/EN strings.

**User action:** click "Ver detalles" → UX-009. Switching the period selector re-queries and recomputes the banner.

**What NOT to say:** do NOT name which categories are affected in the banner (the per-category asterisk handles that surface). Do NOT reveal amounts excluded. Do NOT say "rotated key" or "revoked device".

**Projection behaviour:** If the screen is in `loaded-partial-period` AND `partial-decrypt-failed` simultaneously, the projection tooltip MUST be suppressed for affected categories — a projection computed on incomplete actuals is misleading. Show the projection for unaffected categories normally.

**Diagnostic-bundle fields:**
- `ce_id: "CE-004"`
- `saldo_period` (ISO dates of current period + prior comparison period)
- `failed_record_ulids` (list, scoped to both periods)
- Per-ulid sub-reasons (same enum as CE-003)

---

### CE-005 — Panel view: some events failed to decrypt

**Trigger:** Panel's mount-time query set (five parallel queries per UX-005 §3 preconditions) encounters ≥1 event that fails to decrypt. Balances, monthly KPIs, sparklines, or recent-8 may be affected.

**Surface:** UX-005 state `partial-decrypt-failed` — view-level banner at the top of Panel, plus affected-card footnote on account cards whose balance is incomplete, plus affected-row placeholder on any of the recent-8 rows that failed (same treatment as CE-003 row-placeholder).

**Severity:** View-level (P3).

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-005.banner` | "{count, plural, one {# movimiento no pudo leerse} other {# movimientos no pudieron leerse}} — balances y resúmenes pueden ser incompletos. [Ver detalles]" | "{count, plural, one {# transaction couldn't be read} other {# transactions couldn't be read}} — balances and summaries may be incomplete. [See details]" |
| `ux.errors.crypto.ce-005.card-footnote` | "Balance incompleto — algunos movimientos no pudieron leerse." | "Incomplete balance — some transactions couldn't be read." |

**Deviation from Niobe's proposed copy (UX-005 Q8):** Niobe proposed *"{N} movimientos no pudieron leerse — balances y KPIs pueden ser incompletos. Ver detalles."* **ADJUSTED:** "KPIs" is jargon — volunteer treasurers are not data analysts. Swapped for "resúmenes" (ES) / "summaries" (EN). "Balances" survives because treasurers use that word natively. Also normalised to ICU plural. The existing UX-005 key `ux.panel.decrypt-partial` is retained as an alias pointing to the same strings.

**User action:** click "Ver detalles" → UX-009.

**What NOT to say:** do NOT reveal which specific account card is affected in the banner copy (the card-level footnote handles that surface). Do NOT show currency amounts excluded. Do NOT distinguish subclasses.

**Diagnostic-bundle fields:**
- `ce_id: "CE-005"`
- Per-query-kind counts (balances / monthly-kpis / sparklines / recent-8)
- `failed_record_ulids` (list)
- Per-ulid sub-reasons (same enum as CE-003)

---

### CE-006 — Audit log chain break

**Trigger:** At dataset open (or at any later consistency check), the audit log hash chain fails to verify. Specifically one of:
- `seq` has a gap;
- an entry's `prev_entry_hash` does not match the canonical hash of the declared previous entry;
- the genesis entry anchor is incorrect for this `dataset_id`.

All three surface as the same copy (P1).

**Surface:** App-level blocking screen. Session cannot proceed past this state. Treasury is not opened. (Per crypto-spec §8.4: "refuse to open".)

**Severity:** BLOCKING (P4). No "continue anyway".

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-006.title` | "El historial de esta tesorería no está íntegro" | "This treasury's history isn't intact" |
| `ux.errors.crypto.ce-006.body` | "El registro de actividad tiene un hueco o una alteración que no podemos ignorar. Por seguridad, no abrimos la tesorería. Restaura desde una copia de seguridad reciente o contacta al administrador." | "The activity log has a gap or alteration we can't ignore. For safety, we're not opening the treasury. Restore from a recent snapshot or contact the admin." |
| `ux.errors.crypto.ce-006.cta.snapshot` | "Restaurar desde copia de seguridad" | "Restore from snapshot" |
| `ux.errors.crypto.ce-006.cta.export` | "Exportar diagnóstico" | "Export diagnostic" |
| `ux.errors.crypto.ce-006.cta.back` | "Volver" | "Back" |

**User action:** restore from snapshot (R19, crypto-spec §9.3), contact admin, or export diagnostic. Never proceed.

**What NOT to say:** do NOT say "hash chain" or "chain of hashes" — "historial" / "history" carries the same meaning at the treasurer's register. Do NOT distinguish gap vs alteration — surface as one combined phrase. Do NOT reveal the `seq` number of the break.

**Diagnostic-bundle fields:**
- `ce_id: "CE-006"`
- `sub_reason: seq_gap | prev_hash_mismatch | genesis_anchor_invalid`
- `break_at_seq`
- `expected_prev_hash_b64`, `actual_prev_hash_b64`
- `dataset_id`
- `last_known_good_snapshot_path` (if any)

---

### CE-007 — Audit log entry with bad signature

**Trigger:** At dataset open, an individual audit entry's Ed25519 signature fails to verify against the declared `signing_device_id`'s `device_pubkey_ed25519` (from `escrow.json`, including revoked entries per crypto-spec §8.2 rule 3).

**Surface:** Same app-level blocking screen as CE-006. Per crypto-spec §8.4: "Bad signature on an entry: same as chain break."

**Severity:** BLOCKING (P4).

**Approved copy:** Identical to CE-006. Treat as the same user-facing event (P1 — user does not need to know whether the break is hash-chain vs per-entry signature). Use `ux.errors.crypto.ce-006.*` keys — no distinct CE-007 keys in the i18n table.

**User action:** same as CE-006.

**What NOT to say:** do NOT surface signature-verification-specific wording. P1 applies.

**Diagnostic-bundle fields:**
- `ce_id: "CE-007"`
- `bad_signature_at_seq`
- `signing_device_id_claimed`
- `signing_device_id_resolvable_in_escrow` (boolean)
- Other same fields as CE-006.

The bundle distinguishes CE-006 vs CE-007; the UI does not.

---

### CE-008 — Device revoked mid-session

**Trigger:** The app is running and has an unwrapped DEK in memory. A new `escrow.json` arrives via OneDrive sync in which this device's entry is now `status: "revoked"` and `dek_version` has incremented past the in-memory DEK.

**Surface:** App-wide banner (via UX-006 shell banner slot, global state `device-revoked`). All write affordances disabled (tx create, edit, delete). Read remains functional against the **local cache** for the DEK version still in memory (consistent with AR2 — the DEK is in our memory, we can keep using it for already-unwrapped data for the duration of the session).

**Severity:** Treasury-level BUT non-blocking for existing reads. Blocking for writes.

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-008.banner.title` | "Este dispositivo ya no está autorizado" | "This device is no longer authorised" |
| `ux.errors.crypto.ce-008.banner.body` | "Un administrador revocó este dispositivo. Puedes seguir consultando lo que ya tienes, pero no puedes registrar nuevos movimientos. Contacta al administrador si esto fue un error." | "An admin revoked this device. You can still view what you already have, but you can't record new transactions. Contact the admin if this was a mistake." |
| `ux.errors.crypto.ce-008.cta.contact` | "¿Cómo contactar al administrador?" | "How to contact the admin" |
| `ux.errors.crypto.ce-008.create-disabled-tooltip` | "Dispositivo revocado — contacta al administrador" | "Device revoked — contact the admin" |

**User action:** read-only browsing of existing data permitted; contact admin to re-enroll (per crypto-spec §5 — a fresh enrollment generates a new `device_id`).

**What NOT to say:** do NOT say "DEK rotated" or "key rotated" — say "revoked". Do NOT name which admin revoked (privacy, same as CE-002b). Do NOT offer "request re-enrollment" as a button — the user re-enrolls by uninstalling or wiping local data (via R6 wipe flow) and re-running UX-001 Branch B, which triggers a fresh UX-002 flow. Offering a button would imply server-mediated re-enrollment, which doesn't exist.

**Do NOT auto-purge cache.** AR2 is accepted: the user's local cache of already-decrypted data remains on their disk. The wipe-local-data button from R6 is the user's explicit choice, not the revocation's automatic side effect.

**Diagnostic-bundle fields:**
- `ce_id: "CE-008"`
- `own_device_id`
- `last_known_dek_version_in_memory`
- `new_escrow_dek_version`
- `revoked_at_timestamp_from_escrow`
- `revoked_by_device_id_from_escrow`

---

### CE-009 — Update payload signature invalid

**Trigger:** `electron-updater` (or equivalent) downloads an update manifest or binary whose Ed25519 signature does not verify against the pinned public key embedded in the app (R13.1).

**Surface:** In-app dialog (not a system dialog). Update aborted. App continues running on the current version. This is NOT a crypto-spec §8 treasury-integrity failure — treasury data is unaffected. The threat is RCE via malicious update (T10), so the defence is refusal + visibility.

**Severity:** BLOCKING for the update. Non-blocking for current session.

**Approved copy:**

| Key | ES | EN |
|---|---|---|
| `ux.errors.crypto.ce-009.title` | "No podemos verificar esta actualización" | "We can't verify this update" |
| `ux.errors.crypto.ce-009.body` | "La actualización descargada no coincide con lo que esperábamos. Por seguridad, no la instalaremos. Tu tesorería no se ha visto afectada." | "The downloaded update doesn't match what we expected. For safety, we're not installing it. Your treasury is unaffected." |
| `ux.errors.crypto.ce-009.cta.retry` | "Volver a intentar más tarde" | "Try again later" |
| `ux.errors.crypto.ce-009.cta.export` | "Exportar diagnóstico" | "Export diagnostic" |

**User action:** dismiss (keep current version). Optionally export diagnostic. Do NOT offer "install anyway" — that defeats R13.1.

**What NOT to say:** do NOT say "signature" / "firma". Do NOT reveal the expected vs actual fingerprint. Do NOT reveal the update URL. Do NOT imply the update server was compromised (could be a transient CDN corruption — P1 opacity).

**Diagnostic-bundle fields:**
- `ce_id: "CE-009"`
- `current_app_version`
- `attempted_update_version`
- `manifest_url` (the update feed URL — not PII)
- `expected_pubkey_fingerprint_b64` (pinned key — not secret, already in the binary)
- `actual_signature_verification_result` (boolean; library exception last 256 chars)
- `manifest_bytes_hash_blake2b`

---

## 3. UX-002 Q1 — enrollment code alphabet and grouping (RATIFIED)

### 3.1 Alphabet — RATIFIED

**Chosen alphabet (30 characters):**

```
A B C D E F G H J K M N P Q R S T V W X Y Z 2 3 4 5 6 7 8 9
```

**Derivation:** Crockford base32 (`0-9 A-Z` minus `I L O U`, which Crockford itself already excludes for human-readability) with the additional exclusion of `0` (visually collides with `O` even though `O` is absent — some fonts render `0` with no slash) and `1` (visually collides with `I` / lowercase `l` / even `|`).

**Correction to Niobe's proposal:** Niobe's UX-002 Q1 proposal said "Crockford base32 minus `0/O/1/I/L/U`, so 26 chars". The count is off — Crockford's base set is 32 (10 digits + 22 letters because I/L/O/U are not in Crockford's letter set). Dropping `0` and `1` from the 32-char Crockford set yields **30 characters, not 26**. The intent is the same; the number is corrected.

**Entropy per code:** 30⁶ ≈ 7.29 × 10⁸ possible codes ≈ 29.4 bits. Since the code is derived as `BLAKE2b(X25519_pubkey)` truncated to 30 bits effective, collision probability across a single NGO (typical ≤10 devices ever) is negligible. Even across every OpenTreasury installation worldwide simultaneously, 30-bit collisions require ~2¹⁵ = ~32,000 concurrent pending enrollments before a 1% birthday-collision probability — well beyond realistic scale. Acceptable.

**Case:** uppercase only. Display, storage, and comparison are all uppercase. The readback alphabet (§3.3) is case-insensitive for robustness against user error.

### 3.2 Grouping — RATIFIED: `XXX-XXX` (3-3)

**Chosen grouping:** three characters, dash, three characters. Example: `ABC-DEF`, `K7P-2MN`.

**Rejected: `XX-XX-XX` (2-2-2).** Rationale:

| Concern | `XXX-XXX` (3-3) | `XX-XX-XX` (2-2-2) |
|---|---|---|
| Chunk count (short-term memory) | 2 chunks of 3 — comfortable, phone-like | 3 chunks of 2 — more mental overhead |
| Readback latency (out-of-band by phone) | Natural cadence ("A-B-C … D-E-F") | Choppy cadence with three pauses |
| Visual verification speed | Two blocks to scan | Three blocks, slower |
| Visible separator overhead | 1 dash, 7-char display width | 2 dashes, 8-char display width |
| Typing friction (if ever entered manually) | N/A — admin reads from escrow; requester displays derived from own key | N/A |
| Similarity to familiar patterns | Phone area codes, postal codes | License plates (locale-dependent) |

**Decision:** `XXX-XXX`. Readback is the dominant user action; 3-3 wins on readback cadence and chunk memory. Mouse will confirm the monospace visual treatment in the design system wave; that's visual only and does not affect this ratification.

### 3.3 Readback alphabet (TTS and "Read aloud")

The "Read aloud" button in UX-002 §4.2 step 3 MUST use the NATO phonetic alphabet for letters and plain number names for digits, in the active app locale:

- Letters → NATO phonetic (*"Alpha, Bravo, Charlie … Yankee, Zulu"*).
- Digits → plain number names in locale (*"dos, tres, cuatro…"* / *"two, three, four…"*).

Rationale: NATO is internationally recognisable, works over poor phone audio, and survives accent variation. A Spanish-language NATO rendering exists and is idiomatic (*"Alfa, Bravo, Charlie…"*).

### 3.4 Integration into crypto-spec

Crypto-spec §5 currently describes the code derivation as *"6-character human-readable code (e.g., BASE32 truncated to 6 chars from BLAKE2b(device_pubkey_x25519))"*. This catalog pins the alphabet and grouping; the derivation function text in crypto-spec does not change.

**Implementation note (for Morpheus / Trinity):** truncate the BLAKE2b(X25519 pubkey) output to 30 bits (5 bytes, minus 10 bits), then encode each 5-bit group into one character of the 30-char alphabet above. The 30-character alphabet is not a power of 2 — this is NOT a standard base32 decode. Document the mapping function inline in the enrollment module so reviewers can trivially verify determinism.

---

## 4. Diagnostic bundle — shared specification

**Purpose:** Give the user a single export they can send to Switch or Pedro for investigation, while keeping internal failure reasons OUT of the UI.

**Trigger:** user-initiated only. Clicking "Exportar diagnóstico" / "Export diagnostic" from any CE-XXX surface. Never auto-sent. Never uploaded.

**Format:** single `.json` file, pretty-printed, written to the user's chosen local path (default: Desktop). Filename convention: `opentreasury-diagnostic-{CE-XXX}-{ISO-UTC-compact}.json`.

**Contents:**

```json
{
  "schema_version": 1,
  "generated_at": "<ISO 8601 UTC>",
  "app_version": "<semver>",
  "os": { "platform": "<win32|darwin|linux>", "release": "<os release>" },
  "ce_id": "CE-001" | "CE-002b" | "CE-003" | "CE-004" | "CE-005" | "CE-006" | "CE-007" | "CE-008" | "CE-009",
  "dataset_id": "<uuid or null>",
  "own_device_id": "<uuid>",
  "own_public_keys": {
    "x25519_b64": "<base64>",
    "ed25519_b64": "<base64>"
  },
  "scenario_specific": { /* fields defined per CE-XXX "Diagnostic-bundle fields" */ },
  "library_errors": [ "<last 256 chars of each library exception observed>" ],
  "redaction_notes": "This bundle contains no PII or financial data. Safe to share with your treasury admin or with the OpenTreasury maintainers."
}
```

**R15 compliance:** the bundle MUST NOT contain names, emails, phones, amounts, account numbers, transaction descriptions, category names, donor/member fields, or any decrypted ciphertext. The main process builds the bundle from the fields whitelisted per CE-XXX; anything else is a defect.

**PRIVATE keys:** MUST NEVER appear in the diagnostic bundle. Only public keys are included. The public-key surface is already visible to anyone with folder read access (crypto-spec §10) so no new leak.

**Escrow UPN inclusion:** the bundle MAY include the UPN of a counterparty (e.g., `revoked_by_device_id` with its associated UPN) because UPNs are already visible to folder-ACL members per crypto-spec §10. The redaction note is honest about this — there is no PII beyond what's already in OneDrive's sharing UI.

---

## 5. What's NOT in this catalog (and why)

- **Non-crypto errors** — OneDrive sync failure, disk full, network timeout, read-model consistency drift: owned by UX-009 broadly but NOT by this catalog. Those are not integrity failures; they're operational states.
- **Copy for UX-009's own help surface** — the "Ver detalles" route-out landing page: owned by Niobe (its copy is a tutorial, not an error string). This catalog defines the entry strings; UX-009 defines the destination.
- **Admin-facing approval-modal security copy** (the "approve only if you contacted this person" warning): owned by UX-002 §4.3 step B, already ratified by Niobe and approved-as-is by Switch.
- **R20 first-run posture checklist copy**: owned by UX-001 and R20. This catalog does not overwrite it.
- **Installer SmartScreen workaround copy** (AR9): owned by UX-019 install guide, not an in-app surface.
- **New in v1.x:** admin transfer copy, DEK rotation admin-triggered copy. Those are UX-012 territory — out of Wave 1.

---

## 6. Traceability matrix

| CE-ID | UX spec(s) that surface it | Crypto-spec section | Security-req | Threat-model threat |
|---|---|---|---|---|
| CE-001 | UX-001 E4 (state `branch-damaged`) | §3 (escrow format), §3.2 (canonical-JSON signing), §9.3 (response map) | R4, R5, R8 | T3 (insider tampering), T15 (escrow tampering) |
| CE-002 | UX-002 `requester.pending`, `requester.stuck-no-admin` | §5 (enrollment flow) | R4, R7 | T4 (accidental oversharing defence) |
| CE-002b | UX-002 `requester.rejected`, `admin.mismatch-rejected` | §5 (enrollment), §8.2 (audit entry) | R4, R7, R8 | T3 (insider), T15 (escrow substitution attempt) |
| CE-003 | UX-003 `row-decrypt-failed` + totals footnote | §2.1 (envelope), §1.1 (AEAD), §7 (DEK rotation edge) | R3, R5 | T5 (sync corruption), T14 (stale key residue) |
| CE-004 | UX-004 `partial-decrypt-failed` banner | §2.1, §1.1 | R3, R5 | T5, T14 |
| CE-005 | UX-005 `partial-decrypt-failed` banner + card footnote | §2.1, §1.1 | R3, R5 | T5, T14 |
| CE-006 | app-wide blocking (UX-001 secondary surface + UX-006 shell locked state) | §8.4 (tamper resistance), §8.2 (chain rules) | R5, R8 | T3, T13 (audit tampering), T15 |
| CE-007 | same as CE-006 (merged in UI per P1) | §8.4, §8.2 rule 3 | R5, R8 | T3, T13, T15 |
| CE-008 | UX-006 shell `device-revoked` state + per-screen write-affordance disable | §6 (revocation), §7 (rotation) | R4 (per-device), R7 (ACL ↔ escrow split) | T3, T14 |
| CE-009 | in-app update dialog (owned by UX-019 installer/update surface) | crypto-spec refs R13.1 only | R13.1 | T10 (malicious update), T7 (supply chain) |

---

## 7. Process rules for adding new CE entries

1. **Switch owns this catalog.** Any new CE-XXX entry requires Switch's approval before it can land.
2. **Cite crypto-spec.** Every new entry must reference a specific crypto-spec section that defines the underlying failure mode. If there isn't one, either (a) add it to crypto-spec first, or (b) the scenario isn't a crypto-error and belongs in a different catalog.
3. **Apply all five principles.** P1–P5 in §0 are the acceptance criteria. If an entry can't pass all five, it gets rewritten.
4. **Append-only numbering.** CE IDs are never reused and never renumbered. If a scenario is retired, mark it `[RETIRED {date}: superseded by CE-YYY]`.
5. **Day-0 i18n.** No entry lands without ES and EN ratified strings in the same PR that adds the entry.

---

## 8. Status history

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | v1.0 Ratified | Switch | Initial catalog. 9 scenarios (CE-001 through CE-009). UX-002 Q1 (alphabet + grouping) and Q2 (mismatch escalation) ratified. Wave-1 UX unblocked to move Draft → In Review. |

---

*End of Crypto Error Copy Catalog v1.0. This is a living document; next revision when Wave-2 specs land (UX-012 admin operations, UX-018 sync conflicts).*
