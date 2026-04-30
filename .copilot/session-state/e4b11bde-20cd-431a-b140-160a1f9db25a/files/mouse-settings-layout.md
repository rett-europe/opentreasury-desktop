# Settings Screen Layout Specification

**Version:** 1.0  
**Date:** 2026-04-29  
**Designer:** Mouse  
**Context:** PR-B prep — "Switch dataset" flow + visual hierarchy overhaul

---

## Section 1 — Information Architecture

The Settings screen should present configuration in three distinct areas, in order:

### 1.1 Current Dataset (status card — informational)

**Purpose:** Surface active dataset identity and state so users understand _which treasury_ they're working with.

**Key fields:**

- **Dataset label/name:** Human-readable label (if profile.json defines one) OR dataset ID as fallback. Use `--font-size-16` (semibold).
- **Dataset ID:** Always show the full UUID (monospace, secondary text) — required for support/trustee coordination.
- **Read-only badge:** If `config.readOnly === true`, show a prominent warning badge next to the dataset name.
- **Location path:** The effective absolute path (same as current "Data folder" display). Use monospace treatment. Include `(default location)` badge when `dataDir === null`.
- **Last event timestamp:** If cheap to surface from bootstrap or config state, show "Last updated: YYYY-MM-DD HH:mm" (relative time like "2 hours ago" is NOT corp-friendly for audit logs — stick to absolute timestamps). **⚠️ Open question for Pedro — see §5.**
- **Event count:** Total events applied (e.g., "1,247 transactions"). **⚠️ Open question for Pedro — see §5.**

**Actions:** None. This is pure status display — users cannot edit the dataset ID or location from here (that's §1.2's job).

---

### 1.2 Data Folder (action card — change location)

**Purpose:** Allow users to move the data folder to a different OneDrive for Business / SharePoint location within the _same dataset_.

**Key fields:**

- **Section title:** "Data folder location" (to differentiate from the dataset status above).
- **Current path:** Already shown in §1.1 (no duplication).
- **Requirement hint:** The corp-folder rule text (already in i18n: `settings.dataFolder.requirement`).

**Actions:**

- **"Change…" button:** Opens folder picker (current behavior from PR #174). Placement: Below the hint text, not inline with the path.
- **Error display:** Below the button (current behavior — keep it).

**Design decision:** Keep this as a _separate card_ from §1.1. Rationale: Dataset identity (§1.1) is **read-only informational** context; folder location (§1.2) is an **administrative action**. Merging them into one card would flatten the distinction between "what dataset am I in?" and "where is the data stored?" — two different mental models.

---

### 1.3 Switch Dataset (destructive action — footer or separate card)

**Purpose:** Trigger the "leave this dataset and pick a new folder" flow (which will relaunch the app into profile setup).

**Placement options:**

1. **Footer action (recommended):** Place at the bottom of the Settings screen, after a visual separator (e.g., `--space-12` vertical gap + `1px solid var(--color-divider)` horizontal rule). This spatially isolates the destructive action from the safe configuration above.
2. **Separate card (alternative):** A third card with a danger-tone border (`var(--color-danger-default)`).

**Copy for trigger button:**

- Primary label: "Switch to a different dataset…" (button styled as `--color-danger-default` text, no fill — see §2).
- Icon: `LogOut` or `FolderOpen` from `lucide-react` (size 16), left of text.

**⚠️ Open question for Pedro — see §5:** Should the existing "Sign out" sidebar icon be removed/repurposed, or keep both (sidebar = quick escape, Settings = formal action)?

---

### 1.4 App Metadata (optional footer section)

**Purpose:** Surface version, docs link, language switcher (future).

**Key fields:**

- **App version:** "OpenTreasury Desktop v1.0.2" (pull from `package.json` or build metadata). Small text, `--color-text-muted`.
- **Docs link:** "View documentation" → opens external URL (if one exists). Small link, `--color-text-link`.
- **Language switcher:** If more than one locale exists in `app/src/renderer/locales/` (currently EN + ES), show a small dropdown or pill toggle. **Currently NOT in scope** — the i18n strings exist but no UI for switching. Pedro can decide if this ships in PR-B or later.

**Placement:** Very bottom of the screen, small text, `--space-9` top margin.

---

## Section 2 — Visual Hierarchy

### 2.1 Page Structure

```
┌─────────────────────────────────────────────────┐
│ Settings                          (h1, 28px)    │  ← Title bar (existing)
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌─ Current Dataset ────────────────────────┐   │  ← Card 1 (status)
│ │ [Dataset Label]            [Read-only]   │   │
│ │ ID: abc123-…                             │   │
│ │ C:\Users\…\OneDrive… (default location)  │   │
│ │ Last updated: 2026-04-29 14:32           │   │  (if shown)
│ │ 1,247 transactions                       │   │  (if shown)
│ └──────────────────────────────────────────┘   │
│                                    ↕ --space-9  │
│ ┌─ Data Folder Location ───────────────────┐   │  ← Card 2 (action)
│ │ [Requirement hint]                       │   │
│ │ [Change… button]                         │   │
│ │ [Error display (if present)]             │   │
│ └──────────────────────────────────────────┘   │
│                                    ↕ --space-12 │
│ ────────────────────────────────────────────   │  ← Divider
│                                    ↕ --space-10 │
│ [Switch to a different dataset…]  (danger)     │  ← Footer action
│                                    ↕ --space-9  │
│ OpenTreasury Desktop v1.0.2 · Docs             │  ← App metadata
└─────────────────────────────────────────────────┘
```

### 2.2 Card Container (`.ot-settings__card`)

- **Background:** `--color-surface-primary`
- **Border:** `1px solid var(--color-border-default)`
- **Border radius:** `--radius-md` (8px)
- **Padding:** `--space-8` (20px)
- **Box shadow:** `--shadow-card` (existing token — purple-tinted subtle shadow)
- **Spacing between cards:** `--space-9` (24px)

**⚠️ Token inconsistency found:** Current `SettingsScreen.css` uses `--spacing-lg`, `--spacing-md`, etc., but `tokens.css` only defines `--space-0` through `--space-13`. Trinity should replace all `--spacing-*` with the correct `--space-*` tokens when implementing this spec.

### 2.3 Section Titles (within cards)

- **Font size:** `--font-size-16` (16px)
- **Font weight:** `--font-weight-semibold` (600)
- **Color:** `--color-text-primary`
- **Margin bottom:** `--space-6` (12px)

### 2.4 Dataset Status Fields (Card 1)

**Dataset label/name:**

- **Font size:** `--font-size-16`
- **Font weight:** `--font-weight-semibold`
- **Color:** `--color-text-primary`

**Dataset ID:**

- **Font family:** `--font-family-mono`
- **Font size:** `--font-size-13`
- **Color:** `--color-text-secondary`
- **Background:** `--color-surface-sunken`
- **Padding:** `--space-2` `--space-4` (4px 8px)
- **Border radius:** `--radius-sm` (6px)
- **Border:** `1px solid var(--color-border-subtle)`
- **Word break:** `break-all` (UUIDs are long)
- **Margin top:** `--space-3` (6px — tight to the label above)

**Read-only badge (if active):**

- **Background:** `--color-warning-bg`
- **Color:** `--color-warning-default`
- **Border:** `1px solid var(--color-warning-default)`
- **Padding:** `--space-1` `--space-4` (2px 8px)
- **Border radius:** `--radius-pill` (16px)
- **Font size:** `--font-size-12`
- **Font weight:** `--font-weight-medium`
- **Placement:** Inline with the dataset label (float right or flexbox `justify-content: space-between`)

**Location path:**

- Same treatment as Dataset ID (monospace, secondary background). See current `SettingsScreen.css` line 95–104 for reference.
- **"(default location)" badge:** Inline, same styling as read-only badge but with `--color-info-default` / `--color-info-subtle`.

**Last updated / Event count (optional fields — see §5):**

- **Font size:** `--font-size-13`
- **Color:** `--color-text-secondary`
- **Margin top:** `--space-4` (8px)
- **Layout:** Horizontal row with `·` separator (e.g., "Last updated: 2026-04-29 14:32 · 1,247 transactions")

### 2.5 Data Folder Card (Card 2)

- **Hint text (`settings.dataFolder.requirement`):**
  - **Font size:** `--font-size-13`
  - **Color:** `--color-text-secondary`
  - **Margin bottom:** `--space-6` (12px)

- **"Change…" button:**
  - **Variant:** Secondary button (existing `.ot-settings__button` style is close — see current CSS line 118–138)
  - **Background:** `--color-surface-primary`
  - **Border:** `1px solid var(--color-border-default)`
  - **Hover background:** `--color-surface-raised` or `var(--color-row-hover)` (subtle lift)
  - **Hover border:** `--color-border-strong`
  - **Disabled opacity:** 0.5
  - **Padding:** `--space-3` `--space-7` (6px 16px)
  - **Font size:** `--font-size-14`
  - **Font weight:** `--font-weight-medium`
  - **Border radius:** `--radius-md`
  - **Cursor:** `pointer` (default), `not-allowed` (disabled)

- **Error card (if present):**
  - Same as current (see line 156–168).

### 2.6 Switch Dataset Action (Footer)

**Divider:**

- **Border top:** `1px solid var(--color-divider)`
- **Margin top:** `--space-12` (48px — large gap above the danger zone)
- **Padding top:** `--space-10` (32px)

**Trigger button:**

- **Variant:** Danger ghost button (text-only, no fill, no border)
- **Color:** `--color-danger-default` (text + icon)
- **Background:** `transparent`
- **Hover background:** `--color-danger-subtle` (light red tint)
- **Active background:** Slightly darker than hover (use `color-mix(in oklch, var(--color-danger-subtle) 85%, var(--color-danger-default))` or similar)
- **Font size:** `--font-size-14`
- **Font weight:** `--font-weight-medium`
- **Padding:** `--space-3` `--space-6` (6px 12px)
- **Border radius:** `--radius-md`
- **Icon:** `LogOut` size 16, `--space-2` margin-right

**Placement:** Centered horizontally OR left-aligned (Pedro's call — see §5).

### 2.7 App Metadata Footer

- **Font size:** `--font-size-12`
- **Color:** `--color-text-muted`
- **Margin top:** `--space-9` (24px)
- **Text align:** center
- **Link color:** `--color-text-link`

---

## Section 3 — States & Copy

### 3.1 Current Dataset Card

**Default state:**

- All fields visible (label, ID, path, optional timestamp/count).
- Read-only badge: only shown if `config.readOnly === true`.
- No interactive elements.

**Loading state (initial page load):**

- Skeleton shimmer or spinner in place of card content (use existing `.ot-settings__loading` pattern).

**Error state (config fetch fails):**

- Show existing error message: "Failed to load settings. Please refresh the app."

---

### 3.2 Data Folder Card — "Change…" Button

**Default (enabled):**

- Copy: "Change…" (`settings.dataFolder.changeButton`)
- Background: `--color-surface-primary`, border: `--color-border-default`

**Hover:**

- Background: `--color-surface-raised`
- Border: `--color-border-strong`

**Loading (picker open or setDataDir in flight):**

- Copy: "Loading…" (`common.loading`)
- Disabled state (no click, spinner optional)

**Disabled (read-only mode):**

- Opacity: 0.5
- Cursor: `not-allowed`
- Tooltip (optional): "Data folder is read-only"

**Error display (below button):**

- Same as current (see `SettingsScreen.css` line 156–168).
- Copy: Use existing i18n keys from `settings.dataFolder.errors.*`

---

### 3.3 Switch Dataset — Trigger Button

**Default (idle):**

- Copy: "Switch to a different dataset…"
- Icon: `LogOut` (size 16, left of text)
- Color: `--color-danger-default`
- Background: `transparent`

**Hover:**

- Background: `--color-danger-subtle`

**Active (click):**

- Background: slightly darker (see §2.6)

**Disabled (if in read-only mode — ⚠️ open question for Pedro):**

- Opacity: 0.5
- Cursor: `not-allowed`
- Should read-only users be allowed to switch datasets? Probably **yes** (switching is not data mutation, just navigation), but Pedro should confirm.

---

### 3.4 Switch Dataset — Confirmation Modal

**Modal structure:**

- Use native `<dialog>` (WCAG AA baseline).
- **Title:** "Switch to a different dataset?"
- **Body copy (2 alternatives for Pedro to pick):**

  **Option A (concise):**

  > You are about to leave the current dataset and select a new data folder. The app will relaunch, and you'll need to set up your profile again if the new folder doesn't contain a profile.json file. Your current dataset will remain untouched.

  **Option B (plain, step-by-step):**

  > This action will:
  >
  > 1. Close the current dataset (no data is deleted).
  > 2. Prompt you to pick a new OneDrive for Business or SharePoint folder.
  > 3. Relaunch the app into the new folder.
  > 4. Run profile setup if the folder is empty or contains a different treasury.

**Action buttons:**

- **PRIMARY (anti-misclick):** "Stay in current dataset" or "Cancel"
  - Variant: Filled button, `--color-brand-primary` background
  - Placement: Right side of button row
- **SECONDARY (destructive):** "Switch dataset"
  - Variant: Ghost button, `--color-danger-default` text
  - Placement: Left side of button row

**Keyboard nav:**

- Default focus: PRIMARY (Cancel)
- ESC key: Dismiss modal (same as Cancel)
- Enter key: Activate focused button

**Copy alternatives for Pedro:**
| Element | Option A | Option B |
|-----------------|---------------------------------|-------------------------------|
| Title | Switch to a different dataset? | Switch to a different dataset?|
| PRIMARY button | Stay in current dataset | Cancel |
| SECONDARY button| Switch dataset | Switch dataset |

---

## Section 4 — Accessibility & Responsive Notes

### 4.1 WCAG 2.1 AA Compliance

**Color contrast:**

- `--color-danger-default` on `--color-surface-primary` background: 4.58:1 (AA pass for normal text).
- `--color-danger-default` on `--color-danger-subtle` background: Check at implementation time. If ratio < 4.5:1, darken the text or lighten the background.
- Read-only badge: `--color-warning-default` on `--color-warning-bg` — existing token pair, should pass (verify in dark mode).

**Focus indicators:**

- All interactive elements (buttons, links) must show `:focus-visible` ring (`--color-focus-ring`, 2px solid, 2px offset).
- Modal dismiss (X button, Cancel button) must be keyboard-accessible.

**Keyboard order:**

1. Page title (skip link target, optional)
2. Current Dataset card content (static, no tab stops)
3. "Change…" button
4. "Switch to a different dataset…" button (if not disabled)
5. Footer links (docs, etc.)

**Screen reader notes:**

- Dataset ID: Wrap in `<code aria-label="Dataset identifier: [UUID]">` so screen readers don't spell out each character.
- Read-only badge: `<span role="status" aria-live="polite">Read-only mode</span>` (if dynamically toggled; static on page load = no ARIA needed).
- "Switch dataset" button: `aria-label="Switch to a different dataset. This will close the current dataset and relaunch the app."`

### 4.2 Responsive Layout

**Minimum sensible width:** 720px (Electron desktop app — no mobile viewport).

**Breakpoint behavior (< 720px, rare but possible if user resizes window):**

- Cards: Maintain single-column layout (already the default).
- Dataset ID / path: Allow text to wrap (`word-break: break-all` for UUIDs, `word-wrap: break-word` for paths).
- "Change…" button: Full-width on narrow viewports (optional — Pedro's call).
- Confirm modal: Same responsive rules as other dialogs (constrain to 90vw max-width, center horizontally).

**Typography scaling:**

- No dynamic font scaling — desktop users can zoom the whole app via OS accessibility features.

---

## Section 5 — Open Questions for Pedro

Trinity should NOT start implementation until these are resolved:

1. **Dataset status detail level:** Show "Last updated" timestamp + event count in the Current Dataset card, or hide as too technical? If shown, where does the data come from (bootstrap, config API, or a new query)?

2. **Event count vs. transaction count:** The config state exposes `readOnly` but NOT event metadata. Should Trinity fetch this from the database (e.g., `SELECT COUNT(*) FROM events`) or is it out of scope for Settings?

3. **Switch dataset + read-only mode:** Should the "Switch dataset" button be **disabled** when `config.readOnly === true`, or is switching allowed (since it's navigation, not mutation)?

4. **Sidebar "Sign out" icon:** PR-B will add "Switch dataset" to Settings. Should the sidebar icon:
   - Be removed entirely (Settings is the canonical location)?
   - Be repurposed to link to Settings?
   - Stay as-is (quick escape hatch)?

5. **Confirm modal copy:** Pick Option A (concise) or Option B (step-by-step) from §3.4.

6. **Primary button label:** "Stay in current dataset" (explicit) or "Cancel" (generic)?

7. **"Switch dataset" button placement:** Footer (recommended) or separate danger-tone card?

8. **Language switcher:** Ship in PR-B or defer to a later PR?

9. **App version source:** Pull from `package.json`, or does the backend expose it via an API?

10. **"Switch dataset" button alignment:** Centered or left-aligned in the footer?

---

## Revision History

| Version | Date       | Author | Changes                    |
| ------- | ---------- | ------ | -------------------------- |
| 1.0     | 2026-04-29 | Mouse  | Initial spec for PR-B prep |
