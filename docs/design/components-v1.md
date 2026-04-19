# Components v0.1

> **Status:** Draft v0.1 · **Owner:** Mouse (UI Designer) · **Date:** 2026-04-19
> **Depends on:** [design-principles.md](./design-principles.md) · [tokens.md](./tokens.md) · all Wave-1 UX specs (UX-001/002/003/004/005/006).
> **Consumer:** Trinity (Frontend) implements these. This spec defines anatomy, states, props, a11y — **not** React code.

The minimum component primitive set to realize Wave 1. Each entry is anatomy + states + API shape + a11y + i18n + UX consumers.

**Convention:** Components read design tokens only. Raw hex / raw pixel values in a component override = bug.

---

## Component index

1. [Button](#1-button)
2. [Input / TextField](#2-input--textfield)
3. [Select / Dropdown](#3-select--dropdown)
4. [Date / DateRange picker](#4-date--daterange-picker)
5. [Banner / Alert](#5-banner--alert)
6. [Dialog / Modal](#6-dialog--modal)
7. [Navigation rail / sidebar](#7-navigation-rail--sidebar)
8. [Topbar](#8-topbar)
9. [Toast / Snackbar](#9-toast--snackbar)
10. [Badge / Pill](#10-badge--pill)
11. [Empty state](#11-empty-state)
12. [Loading skeleton](#12-loading-skeleton)
13. [Data table](#13-data-table)
14. [Chart primitives](#14-chart-primitives)
15. [Locale switcher](#15-locale-switcher)
16. [CodeDisplay](#16-codedisplay-security-primitive)

---

## 1. Button

Primary affordance for all user actions.

### Anatomy

```
┌─────────────────────────────┐
│  [icon?]  Label  [spinner?] │
└─────────────────────────────┘
   ↑         ↑          ↑
   padding   text       loading state (replaces icon; label stays)
```

### Variants

| Variant | Use | Visual |
|---|---|---|
| `primary` | Single primary action per surface | `accent.default` fill, `text.inverse` label |
| `secondary` | Alternate / non-primary actions | `surface.primary` fill, `border.default` stroke, `text.primary` label |
| `destructive` | Revoke, delete, discard, reject (UX-002 admin modal Reject) | `danger.default` fill, `text.inverse` label |
| `ghost` | Low-emphasis actions (Clear filters, Cancel in dialogs) | No fill, `text.primary` label; hover = `accent.subtle` bg |
| `link` | Inline text-like actions (`Ver todos los movimientos →`) | `text.link` colour, no chrome |

### Sizes

| Size | Height | Padding-x | Type | Use |
|---|---|---|---|---|
| `default` | 36 px | `space.4` (16) | `type.body` | Most actions |
| `compact` | 28 px | `space.3` (12) | `type.small` | Data-table row-level actions, filter-bar controls |
| `large` | 44 px | `space.5` (20) | `type.body-strong` | First-run hero CTA (UX-001 step 1 "Get started") |

Minimum width: `max(content-width + 2× padding-x, 88 px)`. Spanish CTAs (`Registrar primer movimiento`) MUST render without truncation.

### States

| State | Visual |
|---|---|
| `default` | Variant fill |
| `hover` | `{variant}.hover` fill |
| `active` (pressed) | `{variant}.active` fill |
| `focus-visible` | Adds `shadow.focus` (2px ring, accent colour) — always visible, even inside tables |
| `disabled` | `{variant}.disabled` fill, `text.disabled` label, `cursor: not-allowed`, no hover response, `aria-disabled="true"` |
| `loading` | Label stays, leading icon swaps to spinner, click is ignored, `aria-busy="true"` |
| `icon-only` | Square (36×36 default), `aria-label` required |

### Props / variants (API shape)

```
Button(
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'link' = 'secondary',
  size: 'default' | 'compact' | 'large' = 'default',
  leadingIcon?: LucideIcon,
  trailingIcon?: LucideIcon,
  iconOnly?: boolean,         // requires `aria-label`
  loading?: boolean,
  disabled?: boolean,
  fullWidth?: boolean,        // for modal footers
  children: ReactNode,        // the label
  // ...native button attrs
)
```

### Accessibility

- Native `<button>` element.
- **Never** icon-only for destructive actions (Principle P3).
- Focus ring visible in every state, including inside data-table rows.
- `aria-busy="true"` during `loading`; label still announced; click handler gated.
- **Approve/Reject are not keyboard-adjacent** on UX-002 admin modal (enforced at dialog level — see §6, but buttons honour natural tab order with a deliberate separator element between them).
- Destructive buttons do not auto-focus — confirmations must be deliberate.

### i18n notes

- Minimum widths fit ES (Principle P5). `Registrar primer movimiento` (28ch) = widest Wave-1 CTA; `large` button accommodates it with `space.5` side padding on a 280px natural width.
- Icon+text order is LTR-only in v1. RTL is out of scope; if added later, icon swap logic is at the Button layer, not per-caller. **Flag:** no RTL-specific tokens yet.

### Consumer specs

- UX-001: welcome CTA (large primary), folder picker (secondary), R20 posture Continue (primary, disabled until scrolled)
- UX-002: Request enrollment (primary), Approve (primary, non-adjacent), Reject (destructive, non-adjacent), Ask me later (ghost)
- UX-003: Nuevo Movimiento (primary), Limpiar filtros (ghost, compact), preset chips (Button-like but see §10 Pill)
- UX-005: Ver todos los movimientos → (link)
- UX-006: topbar Settings icon button (icon-only, `aria-label="Ajustes"`)

---

## 2. Input / TextField

Single-line text input with structured affordances.

### Anatomy

```
Label (required?)
┌────────────────────────────────┐
│ [leadingIcon?]  value          │
└────────────────────────────────┘
Helper text / Error message
```

### States

| State | Visual |
|---|---|
| `default` | `surface.primary` fill, `border.default` 1px |
| `hover` | `border.strong` |
| `focus` | `border.strong` + `shadow.focus` |
| `filled` | same as default; label stays above |
| `disabled` | `surface.sunken` fill, `text.disabled` |
| `error` | `border.default` → `danger.default`; error message below in `danger.default` / `type.caption` |
| `read-only` | `surface.secondary` fill, no border, no focus ring change |

### Props

```
TextField(
  label: string,
  value: string,
  onChange,
  required?: boolean,       // shows asterisk; screen-reader announces "required"
  helperText?: string,
  errorText?: string,       // presence triggers error state
  leadingIcon?: LucideIcon,
  trailingIcon?: LucideIcon,
  type?: 'text' | 'email' | 'number',
  inputMode?: 'decimal' | 'numeric',  // for amount min/max on Movements
  placeholder?: string,     // decorative only; never sole label
  disabled?: boolean,
  readOnly?: boolean,
  maxLength?: number,
)
```

### Accessibility

- `<label>` ALWAYS associated via `htmlFor` / `id`. Placeholders are decorative.
- `aria-invalid="true"` on error; error text via `aria-describedby`.
- `aria-required` on required fields.
- `required` marker is `*` **plus** screen-reader text ("(required)" / "(obligatorio)") — not colour alone.
- `inputMode="decimal"` with `Intl`-locale-aware parsing (ES uses `,`; EN uses `.`) per UX-003 §8. Normalization is component-level.

### i18n notes

- Spanish labels often 20-30% longer than English. Default input width 260 px; labels wrap above input (never truncate).
- Placeholder string MUST be translated.

### Consumer specs

- UX-001 device-name (text, required)
- UX-002 device-name confirmation (text, required)
- UX-003 filter bar: amount-min, amount-max (inputMode="decimal"); topbar search (text, leadingIcon=Search, disabled in M1 with tooltip)

---

## 3. Select / Dropdown

Single-select only in v1. Multi-select deferred.

### Anatomy

```
Label
┌────────────────────────────────┐
│ Selected value         [▼]     │   ← trigger
└────────────────────────────────┘
 opens ↓
┌────────────────────────────────┐
│ Option 1                        │
│ Option 2       (hover)          │
│ ✓ Option 3    (selected)        │
└────────────────────────────────┘
```

Uses `z.dropdown`, `shadow.dropdown`, `radius.md`.

### States

| State | Visual |
|---|---|
| `default` | Trigger like Input `default` |
| `hover` | Trigger like Input `hover` |
| `open` | Trigger focused; popover rendered |
| `disabled` | Greyed trigger, chevron muted |

### Props

```
Select(
  label: string,
  value: string,
  options: Array<{ value: string; label: string; leadingIcon?: LucideIcon }>,
  onChange,
  placeholder?: string,
  disabled?: boolean,
  // Follow-up (v1.x): searchable, async-load
)
```

### Accessibility

- Implements WAI-ARIA combobox / listbox pattern.
- Keyboard: Arrow up/down traverses; Enter selects; Esc closes; Home/End jump; type-ahead buffers 1 s.
- Focus returns to trigger on close.
- `aria-expanded`, `aria-activedescendant`, `role="listbox"` on the popover.

### i18n notes

- Popover width = max(trigger width, widest option). ES labels (`Todas las categorías` = 20 ch) drive Wave-1 minimum widths.

### Consumer specs

- UX-003 filter bar: account select, category select
- UX-004 period selector (three options — implemented as segmented control, not Select — see Pill §10)
- UX-004 account filter
- UX-011 Settings > Language (later; uses Select)

---

## 4. Date / DateRange picker

**Critical for UX-003** — Movements empty-on-open gates on range selection. Must be keyboard, accessible, locale-aware.

### Anatomy — DateRange variant

```
Trigger (range pill / input):
┌─────────────────────────────────────┐
│ 📅  Abril 2026                  ✕  │   ← clear button
└─────────────────────────────────────┘
opens ↓
┌────────────────────────────────────────┐
│  Presets                               │
│  [ This month ] [ Last month ]         │
│  [ This quarter ] [ YTD 2026 ]         │
│  [ Last 12 months ] [ Custom... ]      │
│  ─────────────────────────────────     │
│  Custom range                          │
│     From: [ 2026-04-01 ]               │
│     To:   [ 2026-04-30 ]               │
│                      [ Cancel ] [ Apply ]
└────────────────────────────────────────┘
```

Uses `z.dropdown`, `shadow.dropdown`, `radius.lg`.

**On the Movements screen (UX-003), the picker opens by default** on navigate (state `range-not-selected`). Initial focus is on the first preset chip.

### States

| State | Visual |
|---|---|
| `closed-no-range` | Trigger labeled with `ux.movements.empty.pick-range.title` copy; no clear button |
| `closed-range-selected` | Trigger shows range pill (preset name or formatted range) + clear `✕` |
| `open` | Popover rendered; preset chips + custom inputs |
| `invalid-range` | `To < From`: From/To inputs marked error; Apply disabled; inline ES/EN message (UX-003 E9) |

### Props

```
DateRangePicker(
  value: { from: Date | null; to: Date | null },
  onChange,
  presets: Array<{ id: string; labelKey: string; range: () => { from: Date; to: Date } }>,
  locale: string,                   // drives calendar first-day-of-week + month names
  maxRange?: number,                // days; optional guard for UX-003 E8
  disabled?: boolean,
  openByDefault?: boolean,          // true on UX-003 mount when range-not-selected
  triggerMode: 'pill' | 'input',    // pill for UX-003 post-selection; input for embedded forms
)
```

### Accessibility

- **Presets are a radio group** (`role="radiogroup"`); chips are `role="radio"`; arrow keys traverse, Enter selects and fires `onChange`.
- Custom calendar: `role="grid"` of dates; keyboard navigation per WAI-ARIA date picker pattern (arrow = day, PageUp/Down = month, Home/End = week).
- Live region announces range selection result (`role="status"`: *"Abril 2026 seleccionado, 30 días"*).
- **`Esc` closes the picker on UX-003 but the screen stays in `range-not-selected` state** (no phantom "default range" selection).
- Calendar respects `firstDayOfWeek` from active locale (ES: Lunes; EN: Sunday).

### i18n notes

- Month and day names via `Intl.DateTimeFormat(locale, { month: 'long' | 'short', weekday: 'short' })`.
- Preset labels are keys (`ux.datepicker.presets.this-month` etc.), translated per ADR-003.
- Range pill composed via locale-aware formatter; shows preset name when the range exactly matches a preset (`Abril 2026`), otherwise formatted range (`1 abr – 30 abr 2026`).
- Validation messages (UX-003 E9) are translated.

### Consumer specs

- UX-003 Movements — the critical path; `openByDefault: true` on mount
- UX-004 — implicit via period selector; not a direct consumer in v1, but custom-range might reuse in v1.1
- Future: UX-017 export date-range selection

---

## 5. Banner / Alert

Persistent, surface-level status message. Distinct from Toast (§9) — banners don't auto-dismiss.

### Anatomy

```
┌──────────────────────────────────────────────────────┐
│ [icon]  Title                                    [✕] │   ← dismissible?
│         Body message (1 sentence)                    │
│         [Action button]                              │   ← optional inline action
└──────────────────────────────────────────────────────┘
```

### Variants (severity tones)

| Tone | Foreground | Background | Icon | Use |
|---|---|---|---|---|
| `info` | `info.default` | `info.subtle` | `Info` (Lucide) | UX-006 offline banner, UX-020 update available, UX-003 `new-activity` (debated — see UX-003 §11 Q8) |
| `success` | `success.default` | `success.subtle` | `CheckCircle2` | Rare at banner level; most successes are toasts |
| `warning` | `warning.default` | `warning.subtle` | `AlertTriangle` | Soft integrity issues (UX-001 E7 non-treasury files at root), partial-data warnings |
| `danger` | `danger.default` | `danger.subtle` | `AlertOctagon` | UX-003/004/005 partial-decrypt-failed; device revoked; crypto integrity errors |
| `critical` | `text.inverse` on `danger.default` | `danger.default` | `AlertOctagon` | Blocking errors (UX-006 E4 chain break). Dismissible = false. |

### Dismissibility

| Rule | Applied to |
|---|---|
| `dismissible: false` | `critical` always; `danger` when blocking (crypto integrity); UX-006 `offline` (clears automatically when OneDrive returns) |
| `dismissible: true` | `info` informational, `warning` soft, transient `success` |

`Esc` dismisses a dismissible banner IF it currently has focus; never dismisses a blocking banner.

### Global banner slot (UX-006)

UX-006 §7 E9 defines the single-banner slot with priority: **`critical` > `danger` (blocking) > `offline` > `update-available` > `info`**. The Banner component exposes a `priority` prop used by the shell's banner manager.

### Props

```
Banner(
  tone: 'info' | 'success' | 'warning' | 'danger' | 'critical',
  title: string,
  body?: string,
  action?: { label: string; onClick: () => void },
  dismissible?: boolean = inferred-from-tone,
  onDismiss?: () => void,
  priority?: number,       // for shell slot
  role?: 'alert' | 'status',  // defaults 'alert' on first mount, 'status' thereafter
)
```

### Accessibility

- First render: `role="alert"` (`aria-live="assertive"` semantics). Re-renders demote to `role="status"` (polite) to avoid re-interruption. UX-003 §7 / UX-005 §7 / UX-006 §8 align on this pattern.
- Icon is decorative (`aria-hidden="true"`); tone is also communicated by the title copy.
- Colour never sole channel (Principle P3): icon + colour + body text all carry severity.
- Action button inside banner follows standard Button a11y (§1).

### i18n notes

- Title + body flex the container width (Principle P5). Minimum banner height 48 px, grows with wrapped Spanish.
- Action button label translated.

### Consumer specs

- UX-006 offline banner (`info`, dismissible=false)
- UX-003 statement-import banner (`info`, dismissible), new-activity banner (`info`, dismissible), single-row decrypt footnote (inline, not banner — see Data Table §13)
- UX-004 partial-decrypt-failed banner (`danger`)
- UX-005 partial-decrypt-failed banner (`danger`)
- UX-006 blocking-error banner (`critical`)

---

## 6. Dialog / Modal

Focus-trapped overlay. Used sparingly — **never** for state Trinity can express in-page.

### Sizes

| Size | Max width | Use |
|---|---|---|
| `small` | 420 px | Confirmations ("Withdraw pending request?"), simple choices |
| `medium` | 560 px | UX-002 admin approval modal, UX-003 large-range guard (E8) |
| `large` | 720 px | Complex forms (new-transaction form, v1.x) |

### Anatomy

```
──── backdrop (surface.overlay, z.modal-scrim) ────
  ┌────────────────────────────────────────┐
  │ Title                              [✕] │
  │ ──────────────────────────────────────  │
  │                                        │
  │ Body content                           │
  │                                        │
  │ ──────────────────────────────────────  │
  │              [Secondary] [Primary]     │
  └────────────────────────────────────────┘
```

Uses `shadow.dialog`, `radius.lg`, `z.modal`.

### Dismissal rules

| Trigger | Default | Override |
|---|---|---|
| Backdrop click | Closes (`onDismiss`) | Disable for destructive confirmations & security-sensitive (UX-002 approval) |
| `Esc` key | Closes (`onDismiss`) | Disable for blocking modals (none in Wave 1); UX-002 `Esc` = Ask me later (NOT Approve/Reject) |
| Close `✕` button | Always closes | Hidden for blocking modals |

**UX-002 admin approval modal** overrides:
- Backdrop click = treated as "Ask me later" (preserves pending request)
- `Esc` = same
- Approve and Reject are **not keyboard-adjacent** — a non-interactive spacer between them prevents fat-finger approval

### Props

```
Dialog(
  open: boolean,
  onOpenChange,
  size: 'small' | 'medium' | 'large',
  title: string,
  description?: string,
  children: ReactNode,
  primaryAction?: { label: string; onClick: () => void; variant?: 'primary' | 'destructive'; disabled?: boolean },
  secondaryAction?: { label: string; onClick: () => void },
  dismissOnBackdrop?: boolean = true,
  dismissOnEsc?: boolean = true,
  showClose?: boolean = true,
  preventApproveKeyboardAdjacency?: boolean = false,   // UX-002 exposes this
)
```

### Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` = title id, `aria-describedby` = description id (if provided).
- **Focus-trap**: first focusable element focused on open; Tab cycles within; on close, focus returns to the trigger.
- Background content receives `aria-hidden="true"` while modal is open.
- Primary and secondary action tab order: secondary before primary (matches Windows convention).
- Reduced motion: skip slide/scale animation; fade only (or no animation at `prefers-reduced-motion`).

### i18n notes

- Action labels translated. Minimum dialog width accommodates Spanish action labels.
- Title wraps, never truncates.

### Consumer specs

- UX-002 admin approval modal (medium, `preventApproveKeyboardAdjacency: true`)
- UX-002 requester self-cancel confirm (small)
- UX-003 large-range guard (medium, E8)

---

## 7. Navigation rail / sidebar

Left-side primary navigation for UX-006.

### Anatomy (expanded)

```
┌─────────────────┐
│ [brand-mark] OT │   ← (or in topbar; design-decision below)
├─────────────────┤
│ [icon] Panel    │
│ [icon] Movtos.  │   ← active item: accent bar + accent bg
│ [icon] Saldo    │
│ [icon] Cuentas  │
│ [icon] Categor. │
│ [icon] Etiqtas. │
│ ────────────    │
│ [icon] Importac.│
│ [icon] Exportar │   ← disabled in M1 with tooltip "v1.1"
└─────────────────┘
Width: 240 px
```

### Anatomy (collapsed / rail)

```
┌───┐
│[■]│
│[■]│    ← icon-only, 48×48 targets; tooltip on hover
│[■]│    ← active item accent bar on left edge
│[■]│
│[■]│
│───│
│[■]│
│[■]│
└───┘
Width: 64 px
```

### States per item

| State | Visual |
|---|---|
| `default` | `text.secondary`, transparent bg |
| `hover` | `accent.subtle` bg, `text.primary` |
| `active` (current route) | `accent.subtle` bg, `accent.default` foreground + left 3px accent bar |
| `disabled` (Exportar in M1) | `text.disabled`, non-interactive, tooltip explains |
| `focus-visible` | `shadow.focus` ring (inside, no clipping) |

### Props

```
Sidebar(
  items: Array<{
    id: string;
    labelKey: string;
    icon: LucideIcon;
    route: string;
    disabled?: boolean;
    disabledTooltipKey?: string;
    badge?: ReactNode;  // future: member-count, enrollment-queue
  }>,
  activeId: string,
  collapsed: boolean,
  onToggleCollapsed: () => void,
)
```

### Accessibility

- `<nav aria-label="Primary">`.
- Each item is an `<a>` (router link), focusable.
- Collapsed items have `aria-label` = full label; visible label replaced by tooltip on hover/focus.
- Keyboard: Tab enters rail, arrow up/down traverses (native link tab-order also works; arrow keys are enhancement).
- `Ctrl+Shift+P/M/S` shortcuts (UX-006 §8) handled at shell level, focus the corresponding item.

### i18n notes

- Expanded rail minimum width: 240 px — sized for longest ES label (`Importación` = 11 ch) without truncation.
- Labels never truncate; if a future label exceeds the rail, widen the rail.
- **Flag to Pedro:** can Pedro confirm `Cuentas`, `Categorías`, `Etiquetas`, `Importación`, `Exportar` as the final sidebar taxonomy? Spec-level question; UX-006 §12 Q2 tangentially covers it.

### Consumer specs

- UX-006 §6 — Primary nav

---

## 8. Topbar

Persistent header.

### Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│ [brand]  Rett Spain              [🔍 search]  [sync]  ES|EN  [⚙]  │
└─────────────────────────────────────────────────────────────┘
  ↑         ↑                       ↑            ↑      ↑      ↑
  32px      NGO display name        disabled M1  sync  locale  settings
  logo                               (tooltip)   indi.
```

Height: **56 px** (standard) / 48 px (compact density). `z.topbar`.

### Regions (LTR)

| Region | Contents | Wave-1 spec |
|---|---|---|
| Brand | Logo + NGO display name | UX-006 §6 |
| Spacer | flex-grow | — |
| Search | Icon button (disabled M1, tooltip) | UX-006 §10 Q3 |
| Sync indicator | Icon + status tone (green/grey/red) + tooltip | UX-005 owns detail; §15 here |
| Locale switcher | `ES | EN` segmented | See §15 |
| Settings | Icon button (Cog) | UX-006 |

### States

Inherits `z.topbar`, `shadow.card` bottom hairline (1px `border.default`).

### Props

```
Topbar(
  ngoDisplayName: string,
  searchEnabled: boolean,                   // false in M1
  syncStatus: 'online' | 'syncing' | 'offline',
  lastSyncedAt?: Date,
  locale: 'es' | 'en',
  onLocaleChange: (locale) => void,
  onOpenSettings: () => void,
)
```

### Accessibility

- `<header role="banner">`.
- Overflow behaviour: at `breakpoint.compact`, search icon + locale switcher collapse into a `⋯` overflow `z.dropdown` menu. Settings and sync indicator remain.
- Text-zoom at 200% collapses to overflow gracefully (UX-006 §8).

### Consumer specs

- UX-006 — primary header

---

## 9. Toast / Snackbar

Transient feedback. PRD permits these; keep short-lived and non-blocking.

### Anatomy

```
┌───────────────────────────────────────────┐
│ [icon]  Message                     [Action]│
└───────────────────────────────────────────┘
```

Bottom-right of content area (not window — respects sidebar). `z.toast`. `shadow.dropdown`.

### Variants

Same severity tones as Banner (`info`, `success`, `warning`, `danger`). No `critical` — critical errors are banners (§5), never toasts.

### Behaviour

| Trigger | Duration | Dismissible |
|---|---|---|
| `success` | 4 s auto-dismiss | Yes (✕) |
| `info` | 5 s | Yes |
| `warning` | 6 s | Yes |
| `danger` | 8 s | Yes — but danger at toast-level is unusual; prefer Banner |

Paused on hover / focus. Reduced-motion: no slide-in, instant appear.

### Props

```
Toast(
  tone,
  message,
  action?: { label, onClick },
  duration?: number,    // ms, default per tone
  onDismiss?,
)
```

### Accessibility

- `role="status"` (polite) for `success`/`info`; `role="alert"` (assertive) for `warning`/`danger`.
- Focus NOT auto-shifted to toast. User finishes what they were doing; toast is ambient.
- Action button, when present, is keyboard-reachable via a shortcut: **`Ctrl+Shift+T`** focuses the most recent toast's action (UX-006 shortcuts table not yet includes this; flag for addition). **Flag to Niobe** to add.

### Consumer specs

- UX-003 E6 "Movement saved (3 abr). Outside your current range."
- UX-002 admin side step 4.3 C "Juan enrolled. They'll be unlocked as soon as OneDrive syncs."

---

## 10. Badge / Pill

Short, non-interactive or minimally interactive labels.

### Distinction: Badge vs Pill

| Kind | Shape | Interactive | Use |
|---|---|---|---|
| **Badge** | `radius.sm` | No | `Sin categorizar`, decrypt-failed marker, count indicators |
| **Pill** | `radius.pill` | Sometimes | Account pills (UX-003 col 4), range pill (closable), filter type chips, preset chips |

### Anatomy

```
Badge:   ┌──────────────┐
         │ [icon?] Text │
         └──────────────┘
         (radius.sm, space.1 padding-y, space.2 padding-x)

Pill:    ╭──────────────╮
         │ Text [✕?]    │
         ╰──────────────╯
         (radius.pill, space.1 padding-y, space.3 padding-x)
```

### Tones

| Tone | Background | Foreground |
|---|---|---|
| `neutral` | `surface.secondary` | `text.secondary` |
| `accent` | `accent.subtle` | `accent.default` |
| `success` | `success.subtle` | `success.default` |
| `warning` | `warning.subtle` | `warning.default` |
| `danger` | `danger.subtle` | `danger.default` |
| `account` | **account's custom colour** + 14% opacity bg | `text.primary` | ← UX-003 account pill special case

**Account pill** reads `account.color` from the account metadata (future PRD-010). In v1, palette is constrained to a preset of 10 curated colours (ensures contrast against both themes). Trinity implements palette lookup + contrast check; raw user-chosen hex is v1.x.

**⚠️ NOTHING uses tone "pending"** — no pending-transaction concept (decisions 2026-04-19). Badges/Pills do not ship a `pending` tone.

### States (Pill only, when interactive)

| State | Visual |
|---|---|
| `default` | Tone-standard |
| `hover` | Slight bg shift (opacity +6%) |
| `focus-visible` | `shadow.focus` |
| `closable` | Trailing `✕` (12 px), clickable |

### Props

```
Badge(tone, children, leadingIcon?)

Pill(
  tone,
  children,
  leadingIcon?,
  closable?: boolean,
  onClose?: () => void,
  selected?: boolean,       // for preset-chip / filter-chip mode
  onClick?,
)
```

### Accessibility

- Closable pills: `✕` is a `<button>` with `aria-label` of the form "Clear {range}" / "Remove {tag}".
- Selected pills (preset chips in DateRangePicker) use `role="radio"` / `aria-checked`.

### i18n notes

- Width flexes to content. Spanish account names (longer) drive pill min-width planning.

### Consumer specs

- UX-003 account pills (col 4), range pill (closable), preset chips, filter type chips, `Sin categorizar` badge, decrypt-failed footnote marker
- UX-005 `Sin categorizar` badge on recent-tx table
- UX-004 delta pills (tone follows direction: success for up, danger for down, neutral for flat)

---

## 11. Empty state

Standardized pattern. Per Principle P6 ("the empty state teaches"), every empty surface uses this primitive.

### Anatomy

```
            [optional icon slot — 32 px Lucide icon]

                      Title
                      Subtitle line (1 sentence)

                    [Primary action]
                  [Secondary action]
```

Centered horizontally + vertically in its container. Max content width 420 px.

### Slots

| Slot | Required | Tokens |
|---|---|---|
| Icon | optional (v1 default: none) | 32 px, `text.muted` |
| Title | required | `type.h3`, `text.primary` |
| Subtitle | required | `type.body`, `text.muted` |
| Primary action | required | Button `primary` size `default` |
| Secondary action | optional | Button `ghost` size `default` |

**Illustrations slot** defined but **not used in v1** — see [icons-and-illustrations.md](./icons-and-illustrations.md).

### Props

```
EmptyState(
  icon?: LucideIcon,
  titleKey: string,
  subtitleKey: string,
  primaryAction: { labelKey, onClick, variant? },
  secondaryAction?: { labelKey, onClick },
)
```

### Accessibility

- Wrapped in `role="region"` with `aria-labelledby` = title id.
- Primary action receives focus on mount ONLY when the empty state is the user's explicit navigation target (e.g., clicking an empty route). Not when it's a loaded-but-empty filtered state (focus stays with filter controls so user can adjust without keyboard round-trip).

### Consumer specs

- UX-001 pre-folder (modified — empty state is the entire screen)
- UX-003 `db-empty` state ("Aún no has registrado ningún movimiento" + "Registrar primer movimiento" / "Importar desde extracto")
- UX-003 `range-loaded-empty-range`, `range-loaded-empty-filters`
- UX-004 `empty-db`
- UX-005 `empty-no-accounts`, `empty-accounts-no-tx`, `empty-no-tx-this-month`

---

## 12. Loading skeleton

Shape-preserving placeholder while data loads.

### Anatomy

Rectangles matching the final content's geometry, tinted `surface.sunken` with a subtle shimmer.

### Variants

| Variant | Use |
|---|---|
| `text` | Single-line text placeholder (fixed height = current line-height × 1em) |
| `text-block` | Multi-line paragraph (3 rows, last row 60% width) |
| `rect` | Fixed-size rectangular block (pass w/h or let content specify) |
| `circle` | Avatar/icon placeholder |
| `row` | Full data-table row (7–9 cells to match UX-003) |
| `card` | Full card (matches UX-005 account card / KPI card geometry) |

### Motion

Shimmer sweep: `motion.duration.slow` (340 ms), infinite, `motion.easing.standard`. Opacity 0.4 → 0.8 → 0.4.

**Reduced-motion:** static (no shimmer) — plain `surface.sunken` fill.

### Props

```
Skeleton(
  variant: 'text' | 'text-block' | 'rect' | 'circle' | 'row' | 'card',
  count?: number,    // for row / card, renders N copies
  width?, height?,
)
```

### Accessibility

- Container announces `aria-busy="true"`, `aria-live="polite"` with a visually-hidden *"Loading…"* / *"Cargando…"* label.
- Screen readers are not asked to announce skeleton shapes.

### Consumer specs

- UX-003 `range-loading` state
- UX-004 `loading` state (KPIs + panels + chart shells)
- UX-005 `skeleton` state (cards + KPIs + chart + recent-tx rows)

---

## 13. Data table

Movements list, Saldo data-table equivalent, Panel recent-tx.

### Anatomy

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [☐]  Type  Date       Account   Observations   Category  …  Amount      │   ← header (sticky)
├─────────────────────────────────────────────────────────────────────────┤
│ [☐]  ↓    12 abr 26   Unicaja   Factura...     Servicios …  −320,00 €   │
│ [☐]  ↑    10 abr 26   PayPal    Donación...    Donación  …  +150,00 €   │
│ [☐]  ⚠    08 abr 26   …         No se pudo leer este movimiento.        │  ← decrypt-failed row (CE-003)
├─────────────────────────────────────────────────────────────────────────┤
│  Ingresos: +1.320 €  ·  Gastos: −840 €  ·  Neto: +480 €  ·  24 movtos.   │   ← totals strip (sticky bottom)
│  1 movimiento no pudo leerse. Ver detalles.                              │   ← CE-003 footnote
└─────────────────────────────────────────────────────────────────────────┘
```

### Anatomy — row states

| Row state | Visual |
|---|---|
| `default` | `surface.primary` fill, 1px `border.subtle` bottom |
| `hover` | `accent.subtle` bg |
| `selected` | `accent.subtle` bg + 2px left `accent.default` bar + checkbox filled |
| `focus-visible` | `shadow.focus` inset (2px ring inside the row) |
| `decrypt-failed` (CE-003) | Neutral `surface.sunken` bg, `⚠` icon in Type column, placeholder copy in Observations, all other columns greyed / replaced with `—`. Row-level footnote tokens: `type.caption` in `warning.default`. Row is still selectable (bulk export/recovery later) but not editable. |

### Sort

Column headers with sort capability show `ArrowUp` / `ArrowDown` / `ChevronsUpDown` (neutral) Lucide icon. Clickable header = button; `aria-sort` = `ascending` / `descending` / `none`.

### Density

Standard: **40 px** row height. Compact: **32 px**. Toggle surfaces on UX-003 (per Principle P7).

### Selection

Leading checkbox column (fixed 40 px width). Header checkbox = select-all-in-view. PRD-001 PR6 ships selection in M1; bulk *actions* deferred.

### Sticky elements

- Header row (`z.sticky`).
- Totals strip (bottom, `z.sticky`) — only on UX-003 Movements.

### Props

```
DataTable(
  columns: Array<{
    id: string;
    headerKey: string;
    cell: (row) => ReactNode;
    sortable?: boolean;
    align?: 'start' | 'end' | 'center';
    width?: number | 'auto';
    minWidth?: number;
    tabularNumeric?: boolean;   // applies font-variant-numeric to cells
  }>,
  rows: Row[],
  selection?: { selectedIds: Set<string>; onChange },
  sort?: { by: string; direction: 'asc' | 'desc'; onChange },
  density?: 'standard' | 'compact',
  stickyHeader?: boolean,
  stickyFooter?: ReactNode,           // UX-003 totals strip
  rowFootnote?: (row) => ReactNode,   // CE-003 surface
  emptyState?: ReactNode,
)
```

### Accessibility

- Real `<table>` with `<thead>/<tbody>`. `<th scope="col">` in header.
- Sort buttons inside `<th>` are `<button>`-elements with `aria-sort`.
- Row checkbox `<label>` reads "Seleccionar movimiento del {fecha}: {observaciones}" / "Select transaction from {date}: {description}".
- Arrow-key row navigation is **opt-in** (on UX-003 yes, on UX-005 recent-tx no — passive view).
- Totals strip: wrapped in `role="status"`, `aria-live="polite"` — filter changes announce new totals.
- Tabular digits on amount columns (per [tokens §2.4](./tokens.md#24-numeric-rendering)).
- Colour-not-sole-channel: Type column shows arrow icon; Amount shows sign prefix (`+` / `−`) AND tone colour.

### i18n notes

- Column headers flex; amount column reserves trailing space for Spanish currency format (`1.234,56 €` vs `€1,234.56`).
- Decrypt-failed row footnote string is **pending Switch** (UX-003 §11 Q9).

### Consumer specs

- UX-003 Movements table (full — selection, sort, sticky totals, decrypt-failed rows, density toggle)
- UX-005 recent-tx table (no selection, no sort, no footnote) — `DataTable` with features toggled off
- UX-004 chart data-table equivalent (collapsible; sort off; tabular digits required)

---

## 14. Chart primitives

### 14.1 Bar chart

Used by UX-005 (12-month income/expense) and UX-004 (net monthly).

**Styling:**
- Bars use `success.default` (income) + `danger.default` (expense) in both themes.
- Bar width flexes to chart width / month count; gap between month pairs is 2× gap between bars within a pair.
- Tooltip: `radius.md`, `shadow.dropdown`, `z.tooltip`. Shows month + amount (locale-formatted EUR).
- Axis labels: `type.caption`, `text.muted`. Month labels via `Intl.DateTimeFormat(locale, { month: 'short' })`.
- Legend: below chart, `type.caption`.

**States:**
- `default`: all bars rendered
- `hover-bar`: bar darkens (+8% luminosity), tooltip appears
- `focus-bar`: same as hover + `shadow.focus` around the bar
- `loading`: replaced by Skeleton `card`
- `error`: inline error text + retry (UX-005 E5, UX-004 E10)

### 14.2 Sparkline (UX-005 account card)

Line + soft fill under line. `accent.default` at 100% line, 16% fill. 56 px tall, full-card wide. No axes, no labels.

**States:**
- `partial-data` (< 3 months per UX-005 E4): hidden, replaced by caption text.
- `hover`: last-month-net tooltip.

### 14.3 Collapsible data-table equivalent

Both UX-004 and UX-005 charts MUST ship a collapsible `<table>` containing every data point. Uses DataTable (§13) with:
- No selection, no sort, no sticky.
- Months as rows; series as columns (Income, Expense, Net).
- Tabular digits.
- Toggle button ("Ver tabla de datos" / "Show data table") toggles `aria-expanded`.

Collapsed by default (UX-004 §11 Q6, UX-005 §11 Q9 both recommend collapsed).

### 14.4 Accessibility (charts overall)

- Chart container is `role="img"` with `aria-label` summarising the chart ("Ingresos vs gastos, últimos 12 meses, total neto 2.400 €").
- Each bar is a focusable element (`<button>` or `role="graphics-symbol"`) with individual `aria-label`.
- Data-table equivalent is the PRIMARY screen-reader path — required for compliance (UX-004 PR17, UX-005 PR15).

### 14.5 Library decision

**Recommend: `visx` or a minimal custom SVG implementation.** Trinity decides; no Recharts (Recharts produces 500+ DOM nodes per chart and doesn't expose bar-level focus cleanly). **Flag to Trinity:** benchmark visx vs hand-rolled SVG against Panel's performance target (PR12 ≤500ms at 1,000 events).

---

## 15. Locale switcher

Topbar component per UX-006 §6 / Q5.

### Anatomy

```
┌──────────┐
│ ES | EN  │
└──────────┘
```

Segmented control. Active locale: `accent.subtle` bg, `text.primary`, `aria-current="true"`. Inactive: `text.secondary`.

### Variant

Also lives in Settings > Language as a larger Select — that variant is out of Wave 1.

### Props

```
LocaleSwitcher(
  locale: 'es' | 'en',
  onChange: (locale) => void,
  variant: 'segmented' | 'select'    // segmented in topbar, select in settings
)
```

### Accessibility

- `role="group"` with `aria-label="Idioma" / "Language"`.
- Each option: `<button>` with `aria-pressed` / `aria-current="true"`.
- Keyboard shortcut `Ctrl+L` focuses the switcher (UX-006 §8).
- **On change:** persists to user-prefs file (not OneDrive, per ADR-003 §7.3); `i18next.changeLanguage(lng)` fires; every visible string re-resolves. UX-006 §7 E7 covers the "mid-modal swap" case.

### Consumer specs

- UX-006 topbar

---

## 16. CodeDisplay (security primitive)

The 6-character enrollment code (UX-002). **Non-trivial** because Principle P8 requires this to be unmissable: the pubkey-substitution defense ONLY works if requester and admin both see the code clearly enough to notice mismatch.

### Anatomy

```
  ╔═══════════════════════════════╗
  ║                               ║
  ║        A B C - 1 2 3          ║        ← type.display (28 px, monospace, 700)
  ║                               ║
  ╚═══════════════════════════════╝
            [ Copy ]  [ Read aloud ]
```

### Layout rules

- Centered in its container.
- Horizontal padding: `space.9` (48 px) minimum surrounding whitespace.
- Monospace font (`font-family-mono` from tokens).
- Tracking: `letter-spacing: 0.15em` — characters visibly distinct.
- Group separator: em-dash-like visual spacing (not ASCII `-`; actual wider spacing between groups of 3).
- Character alphabet: Crockford base32 minus ambiguous (`0/O/1/I/L/U`) per UX-002 §11 Q1 (pending Switch ratification). **Flag to Switch.**

### States

| State | Visual |
|---|---|
| `default` | Large, static |
| `copying` | Copy button shows checkmark for 2 s after click |
| `reading-aloud` | Speaker icon pulses during TTS (no pulse if reduced-motion) |

### Props

```
CodeDisplay(
  code: string,                     // 6 chars, uppercase, validated
  grouping?: '3-3' | '2-2-2',       // default '3-3'
  onCopy?: () => void,
  onReadAloud?: () => void,
  locale: 'es' | 'en',              // drives phonetic readback
)
```

### Accessibility

- `role="status"` with `aria-label="Tu código de enrolamiento: A, B, C, 1, 2, 3"` (character-by-character, NOT "ABC123" — avoids the screen reader saying "abc one hundred twenty-three").
- Copy button `aria-label="Copiar código"` / "Copy code"; confirmation via live-region.
- Read-aloud uses platform TTS with phonetic alphabet (*"Alpha, Bravo, Charlie — one, two, three"* / *"Alfa, Bravo, Charlie — uno, dos, tres"*).
- Contrast: display copy is `text.primary` on `surface.raised` (AAA, ~15:1 in both themes).

### i18n notes

- Code alphabet is locale-independent.
- Readback is phonetic **in the active locale** (ES phonetic table, EN NATO-ish). A small dictionary in the renderer maps character → phonetic-name per locale.

### Consumer specs

- UX-002 requester pending screen (`requester.pending` state)
- UX-002 admin approval modal (shows code derived from escrow-resident pubkey — AC2)

---

## Cross-cutting: component → UX-spec matrix

| Component | UX-001 | UX-002 | UX-003 | UX-004 | UX-005 | UX-006 |
|---|---|---|---|---|---|---|
| Button | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TextField | ✓ | ✓ | ✓ | | | ✓ |
| Select | | | ✓ | ✓ | | ✓ (future) |
| DateRangePicker | | | ✓ | | | |
| Banner | ✓ | | ✓ | ✓ | ✓ | ✓ |
| Dialog | | ✓ | ✓ (E8 guard) | | | |
| Sidebar | | | | | | ✓ |
| Topbar | | | | | | ✓ |
| Toast | | ✓ | ✓ | | | |
| Badge/Pill | | | ✓ | ✓ | ✓ | |
| EmptyState | ✓ | | ✓ | ✓ | ✓ | |
| Skeleton | | | ✓ | ✓ | ✓ | |
| DataTable | | | ✓ | ✓ (chart table) | ✓ (recent + chart table) | |
| Chart (bar) | | | | ✓ | ✓ | |
| Sparkline | | | | | ✓ | |
| LocaleSwitcher | | | | | | ✓ |
| CodeDisplay | | ✓ | | | | |

---

## Open questions

1. **Chart library choice** — visx vs custom SVG vs Recharts. Recommend benchmark on UX-005 performance target. → **Trinity** (implementation).
2. **Account palette (10-colour preset)** — who picks? Mouse to propose a 10-colour set that passes AA in both themes, in a follow-up tokens-v0.2 pass. → **Mouse** (follow-up).
3. **Right-click context menus** on data-table rows — ship in M1 or defer? Recommend defer to v1.x; keyboard-accessible row actions remain primary. → **Pedro / Niobe**.
4. **Toast action keyboard shortcut** (`Ctrl+Shift+T`) — add to UX-006 shortcut map? → **Niobe**.
5. **Density toggle placement on Movements** — in filter bar, in table footer, or globally in settings only? → **Niobe**.

---

## Changelog

| Date | Version | Notes |
|---|---|---|
| 2026-04-19 | v0.1 | Initial component primitive set. 16 primitives covering Wave 1. No pending-state tone anywhere. Lucide icon commitments (see icons doc). |
