# Localized User Guide Translation

**Issue:** #232 (Trial Spanish-language end-user guide)

**Status:** ✅ Proven pattern, repeatable for future locales.

---

## Overview

Translate illustrated user guides (e.g., end-user reference docs, admin guides) into additional languages (Spanish, French, etc.) while maintaining prose fidelity, UI consistency, and parallel screenshot infrastructure.

**Key insight:** Writers (Oracle) can create translated guides referencing screenshots with locale-specific suffixes *before* screenshots are generated; Playwright harness (Cypher) handles generation asynchronously via parametrized test runs.

---

## Workflow

### 1. Preparation
- [ ] Identify source guide (e.g., `docs/guides/user-guide.md`)
- [ ] Extract target locale UI strings from app i18n files:
  - Location: `app/src/renderer/locales/{locale}/common.json`
  - Example: Look up "Dashboard" → `shell.nav.panel` → "Panel" (ES)
- [ ] Confirm test harness supports locale parametrization:
  - e.g., `tests/e2e/doc-shots.spec.ts` should read `process.env.DOC_SHOTS_LOCALE`
  - Naming function: `outputName(base) => locale === 'en' ? `${base}.png` : `${base}.${locale}.png``

### 2. Create Translated Guide

1. **File naming:** `{filename}.{locale-code}.md`
   - Example: `user-guide.md` → `user-guide.es.md`

2. **Header cross-reference (one line):**
   - Top of ES file: `🇬🇧 [English version: user-guide.md](./user-guide.md)`
   - Top of EN file: `🇪🇸 [Versión en español: user-guide.es.md](./user-guide.es.md)`

3. **Structure & prose:**
   - Preserve all headings (same level, same order)
   - Preserve section count and layout
   - Keep example names (Maria, Pablo, Casa Esperanza) consistent with original
   - Use locale-appropriate tone: friendly, patient, non-technical for NGO audience
   - Translate placeholders: "CaixaBank – Operations" → "CaixaBank – Operaciones"
   - Maintain translator's note about language switch (e.g., "You can switch languages anytime in Settings")

4. **UI labels & terminology:**
   - **Do NOT invent translations.** Pull from app i18n files.
   - Create a reference table:
     ```
     EN i18n key          EN label           ES label (from i18n)
     shell.nav.panel      Dashboard          Panel
     shell.nav.movements  Transactions       Movimientos
     shell.nav.balance    Balance            Saldo
     common.save          Save               Guardar
     ```
   - Use exact matches when prose mentions UI labels: "click **Save**" → "haz clic en **Guardar**"

5. **Screenshot references:**
   - Change image paths to locale suffix: `screenshots/01-foo.png` → `screenshots/01-foo.es.png`
   - Captions & figure descriptions: translate fully (not the image itself—that's Cypher's job)
   - Keep numbering (01–07) and slug names (profile-setup) unchanged

6. **Code blocks & technical terms:**
   - **Keep unchanged:** File paths, CLI commands, code, keyboard shortcuts
   - Example: "Save the transaction by clicking **Save**" translates to "Guarda la transacción haciendo clic en **Guardar**"
     but `events.ndjson`, `app-config.json`, `npm run dev` do NOT translate

7. **Dates, currency, conventions:**
   - Apply locale defaults:
     - Spanish: DD/MM/YYYY, € currency, 1.000,50 number format (if mentioned)
     - Folder paths match OS: Windows `C:\Users\...`, Mac `/Users/...`

### 3. Ensure Test Harness is Ready

**Cypher's responsibility:** Update test file to support locale parametrization.

Expected changes in `tests/e2e/doc-shots.spec.ts`:
```typescript
const LOCALE = process.env.DOC_SHOTS_LOCALE ?? 'en';
const outputName = (base: string): string =>
  LOCALE === 'en' ? `${base}.png` : `${base}.${LOCALE}.png`;

// In each test:
await shoot(page, outputName('01-profile-setup'));  // → '01-profile-setup.es.png' if LOCALE='es'
```

### 4. Commit & Push (Oracle)

```bash
cd {worktree}
git add docs/guides/user-guide.{en,es}.md tests/e2e/doc-shots.spec.ts
git commit -m "docs(guide): add Spanish translation of end-user guide (#232)" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
git push -u origin squad/{issue-number}-{locale}-guide
```

**If Cypher has already pushed test changes:**
- `git pull --rebase origin squad/{branch}` before pushing (resolves merge)

### 5. Generate Screenshots (Cypher)

```bash
# Terminal/PowerShell
$env:DOC_SHOTS_LOCALE='es'
npm run docshots

# Or Bash
DOC_SHOTS_LOCALE=es npm run docshots
```

**Expected output:** `docs/guides/screenshots/{01..07}-*.es.png`

---

## Naming Conventions (Locked)

### Translated Guide File
- **Pattern:** `docs/guides/{filename}.{locale-code}.md`
- **Example:** `user-guide.es.md` for Spanish
- **EN guide unchanged:** Keep `user-guide.md` as is (no `.en` suffix for backward compatibility)

### Screenshots
- **EN (backward-compat):** `docs/guides/screenshots/{NN}-{slug}.png`
- **Other locales:** `docs/guides/screenshots/{NN}-{slug}.{locale-code}.png`
- **Example:** `01-profile-setup.png` (EN), `01-profile-setup.es.png` (Spanish)

---

## Translation Checklist

- [ ] Source guide identified and i18n files reviewed
- [ ] Test harness supports `DOC_SHOTS_LOCALE` env var (or Cypher will add it)
- [ ] Translated guide created with:
  - [ ] One-line cross-reference to EN version at top
  - [ ] All headings preserved (same level/order)
  - [ ] UI labels pulled from app i18n JSON
  - [ ] Screenshot paths updated to `.{locale}.png`
  - [ ] Code/CLI/file paths **NOT translated**
  - [ ] Locale-appropriate tone & conventions (dates, currency, folder paths)
- [ ] EN guide updated with one-line back-reference to new locale guide
- [ ] Commit message includes issue number & co-author trailer
- [ ] Pushed to feature branch (e.g., `squad/232-spanish-guide`)
- [ ] Awaiting Cypher's parallel screenshot generation
- [ ] History.md updated with learnings & reusable pattern

---

## Example: Spanish (es-ES) Translation

**File:** `user-guide.es.md`

**Top of file:**
```markdown
🇬🇧 [English version: user-guide.md](./user-guide.md)

# OpenTreasury Desktop — Guía de Usuario
```

**Section example:**
```markdown
## Configuración: Carpeta de datos y modo de solo lectura

![Pantalla Configuración mostrando fila de carpeta de datos y distintivo de solo lectura](./screenshots/07-settings-data-folder.es.png)  
_**Figura 7:** La pantalla Configuración muestra tu ruta de carpeta de datos actual…_

### Ubicación de carpeta de datos

La fila **Carpeta de datos** muestra dónde se almacenan tus datos de transacciones…

- **Ruta actual:** Verás algo como `C:\Users\maria\OneDrive - Casa Esperanza\Treasury`.
- **Botón de cambio:** Haz clic en **Cambiar**…

### Modo de solo lectura

El interruptor **Modo de solo lectura** controla si puedes agregar o editar transacciones.

- **Interruptor APAGADO (por defecto para el escritor):** Puedes agregar, editar y eliminar transacciones. El botón "Nuevo Movimiento" está habilitado.
```

**En app i18n (source of truth):**
```json
{
  "shell.nav.panel": "Panel",
  "shell.nav.movements": "Movimientos",
  "common.save": "Guardar"
}
```

**Translation matches i18n exactly:**
- "Nuevo Movimiento" = `shell.nav...cta.new-movement` from ES i18n
- "Guardar" = `common.save` from ES i18n

---

## Reusability Notes

This pattern works for:
- ✅ Additional languages (French, German, Portuguese, etc.)
- ✅ Admin deployment guides with screenshots
- ✅ Developer onboarding docs with visual walkthroughs
- ✅ Feature release notes with locale-specific UI labels

**Do NOT use for:**
- ❌ In-app copy (use i18n framework directly)
- ❌ Marketing material (different audience, style)
- ❌ API documentation (code-focused, less locale variation)

---

## Coordination & Handoff

| Phase | Owner | Deliverable |
|-------|-------|-------------|
| Preparation | Oracle | i18n reference, test harness audit |
| Translation | Oracle | `{guide}.{locale}.md` + EN cross-ref |
| Test setup | Cypher | Locale parametrization in test harness |
| Screenshots | Cypher | `.{locale}.png` images via env var |
| Merge | Coordinator | Both guides + screenshots on same branch/PR |

**Async safety:** Oracle creates guide with `.{locale}.png` references *before* Cypher generates images. Both commit to the same feature branch; no merge conflicts because files are disjoint.

---

## Related Skills & Decisions

- **Skill:** `playwright-electron-doc-shots` — how to generate Electron screenshots at scale
- **Decision:** `.squad/decisions.md` § "Screenshot Naming Convention for Illustrated Guides" (locked naming)
- **ADR-003:** i18n framework choice (`react-i18next`); locale JSON location: `app/src/renderer/locales/{lang}/{namespace}.json`

---

## Questions & Gotchas

**Q: Should I translate category names like "Donaciones", "Salarios" in the examples?**  
A: No. These are data entered by users, not UI labels. Keep the original Spanish category names (Casa Esperanza's chart of accounts). Only translate the *prose around them* ("rent payment" → "pago de alquiler").

**Q: What if the app i18n is incomplete for the target locale?**  
A: Escalate to Niobe (UX writer) or Neo (dev) to add missing keys. Don't invent translations—docs must match app UI exactly.

**Q: How do I handle footnotes, tips, and callout boxes?**  
A: Translate fully. These are author voice, not code.

**Q: What about section anchors (e.g., `#first-launch-profile-setup`)?**  
A: Keep in English. Markdown anchors don't support Unicode; Spanish-only anchors break cross-references. Use English heading *IDs* with Spanish *text*.

---

**Created:** 2026-06-02 (Oracle, Issue #232)  
**Last updated:** 2026-06-02
