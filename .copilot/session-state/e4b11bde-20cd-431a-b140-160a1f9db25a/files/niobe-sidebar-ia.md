# Sidebar Information Architecture Specification — OpenTreasury Desktop

**Version:** 1.0  
**Date:** 2026-05-02  
**Analyst:** Niobe (Spec / UX Analyst)  
**Context:** Sidebar IA overhaul — fixing the "Settings" misnaming issue and establishing a coherent entry point for app preferences

---

## Section 1 — Audit of Current Sidebar

### 1.1 Current Structure (as of 2026-05-02)

**Source files:**

- `app/src/renderer/screens/AppShell/AppShell.tsx` lines 126–148
- `app/src/renderer/locales/en/common.json` lines 19–72
- `app/src/renderer/locales/es/common.json` lines 19–72

**Current sidebar navigation (NAV_SECTIONS array):**

```
┌─ MAIN (shell.sections.main) ─────────────────────────┐
│  • Dashboard         (panel)        LayoutDashboard  │
│  • Transactions      (movements)    ArrowLeftRight   │
│  • Balance           (balance)      Scale            │
│  • Insights          (insights)     ChartLine        │
└──────────────────────────────────────────────────────┘

┌─ SETTINGS (shell.sections.config) ───────────────────┐
│  • Categories        (categorias)   FolderOpen       │
│  • Tags              (etiquetas)    Tag              │
│  • Accounts          (cuentas)      Landmark         │
└──────────────────────────────────────────────────────┘

┌─ DATA (shell.sections.datos) ────────────────────────┐
│  • Import            (datos)        Upload           │
└──────────────────────────────────────────────────────┘

┌─ USER AREA (bottom of sidebar) ──────────────────────┐
│  [Avatar/Initials] Username + Role                   │
│  [Sign out icon] (LogOut) — shell.user.logout        │
└──────────────────────────────────────────────────────┘

┌─ TOP-RIGHT HEADER (separate from sidebar) ───────────┐
│  [Settings gear icon] → navigates to /settings route │
│  AppShell.tsx line 534                               │
└──────────────────────────────────────────────────────┘
```

### 1.2 i18n Keys

**English (en/common.json):**

- `shell.sections.main`: "Main"
- `shell.sections.config`: **"Settings"** ← MISNAMING HERE
- `shell.sections.datos`: "Data"
- `shell.nav.categorias`: "Categories"
- `shell.nav.etiquetas`: "Tags"
- `shell.nav.cuentas`: "Accounts"
- `shell.user.logout`: "Sign out"
- `shell.settings.label`: "Settings" (gear icon tooltip)

**Spanish (es/common.json):**

- `shell.sections.main`: "Principal"
- `shell.sections.config`: **"Configuración"** ← MISNAMING HERE
- `shell.sections.datos`: "Datos"
- `shell.nav.categorias`: "Categorías"
- `shell.nav.etiquetas`: "Etiquetas"
- `shell.nav.cuentas`: "Cuentas"
- `shell.user.logout`: "Cerrar sesión"
- `shell.settings.label`: "Configuración" (gear icon tooltip)

### 1.3 Problems Identified

**PROBLEM 1 — The "SETTINGS" group is misnamed:**

The `shell.sections.config` label ("Settings" / "Configuración") currently groups:

- Categories
- Tags
- Accounts

These are **NOT settings**. They are **reference data / taxonomy** that users maintain as part of their treasury operations. This is working data, not app configuration.

**Real settings** (theme, language, profile, dataset config, data folder, switch dataset, app version) currently live in a separate `/settings` route accessed via the top-right gear icon (AppShell.tsx line 534).

This creates semantic confusion: the word "Settings" appears in two contexts with unrelated meanings:

1. Sidebar group label → actually means "reference data"
2. Gear icon + /settings route → actually means "app preferences"

**PROBLEM 2 — No sidebar entry for app preferences:**

The `/settings` route is accessible only via the top-right gear icon. There's no sidebar navigation item for it. This is inconsistent with the sidebar-as-primary-navigation pattern used for all other screens.

**PROBLEM 3 — Dead "Sign out" icon:**

The LogOut icon in the user area (AppShell.tsx line 593) currently serves as a "sign out" action. However, per Pedro's directive, this will be **removed in PR-B** regardless. Mouse's settings spec (`.copilot/session-state/.../mouse-settings-layout.md`) includes a "Switch to a different dataset…" action in the Settings screen footer, which is the proper dataset-switching mechanism (not the sidebar icon).

The "Sign out" icon is a placeholder from pre-dataset-switching days and should be retired.

**PROBLEM 4 — Scalability concern:**

Pedro explicitly stated: _"I don't want the navbar to grow that much... we still have more features to come later! But one option called Settings seems like an interesting one."_

Future features hinted at: more reports, multi-user roles, possibly budgets. The current 3-section sidebar (MAIN / SETTINGS / DATA) with 8 total entries is already growing. Adding app preferences as a 9th entry requires careful placement.

---

## Section 2 — Proposed Sidebar Structure (RECOMMENDED)

### 2.1 Recommended Structure (Option A — Rename + Bottom-Anchor)

**Core principle:** Rename the "SETTINGS" group to reflect its true purpose (reference data / taxonomy), and add a **bottom-anchored** "Preferences" entry for app configuration. The bottom placement follows industry conventions (VS Code, Figma, Slack) where app settings sit at the bottom of the sidebar, separate from working content.

```
┌─ MAIN ───────────────────────────────────────────────┐
│  • Dashboard         (panel)        LayoutDashboard  │
│  • Transactions      (movements)    ArrowLeftRight   │
│  • Balance           (balance)      Scale            │
│  • Insights          (insights)     ChartLine        │
└──────────────────────────────────────────────────────┘

┌─ CATALOGS ───────────────────────────────────────────┐
│  • Categories        (categorias)   FolderOpen       │
│  • Tags              (etiquetas)    Tag              │
│  • Accounts          (cuentas)      Landmark         │
└──────────────────────────────────────────────────────┘

┌─ DATA ───────────────────────────────────────────────┐
│  • Import            (datos)        Upload           │
└──────────────────────────────────────────────────────┘

┌─ USER AREA (bottom of sidebar) ──────────────────────┐
│  [Avatar/Initials] Username + Role                   │
└──────────────────────────────────────────────────────┘

┌─ PREFERENCES (bottom-anchored, below user area) ─────┐
│  • Preferences       (preferences)  Settings         │
└──────────────────────────────────────────────────────┘
```

**Key changes:**

1. **Rename** `shell.sections.config` from "Settings" → **"Catalogs"** (EN) / "Catálogos" (ES)
2. **Add** new bottom-anchored entry: "Preferences" (EN) / "Preferencias" (ES)
3. **Remove** the dead "Sign out" icon from user area
4. **Remove** the top-right gear icon (Settings route is now in sidebar)

**Route mapping:**

- `/preferences` (new route name, replaces `/settings`)
- Existing routes (`/categorias`, `/etiquetas`, `/cuentas`, `/datos`) unchanged

### 2.2 Why "Catalogs"?

**Rationale for the "CATALOGS" label:**

1. **Semantically accurate:** Categories, Tags, and Accounts are taxonomies — structured vocabularies that users define once and reference repeatedly. "Catalog" is a well-understood metaphor in non-technical domains (library catalogs, product catalogs).

2. **NGO-friendly:** Trustees and treasurers understand "catalog" as "the list of things we can choose from." It's plain English, not jargon.

3. **Distinct from "Settings":** Unlike "Settings" (which implies app behavior configuration), "Catalogs" signals "editable reference lists" — which is exactly what Categories/Tags/Accounts are.

4. **Internationalization:** Spanish "Catálogos" is equally clear and common in accounting contexts.

**Rejected alternatives:**

- ❌ **"Reference Data"** — too technical, sounds like a developer term
- ❌ **"Master Data"** — corporate jargon, unfamiliar to NGO users
- ❌ **"Setup"** — ambiguous (could mean initial setup wizard vs. ongoing maintenance)
- ❌ **"Book"** — accounting-specific metaphor, less intuitive for non-accountants
- ❌ **"Configuration"** — too broad (encompasses both catalogs AND app preferences)

### 2.3 Why "Preferences" (not "Settings")?

**Rationale for the "PREFERENCES" label:**

1. **Semantic distinction:** "Preferences" connotes _user choices_ (theme, language, profile), while "Settings" has already been polluted by the existing sidebar group label. Using "Preferences" cleanly separates the two concepts.

2. **Industry precedent:** macOS System Preferences, Firefox Preferences, many apps use "Preferences" for user-configurable options. This aligns with desktop app conventions.

3. **Clarity:** An NGO user opening "Preferences" expects to find "how I want the app to behave for me" — which matches the content (theme, language, dataset, profile).

**Rejected alternatives:**

- ❌ **"Settings"** — already used (incorrectly) for the taxonomy group in the current sidebar
- ❌ **"App Settings"** — verbose; sidebar space is limited
- ❌ **"Configuration"** — too technical, overlaps with Spanish "Configuración" (currently misused)
- ❌ **"Options"** — generic, doesn't convey "personal customization"

**Spanish equivalent:** **"Preferencias"**  
(Note: Current Spanish uses "Configuración" for the taxonomy group — we'd change that to "Catálogos" and repurpose "Preferencias" for app preferences.)

---

## Section 3 — Naming Proposal (Ranked Options)

### 3.1 Taxonomy Group Name (Categories / Tags / Accounts)

**Ranked candidates:**

1. **"Catalogs" / "Catálogos"** ⭐ RECOMMENDED
   - **Rationale:** Semantically accurate, NGO-friendly, clear metaphor. "Catalog" = "structured list of things I can choose from."
   - **User mental model:** "This is where I manage the lists (categories, tags, accounts) that I use when entering transactions."
   - **Acceptance test:** ✅ PASS. Non-technical NGO trustee would recognize "Catalogs" as "the place to manage my reference lists."

2. **"Reference" / "Referencia"** (short for "Reference Data")
   - **Rationale:** Accurate but slightly technical. "Reference" might be unclear without "Data" suffix, and "Reference Data" is too verbose for a sidebar label.
   - **User mental model:** "This is... reference? Reference to what?"
   - **Acceptance test:** ⚠️ MARGINAL. Some users might not immediately grasp "Reference" without more context.

3. **"Setup" / "Configuración Inicial"**
   - **Rationale:** Implies one-time setup, but Categories/Tags/Accounts are maintained continuously, not just during onboarding.
   - **User mental model:** "Setup is for the beginning, but I edit categories all the time."
   - **Acceptance test:** ❌ FAIL. "Setup" misleads users into thinking this is only for initial configuration.

### 3.2 App Preferences Entry Name

**Ranked candidates:**

1. **"Preferences" / "Preferencias"** ⭐ RECOMMENDED
   - **Rationale:** Industry-standard term for user-configurable app options. Semantically distinct from "Settings" (which is polluted). Matches desktop conventions (macOS, Firefox, VS Code).
   - **User mental model:** "This is where I set how the app looks and behaves for me (theme, language, profile)."
   - **Acceptance test:** ✅ PASS. NGO trustee opening "Preferences" expects theme, language, profile settings.

2. **"App Settings" / "Configuración de la App"**
   - **Rationale:** Explicit about scope (app-level, not data-level), but verbose for sidebar label.
   - **User mental model:** Clear but wordy.
   - **Acceptance test:** ✅ PASS, but less concise.

3. **"Options" / "Opciones"**
   - **Rationale:** Generic. Doesn't convey "personal customization" as clearly as "Preferences."
   - **User mental model:** "Options for... what? Transactions? The app?"
   - **Acceptance test:** ⚠️ MARGINAL. Too vague.

### 3.3 Spanish Equivalents (if `es/common.json` exists)

**Current Spanish i18n:**

- `shell.sections.config`: "Configuración" (currently misused for Categories/Tags/Accounts)

**Proposed changes:**

- `shell.sections.catalogs`: **"Catálogos"** (for Categories/Tags/Accounts)
- `shell.nav.preferences`: **"Preferencias"** (for app preferences entry)

**Alternative Spanish terms evaluated:**

- ❌ **"Configuración"** — retire this label from the taxonomy group (it caused the misnaming problem)
- ❌ **"Datos Maestros"** — corporate jargon, unfamiliar to NGO users
- ❌ **"Ajustes"** — less common than "Preferencias" in desktop apps

---

## Section 4 — Entry Point for App Preferences

### 4.1 Recommendation: Bottom-Anchored Sidebar Entry

**Placement:** A **dedicated sidebar navigation item** at the **bottom of the sidebar**, below the user area, visually separated from working content (Dashboard, Transactions, etc.).

**Rationale (2-3 sentences):**

App preferences (theme, language, profile, dataset config) are **infrequently accessed** — users set them during onboarding and rarely return except for occasional theme/language tweaks or dataset switches. Placing "Preferences" at the **bottom of the sidebar** follows desktop app conventions (VS Code, Figma, Slack) where settings are spatially separated from daily-use navigation. This also **frees up the top-right header** from the gear icon clutter and consolidates all navigation in one place (the sidebar).

**Frequency of access:**

- **First-run:** Profile setup, dataset folder selection (one-time)
- **Occasional:** Language/theme change (~once per quarter, if ever)
- **Rare:** Dataset switch (when a user needs to work with a different treasury)

**Why NOT a top-right profile menu:**

- The current top-right area (AppShell.tsx line 534) uses a gear icon, which is fine but inconsistent with the "sidebar is primary navigation" pattern. Moving Preferences to the sidebar unifies all app navigation in one place.
- Profile menus (top-right avatar dropdown) are common in multi-user web apps, but OpenTreasury Desktop is a **single-user Electron app**. The user area (avatar + name) is already in the sidebar. A top-right dropdown would duplicate that affordance.

**Why NOT keep the gear icon:**

- Redundant. If "Preferences" is in the sidebar, the gear icon becomes dead weight.
- Removes visual clutter from the header, which currently has [search] [gear icon] — simplifying to [search] only is cleaner.

**Why NOT a separate group:**

- Preferences is a **single entry**, not a group of 3–4 items. Bottom-anchoring a single entry is more space-efficient than creating a new group section.

### 4.2 Visual Treatment

**Sidebar rendering (bottom-anchored entry):**

- Render **below the user area** (avatar + name)
- Add a horizontal divider (1px solid `var(--color-divider)`, `--space-6` margin-top) to visually separate Preferences from the user area
- Use the **Settings** icon (same as current gear icon) with size 18
- Highlight on hover (same as other nav items)

**HTML structure (conceptual):**

```tsx
<nav className="ot-shell__sidebar">
  {/* Nav sections (MAIN, CATALOGS, DATA) */}

  {/* User area */}
  <div className="ot-shell__user">...</div>

  {/* Divider */}
  <div className="ot-shell__divider" />

  {/* Bottom-anchored Preferences */}
  <button
    className="ot-shell__nav-item"
    onClick={() => onNavigate('preferences')}
    aria-current={currentRoute === 'preferences' ? 'page' : undefined}
  >
    <Settings size={18} aria-hidden="true" />
    <span>{t('shell.nav.preferences')}</span>
  </button>
</nav>
```

---

## Section 5 — Migration Plan

### 5.1 Screens / Routes to Rename

| Current Route | New Route      | Reason                                    |
| ------------- | -------------- | ----------------------------------------- |
| `/settings`   | `/preferences` | Semantic clarity (preferences ≠ catalogs) |

**Are route URLs user-visible?**

- **No.** OpenTreasury Desktop is an Electron app with internal routing (likely React Router or similar). Users don't see `/settings` in a browser address bar — they click sidebar items. Renaming the route is safe.

**Breaking changes for users mid-trial:**

- **Minimal.** Pedro is currently the only user (dogfooding phase). No external users will be affected.
- **Bookmarks:** N/A (Electron app, no URL bookmarks)
- **Deep links:** If the app supports deep linking (e.g., `opentreasury://settings`), those would break. Verify if deep links exist — if so, alias `/settings` → `/preferences` for backward compatibility.

### 5.2 What Needs to Be Updated

**1. i18n keys (English + Spanish):**

| File                                      | Key                           | Current Value   | New Value          |
| ----------------------------------------- | ----------------------------- | --------------- | ------------------ |
| `app/src/renderer/locales/en/common.json` | `shell.sections.config`       | "Settings"      | **"Catalogs"**     |
| `app/src/renderer/locales/en/common.json` | `shell.nav.preferences` (NEW) | —               | **"Preferences"**  |
| `app/src/renderer/locales/es/common.json` | `shell.sections.config`       | "Configuración" | **"Catálogos"**    |
| `app/src/renderer/locales/es/common.json` | `shell.nav.preferences` (NEW) | —               | **"Preferencias"** |

**Retire:** `shell.settings.label` (gear icon tooltip) — the gear icon will be removed.

**2. Route paths:**

| File (likely location — verify)               | Current                    | New                           |
| --------------------------------------------- | -------------------------- | ----------------------------- |
| Router config (e.g., `App.tsx`, `Router.tsx`) | `<Route path="/settings">` | `<Route path="/preferences">` |

**3. Sidebar navigation config:**

| File                                             | Line Range | Change                                                                         |
| ------------------------------------------------ | ---------- | ------------------------------------------------------------------------------ |
| `app/src/renderer/screens/AppShell/AppShell.tsx` | 126–148    | Rename `labelKey: 'shell.sections.config'` in NAV_SECTIONS array               |
| `app/src/renderer/screens/AppShell/AppShell.tsx` | 126–148    | Add new bottom-anchored entry (not in NAV_SECTIONS, render separately)         |
| `app/src/renderer/screens/AppShell/AppShell.tsx` | 534        | Remove top-right gear icon (`<button onClick={() => onNavigate('settings')}>`) |
| `app/src/renderer/screens/AppShell/AppShell.tsx` | 589–594    | Remove "Sign out" button in user area (LogOut icon)                            |

**4. Breadcrumbs / Page Titles:**

| File (likely location — verify) | Current Title | New Title         |
| ------------------------------- | ------------- | ----------------- |
| Settings screen component       | "Settings"    | **"Preferences"** |

Check: Does the Settings screen pull its title from i18n (`settings.title`) or hardcoded? Update accordingly.

**5. TypeScript types:**

| File                                             | Line  | Change                                                              |
| ------------------------------------------------ | ----- | ------------------------------------------------------------------- |
| `app/src/renderer/screens/AppShell/AppShell.tsx` | 45–55 | Add `'preferences'` to the `Route` union type (remove `'settings'`) |

**6. Component file rename (if applicable):**

If the Settings screen is in a folder like `app/src/renderer/screens/SettingsScreen/`, consider renaming to `PreferencesScreen/` for consistency. However, this is **low priority** — the route name and i18n keys matter more than internal folder names.

### 5.3 Testing Checklist

After Trinity implements:

- [ ] Sidebar displays three groups: MAIN / CATALOGS / DATA
- [ ] "Catalogs" group label is correct in EN + ES
- [ ] Bottom-anchored "Preferences" entry appears below user area
- [ ] "Preferences" entry uses Settings icon (size 18)
- [ ] Clicking "Preferences" navigates to `/preferences` route
- [ ] Preferences screen displays (Dataset / Data folder / Switch dataset / Theme / Language / Profile / About — per Mouse spec)
- [ ] Top-right gear icon is removed from header
- [ ] "Sign out" LogOut icon is removed from user area
- [ ] All i18n strings render correctly in EN + ES
- [ ] No console errors or TypeScript type mismatches

---

## Section 6 — Open Questions

**Decisions needed from Pedro before Trinity can implement:**

1. **Route alias for backward compatibility:** If deep links exist (e.g., `opentreasury://settings`), should we alias `/settings` → `/preferences` to avoid breaking external links? Or is this a non-issue because no deep links exist yet?

2. **"Catalogs" label approval:** Does Pedro approve "Catalogs" / "Catálogos" as the new group name? If he prefers a different term (e.g., "Reference", "Lists"), confirm before implementation.

3. **Preferences screen title:** Should the Preferences screen's page title (h1) be "Preferences" or "App Settings" or something else? (Mouse's spec says "Settings" — should that be updated to "Preferences" for consistency?)

4. **User area visual treatment post-LogOut-removal:** With the "Sign out" icon removed, the user area will just show [Avatar + Name + Role]. Should we add any visual treatment (border, background) to distinguish it from the Preferences entry below? Or keep it minimal?

---

## Appendix A — Alternative Structures (Not Recommended)

### Option B — Drop the Taxonomy Group, Surface Entries Directly

**Structure:**

```
┌─ MAIN ───────────────────────────────────────────────┐
│  • Dashboard         (panel)        LayoutDashboard  │
│  • Transactions      (movements)    ArrowLeftRight   │
│  • Balance           (balance)      Scale            │
│  • Insights          (insights)     ChartLine        │
└──────────────────────────────────────────────────────┘

┌─ DATA ───────────────────────────────────────────────┐
│  • Categories        (categorias)   FolderOpen       │
│  • Tags              (etiquetas)    Tag              │
│  • Accounts          (cuentas)      Landmark         │
│  • Import            (datos)        Upload           │
└──────────────────────────────────────────────────────┘

┌─ PREFERENCES (bottom-anchored) ──────────────────────┐
│  • Preferences       (preferences)  Settings         │
└──────────────────────────────────────────────────────┘
```

**Tradeoffs:**

- ✅ **Pro:** Eliminates the misnaming problem entirely (no "Settings" group).
- ✅ **Pro:** Merges DATA and taxonomy into one group, reducing sidebar clutter.
- ❌ **Con:** Conflates "reference data I maintain" (Categories/Tags/Accounts) with "data I import" (Import). These are conceptually different — one is taxonomy management, the other is data ingestion.
- ❌ **Con:** Makes the DATA group too large (4 items vs. 1). Loses visual grouping clarity.

**Verdict:** Reject. The taxonomy (Categories/Tags/Accounts) deserves its own group because it's semantically distinct from Import.

### Option C — Top-Right Profile Menu for Preferences

**Structure:**

- Sidebar: Same as Option A (MAIN / CATALOGS / DATA), but NO bottom-anchored Preferences entry.
- Top-right header: Replace gear icon with a **profile avatar dropdown** that contains:
  - Profile editing
  - Theme switcher
  - Language switcher
  - Dataset management
  - About / Version

**Tradeoffs:**

- ✅ **Pro:** Mimics web app patterns (GitHub, Gmail, Slack).
- ❌ **Con:** Duplicates the user area (avatar appears twice: sidebar + top-right).
- ❌ **Con:** Breaks the "sidebar is primary navigation" convention used elsewhere.
- ❌ **Con:** Requires building a dropdown component (extra dev work) when a simple sidebar entry suffices.

**Verdict:** Reject. Sidebar entry is simpler, more consistent, and avoids duplication.

---

## Revision History

| Version | Date       | Author | Changes                          |
| ------- | ---------- | ------ | -------------------------------- |
| 1.0     | 2026-05-02 | Niobe  | Initial sidebar IA spec for PR-B |
