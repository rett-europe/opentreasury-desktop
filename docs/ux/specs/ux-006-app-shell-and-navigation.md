# UX-006 — App Shell & Navigation

> **Status:** Draft v0.1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-19
> **Paired PRD:** none direct; hosts every PRD's UI (PRD-001/002/003 at M1).
> **Note on numbering:** plan (`ux-spec-plan.md`) had shell as UX-004 historically; this deliverable adopts **UX-006** per the batch-1 task spec. Plan will be reconciled in the plan-update step.

**Traceability:** vision §5, §7 Principle 5 (offline), §13 divergence "Authentication" (no login screen) · ADR-001 **C6**, **C7**, **C13** · security-requirements v0.2 **R11** (Electron hardening), **R12** (IPC schemas), **R15** (no PII in logs) · crypto-spec §2 (renderer never sees keys) · prototype-analysis **G1**, **G3**, **G7**, **UX-R4** · decisions 2026-04-19 (day-0 i18n; locale switcher visible; **no pending/draft transaction concept anywhere**).

---

## 1. Summary

The app shell is the persistent frame around every screen: a top bar (logo, global search entry, sync indicator, locale switcher, settings), a left sidebar (Panel / Movimientos / Saldo / Cuentas / Categorías / Etiquetas / Importación / Exportar), and a content area that swaps per route. It also owns the cross-cutting global states — **offline**, **syncing**, **locked** (no dataset open), **error-banner**, and **normal** — which any screen inherits.

## 2. User problem

Treasurers need a consistent, predictable frame: where am I, what's the sync state, how do I switch screens, how do I change language, how do I get to settings — without a login screen (per product divergence) and without a pending-transaction mental model (removed from product).

## 3. Actors & preconditions

- **Treasurer**, post-UX-001 Branch A success OR post-UX-002 enrollment success OR resume (Branch C).
- **Main process** — provides dataset context to renderer via schema-validated IPC (C13).
- **Renderer** — hosts the shell; no filesystem, crypto, or keychain access (C6).

**Preconditions:** dataset loaded (escrow read, DEK unwrapped in main) OR locked state (no dataset). No authentication layer — identity is the OS user + their OneDrive account (divergence-from-cloud).

## 4. Happy path (shell appears after first-run or on launch with prior state)

| # | User sees | User does | System does |
|---|---|---|---|
| 1 | Topbar: logo · global search (disabled M1; "pending v1.x" tooltip) · sync indicator · locale switcher · settings icon. Sidebar: Panel (selected by default). Content area: Panel (UX-007 spec). | — | Main emits dataset context (NGO display name, member/device info, DEK-loaded=true) to renderer via IPC |
| 2 | Click sidebar item `Movimientos` | Click | Route swap; Movements renders its own `empty-on-open` state (PRD-001 PR1) |
| 3 | Click locale switcher `EN ↔ ES` | Pick | i18n framework swaps active locale; every string in the current view re-resolves; persisted to user-prefs file in `%APPDATA%` (not in OneDrive) |
| 4 | Click settings icon | Click | Route to Settings (UX-011, future) |
| 5 | OneDrive goes offline | — | Sync indicator switches to **offline**; persistent banner below topbar *"Sin conexión — los cambios se sincronizarán cuando vuelvas en línea."* |

## 5. States (global)

The shell itself has 5 global states; every screen composes on top of them.

```mermaid
stateDiagram-v2
    [*] --> locked: launch, no dataset
    locked --> normal: UX-001 / UX-002 completes
    normal --> syncing: outbound writes queued
    syncing --> normal: queue drained
    normal --> offline: OneDrive unreachable
    offline --> normal: OneDrive back + sync caught up
    offline --> syncing: OneDrive back with queued writes
    normal --> error-banner: recoverable error
    error-banner --> normal: user dismisses / issue resolves
    syncing --> error-banner: sync conflict or crypto error
    offline --> error-banner: crypto / integrity issue detected locally
    normal --> locked: "wipe local data" / change folder
    error-banner --> [*]: fatal → app quits
```

| State | What's shown | Interactive? | Copy cue |
|---|---|---|---|
| `locked` | full-viewport first-run redirect / re-link prompt; sidebar hidden | Limited (CTA only) | `ux.shell.locked.title` |
| `normal` | topbar + sidebar + content; sync indicator green (up-to-date) | Yes | — (no chrome copy) |
| `syncing` | sync indicator shows spinner/arrows; tooltip "Sincronizando…"; no banner | Yes | `ux.shell.sync.syncing` |
| `offline` | sync indicator red/grey; persistent banner under topbar | Yes | `ux.shell.sync.offline.banner` |
| `error-banner` | inline banner in content-area top slot (severity tokens owned by Mouse); dismissible OR blocking per error class (UX-009) | Yes | `ux.shell.error.*` |

**No `pending-transaction` state anywhere.** The product has no pending/draft/provisional concept per decisions 2026-04-19. The shell must not surface any such affordance.

## 6. Layout regions (abstract — no pixels)

| Region | Role | Contents | Notes |
|---|---|---|---|
| **Primary header (topbar)** | identity & globals | NGO display name · global search entry (disabled M1) · sync indicator · locale switcher · settings icon | Persistent in `normal`, `syncing`, `offline`, `error-banner` |
| **Primary nav (sidebar)** | route switcher | Panel · Movimientos · Saldo · Cuentas · Categorías · Etiquetas · Importación · Exportar | Collapsible; keyboard-navigable |
| **Content area** | current screen | routed screen (UX-001 success → Panel by default) | Owns its own empty/loading/error states |
| **Global banner slot** | cross-cutting signals | offline banner · error banner · update-available banner (UX-020) | Single-slot: one banner at a time, priority-ordered |
| **Status rail (optional)** | secondary signals | last-synced time expanded detail (from sync-indicator click) | Owned by UX-005 |

## 7. Edge cases & errors

| Trigger | Shell behaviour | Recovery |
|---|---|---|
| **E1.** Dataset DEK not yet in memory (cold launch mid-unlock) | Locked state with a one-line "Opening treasury…" progress; no sidebar | Automatic once main emits dataset-ready |
| **E2.** OneDrive client not running | `offline` state with CTA "Start OneDrive" (deep-link platform handler) | User action |
| **E3.** Sync lag > 5 min | `syncing` with stale-indicator tooltip "Tu última sincronización fue hace {relative time}" | UX-005 owns the detail surface |
| **E4.** Crypto integrity error (chain break / bad AAD / wrong DEK version) | **Blocking** `error-banner` at top of content area; content below is read-only; sidebar disabled except for Settings (UX-009 recovery) | UX-009 path |
| **E5.** Fatal error (escrow unreadable) | Full-viewport fatal screen; shell components hidden except app quit | User quits / escalates |
| **E6.** Update available (UX-020) | Non-blocking banner in global slot; lower priority than offline/error | User clicks |
| **E7.** Locale switcher clicked mid-operation (e.g., with a modal open) | Swap completes; any open modal re-renders strings; focus preserved | Automatic |
| **E8.** Window resize below minimum width | Sidebar auto-collapses to icon-only; topbar compresses | Automatic |
| **E9.** Multiple banners eligible at once | Single-slot priority: **blocking error > offline > update available > informational** | Automatic |

## 8. Accessibility

- **Landmarks:** `banner` (topbar), `navigation` (sidebar), `main` (content area), `complementary` (status rail).
- **Tab order:** topbar L→R (logo → search → sync indicator → locale → settings), then sidebar top→bottom, then content area.
- **Screen reader:** route changes announced via a visually-hidden `aria-live="polite"` region. Sync-state transitions announced via `aria-live="polite"` with throttling (no more than 1 announcement per 5s).
- **Keyboard shortcuts** (Mac: substitute `Cmd`):
  - `Ctrl+,` → Settings
  - `Ctrl+Shift+P` → Panel · `Ctrl+Shift+M` → Movimientos · `Ctrl+Shift+S` → Saldo
  - `Ctrl+L` → locale switcher focus
  - `Ctrl+N` → new transaction (from anywhere; confirms PR recommendation in prototype-analysis) **[Open Q1 to Pedro — ratify]**
  - `Esc` dismisses banners where the banner is dismissible (never dismisses blocking errors).
- **Focus rings** visible on all interactive elements.
- **Contrast AA** for sync-indicator states (offline must not rely on colour alone — icon + label).
- **Reduced-motion** respected (no spinner animation if user prefers reduced motion — swap to static "Sincronizando…").
- **Text-zoom 200%** supported: topbar overflow gracefully collapses secondary items (locale, search) into a `⋯` overflow menu.

## 9. i18n notes

- **Day-0 ES + EN**, all strings keyed. Root: `ux.shell.*`.
- **Locale switcher is in the topbar** (since i18n is day-0 per decisions 2026-04-19). Label: `ES` / `EN`; active-locale indicated by accent + `aria-current="true"`. Persisted to `%APPDATA%` user-prefs (not OneDrive — per-device).
- **Locale-aware formatters** via `Intl.DateTimeFormat` and `Intl.NumberFormat` — shell surfaces one (sync-indicator relative time "hace 5 minutos" / "5 minutes ago"). All other locale-formatted strings live on the hosted screens.
- **Pluralization:** sync-indicator relative-time strings use ICU forms.
- **ES vs EN layout risk** (flag for Mouse): sidebar labels in Spanish are longer (`Movimientos`=11, `Movements`=9; `Importación`=11 vs `Import`=6; `Exportar`=8 vs `Export`=6). Sidebar minimum width must accommodate Spanish without truncation.
- **RTL not in scope** (ES and EN are both LTR). Flag in open questions if more languages are later added.
- UPN / NGO display name: raw interpolation; never localise.

## 10. Copy guidance

**Tone:** neutral, chrome-like, invisible when things are normal; direct and instructional when not.

| Key | ES | EN |
|---|---|---|
| `ux.shell.nav.panel` | "Panel" | "Dashboard" |
| `ux.shell.nav.movements` | "Movimientos" | "Movements" |
| `ux.shell.nav.balance` | "Saldo" | "Balance" |
| `ux.shell.sync.syncing` | "Sincronizando…" | "Syncing…" |
| `ux.shell.sync.offline.banner` | "Sin conexión — los cambios se sincronizarán cuando vuelvas en línea." | "Offline — changes will sync when you're back online." |
| `ux.shell.locale.label` | "Idioma" | "Language" |
| `ux.shell.search.disabled-tooltip` | "La búsqueda global llega en v1.x" | "Global search arrives in v1.x" |

## 11. Out of scope

- Sync indicator detail surface (state machine, last-synced time math, conflict copy) → **UX-005**.
- Error-banner content (crypto-error copy, recovery flows, severity visuals) → **UX-009**.
- Global search implementation → **v1.x** (UX-013-ish; out of v1).
- Settings content (folder, language, security, diagnostics) → **UX-011**.
- Update flow / signature verification UI → **UX-020**.
- Notifications (OS-level + in-app) → **UX-025**.
- Members / admin view (for admin-only affordances) → **UX-012 / UX-024**.
- Visual design tokens (colours, spacing, iconography, widths) → **Mouse**.

## 12. Open questions

1. **`Ctrl+N` universal new-transaction shortcut** — ratify. Recommendation: yes. → **Pedro**.
2. **Sidebar collapse default** — expanded by default on desktop, collapsed on narrow windows; remember per-device preference? → **Pedro / Mouse**.
3. **Search affordance while disabled** — show entry greyed with tooltip, or hide entirely in M1? Recommendation: show greyed with tooltip (teaches users it's coming). → **Link**.
4. **Global-banner priority order** — proposed blocking-error > offline > update-available > informational. → **Mouse + Switch** (severity tokens).
5. **Locale switcher placement** — topbar (always visible) vs Settings only. Given day-0 i18n is a hard requirement, visible in topbar is proposed. Confirm. → **Pedro**.
6. **`Ctrl+,` Settings shortcut on non-Mac** — some Windows apps use `Ctrl+,`, others `F10`. Recommendation: `Ctrl+,` for cross-platform muscle memory. → **Pedro**.
7. **Locked-state landing** when dataset change / wipe is mid-flight — do we return to UX-001 welcome, or a truncated "re-link this device" screen? Recommendation: truncated re-link. → **Niobe + Link** follow-up.

## 13. Acceptance criteria

- AC1 — Shell has exactly 5 global states (`locked`, `normal`, `syncing`, `offline`, `error-banner`) per §5; no sixth `pending` state exists.
- AC2 — No string in the shell is hardcoded; every string resolves through i18n with both `es` and `en` populated.
- AC3 — Locale switcher is present in the topbar at all times (except `locked`) and persists selection per-device (not in OneDrive).
- AC4 — Sidebar minimum width fits Spanish labels without truncation at 100% and 125% OS scaling.
- AC5 — Offline banner appears within 10s of OneDrive unreachable and clears within 10s of OneDrive recovery.
- AC6 — Blocking-error state disables sidebar navigation except for Settings.
- AC7 — Keyboard shortcut map in §8 is fully wired; all are announced in the Settings > Keyboard Shortcuts reference (UX-011).
- AC8 — Single-banner slot enforces the priority order in §11 Q4 (once ratified).
- AC9 — Renderer never imports from `src/main/`, `src/crypto/`, or `src/storage/` (ADR-001 C6); verified by `import/no-restricted-paths`.
- AC10 — No renderer log statement outputs full objects containing PII (R15 redaction lint).

## 14. Traceability matrix

| Requirement | Source | Where in this spec |
|---|---|---|
| No authentication / login screen | vision §13 divergence | §3, §1 |
| Renderer isolation | ADR-001 C6, R11 | AC9, §3 |
| Schema-validated IPC | ADR-001 C13, R12 | §3 |
| Offline-first state | vision §7 Principle 5 | §5 `offline`, §7 E2 |
| Sync transparency | prototype-analysis G3 / UX principle 4 | §5 `syncing`, §6 topbar |
| Day-0 ES + EN + visible locale switcher | decisions 2026-04-19 | §9, AC2, AC3 |
| No pending/draft state | decisions 2026-04-19 (product reshape) | §1, §5 (explicit negative), AC1 |
| PII redaction in logs | R15 | AC10 |
| Single banner slot priority | UX principle 3 (errors actionable) | §7 E9, §11 Q4 |

## 15. Status history

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Niobe | Initial shell spec. State model excludes pending per product reshape. Batch 1 of Wave-1 UX specs. |
