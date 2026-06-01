# SPEC-029 (UX) — Invoice Attachments for Transactions

> **Status:** Draft · **Owner:** Niobe · **Last updated:** 2026-06-01
> **Paired feature spec:** [`docs/specs/029-invoice-attachments.md`](../../specs/029-invoice-attachments.md)
> **Paired Design:** Pending — Mouse (visual polish, icons, tokens)
> **Security input:** Pending — Switch sign-off (decrypt-to-cache view model, audited operations)
> **GitHub issue:** [#293](https://github.com/rett-europe/opentreasury-desktop/issues/293)

---

## 1. Summary

María is reviewing a €4.200 supplier payment with an auditor sitting beside
her. He asks, "Show me the invoice." Today she alt-tabs to SharePoint and hunts
for a file named from memory. With Invoice Attachments she opens the
transaction, the **Facturas** section already lists `factura-0421.pdf`, she
clicks it, and the PDF opens in Edge. When she closes the transaction, the
decrypted copy is gone. She never left the app to find it, and the document
travelled — encrypted — with the movement it belongs to.

This UX spec covers the attachments section inside the transaction detail view,
the add (file picker + drag-and-drop), view, remove, and replace flows, every
empty/loading/error/availability state, the movements-list badge, accessibility,
and ES + EN copy. Canonical functional/security behaviour lives in the paired
feature spec.

## 2. Entry Points

| # | Trigger | Behaviour |
|---|---|---|
| 1 | Open a transaction → **TransactionDetailModal** | The **Facturas / Invoices** section renders below Notes, in both read-only and edit presentations. |
| 2 | Paperclip badge on a movements row | Visual affordance only (it does not open the file directly); it signals "this movement has invoices". Clicking the row opens the detail view as usual. |
| 3 | Drag a file from the OS onto the open detail view | Highlights the Facturas section as a drop target; dropping triggers Add (§3.2). |
| 4 | Keyboard shortcut | **Not in v1.** |

Section ID: **`ATT-1`** (attachments section). Confirm-remove dialog: **`ATT-2`**.

## 3. Happy-Path Walkthrough

### 3.1 Add via file picker

Screen state: **`ATT-1`**.

| # | Step | State | Visible copy |
|---|---|---|---|
| 1 | María opens a transaction with no invoices | `ATT-1.empty` | Section title *"Facturas"*; empty hint *"Sin facturas adjuntas."*; button **+ Añadir factura**. |
| 2 | She clicks **+ Añadir factura** | `ATT-1.picking` | The **OS file dialog** opens (from main), filtered to PDF / PNG / JPEG / WebP. The renderer shows the button in a brief pending state. |
| 3 | She selects `factura-0421.pdf` | `ATT-1.adding` | A row appears with a spinner and *"Cifrando…"*; an `aria-live="polite"` region announces *"Adjuntando factura…"*. |
| 4 | Add completes | `ATT-1.populated` | The row settles: PDF icon, *"factura-0421.pdf"*, *"312 KB"*, state badge **Disponible**. Toast: *"Factura adjuntada."* The movements badge appears. |

### 3.2 Add via drag-and-drop

| # | Step | State | Visible copy |
|---|---|---|---|
| 1 | She drags a PNG over the detail view | `ATT-1.drop-target` | The Facturas section shows a dashed drop outline + *"Suelta el archivo para adjuntarlo."* |
| 2 | She drops it | `ATT-1.adding` | Same as §3.1 step 3. The renderer resolves the OS path in preload and sends only the path; main re-reads and validates. |
| 3 | Add completes | `ATT-1.populated` | Same as §3.1 step 4. |

### 3.3 View

| # | Step | State | Visible copy |
|---|---|---|---|
| 1 | She clicks a listed invoice (or its **Ver** action) | `ATT-1.opening` | The row shows a brief spinner; `aria-live` announces *"Abriendo factura…"*. |
| 2 | Main decrypts to the secure cache + `shell.openPath` | `ATT-1.populated` | The file opens in the OS default app (PDF → Edge/Acrobat, image → Fotos). No in-app viewer. |
| 3 | She closes the transaction detail view | — | The decrypted cache copy is purged (FR14). No user-visible step. |

### 3.4 Replace

| # | Step | State | Visible copy |
|---|---|---|---|
| 1 | She clicks **Reemplazar** on a row | `ATT-1.picking` | OS file dialog opens (as §3.1). |
| 2 | She picks the corrected file | `ATT-1.adding` | The row updates in place; old attachment is tombstoned, new one shown. Toast: *"Factura reemplazada."* If the new file fails validation, the original stays and an error toast shows — nothing is lost. |

### 3.5 Remove

| # | Step | State | Visible copy |
|---|---|---|---|
| 1 | She clicks **Eliminar** on a row | `ATT-1` → modal `ATT-2` | Confirm dialog: *"¿Eliminar esta factura?"* body *"La factura dejará de estar vinculada a esta transacción."* buttons **Eliminar** / **Cancelar**. |
| 2 | She confirms | `ATT-1.removing` → `ATT-1.populated`/`empty` | Row disappears; toast *"Factura eliminada."* Movements badge disappears if it was the last one. |

## 4. Empty / Loading / Error / Availability States

| State | When | Visual |
|---|---|---|
| `empty` | Transaction has no live attachments | Hint *"Sin facturas adjuntas."* + Add button. |
| `loading` | Detail view opened, list resolving | Skeleton rows (≤ 1). |
| `adding` / `removing` / `opening` | Op in flight | Inline spinner on the affected row / section; Add disabled (one op per window, FR20). |
| `available` (badge) | Blob present + decryptable | Neutral **Disponible** badge; row fully interactive. |
| `pending_sync` (badge) | Metadata synced, blob not yet local | Muted **Pendiente de sincronización** badge + tooltip *"El archivo aún se está sincronizando desde SharePoint."* View disabled. **Not an error color.** |
| `missing_blob` (badge) | Blob expected but absent (not recent sync) | Warning **No encontrada** badge + tooltip explaining the file could not be located; View disabled. |
| `corrupt_or_wrong_key` (badge) | Blob present, AEAD open fails | Error **Dañada** badge + tooltip *"No se pudo descifrar el archivo (posible daño o clave incorrecta)."* View disabled. |
| `type-rejected` (transient) | Added file fails magic-byte/type check | Error toast *"Tipo de archivo no admitido. Usa PDF, PNG, JPEG o WebP."* No row created. |
| `too-large` (transient) | File > 10 MB | Error toast *"El archivo supera el límite de 10 MB."* No row created. |
| `at-cap` | 20 attachments reached | Add button disabled + hint *"Máximo de 20 facturas por transacción."* |
| `busy` | Second op attempted while one runs | Toast *"Espera a que termine la operación actual."* |

## 5. State Diagram

```
            ┌────────────┐  open detail
            │  loading   │──────────────┐
            └─────┬──────┘              │
                  │ resolved            │
        ┌─────────▼─────────┐           │
   ┌───▶│ empty / populated │◀──────────┘
   │    └───┬───────┬───────┘
   │  Add   │       │  View
   │ (dialog│       ▼
   │  /drop)│   ┌────────┐ shell.openPath  ┌───────────────┐
   │        │   │ opening│────────────────▶│ OS default app│
   │        ▼   └────────┘                 └───────────────┘
   │   ┌────────┐ validate(magic,size)
   │   │ adding │── fail ─▶ toast (type-rejected / too-large), no row
   │   └───┬────┘
   │  ok   │  seal → write blob → event → audit
   │       ▼
   │   (row available)   Remove ─▶ confirm ATT-2 ─▶ removing ─▶ tombstoned
   └───────────────────────────────────────────────────────────────────┘
                       Replace = Remove(old) + Add(new), one gesture
```

## 6. Accessibility (WCAG 2.1 AA)

- **Keyboard:** Add, and each row's View / Replace / Remove are reachable and
  operable by keyboard; the drop target is a progressive enhancement with an
  equivalent button path. Focus moves to the new row after Add and to the
  section heading after Remove.
- **Screen reader:** async results (`adding`, `opening`, `removing`) announced
  via `aria-live="polite"`; errors via `role="alert"`. Each row's accessible
  name = filename + type + size + availability state (state is **not**
  conveyed by color alone — text label + icon).
- **Confirm dialog `ATT-2`:** focus-trapped, `aria-modal`, Escape cancels,
  default focus on **Cancelar**.
- **Contrast & focus:** badges and icons meet 3:1 non-text contrast; visible
  focus rings on all controls.
- **Reduced motion:** spinners respect `prefers-reduced-motion` (swap to a
  static "…" indicator).
- **Theme:** badges legible in light / dark / system themes.

## 7. Copy (ES + EN)

| Key | ES | EN |
|---|---|---|
| Section title | Facturas | Invoices |
| Empty hint | Sin facturas adjuntas. | No invoices attached. |
| Add button | + Añadir factura | + Add invoice |
| Drop target | Suelta el archivo para adjuntarlo. | Drop the file to attach it. |
| Adding | Cifrando… | Encrypting… |
| Add announce | Adjuntando factura… | Attaching invoice… |
| Add success | Factura adjuntada. | Invoice attached. |
| Opening | Abriendo factura… | Opening invoice… |
| Replace action | Reemplazar | Replace |
| Replace success | Factura reemplazada. | Invoice replaced. |
| Remove action | Eliminar | Remove |
| Remove confirm title | ¿Eliminar esta factura? | Remove this invoice? |
| Remove confirm body | La factura dejará de estar vinculada a esta transacción. | The invoice will no longer be linked to this transaction. |
| Remove success | Factura eliminada. | Invoice removed. |
| Badge available | Disponible | Available |
| Badge pending sync | Pendiente de sincronización | Pending sync |
| Badge missing | No encontrada | Not found |
| Badge corrupt | Dañada | Damaged |
| Type rejected | Tipo de archivo no admitido. Usa PDF, PNG, JPEG o WebP. | Unsupported file type. Use PDF, PNG, JPEG, or WebP. |
| Too large | El archivo supera el límite de 10 MB. | The file exceeds the 10 MB limit. |
| At cap | Máximo de 20 facturas por transacción. | Maximum of 20 invoices per transaction. |
| Busy | Espera a que termine la operación actual. | Wait for the current operation to finish. |
| Pending-sync tooltip | El archivo aún se está sincronizando desde SharePoint. | The file is still syncing from SharePoint. |

## 8. Edge Cases

1. **Sync lag on view.** User clicks an attachment whose blob just arrived
   mid-session → main re-checks existence before decrypt; if still absent, the
   badge flips to `pending_sync` and View is disabled (no error dialog).
2. **External app keeps a copy.** After `shell.openPath`, the OS app may copy
   the file into its own recents/cloud. The pre-feature disclosure (first add)
   states this plainly; OpenTreasury only guarantees its own cache is purged.
3. **App quit while a viewer is open.** Cache sweep on `will-quit` and on next
   launch removes the decrypted copy even if the external app still holds it
   open (the external app's handle is its own concern).
4. **Duplicate file.** Attaching a file whose plaintext `sha256` matches an
   existing live attachment is allowed in v1 but the UI may show a subtle
   *"Ya existe una factura idéntica"* hint (non-blocking). (Confirm — OQ.)
5. **Corrupt blob.** AEAD open fails → `corrupt_or_wrong_key` badge; View
   disabled; Remove still available so the user can clear the broken reference.
6. **Cap reached.** 20th attachment present → Add disabled with the `at-cap`
   hint.
7. **Transaction deleted with attachments.** The transaction's attachments are
   hidden along with it; blobs retained for GC (feature spec FR15).
8. **Drag of multiple files.** v1 attaches the **first** file and shows a hint
   *"Solo se adjunta un archivo a la vez."* (multi-select is a fast-follow — feature
   OQ6).

## 9. Component Reuse

- **`TransactionDetailModal`** — host; new `AttachmentsSection` mounted below
  `NotesThread`.
- **`ConfirmDialog`** — the `ATT-2` remove confirmation (same as Notes delete).
- **Toast system** — success/error feedback (same as Notes / Export).
- **Movements row** — add a paperclip badge slot driven by
  `attachmentParentIds.has(txId)` (feature spec §6.2), mirroring how splits mark
  rows.
- **Icons** — Lucide `Paperclip` (badge / section), `FileText` (PDF),
  `Image` (image), `Eye`/`Trash2`/`RefreshCw` (View/Remove/Replace).

## 10. Traceability

- **Paired feature spec:** [`docs/specs/029-invoice-attachments.md`](../../specs/029-invoice-attachments.md).
- **UX dependencies:**
  - [UX-006 app shell & navigation](ux-006-app-shell-and-navigation.md) — global
    states, toast host.
  - Transaction detail / Notes UX — section layout, ConfirmDialog idiom, row
    actions parity.
- **Security requirements satisfied (UX-level):** R8 (audit visibility via
  success/error feedback), R11 (no path strings in renderer state), R12 (no
  plaintext bytes in renderer state), R15 (no filename PII in logs/toasts beyond
  on-screen display), R18 (cache destination controlled by main).
- **Crypto-spec sections:** §1.1, §2 / §2.1, §8.2, §8.3 (mirrored from the paired
  feature spec).
- **Backlog note:** [`docs/ux/ux-spec-plan.md`](../ux-spec-plan.md) row
  "UX-027 Attachments (receipts)" is realized here and has been re-pointed to
  **SPEC-029**.

## 11. Out of Scope (v1)

- **In-app preview / inline thumbnails of file contents** — v1 opens in the OS
  default app only (decrypting bytes into the renderer widens the plaintext
  blast radius). A future sandboxed image preview is feature OQ5.
- **Multi-file add in one gesture** — single file in v1 (feature OQ6).
- **Including attachments in CSV/XLSX export** — feature FR19 / OQ2.
- **Bulk attach from the movements list** — not in v1.
- **Editing/annotating the invoice inside OpenTreasury** — not in v1.
- **Server-side virus scanning** — out of scope; magic-byte + type allowlist +
  size cap are the v1 controls.

## 12. Open Questions

Mirrors §12 of the paired feature spec. UX-level additions:

- **UX-A.** Duplicate-file hint (edge case 4) — show a soft "identical invoice
  already attached" notice, or stay silent? Recommendation: **soft hint,
  non-blocking**.
- **UX-B.** Should the section show a small file-type/size summary line when
  multiple invoices are attached (e.g. *"3 facturas · 1,2 MB"*)? Recommendation:
  **yes**, low cost.
- **UX-C.** First-add disclosure: one-time modal vs. inline helper text about the
  "opens in external app, which may keep a copy" caveat? Recommendation:
  **one-time modal**, then inline tooltip thereafter.

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-06-01 | Draft | Niobe | Initial UX spec paired with `docs/specs/029-invoice-attachments.md`. Covers ATT-1 section + ATT-2 confirm, add (picker + drag-drop), view (OS default app), replace, remove, availability badges (available/pending_sync/missing/corrupt), movements badge, ES+EN copy, accessibility, 8 edge cases, component reuse. 3 UX open questions. Awaiting Switch/Neo/Link review in lockstep with the feature spec. (Renumbered from SPEC-028 → SPEC-029; SPEC-028 was reserved by the Audit & Evidence spec.) |
