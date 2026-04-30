# Preferences Screen Extension Specification — Profile, Appearance, Language

**Version:** 1.0  
**Date:** 2026-05-02  
**Designer:** Mouse  
**Context:** PR-B all-in-one Preferences overhaul — extending mouse-settings-layout.md with Profile editing, Appearance (theme), and Language sections

---

## Section 1 — Updated Information Architecture (Overview)

### 1.1 Final Preferences Screen Layout (Top-to-Bottom Card Order)

**Design principle:** Frequency of access + identity-first heuristic — most-used sections at the top, destructive actions at the bottom.

**Final order:**

1. **Profile** (name, role, organization) — WHO YOU ARE. Identity fields the user needs on day one and may revisit when role changes or org rebrands. Placed first because every other section depends on having a valid profile.

2. **Appearance** (light / dark / system theme) — DAILY PREFERENCE. NGO staff working across time zones or during evening fundraising events switch theme frequently. High utility, zero friction.

3. **Language** (English / Spanish) — INFREQUENT BUT CRITICAL. Set once at first launch, rarely changed unless org switches primary language or new staff join. Placed before dataset config because it's user-facing preference (not admin config).

4. **Current Dataset** (status card — read-only) — WHAT DATASET AM I IN. Informational anchor — shows dataset ID, path, read-only status, optional event count. No actions. This is NOT configuration, it's context display, so it ranks after personal preferences.

5. **Data Folder Location** (change folder action) — ADMIN ACTION. Technical configuration for IT coordinators or advanced users who need to move data between OneDrive folders. Most users never touch this.

6. **About / Version** (app metadata) — RARELY ACCESSED. Version string + docs link. Useful for support tickets, not day-to-day work.

7. **Switch Dataset** (footer, danger action) — DESTRUCTIVE ESCAPE HATCH. Leaves the current treasury and relaunches app into profile setup. Isolated in a footer treatment with a danger ghost button + confirmation modal to prevent misclicks.

**Rationale:** This sequence balances user identity (Profile) → daily comfort (Appearance, Language) → dataset context (Current Dataset, Data Folder) → metadata (About) → destructive action (Switch). The "who / how / what / escape" progression mirrors NGO staff mental models (first I log in, then I configure my workspace, then I see which dataset I'm in, and finally I have an emergency exit if needed).

### 1.2 Section Grouping (Visual Treatment)

**No explicit group separators.** Preferences are presented as a single vertical stack of cards with consistent `--space-9` (24px) spacing between each. The Switch Dataset action breaks the stack with a visual divider (`1px solid var(--color-divider)`) to isolate the danger zone, but the other sections flow naturally without sub-grouping.

**Why no groups?** The card order already provides semantic clustering (personal → global → dataset → admin → escape). Adding group headers ("User Preferences" / "Dataset Configuration") would introduce hierarchy depth that flattens the perceived speed of the screen — NGO users want a quick scan, not nested mental navigation.

---

## Section 2 — Profile Section

### 2.1 Purpose

Allow users to edit their profile fields (name, role, organization name) inline without relaunching the ProfileSetupModal. These are the same fields captured at first launch — the Preferences screen gives them a permanent home for updates (e.g., role promotion from "Accountant" to "Finance Director", org rebrand from "Fundación Esperanza" to "Esperanza Global").

### 2.2 Fields

**Three editable text inputs, matching ProfileSetupModal:**

1. **Name**
   - Label: `profileSetup.nameLabel` ("Your name")
   - Validation: 1-100 characters (per `profileSchema` in `profile.ts` line 15, though modal maxLength is 80 — **🚧 Open question for Pedro: reconcile this**).
   - Placeholder: None (pre-populated from current profile).

2. **Role**
   - Label: `profileSetup.roleLabel` ("Your role")
   - Validation: Max 50 characters (per `profileSchema` line 16).
   - Placeholder: `profileSetup.rolePlaceholder` (e.g., "Treasurer, Finance Director, etc.")
   - **⚠️ Open question for Pedro:** Is freeform text still appropriate? Consider offering a dropdown of common NGO roles (Treasurer, Accountant, Executive Director, Finance Manager) + "Other (specify)" option. This would reduce variance in audit logs and improve UX for first-time users who don't know what to write.

3. **Organization Name**
   - Label: `profileSetup.ngoLabel` ("Your organization")
   - Validation: Max 200 characters (per `profileSchema` line 17, though modal maxLength is 120 — **🚧 Open question for Pedro: reconcile this**).
   - Placeholder: None (pre-populated).

**Fields NOT shown:**

- **userId** (ULID) — system-generated, immutable, no UI.
- **identitySource** (`local` or `aad`) — future auth metadata, no UI today.
- **createdAt** (ISO 8601 timestamp) — system metadata, no UI.

### 2.3 Section Title & Microcopy

**Title:** "Your profile" (`preferences.profile.title`)

**Rationale:** "Your profile" is warmer and more NGO-friendly than "Profile" (which sounds like a database record). This is personal information, not a config file.

**Hint text (optional, below title, small secondary text):**  
"This information appears in audit logs and exported reports."

**Why include hint?** NGO staff may hesitate to update their role mid-year if they don't understand the scope — clarifying that this is audit metadata (not a signature that invalidates past transactions) reduces support friction.

### 2.4 Save Model — Explicit "Save changes" Button (Recommended)

**Approach:** Idle → editing → explicit save → saved confirmation.

**Why explicit save (not auto-save-on-blur)?**

1. **Predictability:** NGO users expect to review changes before committing — auto-save feels "magic" and untrustworthy in finance contexts.
2. **Error handling:** If the IPC call fails mid-blur (network hiccup, disk full), auto-save would silently fail or require intrusive toast notifications. An explicit button lets the user retry.
3. **Multi-field edits:** Users often update multiple fields at once (e.g., name + role after a promotion). Explicit save batches the IPC call instead of triggering three separate writes.

**Alternative (deferred):** Auto-save-on-blur with a debounced "Saving…" micro-indicator. This is more modern but riskier for v1 Preferences — defer to a follow-up UX audit after Pedro dogfoods the explicit-save version.

### 2.5 States & Token Usage

**Default (idle):**

- All fields show current profile values.
- Inputs are enabled (white background, `--color-surface-primary`).
- "Save changes" button is **disabled** (gray text, `--color-text-disabled`, opacity 0.5, `cursor: not-allowed`).

**Editing:**

- User types in any field → "Save changes" button becomes **enabled** (filled brand button, `--color-brand-primary` background, white text).
- No inline validation — errors only surface on save.

**Saving (IPC call in flight):**

- All inputs **disabled** (to prevent race conditions).
- "Save changes" button shows loading state: "Saving…" text, optional spinner (left of text, size 14px, `--color-brand-on-primary`).

**Saved (success):**

- Brief confirmation microcopy appears below the button: "Profile updated" (green checkmark icon + `--color-success-default` text, auto-dismiss after 2 seconds).
- Button returns to **disabled** state (no pending changes).
- Inputs return to **enabled**.

**Error (IPC call fails):**

- Error card appears below the button (same treatment as existing `SettingsScreen.css` error card, lines 156-168):
  - Background: `--color-danger-subtle`
  - Border: `1px solid var(--color-danger-default)`
  - Icon: `AlertCircle` (lucide-react, size 16)
  - Copy: Server-provided error message OR generic fallback: "Failed to save profile. Please try again."
  - Button: "Retry" (danger text button, inline right).
- Button returns to **enabled** state (user can retry).

**Validation errors (client-side, triggered on save attempt):**

- Per-field error messages appear **below each input** (same pattern as ProfileSetupModal lines 135–138).
- Focus moves to the first invalid field.
- Button remains **enabled** (user can fix and retry without re-clicking).

### 2.6 Visual Hierarchy & Layout

**Card container:**

- Same as all Preferences cards: `.ot-preferences__card`, background `--color-surface-primary`, border `1px solid var(--color-border-default)`, padding `--space-8` (20px), border-radius `--radius-md` (8px).

**Section title:**

- "Your profile"
- Font: `--font-size-16`, `--font-weight-semibold`, `--color-text-primary`
- Margin bottom: `--space-6` (12px)

**Hint text (if shown):**

- Font: `--font-size-13`, `--color-text-secondary`
- Margin bottom: `--space-6`

**Input fields:**

- Stack vertically, `--space-6` (12px) between each.
- Label above input (same as ProfileSetupModal):
  - Font: `--font-size-14`, `--font-weight-medium`, `--color-text-primary`
  - Margin bottom: `--space-3` (6px)
- Input box:
  - Height: 36px (padding `--space-3` top/bottom, input text size `--font-size-14`)
  - Border: `1px solid var(--color-border-default)`
  - Hover border: `--color-border-strong`
  - Focus border: `2px solid var(--color-focus-ring)`, remove default outline
  - Background: `--color-surface-primary`

**"Save changes" button:**

- Placement: Below the last input, `--space-7` (16px) margin-top.
- Variant: Filled brand button (enabled) or disabled ghost (idle).
- Size: `--space-3` `--space-7` (6px 16px padding), `--font-size-14`, `--font-weight-medium`.
- Width: Auto (NOT full-width — keeps the button compact and left-aligned with inputs).

**Success / error feedback:**

- Appears directly below the button, `--space-4` (8px) margin-top.

### 2.7 Accessibility

**Keyboard navigation:**

1. Section title (skip link target, optional)
2. Name input (autofocus on Preferences page load? No — let user read the page title first)
3. Role input
4. Organization name input
5. "Save changes" button

**Screen reader notes:**

- Each input has an associated `<label>` with `htmlFor` attribute.
- Error messages use `aria-describedby` (same as ProfileSetupModal line 131).
- "Save changes" button has `aria-disabled="true"` when disabled (not just visual opacity).

**Focus indicators:**

- All inputs show `:focus-visible` ring (2px solid `--color-focus-ring`, 2px offset).

---

## Section 3 — Appearance Section

### 3.1 Purpose

Let users choose between Light, Dark, and System (auto-follow OS preference) themes. The app already ships with a full dark mode palette in `tokens.css` (lines 378–450), so this section is UI-only — the backend (theme persistence + `[data-theme]` attribute application) already exists.

### 3.2 Options

**Three mutually-exclusive choices:**

1. **Light** — Force light theme regardless of OS setting. Sets `<html data-theme="light">`.
2. **Dark** — Force dark theme regardless of OS setting. Sets `<html data-theme="dark">`.
3. **System** (default) — Follow OS preference. Sets `<html data-theme="system">` and defers to `@media (prefers-color-scheme: dark)` for token selection.

### 3.3 Visual Treatment — Segmented Control (Recommended)

**Layout:**

```
┌─ Appearance ────────────────────────────────────────┐
│  Theme                                              │
│  ┌────────────────────────────────────────────────┐│
│  │  Light   │   Dark   │   System                ││  ← Segmented control
│  └────────────────────────────────────────────────┘│
│  (Selected: Light background fill, rest are ghost) │
└─────────────────────────────────────────────────────┘
```

**Why segmented control (not radio cards)?**

- **Compactness:** Three options in a horizontal row (60px/option ≈ 180px total width) fit comfortably on a 720px-wide window.
- **Affordance clarity:** Segmented controls are the standard pattern for mutually-exclusive visual modes (iOS Settings, macOS System Preferences, GitHub theme picker).
- **Low decision weight:** This is a preference, not a transaction — users should scan, click, and move on, not deliberate over full-height radio cards.

**Alternative (for Pedro to override):** Three radio cards with icons + labels (Sun / Moon / Monitor). This is more accessible for low-vision users but takes 3× the vertical space. If Pedro prefers cards, each card should be 48px tall with a left-aligned icon (size 20) + label.

### 3.4 Token Strategy & Dark Mode Readiness

**✅ Dark theme tokens already exist** in `tokens.css` lines 378–450. The palette is complete (surfaces, text, borders, semantic colors, shadows). No new tokens are needed.

**Implementation notes for Trinity:**

- The `AppShell.tsx` already has theme-switching logic (check for `data-theme` attribute or `useTheme` hook).
- Persistence: Check if theme preference lives in `localStorage` (key `ot-theme` or similar) OR in `profile.json` as a new field. **⚠️ Open question for Pedro — see §6.**
- State synchronization: Changing theme must update `<html data-theme="…">` AND persist the choice — Trinity should confirm the current mechanism.

### 3.5 Microcopy & Labels

**Section title:** "Appearance" (`preferences.appearance.title`)

**Segmented control label (above the buttons):** "Theme" (`preferences.appearance.themeLabel`)

**Button labels:**

- `preferences.appearance.light` → "Light"
- `preferences.appearance.dark` → "Dark"
- `preferences.appearance.system` → "System"

**Hint text (optional, below segmented control, small secondary text):**  
"System matches your operating system's theme preference."

**Why include hint?** "System" is tech jargon — NGO users may not know what it means. A one-line explainer reduces confusion.

### 3.6 States

**Default (idle):**

- Segmented control shows the current theme selection (filled background on active button, ghost on inactive).
- No "Save" button — theme changes apply **immediately** (live preview).

**Active (user clicks a different option):**

- The clicked button becomes filled (background `--color-brand-primary`, text `--color-brand-on-primary`).
- The previously-active button becomes ghost (background `transparent`, text `--color-text-primary`, border `1px solid var(--color-border-default)`).
- The `<html data-theme="…">` attribute updates instantly.
- Persistence IPC call fires in the background (no loading spinner — this is fast enough to be perceived as instant).

**Error (persistence fails — rare):**

- No inline error. If the IPC call to save the theme preference fails, the theme still switches (in-memory state persists for the session). On next app launch, the theme reverts to the last successfully-persisted value.
- **⚠️ Open question for Pedro:** Should we show a toast notification ("Theme preference not saved") or silently fail? For v1, silent fail is acceptable — theme is low-risk preference, not treasury data.

### 3.7 Accessibility

**Keyboard navigation:**

- All three buttons are `<button type="button">` with `role="radio"` and `aria-checked="true"` on the active one.
- Arrow keys (← / →) cycle through the options (standard `radiogroup` behavior).
- Space or Enter selects the focused button.

**Screen reader notes:**

- The segmented control container has `role="radiogroup"` and `aria-label="Theme"`.
- Each button announces as "Light, radio button, checked" (or unchecked).

**Focus indicators:**

- `:focus-visible` ring on all buttons (2px solid `--color-focus-ring`, 2px offset).

---

## Section 4 — Language Section

### 4.1 Purpose

Let users switch between English and Spanish without relaunching the app. The app already has two complete locales (`en/common.json` and `es/common.json`), and `AppShell.tsx` lines 197–204 show `i18n.changeLanguage()` is wired. This section is UI-only.

### 4.2 Options

**Two locales (today):**

1. **English** (`en`) — Shell labels: "Profile" / "Dashboard" / "Transactions" / etc.
2. **Spanish** (`es`) — Shell labels: "Perfil" / "Panel" / "Movimientos" / etc.

**Future-proofing:** The UI should gracefully accommodate a third locale (e.g., French, Portuguese) without redesign. If we ship a `<select>` dropdown now, adding a third option is trivial. If we ship a two-button toggle, we'll need to redesign as a dropdown or segmented control later.

### 4.3 Visual Treatment — Labeled `<select>` Dropdown (Recommended)

**Layout:**

```
┌─ Language ──────────────────────────────────────────┐
│  Language                                           │
│  ┌────────────────────────────────────────────────┐ │
│  │ English                               ▼        │ │  ← Dropdown
│  └────────────────────────────────────────────────┘ │
│  (Dropdown options: English, Español)              │
└─────────────────────────────────────────────────────┘
```

**Why `<select>` (not two-button toggle)?**

- **Scalability:** Adding a third locale requires zero redesign — just append another `<option>`.
- **Localized labels:** The dropdown shows "English" when `en` is active, "Español" when `es` is active. A two-button toggle would need to decide which language to label the buttons in (current locale? both? icon flags?).
- **Established pattern:** macOS, Windows, and most desktop apps use dropdowns for language selection.

**Alternative (for Pedro to override):** Two-button toggle (same segmented control as Appearance). This is more compact but harder to extend and requires flag icons (which introduce cultural/political complexity — e.g., is "Spanish" the flag of Spain, Mexico, or Argentina?).

### 4.4 Dropdown Options

**Option labels (localized):**

When dropdown is rendered in **English mode**:

- Option 1: "English"
- Option 2: "Español"

When dropdown is rendered in **Spanish mode**:

- Option 1: "English"
- Option 2: "Español"

**Why mixed labels?** Users need to see BOTH their current language AND the target language to switch. If we show "English / Spanish" in English mode, Spanish speakers won't recognize "Spanish" as "Español". If we show "Inglés / Español" in Spanish mode, English speakers won't recognize "Inglés" as "English". Mixed labels (each language name in its own script) solve this.

**Programmatic approach:**

```typescript
<option value="en">English</option>
<option value="es">Español</option>
```

The labels are **hardcoded** (not i18n keys) because they must be recognizable in all contexts.

### 4.5 Persistence & Hot-Swap Behavior

**Persistence location:** **⚠️ Open question for Pedro — see §6.** Where does the chosen language live?

1. **Option A: `profile.json` (new field `preferredLanguage: 'en' | 'es'`)** — Ties language to the user's profile. If the user switches datasets, their language preference roams. Pro: Consistent UX across datasets. Con: Requires schema migration + IPC contract update.

2. **Option B: Renderer `localStorage` (key `ot-language`)** — Ties language to the browser session. If the user switches datasets, language resets to system default. Pro: Simple, no backend changes. Con: Preference doesn't roam.

3. **Option C: App-level preference (new IPC contract `preferences:get` / `preferences:save`, stored in `userData/preferences.json`)** — Decouples language from profile. Pro: Clean separation of concerns (profile = identity, preferences = UI state). Con: Adds new IPC surface area.

**Recommended:** Option B (`localStorage`) for v1 Preferences, migrate to Option C (app-level preferences IPC) in a follow-up PR if Pedro wants language to roam across datasets.

**Hot-swap behavior:**

When the user selects a different language from the dropdown:

1. The dropdown `onChange` fires.
2. `i18n.changeLanguage(nextLang)` is called (same as `AppShell.tsx` line 199).
3. **All i18n strings re-render instantly** — no page reload, no modal, no spinner. This is React's default i18next behavior.
4. The chosen language is persisted (IPC call to save preference OR `localStorage.setItem('ot-language', nextLang)`).

**Default language (first launch):** System locale (read from `navigator.language`), fallback to English if the detected locale is not `en` or `es`. **⚠️ Confirm with Trinity:** Is this already wired in `i18n.ts` or does Trinity need to add a locale-detection step?

### 4.6 Microcopy & Labels

**Section title:** "Language" (`preferences.language.title`)

**Dropdown label (above the `<select>`):** "Language" (`preferences.language.label`)

**No hint text needed** — the dropdown is self-explanatory.

### 4.7 States

**Default (idle):**

- Dropdown shows the current language selection.
- No "Save" button — language changes apply **immediately**.

**Active (user selects a different option):**

- The dropdown `value` updates.
- All i18n strings re-render (hot-swap).
- Persistence IPC call fires in the background.

**Error (persistence fails — rare):**

- Same strategy as Appearance (§3.6) — silent fail. The language switches in-memory; on next app launch, it reverts to the last successfully-persisted value. No toast notification for v1.

### 4.8 Accessibility

**Keyboard navigation:**

- `<select>` is natively accessible (arrow keys to navigate options, Enter to select).
- The `<label>` has `htmlFor` pointing to the `<select>` ID.

**Screen reader notes:**

- Screen readers announce the label ("Language") and the current selection ("English" or "Español").
- No custom ARIA needed — native `<select>` semantics are sufficient.

---

## Section 5 — Updated Visual Hierarchy (Delta from Original Spec)

This section documents ONLY the changes from `mouse-settings-layout.md` (v1.0). Everything else (card container rules, button styles, etc.) remains as specified.

### 5.1 Revised Card Spacing

**Original spec:** `--space-9` (24px) between all cards.

**Updated rule:** Same, BUT Profile / Appearance / Language cards may feel cramped if they're all simple single-row controls. Consider `--space-10` (32px) between cards to give the page more breathing room.

**⚠️ Open question for Pedro:** Keep `--space-9` (tighter, more compact scan) or increase to `--space-10` (more relaxed, less overwhelming)? Prototype with both and pick the one that feels faster to scan.

### 5.2 Card Grouping (None)

**Original spec:** No explicit groups.

**Updated:** Still no explicit groups. Profile / Appearance / Language / Current Dataset / Data Folder / About flow as a single vertical stack. The only visual break is the `1px solid var(--color-divider)` horizontal rule before "Switch dataset" (inherited from original spec § 2.6).

### 5.3 Section Titles Within Cards

**Original spec:** Section titles use `--font-size-16` / `--font-weight-semibold`.

**Updated:** Same. Profile ("Your profile"), Appearance ("Appearance"), Language ("Language"), etc. all follow the same typographic treatment.

### 5.4 Input vs. Segmented Control vs. Dropdown Visual Weight

**New pattern introduced:** The Appearance section uses a **segmented control** (three inline buttons), which is visually heavier than a single input field. To balance this:

- Segmented control buttons: `--space-3` `--space-6` (6px 12px padding), `--font-size-14`.
- Dropdown (`<select>`): Height 36px (same as text inputs), `--font-size-14`, full-width OR constrained to 200px max-width (Pedro's call).
- Text inputs (Profile section): Height 36px, `--font-size-14`, full-width.

**Consistency check:** All interactive elements (inputs, buttons, dropdown) should align to a 4px vertical rhythm to prevent jaggy spacing.

### 5.5 "Switch Dataset" Footer Treatment (Unchanged)

**Original spec (§ 2.6):** Divider above, danger ghost button, centered or left-aligned.

**Updated:** No change. This treatment still applies — the footer action is isolated from the cards above.

---

## Section 6 — Open Questions for Pedro

**Priority ranking:** Questions 1–3 block Trinity; 4–6 are nice-to-have for v1.

1. **[HIGH] Profile schema discrepancy — `name` max length:** ProfileSetupModal enforces `maxLength={80}` (line 128), but `profileSchema` (profile.ts line 15) allows `max(100)`. Which is correct? If 100, update the modal. If 80, update the schema.

2. **[HIGH] Profile schema discrepancy — `ngoName` max length:** ProfileSetupModal enforces `maxLength={120}` (line 172), but `profileSchema` (profile.ts line 17) allows `max(200)`. Which is correct?

3. **[HIGH] Persistence layer for theme + language:** Where do these preferences live?
   - **Theme:** `localStorage`, `profile.json` (new field `preferredTheme`), or new `preferences.json`?
   - **Language:** `localStorage`, `profile.json` (new field `preferredLanguage`), or new `preferences.json`?
   - **Recommendation:** `localStorage` for v1 (fast to implement), migrate to `preferences.json` + IPC contract in a follow-up PR if you want roaming across datasets.

4. **[MEDIUM] Profile role field — freeform vs. dropdown:** Is freeform text ("Accountant", "Finance Director", "Treasurer", etc.) still the right UX, or should we offer a dropdown of common NGO roles + "Other (specify)" option? Freeform is flexible but creates variance in audit logs. Dropdown is predictable but may miss edge cases ("Interim CFO", "Volunteer Bookkeeper").

5. **[MEDIUM] Card spacing — `--space-9` (24px) vs. `--space-10` (32px):** The new sections (Profile, Appearance, Language) are all relatively simple single-row controls. Does `--space-9` feel cramped when you scan the full Preferences screen, or is it appropriately compact?

6. **[LOW] Theme persistence error handling:** If the IPC call to save the theme preference fails (rare), should we show a toast notification ("Theme preference not saved — changes will revert on next launch") or silently fail? Silent fail is simpler for v1.

---

## Section 7 — Implementation Notes for Trinity

**Pragmatic guidance to minimize back-and-forth:**

1. **Profile section save button:** Start with explicit "Save changes" button. If Pedro dogfoods it and requests auto-save-on-blur, we'll refactor in a follow-up.

2. **Appearance section — if dark theme breaks:** The dark palette in `tokens.css` is complete (lines 378–450), but Trinity should smoke-test all Preferences cards in dark mode. If any token produces low contrast (e.g., `--color-text-secondary` on `--color-surface-primary`), flag it for Mouse to audit. Do NOT ship a broken dark mode — better to gray out the "Dark" option with a "Coming soon" label and ship Light + System only.

3. **Language section default:** If `i18n.ts` doesn't already detect system locale (`navigator.language`), add a one-line fallback: `const detectedLang = navigator.language.startsWith('es') ? 'es' : 'en'; i18n.changeLanguage(detectedLang);`. This ensures Spanish-speaking users see Spanish UI on first launch.

4. **Segmented control component:** If no reusable `SegmentedControl.tsx` exists, build one for Appearance and reuse it for Language (if Pedro picks the two-button toggle over dropdown). Don't inline the markup in Preferences — this pattern will recur in future screens.

5. **Dropdown width:** The Language `<select>` should NOT be full-width (looks janky when "English" / "Español" are short words and the dropdown spans 600px). Constrain to `max-width: 200px` or `width: auto` (whichever feels better when you prototype).

6. **i18n key reuse:** The Appearance and Language sections introduce new keys (`preferences.appearance.*`, `preferences.language.*`). Add these to `en/common.json` and `es/common.json` in a single i18n commit before building the UI — this prevents you from forgetting to translate a label and shipping English-only strings in Spanish mode.

7. **Profile section validation:** Reuse the validation logic from ProfileSetupModal (lines 65–78) — don't rewrite it. Extract `validateProfileFields(name, role, ngoName)` into a shared util if needed.

8. **Switch dataset footer:** The original spec (mouse-settings-layout.md § 2.6) specifies a danger ghost button + confirmation modal. That spec is LOCKED — don't redesign it. Just implement it below the new sections.

9. **Final card order sanity check:** Before shipping, walk through the Preferences screen top-to-bottom with fresh eyes. Does the sequence (Profile → Appearance → Language → Dataset status → Data folder → About → Switch) feel logical, or does something jump out as misplaced? If you have a strong intuition that a different order would be better, flag it for Pedro — but default to the order specified in §1.1.

10. **Dark mode smoke test checklist:**
    - [ ] All card backgrounds visible (not pure black on black)
    - [ ] All text readable (4.5:1 contrast minimum)
    - [ ] Focus rings visible on all interactive elements
    - [ ] Segmented control active/inactive states distinguishable
    - [ ] Error card (red background) not garish in dark mode

---

## Revision History

| Version | Date       | Author | Changes                                                               |
| ------- | ---------- | ------ | --------------------------------------------------------------------- |
| 1.0     | 2026-05-02 | Mouse  | Initial extension spec — Profile, Appearance, Language sections added |
