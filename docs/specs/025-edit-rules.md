# SPEC-025 — Status-Based Transaction Edit Rules

> **Status:** Draft · **Owner:** Niobe · **Last updated:** 2026-05-07
> **Paired PRD:** —  (small UX rule change; tracked under Movements PRD-001)
> **Paired UX:** inline (this spec)
> **Paired Design:** —  (no new visuals; reuses existing form fields + lock icon)

---

## 1. Summary

The "Edit Transaction" modal currently locks Date, Description, Amount, and Account
for **every** transaction regardless of status — even though a user can freely **delete**
the same transaction (a far more destructive action). This spec replaces the blanket
lock with a **status-aware** rule: `pending` transactions are fully editable, `approved`
transactions expose only metadata fields, and the user can flip status inside the same
modal to unlock the heavy fields. The split-amount lock from SPEC-023 still wins.

## 2. Problem

Two concrete pains drive this:

1. **Bulk-import correction.** After a CSV import, Pedro routinely needs to fix a wrong
   date, a swapped account, or a typo in a description on dozens of rows. Today he
   must delete and re-create each one — losing the original event chain.
2. **Manual-entry typos.** A treasurer enters a row, taps "Approve", then notices the
   amount is off by one digit. Today she must delete + re-enter. The audit log already
   captures every mutation, so editing is no more risky than deleting.

The deeper inconsistency: **delete is allowed in any status, but edit is not.** That is
backwards from a risk standpoint. Approval should mean *"I have reviewed the financial
facts (date, amount, account, description)"* — those are the fields that warrant
friction. Categorisation, tags, reference numbers, and free-text notes are
post-approval housekeeping and should never have been locked.

## 3. Users & Scenarios

**Persona:** NGO treasurer / administrative staff (Pedro, María).

- **Scenario A — Pending fix.** María imports a CSV. One row's amount is wrong.
  She opens it (still `pending`), corrects the amount, saves. Done.
- **Scenario B — Re-categorise approved.** Pedro reviews end-of-month. He wants to
  move an `approved` transaction from "Office" to "Travel". He opens it, changes
  category and adds a reference, saves. Date/amount/account stay locked — that data
  is already audited as approved.
- **Scenario C — Approved correction.** Pedro spots a wrong amount on an `approved`
  row. He opens it, sees Amount disabled with the hint *"Set status to Pendiente to
  edit financial fields"*, changes the Status dropdown to `pending`, the Amount field
  becomes editable in the same view, he edits it, flips Status back to `approved`,
  saves. One modal, no round trips. The audit log captures both the un-approval and
  the re-approval.
- **Scenario D — Splits parent.** A split parent's Amount is locked **regardless of
  status** (SPEC-023 invariant: children must sum to parent). Status flip does not
  unlock it; the user must remove splits first.

## 4. Requirements

### 4.1 Functional — Status × Field Matrix

The authoritative rule. `✏️` = editable, `🔒` = locked (with hint), `🔒*` = locked
by SPEC-023 split rule (overrides status).

| Field          | `pending`            | `approved`         | Notes                                              |
|----------------|----------------------|--------------------|----------------------------------------------------|
| Date           | ✏️                   | 🔒                 | Approved date is part of the financial fact.       |
| Description    | ✏️                   | 🔒                 | Treated as a financial fact (matches bank record). |
| Amount         | ✏️ (🔒* if hasSplits)| 🔒 (🔒* if splits) | SPEC-023 always wins.                              |
| Account        | ✏️                   | 🔒                 | Misposted account is an approval-level error.      |
| Category       | ✏️                   | ✏️                 | Re-categorisation is normal post-approval work.    |
| Subcategory    | ✏️                   | ✏️                 | Same.                                              |
| Tags           | ✏️                   | ✏️                 | Housekeeping.                                      |
| Status         | ✏️                   | ✏️                 | The unlock mechanism (see §4.2).                   |
| Reference      | ✏️                   | ✏️                 | Free text, low risk, frequently added later.       |
| Details        | ✏️                   | ✏️                 | Free text, low risk, frequently added later.       |

> **FR1** — `mode='edit'` in `TransactionFormFields` MUST render Date, Description,
> Amount, and Account inputs (today they are absent / hardcoded `disabled`).
> **FR2** — Each of those four fields MUST be `disabled` when `status === 'approved'`.
> **FR3** — Amount MUST also be `disabled` when `hasSplits === true`, irrespective of
> status (SPEC-023 §FR14).
> **FR4** — Status, Category, Subcategory, Tags, Reference, Details MUST be editable
> in both statuses (only constrained by `hasSplits` for Category on split parents per
> SPEC-023 §FR15).
> **FR5** — Each locked-by-status field MUST display an inline hint:
> *"Cambia el estado a Pendiente para editar"* (es) / *"Set status to Pending to edit"* (en).
> Hint goes in the existing `ot-tx-fields__field-error` slot, but with a neutral
> "info" variant (not red).
> **FR6** — Locked-by-splits hint (SPEC-023) takes precedence over the status hint
> when both apply.

### 4.2 Status Transition UX (the unlock mechanism)

**Decision: Option A — implicit unlock via the Status dropdown.** No separate
"Unlock" button.

Rationale:
- The Status field is **already** in the edit form (Row 3, mirrors view mode).
  Adding a second "Unlock" button duplicates an existing affordance and burdens the
  user with two ways to do one thing.
- Option A makes the model *visible*: locked fields explicitly reference the Status
  field by name in their hint, teaching the rule.
- One fewer button to translate, label, and place visually.
- Approving / un-approving is a meaningful action a treasurer already understands —
  framing the unlock as "change status" is honest about what is happening in the
  audit log.

**Behaviour while modal is open:**

- **`approved → pending` mid-edit:** the four locked fields become editable
  **immediately** on dropdown change (no save required, no modal reopen). The hint
  text disappears. Focus stays where it was.
- **`pending → approved` mid-edit:** fields do **NOT** lock mid-edit. The user
  finishes their edits and the lock applies on **next open**. Locking inputs while
  the user is mid-keystroke would be hostile and could discard typed text.
  - Validation on Save still applies normally (e.g., required fields).
  - The Status change is part of the same `tx.updated` event payload — one event,
    one audit entry covering both the status flip and any field edits.
- **Cancel** reverts all in-modal changes, including Status, as today.

### 4.3 Non-functional

- **NFR1** — No additional IPC round-trips. The lock state is derived in the renderer
  from `transaction.status` and `transaction.hasSplits` already on the wire.
- **NFR2** — Accessibility (WCAG 2.1 AA): disabled fields use `disabled` + a
  `aria-describedby` pointing at the hint text. Hint text is announced by screen
  readers when the field receives focus.
- **NFR3** — i18n: hint strings added to both `en` and `es` namespaces under
  `transactionDetail.editLock.*`.

## 5. UX Notes

- No new visual components. Reuse the existing field-error slot styling for the hint
  (neutral colour, not red — this is informational, not an error).
- The Status dropdown already lives in Row 3 of edit mode. Do not move it.
- The summary banner at the top of the edit modal (date / description / amount)
  becomes redundant for `pending` transactions because those fields are now in the
  form below. **Keep the banner for `approved` only**; for `pending`, hide it (the
  form fields above the fold are the source of truth).
- The lock icon (🔒) currently used by SPEC-023 on the amount field MAY be reused
  visually next to status-locked field labels for consistency. Mouse to confirm
  exact glyph; not a blocker for implementation.

## 6. Edge Cases

1. **Splits parent + status change.** Amount stays locked even after flipping to
   `pending`. Hint reads the SPEC-023 message ("Remove splits to edit amount"),
   not the status message.
2. **Status change `approved → pending` mid-edit.** Fields unlock immediately
   (per §4.2). User can edit and continue.
3. **Status change `pending → approved` mid-edit.** Fields stay editable until Save.
   Lock applies on next open.
4. **Reference and Details — always editable.** **Confirmed.** These are free-text
   notes with no financial-fact semantics; locking them would force a status flip
   for trivial annotations. The audit log records every change anyway.
5. **Save with both status flip and field edits.** Single `tx.updated` event with all
   new values. No two-step "approve then edit" UX required from the user.
6. **Concurrent split-children mutation.** Out of scope here — SPEC-023 already
   defines that locking. We only respect its `hasSplits` flag.

## 7. Acceptance Criteria

- [ ] **AC1** — Opening a `pending` transaction in edit mode shows editable Date,
  Description, Amount, and Account inputs.
- [ ] **AC2** — Opening an `approved` transaction in edit mode shows Date,
  Description, Amount, Account as `disabled` with the localized hint.
- [ ] **AC3** — Changing Status from `approved` to `pending` inside the edit modal
  immediately enables the four locked fields (no save, no reopen).
- [ ] **AC4** — Changing Status from `pending` to `approved` inside the edit modal
  does NOT lock fields mid-edit; lock applies on next modal open.
- [ ] **AC5** — Saving with both a status flip and field edits produces one
  `tx.updated` event carrying all new values.
- [ ] **AC6** — On a transaction with `hasSplits === true`, Amount is locked in BOTH
  statuses; the SPEC-023 hint takes precedence over the status hint.
- [ ] **AC7** — Category, Subcategory, Tags, Status, Reference, Details are editable
  in both statuses (Category honours SPEC-023 split-parent rule).
- [ ] **AC8** — Disabled inputs have `aria-describedby` pointing at the hint;
  screen-reader announcement verified manually.
- [ ] **AC9** — i18n strings exist in `en` and `es`; no hardcoded English in JSX.
- [ ] **AC10** — Existing E2E tests for edit/save still pass; new E2E covers AC3
  (mid-modal unlock flow).

## 8. Out of Scope

- A new "Locked" or "Reconciled" status beyond `pending` / `approved`.
- Bulk edit across multiple selected transactions.
- Transfers (none exist in the data model today).
- Visual redesign of the edit modal layout, lock glyph, or hint colour beyond
  reusing existing tokens (Mouse owns visual polish).
- Permission-based locking (single-user app today).
- Changing what the Delete button can do.

## 9. Implementation Note for Trinity

PR #295 (next/prev navigation in the detail modal) is in flight on the same
`TransactionDetailModal.tsx`. Either **merge #295 first**, or rebase this work on
top of it — do not re-implement navigation from scratch. Touch points overlap on
the form-fields render path and the modal's edit-mode state, so a clean merge order
matters more than usual.

## 10. Traceability

- **PRD:** `docs/product/prds/prd-001-movements.md` (Movements feature).
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md).
- **Related specs:** [SPEC-023](./023-split-transactions.md) — split-amount lock
  invariant respected here.
- **Status enum source of truth:** `app/src/core/events/schemas.ts` (line 22:
  `transactionStatusSchema = z.enum(['pending', 'approved'])`).
- **Code touch points:**
  - `app/src/renderer/components/TransactionDetailModal/TransactionDetailModal.tsx`
  - `app/src/renderer/components/TransactionFormFields/TransactionFormFields.tsx`
- **In-flight PR to coordinate with:** #295 (modal next/prev navigation).

## 11. Resolved Questions

1. **Reference and Details are always editable** in both statuses (no lock).
   ✅ Confirmed by Pedro (2026-05-07).
2. **Cancel reverts status flips made inside the modal** along with all other
   changes — no half-applied un-approval. ✅ Confirmed by Pedro (2026-05-07).

## 12. Status History

| Date       | Status   | By    | Notes                                         |
|------------|----------|-------|-----------------------------------------------|
| 2026-05-07 | Draft    | Niobe | Initial draft.                                |
| 2026-05-07 | Approved | Pedro | Open questions resolved; ready for Trinity.   |
