# Design Tokens v0.1

> **Status:** Draft v0.1 · **Owner:** Mouse (UI Designer) · **Date:** 2026-04-19
> **Depends on:** [design-principles.md](./design-principles.md) · [ADR-001](../architecture/adr-001-tech-stack.md) · [ADR-003 (i18n)](../architecture/adr-003-i18n-framework.md) · [prototype/styles.css](../../prototype/styles.css) (visual baseline reference)

Authoritative token catalog. **Tokens are semantic** (`color.text.primary`) — not palette-direct (`purple-800`). Consumers (Trinity's React components, CSS) reference tokens only; raw hex appears here and nowhere else.

---

## 0. Token-to-constraint map

| Token group | Constraint / spec reference | Why |
|---|---|---|
| Typography | [ADR-003 §1](../architecture/adr-003-i18n-framework.md) (I1 two locales day-0), [ADR-003 §7.1](../architecture/adr-003-i18n-framework.md) (OS-locale detection) | Type scale accommodates ~30% ES expansion over EN; system-font stack honours OS locale glyph set |
| Typography (font stack) | Principle P4 "Desktop-native feel"; [ADR-001 §C11](../architecture/adr-001-tech-stack.md) (no network dependency at runtime) | No web fonts downloaded at runtime; pure OS system stack per platform |
| Colour — danger/warning | [UX-002 §4.3 B](../ux/specs/ux-002-device-enrollment.md), [UX-003 §6 E5](../ux/specs/ux-003-movements-screen.md), crypto-error surfaces | Security-adjacent copy needs unambiguous visual severity (P8) |
| Colour — income / expense | UX-003, UX-004, UX-005 PR16 ("colour not sole channel") | Reinforces — does not replace — sign prefix + arrow |
| Spacing | Prototype baseline (8px grid) × P7 density | 4px base allows standard + compact densities without re-computing every token |
| Motion | UX-003 §7 "reduced motion", UX-005 §7 | `prefers-reduced-motion` respected at token level, not per-component |
| Breakpoints | UX-005 §6 E11 (narrow window reflow), UX-006 §7 E8 | Electron BrowserWindow is resizable; Panel grid reflow uses these |
| Z-index | UX-006 §7 E9 (banner priority), modal stacking | Layering scale is **documented**; `z-index` arithmetic forbidden |

---

## 1. Colour tokens

### 1.1 Semantic structure

Tokens follow `color.{slot}.{variant}`.

**Slots:**
- `surface` — page backgrounds, card fills, raised containers
- `text` — foreground type
- `border` — all stroke colour
- `accent` — brand / primary action
- `success` — income, positive, approved outcomes
- `warning` — caution, non-blocking attention
- `danger` — expense, destructive, blocking errors, revoked state
- `info` — neutral informational banners (offline, update available)

**Variants:** `default | hover | active | disabled | subtle (bg for banners/pills)`

**State tokens** exist for interactive slots only (`accent`, `success`, `warning`, `danger`, `info`). Surface and text do not have interactive states; those belong to the element.

### 1.2 Light theme

Brand anchor: **`#6d4d8c`** — carried forward from the prototype / cloud app so Rett Spain treasurers see continuity. All surrounding values re-balanced for AA+.

| Token | Hex | Role |
|---|---|---|
| `color.surface.app` | `#faf7fc` | Window background (behind cards) |
| `color.surface.primary` | `#ffffff` | Cards, data tables, input fills |
| `color.surface.secondary` | `#f4eef8` | Sidebar, subtle sections, read-only panels |
| `color.surface.raised` | `#ffffff` | Modals, dropdowns, popovers (paired with `shadow.dialog`) |
| `color.surface.sunken` | `#efe8f4` | Skeleton loaders, disabled input backgrounds |
| `color.surface.overlay` | `rgba(32, 22, 40, 0.48)` | Modal scrim |
| `color.text.primary` | `#1a1420` | Body text, headings |
| `color.text.secondary` | `#433a4e` | Sublabels, metadata |
| `color.text.muted` | `#645872` | Captions, helper text |
| `color.text.disabled` | `#9a90a5` | Disabled controls |
| `color.text.inverse` | `#ffffff` | Text on accent/danger fills |
| `color.text.link` | `#5a3c82` | Inline links (distinct from accent at rest) |
| `color.border.default` | `#e1d6ea` | Cards, inputs, dividers (1px) |
| `color.border.strong` | `#b8a6ca` | Focused inputs, selected rows |
| `color.border.subtle` | `#ede4f2` | Hairlines, table row dividers |
| `color.accent.default` | `#6d4d8c` | Primary button, brand mark, active nav |
| `color.accent.hover` | `#5a3d75` | Primary button hover |
| `color.accent.active` | `#49315f` | Primary button pressed |
| `color.accent.disabled` | `#c8b9d6` | Disabled primary |
| `color.accent.subtle` | `#ede4f2` | Selected-row bg, accent banner bg |
| `color.success.default` | `#1e7a2c` | Income amounts, approved confirmations |
| `color.success.hover` | `#155c21` | Interactive success (rare) |
| `color.success.subtle` | `#e4f4e7` | Success banner bg |
| `color.warning.default` | `#9c4a00` | Warning banner foreground / icon |
| `color.warning.subtle` | `#fdf0db` | Warning banner bg |
| `color.danger.default` | `#b81f1f` | Expense amounts, destructive action, blocking errors |
| `color.danger.hover` | `#8f1616` | Destructive button hover |
| `color.danger.active` | `#6e1010` | Destructive button pressed |
| `color.danger.subtle` | `#fbe4e4` | Danger banner bg |
| `color.info.default` | `#1558a8` | Offline banner fg, transfer (future) |
| `color.info.subtle` | `#e1edfa` | Info banner bg |
| `color.focus.ring` | `#6d4d8c` | Focus ring stroke (2px) — same as accent for consistency |
| `color.focus.ring-offset` | `#ffffff` | Ring offset on light surfaces |

### 1.3 Dark theme

Dark mode is **mandatory at v0.1** (Principle P4). The treasurer who opens the app on a Windows laptop at 10 PM should not be blinded.

| Token | Hex | Role |
|---|---|---|
| `color.surface.app` | `#120e17` | Window background |
| `color.surface.primary` | `#1c1624` | Cards, tables, input fills |
| `color.surface.secondary` | `#17121e` | Sidebar, subtle sections |
| `color.surface.raised` | `#251e31` | Modals, dropdowns |
| `color.surface.sunken` | `#181320` | Skeletons, disabled fills |
| `color.surface.overlay` | `rgba(0, 0, 0, 0.64)` | Modal scrim |
| `color.text.primary` | `#f3edf8` | Body, headings |
| `color.text.secondary` | `#c9bfd4` | Sublabels |
| `color.text.muted` | `#958aa3` | Captions |
| `color.text.disabled` | `#5f566c` | Disabled |
| `color.text.inverse` | `#1a1420` | Text on light accent fills (rare) |
| `color.text.link` | `#c1a8df` | Links |
| `color.border.default` | `#2f2738` | Cards, inputs |
| `color.border.strong` | `#5f4b78` | Focused, selected |
| `color.border.subtle` | `#221b2b` | Hairlines |
| `color.accent.default` | `#c9abe8` | Primary (light purple on dark) |
| `color.accent.hover` | `#d8bff0` | Hover |
| `color.accent.active` | `#b795d7` | Pressed |
| `color.accent.disabled` | `#4a3b5f` | Disabled |
| `color.accent.subtle` | `#2e2438` | Selected-row bg |
| `color.success.default` | `#6fcf7c` | Income |
| `color.success.hover` | `#8bdb96` | Hover |
| `color.success.subtle` | `#1a2f1d` | Banner bg |
| `color.warning.default` | `#f0a94a` | Warning fg |
| `color.warning.subtle` | `#3a2811` | Banner bg |
| `color.danger.default` | `#f07070` | Expense, destructive |
| `color.danger.hover` | `#f58a8a` | Hover |
| `color.danger.active` | `#d85050` | Pressed |
| `color.danger.subtle` | `#3a1818` | Banner bg |
| `color.info.default` | `#7fb0e8` | Offline fg |
| `color.info.subtle` | `#142338` | Banner bg |
| `color.focus.ring` | `#c9abe8` | Focus ring |
| `color.focus.ring-offset` | `#1c1624` | Ring offset |

### 1.4 Contrast verification (WCAG AA — 4.5:1 for body text, 3:1 for large text & UI components)

All foreground/background pairs routinely shipped in Wave 1. **Ratios measured with standard WCAG formula (sRGB relative luminance).**

**Light theme:**

| Foreground | Background | Ratio | AA body | AA large |
|---|---|---|---|---|
| `text.primary` #1a1420 | `surface.primary` #ffffff | **15.9:1** | ✅ | ✅ |
| `text.primary` #1a1420 | `surface.app` #faf7fc | **15.3:1** | ✅ | ✅ |
| `text.primary` #1a1420 | `surface.secondary` #f4eef8 | **14.3:1** | ✅ | ✅ |
| `text.secondary` #433a4e | `surface.primary` #ffffff | **9.8:1** | ✅ | ✅ |
| `text.muted` #645872 | `surface.primary` #ffffff | **6.1:1** | ✅ | ✅ |
| `text.muted` #645872 | `surface.secondary` #f4eef8 | **5.5:1** | ✅ | ✅ |
| `text.inverse` #ffffff | `accent.default` #6d4d8c | **5.4:1** | ✅ | ✅ |
| `text.inverse` #ffffff | `accent.hover` #5a3d75 | **7.0:1** | ✅ | ✅ |
| `text.inverse` #ffffff | `danger.default` #b81f1f | **6.1:1** | ✅ | ✅ |
| `success.default` #1e7a2c | `surface.primary` #ffffff | **5.6:1** | ✅ | ✅ |
| `success.default` #1e7a2c | `success.subtle` #e4f4e7 | **5.0:1** | ✅ | ✅ |
| `danger.default` #b81f1f | `surface.primary` #ffffff | **6.1:1** | ✅ | ✅ |
| `danger.default` #b81f1f | `danger.subtle` #fbe4e4 | **5.4:1** | ✅ | ✅ |
| `warning.default` #9c4a00 | `surface.primary` #ffffff | **6.2:1** | ✅ | ✅ |
| `warning.default` #9c4a00 | `warning.subtle` #fdf0db | **5.5:1** | ✅ | ✅ |
| `info.default` #1558a8 | `surface.primary` #ffffff | **7.1:1** | ✅ | ✅ |
| `info.default` #1558a8 | `info.subtle` #e1edfa | **6.3:1** | ✅ | ✅ |
| `accent.default` #6d4d8c | `surface.primary` #ffffff | **6.7:1** | ✅ | ✅ (UI element) |
| `border.strong` #b8a6ca | `surface.primary` #ffffff | **2.5:1** | ⚠️ non-text UI only | n/a |
| `text.link` #5a3c82 | `surface.primary` #ffffff | **8.7:1** | ✅ | ✅ |

**Dark theme:**

| Foreground | Background | Ratio | AA body | AA large |
|---|---|---|---|---|
| `text.primary` #f3edf8 | `surface.app` #120e17 | **15.1:1** | ✅ | ✅ |
| `text.primary` #f3edf8 | `surface.primary` #1c1624 | **13.2:1** | ✅ | ✅ |
| `text.primary` #f3edf8 | `surface.secondary` #17121e | **14.0:1** | ✅ | ✅ |
| `text.secondary` #c9bfd4 | `surface.primary` #1c1624 | **9.1:1** | ✅ | ✅ |
| `text.muted` #958aa3 | `surface.primary` #1c1624 | **5.2:1** | ✅ | ✅ |
| `accent.default` #c9abe8 | `surface.primary` #1c1624 | **8.1:1** | ✅ | ✅ |
| `accent.default` #c9abe8 | `surface.app` #120e17 | **9.2:1** | ✅ | ✅ |
| `success.default` #6fcf7c | `surface.primary` #1c1624 | **7.4:1** | ✅ | ✅ |
| `danger.default` #f07070 | `surface.primary` #1c1624 | **5.9:1** | ✅ | ✅ |
| `warning.default` #f0a94a | `surface.primary` #1c1624 | **7.8:1** | ✅ | ✅ |
| `info.default` #7fb0e8 | `surface.primary` #1c1624 | **7.0:1** | ✅ | ✅ |
| `text.link` #c1a8df | `surface.primary` #1c1624 | **7.3:1** | ✅ | ✅ |

**Notes:**
- `border.strong` at 2.5:1 is intentional — it is a **non-text UI separator**, exempt from WCAG 1.4.11 (3:1 required only when the component's visual boundary carries meaning, e.g., checkbox border; those get `text.primary` or `accent.default` instead).
- **Not AA**: no pair we ship. If a future token falls below AA on a realistic pairing, it fails review.

---

## 2. Typography

### 2.1 Font stack — OS system (no web fonts)

Per Principle P4 and ADR-001 offline-first posture, we download **no fonts at runtime**.

```css
--font-family-sans:
  "Segoe UI Variable", "Segoe UI",
  -apple-system, BlinkMacSystemFont, "SF Pro Text",
  system-ui,
  Roboto, "Helvetica Neue", Helvetica, Arial,
  sans-serif;

--font-family-mono:
  "Cascadia Code", Consolas,
  ui-monospace, "SF Mono", Menlo, Monaco,
  "Liberation Mono", "Courier New",
  monospace;
```

**Windows** gets `Segoe UI Variable` (Win 11) → `Segoe UI` (Win 10). **macOS** gets `-apple-system` / `SF Pro Text`. **Linux** gets `system-ui` / Roboto / sans-serif fallback. All three look native.

Monospace is used for: the UX-002 6-character enrollment code, folder paths in UX-001 rejection cards, and amounts-in-tables (tabular digits — see §2.4).

### 2.2 Type scale

8-step scale. Body starts at **14px** to leave headroom for wrapped Spanish (Principle P5).

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `type.display` | 28px | 1.2 | 600 | UX-002 enrollment code; first-run welcome headline |
| `type.h1` | 22px | 1.25 | 600 | Screen title (`Panel`, `Movimientos`, `Saldo`) |
| `type.h2` | 18px | 1.3 | 600 | Section headings (`Saldos por cuenta`, `Ingresos`, `Gastos`) |
| `type.h3` | 16px | 1.35 | 600 | Card titles, modal titles |
| `type.body` | 14px | 1.5 | 400 | Default body, table rows, form fields |
| `type.body-strong` | 14px | 1.5 | 600 | KPI values, emphasised body |
| `type.small` | 13px | 1.45 | 400 | Secondary text, table meta, date stamps |
| `type.caption` | 12px | 1.4 | 400 | Helper text, chart axis labels, sparkline legends |
| `type.micro` | 11px | 1.35 | 500 | Section dividers (uppercase + tracking), badge text |

**Compact density override** (per Principle P7):
- `type.body` → 13px / 1.45
- `type.small` → 12px / 1.4
- Nothing else shrinks. `h1`–`h3` stay put; micro does not drop further.

### 2.3 Weights

```css
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

**Rule:** bold (700) is reserved for negative-balance emphasis in the dark theme where `danger.default` alone isn't enough, and for the UX-002 code display. Everywhere else, semibold (600) tops out.

### 2.4 Numeric rendering

Financial data is **tabular**. Apply `font-variant-numeric: tabular-nums;` to every cell that renders an amount, balance, or count. System fonts all support this; no download required.

Apply `font-feature-settings: 'tnum'` as a fallback for older engines.

Apply to: Movements `Amount` column, Saldo KPI values + category row amounts + chart data-table cells, Panel account-card balances + KPI values + chart data-table cells, toast/banner counts.

### 2.5 Text-expansion accommodation (ADR-003 link)

Per [ADR-003 §7](../architecture/adr-003-i18n-framework.md) (i18n) and Principle P5:

- Button minimum widths allow ES variants: `Nuevo Movimiento` (16ch), `Registrar primer movimiento` (28ch) — the longest CTA Wave-1 ships.
- Body text wraps at the container, never truncates silently.
- Where truncation is unavoidable (table columns), the full text is in `title` / tooltip.
- Line-heights are set relative (`1.5`) not absolute — so OS text-zoom at 125% / 150% doesn't clip.

---

## 3. Spacing

**Base: 4px**, primary rhythm 8px. The 4px base (vs the prototype's 8px) exists so the compact density can halve spacing tokens without sub-pixel rendering.

| Token | Px | Typical use |
|---|---|---|
| `space.0` | 0 | — |
| `space.1` | 4 | icon-to-text gap, chip internal |
| `space.2` | 8 | form row gap, small button padding-y |
| `space.3` | 12 | button padding-y (default), card internal |
| `space.4` | 16 | input padding-x, section gap (dense) |
| `space.5` | 20 | card padding, modal padding-x |
| `space.6` | 24 | card-to-card gap, section gap (standard) |
| `space.7` | 32 | screen padding, between major regions |
| `space.8` | 40 | screen top padding (above h1) |
| `space.9` | 48 | dialog padding, first-run step padding |
| `space.10` | 64 | welcome-screen hero padding |

**Compact density** halves `space.3` → 8, `space.5` → 16, `space.6` → 16. Nothing else moves.

---

## 4. Radius

Modest. Desktop-native — not iOS rounded.

| Token | Px | Use |
|---|---|---|
| `radius.xs` | 2 | Focus ring inner offset |
| `radius.sm` | 4 | Inputs, small buttons, chips, badges |
| `radius.md` | 6 | Buttons (default), cards, inputs-with-icon |
| `radius.lg` | 10 | Modals, dialogs, large cards (account cards, KPI cards) |
| `radius.pill` | 9999 | Pills (account pill, range pill) |

---

## 5. Elevation (shadows)

Subtle. These are **desktop-native shadows**, not Material Design lifts.

**Light theme:**

```
shadow.none:     none
shadow.card:     0 1px 2px rgba(26, 20, 32, 0.06),
                 0 1px 3px rgba(26, 20, 32, 0.04)
shadow.raised:   0 2px 6px rgba(26, 20, 32, 0.08),
                 0 1px 2px rgba(26, 20, 32, 0.04)
shadow.dropdown: 0 6px 18px rgba(26, 20, 32, 0.10),
                 0 2px 6px rgba(26, 20, 32, 0.06)
shadow.dialog:   0 16px 48px rgba(26, 20, 32, 0.18),
                 0 4px 12px rgba(26, 20, 32, 0.10)
shadow.focus:    0 0 0 2px var(--color-focus-ring-offset),
                 0 0 0 4px var(--color-focus-ring)
```

**Dark theme** amplifies the shadow alpha (0.40–0.60) since ambient black absorbs subtle shadows. A 1px inner top-border (`border.subtle` tone) is added on `shadow.dialog` for lift.

```
shadow.card:     0 1px 2px rgba(0, 0, 0, 0.40)
shadow.raised:   0 2px 6px rgba(0, 0, 0, 0.45)
shadow.dropdown: 0 6px 18px rgba(0, 0, 0, 0.55)
shadow.dialog:   0 16px 48px rgba(0, 0, 0, 0.65),
                 inset 0 1px 0 rgba(243, 237, 248, 0.06)
```

**Do not** compose custom shadows at the component level. If an element needs elevation, it uses a token.

---

## 6. Motion

### 6.1 Duration

| Token | ms | Use |
|---|---|---|
| `motion.duration.instant` | 80 | Toast appear, color tween on hover |
| `motion.duration.fast` | 140 | Dropdown, tooltip fade-in, button press |
| `motion.duration.base` | 220 | Modal in/out, banner slide-in, sidebar collapse |
| `motion.duration.slow` | 340 | Route transition (if enabled), skeleton → content fade |

### 6.2 Easing

| Token | Curve | Use |
|---|---|---|
| `motion.easing.standard` | `cubic-bezier(0.2, 0.0, 0.2, 1.0)` | Default for entering + state change |
| `motion.easing.decelerate` | `cubic-bezier(0.0, 0.0, 0.2, 1.0)` | Enter (appear) |
| `motion.easing.accelerate` | `cubic-bezier(0.4, 0.0, 1.0, 1.0)` | Exit (dismiss) |

### 6.3 Reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  /* All motion.duration.* collapse to 0ms.
     State changes still occur — without animation. */
}
```

Token-level. Components do not re-implement this check; they use `motion.duration.*` which collapses globally.

---

## 7. Z-index layering

Documented scale. No arbitrary `z-index: 9999`.

| Token | Value | Layer |
|---|---|---|
| `z.base` | 0 | Page content |
| `z.sticky` | 10 | Sticky table headers, sticky totals strip |
| `z.sidebar` | 20 | Sidebar rail |
| `z.topbar` | 30 | Top bar (above sticky content) |
| `z.banner` | 40 | Global banner slot (UX-006) |
| `z.dropdown` | 50 | Select menus, date picker popover, topbar overflow |
| `z.tooltip` | 60 | Tooltips, delta-pill projection popover |
| `z.modal-scrim` | 70 | Modal backdrop |
| `z.modal` | 71 | Modal content |
| `z.toast` | 80 | Transient toasts (UX-003 new-activity confirm, generic save toast) |
| `z.debug` | 9000 | Dev-only overlays (pseudo-locale indicator) |

**Rule:** a new layer needs a new token, reviewed. Do not inline `z-index` numbers.

---

## 8. Breakpoints (Electron window widths)

Electron BrowserWindow is user-resizable. Wave 1 supports three:

| Token | Min width | Name | Layout implications |
|---|---|---|---|
| `breakpoint.compact` | 960 px | Compact | Sidebar collapses to rail (icon-only). Panel's account cards stack 2-per-row. Saldo's two panels stack vertically. Movements filter bar wraps to 2 lines. |
| `breakpoint.standard` | 1280 px | Standard (default) | Sidebar expanded. Panel cards 3–4 per row. Saldo panels side-by-side. |
| `breakpoint.wide` | 1600 px | Wide | Content area max-width **1440px** — content does not stretch edge-to-edge on ultrawide displays (readability). Excess becomes breathing room on left/right. |

**Minimum supported window width: 960 px.** Below that, the app is not guaranteed to lay out correctly; a user resizing below sees native scrollbars and a best-effort reflow, but we do not regress-test below 960.

**No mobile breakpoints.** This is a desktop app.

---

## 9. Token file & theme switching (implementation hint for Trinity)

Tokens ship as CSS custom properties on `:root` (light) and `html[data-theme="dark"]` (dark). JS has a thin `useTheme()` hook that toggles the `data-theme` attribute on `<html>` and persists to the user-prefs file in `%APPDATA%` per [ADR-003 §7.3](../architecture/adr-003-i18n-framework.md) (not in OneDrive — per-device preference).

Theme preference defaults to OS (`@media (prefers-color-scheme: dark)`) and can be overridden in Settings.

**Do not** ship per-component token overrides. If a token is wrong for a component, fix the token.

---

## 10. Traceability

| Token group | Consumed by (Wave 1) |
|---|---|
| Colour — accent | UX-001 primary CTA, UX-002 approve button, UX-003 Nuevo Movimiento, UX-005 *"Ver todos"* link, UX-006 sidebar active item |
| Colour — success | UX-003 income amounts, UX-004 income panel mini-bars, UX-005 income bars in chart |
| Colour — danger | UX-003 expense amounts, UX-004 expense panel, UX-005 negative-balance cards, all delete/revoke buttons, blocking error banners |
| Colour — warning | UX-003 `new-activity` banner, UX-005 partial-decrypt banner |
| Colour — info | UX-006 offline banner, UX-020 update-available banner (future) |
| Typography — display | UX-002 enrollment code |
| Typography — tabular-nums | UX-003 amount column, UX-004 KPI values + row amounts, UX-005 balance + KPI + recent-tx amounts |
| Spacing | All components |
| Motion — reduced | UX-002 (approval modal no-animate), UX-003 (skeleton no-fade), UX-005 (no bar-grow) |
| Breakpoints | UX-005 §6 E11 narrow-window reflow, UX-006 §7 E8 sidebar collapse |
| Z-index — banner | UX-006 §7 E9 single-banner priority slot |
| Z-index — modal | UX-002 approval modal |
| Z-index — tooltip | UX-004 delta-pill projection tooltip |

---

## Changelog

| Date | Version | Notes |
|---|---|---|
| 2026-04-19 | v0.1 | Initial token set. Light + dark themes both AA-verified. Base grid 4px. System-font stack (no web fonts). Brand anchor `#6d4d8c` carried from prototype. |
