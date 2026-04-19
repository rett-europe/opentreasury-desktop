# Design Principles v0.1

> **Status:** Draft v0.1 · **Owner:** Mouse (UI Designer) · **Date:** 2026-04-19
> **Scope:** Visual-design tie-breakers for OpenTreasury Desktop Wave 1 (UX-001/002/003/004/005/006).
> **Derived from:** [vision §7](../product/vision.md) (principles), [prototype-analysis](../ux/prototype-analysis-v1.md) §UX principles, Rett Spain pilot context (Spanish-first NGO volunteers; treasurers typically 40+, not tech-savvy, board members older).

These are the tie-breakers every visual decision in this design system answers to. When a design question is unclear, apply in order.

---

## P1 — Calm over flashy

Treasury work is serious. Treasurers are spending donor money and answering to boards; a dopamine UI undermines the gravity of the task. No gradients-for-gradients'-sake, no animated confetti on save, no "streak" counters. Visuals favour the *file-on-disk, spreadsheet-adjacent* register over the *SaaS-app, landing-page* register.

**Consequences:**
- Accent colour used **sparingly** — primary action per surface, brand-mark, active nav — not decorative.
- No hero images, no mascots, no illustrated splash screens beyond a minimal welcome in UX-001.
- Motion is a status signal (loading, transitions), never a reward.

## P2 — High contrast by default

Rett Spain volunteers skew older (50+); many work on sub-optimal monitors, some with mild visual impairment. The prototype's purple-on-light-purple rows (`--clr-row-hover: rgba(109, 77, 140, 0.04)`) are pretty but below any reasonable contrast floor for body text.

**Consequences:**
- Body text minimum **7:1** on primary surface (AAA) where practical; **4.5:1** (AA) is the floor.
- No muted-on-muted pairings. Secondary text is muted against *surface*, never against another muted element.
- Dark mode is designed first for contrast, second for aesthetics.
- Focus rings are **always** visible — not subtle. 2px offset ring in accent colour, never under 3:1 against adjacent surfaces.

## P3 — Text-first; icons support, never replace

Treasurers read; they don't memorise icon vocabularies. An icon without a label is a riddle. The prototype's icon-only topbar buttons (search, settings gear) are an accessibility debt we will not inherit.

**Consequences:**
- Primary actions show **text + icon** (or text alone), never icon alone.
- Icon-only buttons are permitted only for **three** cases: (a) overflow `⋯`, (b) close `✕` on modals/toasts, (c) sidebar rail in collapsed state — and each MUST have an accessible name and a tooltip.
- Destructive actions are **never** icon-only. "Revoke device", "Delete transaction", "Burn down dataset" always ship the word.
- Status badges carry text OR an icon pair — never colour alone (reinforces UX-003/004/005 PR16 "colour not sole channel").

## P4 — Desktop-native feel

This is an Electron BrowserWindow, not a website. It should feel like File Explorer / Finder / VS Code — not like a responsive SaaS page. Volunteers know those patterns; matching them reduces cognitive load.

**Consequences:**
- **OS system font stack**, no web fonts downloaded at runtime (NGO offline posture; also respects user font preferences at the OS level).
- Native scrollbars (do not reskin unless the OS default is visibly broken, e.g., overlapping content on macOS — in which case match the platform's "always-visible" variant).
- Keyboard-first interaction model: every interactive surface reachable without a mouse, in a predictable tab order.
- Window chrome leaves platform affordances alone — no fake window controls, no custom titlebar widgets in v1.
- Right-click context menus where users expect them (table rows, account pills) — flagged as v1.x enhancement, not M1 blocker.

## P5 — Bilingual-first layout

Spanish is primary; English is pilot-ready from day 0 (ADR-003). Spanish text runs **~30% longer** than English on average; English on **~30% shorter**. Designing tight to one language breaks the other.

**Consequences:**
- **All text containers flex**. Fixed-width chips, buttons with hard pixel widths, single-line labels that can't wrap — banned.
- Components have **minimum widths tested with Spanish + EN** (e.g., `Nuevo Movimiento` = 16 chars; `New Transaction` = 15 chars — parity; but `Comparación por categoría` = 24 vs `Comparison by category` = 22 — single-line target must accommodate the longer).
- Type scale leaves room — body text is 14px, not 12, to accommodate wrapped Spanish without cramping.
- Two- and three-word labels are preferred over one-word jargon (avoids synonym traps across locales).

## P6 — The empty state teaches

Every Wave-1 surface has an empty state (UX-001 pre-folder, UX-003 range-not-selected + db-empty, UX-004 empty-db + empty-only-{current,prior}, UX-005 empty-no-accounts + empty-no-tx + empty-current-month). Treasurers meet these first — they are orientation, not an afterthought.

**Consequences:**
- Every empty state has: a title, one explanatory sentence, and exactly **one primary action** (and at most one secondary).
- Empty states are **not illustrations** in v1 (see [icons-and-illustrations.md](./icons-and-illustrations.md)) — just clear layout + clear copy. Illustration budget is zero until v1.1.
- Error states follow the same anatomy (title + one sentence + action) and are distinguished only by tone + icon, never by chrome.

## P7 — Density is a preference, not a default

Treasurers reviewing 500 transactions want dense; a board member skimming Saldo wants airy. The prototype already ships `body.density-compact` — we keep the mechanism and make it explicit.

**Consequences:**
- Two densities: **standard** (default, 40px row height on data tables) and **compact** (32px). Accessible via Settings, and — for data tables specifically — via a surface-level density toggle on UX-003 Movements.
- Compact does **not** reduce contrast, font size below 13px, or touch targets below 32×32.
- Spacing tokens scale with density; type scale does not (13px body in compact is the floor).

## P8 — Security-adjacent language is surfaced, not hidden

Per the vision's Principle 6 (*"Secure by default; Switch has final say"*) and the enrollment spec's defense posture (UX-002 step 4.3 B warning), cryptographic UX is honest. Pubkey-substitution defense only works if the visual treatment of the 6-character code makes mismatch **impossible to miss**.

**Consequences:**
- The 6-character enrollment code is **the most prominent element on its screen** — typographically (large monospace, high tracking) and spatially (centre-of-frame, generous surrounding whitespace).
- Security warnings (UX-002 admin modal warning, UX-001 damaged-escrow) use the **danger** tone but plain language (UX principle). Never "⚠️ Warning" without the actionable sentence.
- Decrypt-failed footnotes (UX-003 E5, UX-004 E9, UX-005 E6) are visible at surface level, not buried in a log — even when they're a single row in a thousand.

---

## How these principles apply across Wave 1

| Principle | Where you see it Wave 1 |
|---|---|
| P1 Calm | No confetti on tx save; account colour chip muted on Panel cards; accent only on primary CTAs |
| P2 Contrast | AA-verified token pairs (see [tokens.md](./tokens.md)); dark mode shipped v0.1 |
| P3 Text+icon | Every sidebar item, every primary CTA pairs text with Lucide icon |
| P4 Desktop-native | System font stack in [tokens.md §Typography](./tokens.md#typography); keyboard shortcuts from UX-006 §8 |
| P5 Bilingual | Button min-widths, data-table column sizing, banner wrap behaviour in [components-v1.md](./components-v1.md) |
| P6 Empty-state | `EmptyState` component primitive used by UX-003 db-empty, UX-005 empty-no-accounts, UX-001 pre-folder, UX-004 empty-db |
| P7 Density | Movements density toggle; Settings global density preference |
| P8 Security UX | `CodeDisplay` component for UX-002 enrollment code; danger-tone banners for decrypt failures |

---

## Revisit triggers

- A third locale with markedly different text-expansion profile is added (e.g., Polish, German) → P5 rule set may need widening.
- User research from pilot NGO shows the density default wrong for >30% of treasurers → P7 default flips.
- Accessibility audit (formal, post-M2) exposes a systemic contrast failure → P2 AAA target moves from "where practical" to "required".

---

## Changelog

| Date | Version | Notes |
|---|---|---|
| 2026-04-19 | v0.1 | Initial principles set derived from vision, UX principles, Rett Spain pilot context. |
