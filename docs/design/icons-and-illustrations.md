# Icons and Illustrations v0.1

> **Status:** Draft v0.1 · **Owner:** Mouse (UI Designer) · **Date:** 2026-04-19
> **Depends on:** [design-principles.md](./design-principles.md) · [components-v1.md](./components-v1.md)

Icon library choice, usage rules, and illustration strategy for Wave 1.

---

## 1. Icon library: **Lucide**

**Choice: [Lucide](https://lucide.dev)** ([MIT license](https://github.com/lucide-icons/lucide/blob/main/LICENSE)).

### Rationale

| Criterion | Lucide | Phosphor | Heroicons | Tabler |
|---|---|---|---|---|
| License | MIT | MIT | MIT | MIT |
| Icon count | **1,500+** | 1,500+ | ~300 | 4,500+ |
| Coverage for treasury domain | ✅ Wallet, CreditCard, TrendingDown/Up, Scale, FileText, ArrowLeftRight | ✅ | ⚠️ Some gaps (no `Scale`) | ✅ |
| React package, tree-shakable | ✅ `lucide-react`, individual named imports | ✅ | ✅ | ✅ |
| Weight style | Single-weight (2 px stroke default) | Multi-weight (thin → bold) | Outline + solid | Single-weight |
| Consistency across icons | **Excellent** — uniform grid, stroke | Good, but multi-weight invites inconsistency | Excellent | Good |
| Offline bundle-friendly | ✅ Ships in-app as SVG | ✅ | ✅ | ✅ |
| Ecosystem maturity | High — used by Shadcn, Tailwind UI | Medium | High | Medium |

**Why Lucide over the alternatives:**

1. **Single weight** — Lucide's uniform 2 px stroke forbids the inconsistency Phosphor invites when different contributors pick different weights. One weight = one visual voice. Matches Principle P1 (calm).
2. **Scale / TrendingUp / Wallet / ArrowLeftRight** — all four Wave-1-critical icons exist with clean, legible glyphs. Heroicons lacks `Scale`; that alone disqualifies it.
3. **Single-weight + 24 px default grid** makes sizing predictable. See §3 sizing.
4. **MIT, on npm, tree-shakable.** Trinity imports only what each component uses: `import { Wallet, ArrowLeftRight } from 'lucide-react'`. No icon-font runtime cost.
5. **No web-font dependency.** Lucide ships as SVG components; meets Principle P4 (no runtime font download).

### Implementation notes for Trinity (non-binding)

- Use `lucide-react` (or equivalent framework binding when Trinity picks).
- Set a project-wide default stroke width via the library's `Icon` props (or a thin wrapper). Defaults: 1.75 px stroke (slightly lighter than library default) for visual parity with the system fonts.
- Colour = `currentColor`, so icons inherit from `text.primary` / `accent.default` / whatever the surrounding text slot dictates.
- Always reference icons by **named import** — never via a string-keyed dynamic lookup (tree-shaking preservation).

---

## 2. Icon → semantic mapping (Wave-1 lock)

These mappings are locked for Wave 1. If a new need arises, add here rather than improvising.

### Navigation

| Context | Icon (Lucide name) |
|---|---|
| Panel / Dashboard | `LayoutDashboard` |
| Movimientos | `ArrowLeftRight` |
| Saldo | `Scale` |
| Cuentas | `Wallet` |
| Categorías | `Tag` |
| Etiquetas | `Bookmark` |
| Importación | `Download` |
| Exportar | `Upload` |
| Settings | `Settings` (cog) |
| Search | `Search` |
| Locale switcher | (no icon — text `ES | EN`) |

### Actions

| Action | Icon |
|---|---|
| New / add | `Plus` |
| Edit | `Pencil` |
| Delete / destroy | `Trash2` |
| Copy | `Copy` |
| Read aloud | `Volume2` |
| Expand / show more | `ChevronDown` |
| Collapse | `ChevronUp` |
| Close / dismiss | `X` |
| Confirm | `Check` |
| Filter | `ListFilter` |
| Sort (neutral) | `ChevronsUpDown` |
| Sort ascending | `ArrowUp` |
| Sort descending | `ArrowDown` |
| Refresh / reload | `RotateCw` |
| Overflow menu | `MoreHorizontal` |

### Status & severity

| State | Icon |
|---|---|
| Info | `Info` |
| Success | `CheckCircle2` |
| Warning | `AlertTriangle` |
| Danger | `AlertOctagon` |
| Critical / blocking | `AlertOctagon` (same; distinguished by tone, not glyph) |
| Offline | `WifiOff` |
| Syncing | `RefreshCw` (animated when in syncing state; static under reduced-motion) |
| Online / up-to-date | `Check` in success-tone pill, or `Cloud` when literal |
| Negative balance (inline with amount) | `AlertCircle` (smaller, 14 px) |
| Decrypt-failed row | `AlertTriangle` (inline in table's Type column, warning tone) |
| Required field marker | `Asterisk` (optional — primary indicator is `*` text; icon is fallback for screen readers) |

### Transactions

| Context | Icon |
|---|---|
| Income (tx type) | `ArrowUpRight` (success.default) |
| Expense (tx type) | `ArrowDownRight` (danger.default) |
| Account pill | small Wallet or (future) account-specific glyph |
| Uncategorized badge | (no icon — text only `Sin categorizar`) |
| Date | `Calendar` (filter-bar range pill) |
| Amount | (no icon; tabular-nums rendering is the convention) |

### Security-adjacent

| Context | Icon |
|---|---|
| Enrolled device (admin view future) | `Laptop` or `Smartphone` |
| Revoked device banner | `ShieldOff` |
| Signed / verified | `ShieldCheck` |
| Audit log | `History` |
| Escrow / permission | `Key` (reserve — no v1 surface yet) |

### Empty / onboarding

Per §4, **no icon** on empty states in v1. The slot exists in the `EmptyState` component but defaults to absent. If a future product-level decision adds one, the Lucide choice per context is:

| Empty context | Icon (if used future) |
|---|---|
| Db empty | `Inbox` |
| No range selected | `Calendar` |
| No filter match | `SearchX` |
| No accounts | `Wallet` |

---

## 3. Icon sizes & spacing

| Size token | Px | Use |
|---|---|---|
| `icon.xs` | 14 | Inline-with-text decorators (negative balance AlertCircle, required asterisk) |
| `icon.sm` | 16 | Button leading/trailing icons (default Button size), badge leading icons, status tones in banners (inline) |
| `icon.md` | 20 | Sidebar items, topbar action buttons, filter-bar controls |
| `icon.lg` | 24 | Account cards, sidebar brand mark, Empty-state slot |
| `icon.xl` | 32 | Success hero (first-run success), Empty-state slot when used |
| `icon.2xl` | 48 | Reserve — not used in Wave 1 |

Stroke width: **1.75 px** project-wide default (override at component level only for XL / 2XL where 2 px reads better).

Icon-text spacing (when paired): `space.1` (4 px) gap for `sm`/`md`; `space.2` (8 px) for `lg`+.

---

## 4. Usage rules

### 4.1 Pair icons with text in primary actions

Per Principle P3: icons support text, never replace it, on primary affordances.

- ✅ `[Plus] Nuevo Movimiento`
- ✅ `[Wallet] Cuentas`
- ❌ Icon-only sidebar item (collapsed rail excepted — see below)
- ❌ Icon-only "Save" button

### 4.2 Icon-only is permitted for three cases only

1. **Overflow menu** — `MoreHorizontal` (3 dots)
2. **Close / dismiss** — `X`
3. **Sidebar in collapsed state** — `icon.lg` items with tooltip-on-hover revealing the label

Every icon-only button MUST have an `aria-label`. No exceptions.

### 4.3 Never icon-only for destructive actions

Per Principle P3. "Revoke", "Delete", "Discard", "Reject" always ship the word. The icon may accompany (e.g., `[Trash2] Eliminar`) but never stand alone.

### 4.4 Colour inheritance

Icons inherit colour from surrounding text (`currentColor`). Explicit colour tokens apply only when the icon carries independent severity meaning:

- Income arrow → `success.default`
- Expense arrow → `danger.default`
- Warning inline icon → `warning.default`
- Offline WifiOff → `info.default`

Otherwise icons use the surrounding slot's colour (`text.primary`, `text.secondary`, `text.muted`, `accent.default` on active nav, etc.).

### 4.5 Decorative vs meaningful icons

- **Decorative icon** (pure visual polish, redundant with adjacent text): `aria-hidden="true"`. Not announced by screen readers.
- **Meaningful icon** (carries info not in text): given an `aria-label` or the icon is inside a parent element whose `aria-label` covers it.

Wave-1 examples:
- Banner tone icon: decorative (tone is already in copy + colour + `role`).
- Sidebar item icon: decorative (label is alongside).
- Sidebar item icon in **collapsed rail**: meaningful — the icon IS the label. Parent button gets `aria-label`.
- Decrypt-failed row AlertTriangle in table: meaningful — carries the "couldn't read" signal; given `aria-label="Movimiento no legible"`.

---

## 5. Icon contrast

All icons in informational contexts must clear WCAG 1.4.11 non-text contrast minimum of **3:1** against their background. The colour tokens in [tokens.md](./tokens.md) are already verified to this standard when used at the documented slot pairings. Icons that get explicit colour tokens inherit that verification.

**Exception:** `text.muted` icons on `surface.primary` in light theme (5.7:1) and dark theme (5.2:1) both clear 3:1 comfortably. No issue.

---

## 6. Illustration strategy: **none in v1**

**Wave 1 ships zero custom illustrations.** Principle P6 ("the empty state teaches") is achieved through clear copy + layout + (optionally) Lucide icons at `icon.xl` — not through decorative art.

### Rationale

1. **Budget.** This is a volunteer-staffed project; custom illustration eats cycles better spent on treasury correctness.
2. **Principle P1 (calm over flashy).** Treasury apps don't need mascots. An illustrated empty state signals "we're trying to be fun" — treasurers want "we're trying to be accurate."
3. **i18n friction.** Illustrations often contain culture-loaded imagery (hand gestures, objects). Avoiding them avoids localization drift.
4. **Dark-mode doubling.** Every custom illustration needs a dark-mode variant. None = zero maintenance burden.

### What we ship instead

- Empty states have **no illustration**. Copy is enough (Principle P6 + P3).
- If a future pilot-feedback signal says users get lost, the upgrade path is: start with a single 32 px Lucide icon in the EmptyState's icon slot. That slot is already defined ([components-v1.md §11](./components-v1.md#11-empty-state)).

### Revisit triggers

- Post-M2 pilot feedback shows users confused by empty states → add Lucide icons (tier 1).
- Marketing / fundraising materials need hero imagery → commission targeted art outside the app (landing page, not in-app).
- Settings / onboarding videos land → animations may replace illustration need.

### First-run welcome — deliberate absence

UX-001 `welcome` state has no hero illustration. The brand mark (32 px Lucide glyph with accent tint — `Scale` or a custom forthcoming mark) is the sole visual. Copy + the single primary CTA carry the moment. This is intentional; principle P1.

---

## 7. Custom brand mark (future, not in v1)

Wave 1 uses **Lucide's `Scale`** as a placeholder brand mark in the topbar + first-run welcome. A custom OpenTreasury mark is a future design task (v1.1 or later) and is out of scope for v0.1.

**Flag to Pedro:** is a custom mark a M1-blocker or v1.1 work? Recommendation: v1.1 — Lucide `Scale` at accent tint communicates "balance/treasury" cleanly enough for pilot. Pedro ratify.

---

## 8. Icon loading & packaging

- Icons ship inline as React components via `lucide-react` — no separate font file, no SVG sprite, no CDN.
- Bundled into the renderer Vite output. Tree-shaken per-use; unused icons don't ship.
- No network request at runtime for icons. Offline-first (vision Principle 5).

---

## 9. Open questions

1. **Custom brand mark timing** — M1 ship with Lucide `Scale`, or commission a mark for M1? Recommend defer. → **Pedro**.
2. **Account icon beyond `Wallet`** — future per-account type icons (CreditCard for cards, Banknote for petty cash, PayPal for PayPal…). Defer to v1.x; v1 uses colour-strip differentiation only. → **Link** (PRD-010 hook) / **Mouse** follow-up.
3. **Empty-state icon defaults** — ship zero (current plan) or ship a subtle `text.muted` 32 px per context? Recommend zero for v1; revisit post-pilot. → **Niobe / Pedro**.

---

## Changelog

| Date | Version | Notes |
|---|---|---|
| 2026-04-19 | v0.1 | Lucide locked. No illustrations in v1. Icon → semantic mappings for Wave-1 surfaces. |
