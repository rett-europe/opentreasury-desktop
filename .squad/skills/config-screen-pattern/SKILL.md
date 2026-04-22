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

## Round 3 rule — ground from the prototype screenshot, not memory

**Always open the authoritative prototype PNG before writing code.** Pedro
drops the rendered prototype screenshot into
`.squad/decisions/inbox/prototype-<tab>.png` — that image is the
contract, not the `prototype/*.jsx` source and not any older
`decisions.md` line. Before touching the TSX: open the PNG, list every
visible delta vs the current screen (header, buttons, chips, row
primitives, active state, callouts, footer), then code. Skipping this
step cost Categorías three rounds — rounds 1 and 2 both looked "close
enough" against the source JSX while diverging loudly from the image.

Prototype PNGs override older `decisions.md` entries: a prior Q&A line
("categories are direction-agnostic") does NOT outweigh a newer handoff
screenshot that visibly shows Ingreso/Gasto pills, a colored summary
count, and a kind-based filter chip group. When the two conflict, log
the reversal to `decisions/inbox/` and match the screenshot.

## Six guaranteed requirements

1. **Navbar item per entity — and NO in-screen tab strip.** Each config
   entity is a **top-level** sidebar route under the `shell.sections.config`
   section. Per-entity lucide icons (Landmark/FolderOpen/Tag). The host
   screen (`ConfiguracionScreen`) renders one sub-tab's content via a plain
   `if (initialTab === …)` tree — no `role="tablist"`, no visible tabs.
   **Navbar routes replace internal tabs — never both** (round-2 lesson:
   shipping both looked like two competing navigation systems).
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
with `--active` state; detail renders `.ot-config__md-head` + body.

**Round-3 anatomy (pixel-close to `prototype-categorias.png`):**

- Page header: title + colored stats row (`N categorías · X ingresos · Y
  gastos`, ingresos green / gastos rose) on the left; primary "Nueva
  categoría" button on the right. Export buttons are intentionally
  dropped per constraint.
- Filter bar: `.ot-config__chip-group` (pill-shaped, tinted surface-hover
  background) with `Todas / Ingresos / Gastos` and a grow-flex
  `.ot-config__search-input`. The filter-count pill is NOT rendered for
  Categorías — the master-card header already carries the result count.
- Master row: `.ot-config__folder-tile` (neutral grey square, colored
  folder glyph inside — NOT a solid-color tile) + `.ot-config__list-row-
  text` (title + `X subcategoría(s) · Y movimiento(s)` sub) +
  `.ot-config__kind-pill--{income|expense}` + hoverable
  `.ot-config__list-row-actions` (edit + delete, both `disabled` until
  `CategoryUpdated / CategoryDeleted` events exist).
- Detail head: `{name}` + optional kind-pill in the title row; subtitle
  `X subcategoría(s) · Y movimiento(s) clasificados`. Right side is a
  button pair, not a single icon: `<Button variant="secondary" sm>
  Renombrar</Button>` + `<Button variant="primary" sm> Subcategoría
  </Button>`, both `disabled` until subcategory events land.
- Detail footer: `+ Añadir subcategoría a {name}` — disabled
  `.ot-config__list-add` ghost button.
- Both cards end with a `.ot-config__list-add` footer so the two panes
  "rhyme" visually.

**Balance rule (round-2 lesson, still applies):** master rows must carry
weight against the detail pane. Drop any of `folder-tile | title | sub |
kind-pill | actions` and the layout collapses into the sparse
"placeholder grid" Pedro rejected twice.

**Never render an entity `id` in UI copy.** The prototype renders a slug
in the tag card meta row; our `TagRecord.id` is an opaque ULID. If the
schema does not guarantee a human-readable identifier, drop the slot
entirely rather than substitute the ULID — users read
`01KPKVR0RMXVV963MEH1TSK2QZ` as visual noise.

## Additive optional fields — the pattern to reach for

When the prototype shows data our schema does not yet capture (e.g.
Categorías `kind` = income|expense), the right move is an **additive
optional field**, NOT "render the prototype visually minus that column".
Extend the Zod schemas + the flat event schema + the read-model type +
the reducer spread + the projection selector + the handler pass-through
+ the modal form — all in one commit, all with `.optional()` at the
wire level so old events replay as `undefined`. Renderer can then show
pills only when set and the legacy records degrade gracefully.

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

## IPC service wrappers — mirror the contract shape exactly

When wrapping a WI-* IPC channel in a renderer-side service layer, the wrapper
signature MUST mirror the contract response shape exactly. Do not paper over
ambiguity with `any` casts or `'field' in result` narrowing — those pass
typecheck while hiding real integration bugs (see PR #4 aftermath).

WI-21 contract shape for every mutation:

`{ ok: true, event } | { ok: false, error: { code, message, field? } }`

Wrapper rules:
- On `ok: false` throw a typed error (`ConfigMutationError` carries `code`
  + `field`). The UI catches and maps to i18n.
- On `ok: true` return either `void` (caller reloads via parent `load()`)
  or a record synthesised from the event (only when the event has all fields
  needed for immediate insertion, e.g. `SubcategoryCreated`).
- Archive state is `archivedAt?: string` — there is no boolean `archived`.
- List endpoints accepting `includeArchived` default to active-only; every
  `Mostrar archivadas` toggle MUST forward `{ includeArchived: showArchived }`
  to `listXxx` and re-run `load()` on toggle change.

Validate at the end of cross-agent work: open `app/src/preload/index.ts` and
verify the wrapper's bridge path matches the actual exposed surface. Parallel
work between Trinity and Morpheus (contract + renderer) needs this explicit
smoke-pass before PR.
