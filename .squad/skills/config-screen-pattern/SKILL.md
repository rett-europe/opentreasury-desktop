# Skill — Config-screen pattern (PR#2 renovation playbook)

Shipping / updating any of the three Configuración screens (Cuentas, Categorías, Etiquetas)
follows the same shape. Follow this skill when adding a new config-style screen or updating
an existing one to match prototype parity.

## Directory / file layout

```
app/src/renderer/screens/ConfiguracionScreen/
  ConfiguracionScreen.tsx      # tabs + initialTab/onTabChange wiring
  ConfiguracionScreen.css      # .ot-config__* namespace (no inline colors)
  CuentasTab.tsx / CategoriasTab.tsx / EtiquetasTab.tsx
  index.ts
app/src/renderer/components/ConfigModals/
  AddAccountModal.tsx / AddCategoryModal.tsx / AddTagModal.tsx
  ConfigModalShell.tsx  ConfigModal.css  errorMap.ts  index.ts
app/src/shared/ipc-contracts/{accounts,categories,tags}.ts  # Zod contract
app/src/core/events/schemas.ts  # Config{Entity}CreatedEvent flat schemas
app/src/core/query/{types,reducers}.ts  # ConfigEntity interface + reducer case
app/src/main/projections/config.ts  # select{Entities} defensive copies
app/src/main/ipc/handlers/{accounts,categories,tags}.ts  # create+list
```

## Six guaranteed requirements

1. **Navbar item per entity.** Each config entity is a **top-level** sidebar
   route under the `shell.sections.config` section. Per-entity lucide icons
   (Landmark/FolderOpen/Tag). Keep `ConfiguracionScreen` as a tabbed host that
   accepts `initialTab` + `onTabChange`.
2. **Table-layout:fixed with colgroup** for any tabular view. Every td that
   might overflow gets `ot-config__cell-truncate` + `title={…}`. Flex parent
   gets `min-width: 0`. Wrap in `.ot-config__table-wrapper` for the rounded
   card shell.
3. **Reuse Button `leadingIcon`**, never raw SVG children, so spacing/focus
   ring tokens stay consistent.
4. **Localize every string** — i18n keys under `configuracion.*` / `shell.*`.
   Dates + currencies via `Intl.*Format` with `es-ES`/`en-US` locale from
   `i18n.language`.
5. **Additive Zod + event schema.** Every new field is `.optional()`. Old
   NDJSON events must still replay cleanly. Reducer reads `event.X !== undefined ? { X } : {}`
   spread pattern to keep the read-model shape immutable.
6. **Row-action disable > stubbed functionality.** If Edit/Delete wire events
   don't exist yet, render the row action button as `disabled` with an
   explanatory `title` — do NOT wire a no-op handler. Users must not think
   they clicked something that failed silently.

## Row-of-rich-cells prototype pattern

Prototype rows combine four visual primitives — all available in
`ConfiguracionScreen.css`:

| Class                                  | Purpose                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `ot-config__entity-icon[--sm]`         | Square color-tinted icon tile (Landmark/FolderOpen/Tag). Uses `background: color`. |
| `ot-config__account-pill`              | Color-tinted text pill. Tint = `color-mix(in srgb, <color> 18%, transparent)`.    |
| `ot-config__swatch-sm` / `swatch-lg`   | Round color swatches (10px / 24px) with subtle ring.                               |
| `ot-config__tag-pill`                  | Tag chip with `color-mix(… 30%, transparent)` background.                          |
| `ot-config__code-mono`                 | Monospace IBAN / slug identifier (never wraps).                                   |

## IBAN masking + reveal

```ts
function maskIban(iban: string | undefined): string {
  if (!iban) return '';
  const compact = iban.replace(/\s+/g, '');
  if (compact.length <= 4) return compact;
  const prefix = compact.slice(0, 2);
  const last4  = compact.slice(-4);
  const stars  = '•'.repeat(compact.length - prefix.length - last4.length);
  return `${prefix}${stars}${last4}`.replace(/(.{4})(?=.)/g, '$1 ');
}
```

Per-row reveal state is a `Set<string>` keyed by entity id. In the modal use
`type={revealIban ? 'text' : 'password'}` + a button-style affix.

## Master-detail layout (Categorías)

Two `.ot-config__md-card` blocks in a responsive `grid-template-columns:
1fr 1fr` (collapses to single column at 960px). Master is `.ot-config__list-rows`
with `--active` state; detail renders `.ot-config__md-head` + body. When a
feature is gated behind unshipped events, render
`.ot-config__callout` with an Info icon and honest copy.

## Modal tier — shared contract

Every create/edit modal passes through `ConfigModalShell` and:

- Resets all state when `isOpen` flips to true.
- Validates locally first (`NAME_EMPTY`, `NAME_TOO_LONG`, etc.).
- Maps server errors via `mapConfigErrorToFieldKey` + i18n
  `configuracion.errors.<fieldKey>`.
- Renders a `Vista previa` block at the bottom for non-trivial forms — the
  block re-uses the exact same visual primitives as the table row
  (`ot-config__entity-icon`, pill, swatch), so users see the literal final
  appearance.

## Playwright diff harness

See `scripts/config-diff-playwright.mjs` for the blueprint:

1. `http.createServer` hosting `prototype/` on a free port (Babel-standalone
   needs the JSX files served with a text MIME type).
2. `chromium.launch()` + `newContext({ viewport: { width: 1440, height: 900 }})`.
3. For the **current** Electron app, call `page.addInitScript` with an
   `OpenTreasuryApi` stub before navigating to the Vite dev server URL.
4. Navigate by simulating sidebar clicks via `page.evaluate` — the prototype
   uses `.nav-item`, the current app uses `.ot-shell__nav-item`.
5. Save PNGs to `.squad/decisions/inbox/playwright-config-diff/` (Scribe keeps
   non-`.md` files). Write the textual diff to
   `.squad/decisions/inbox/config-diff-report.md`.

## Gates before commit

`npm run typecheck` · `npm run lint` · `npm run format:check` · `npm run test` · `npm run build`
— all must be green. The test suite includes handler tests for the optional
fields (they're parsed but not required); keep them passing as the schema
grows.
