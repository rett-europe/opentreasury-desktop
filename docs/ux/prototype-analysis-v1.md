# Prototype-as-UX-Contract — Analysis v1

> **Status:** Draft v1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-19
> **Scope:** Read `/prototype/` as a UX reference and answer: what does it tell us v1 will look like, where does it fit, where does it fall short, what's missing.
> **Companions:** [`vision.md`](../product/vision.md) §14 Q7 (prototype-as-contract), [`adr-001-tech-stack.md`](../architecture/adr-001-tech-stack.md) (Accepted), [`adr-002-repo-structure.md`](../architecture/adr-002-repo-structure.md) (Proposed), [`crypto-spec.md`](../security/crypto-spec.md) §4–§5 (first-setup, enrollment), [`security-requirements-v0.1.md`](../security/security-requirements-v0.1.md) v0.2 (R20 first-run wizard, AR9 SmartScreen).
> **Out of scope:** visual design (Mouse), product prioritization (Link), crypto mechanics (Switch), technical implementation (Neo / Morpheus / Trinity).

---

## 0. TL;DR

The prototype gives us a high-fidelity **shape for three core screens** — Panel, Movimientos, Saldo — plus a placeholder shell for six secondary screens (Categorías, Etiquetas, Cuentas, Importación, Exportar, and an implicit Configuración). It **does not** cover any of the things that differentiate desktop-on-a-shared-folder from the cloud product: no first-run, no device pairing, no error/offline/sync states, no empty database, no audit log viewer, no admin-approval UX. Treat the prototype as a **UX contract for the three core screens** and as **visual language** for everything else — but the entire "app shell + integration + failure surface" layer is unbuilt in the prototype and must be specified from scratch.

**Top 5 blocker-level gaps:**
1. First-run / folder-selection flow (blocks install-to-first-transaction completely)
2. Device enrollment UX (blocks multi-device, which is the whole point)
3. Error states for crypto failures (decryption error, chain break, bad escrow signature)
4. Empty database state (new NGO has no accounts, no categories, no transactions — prototype assumes rich seed data)
5. Movements screen empty-by-default contract (Pedro's rule is NOT enforced in the prototype — it auto-loads everything)

---

## 1. Inventory — Every Screen and Significant Interaction

"Significant interaction" = something the user initiates that changes app state or navigation. Decorative hover/focus transitions are not listed.

### 1.1 Screens implemented

| Screen file | Screen name | User task | State shown in prototype | Notes |
|---|---|---|---|---|
| `shell.jsx` — Topbar | Global top bar | Toggle sidebar; global search; settings; tweaks; brand/org identity | Populated ("Demo NGO") | Global search auto-navigates to Movimientos (`app.jsx` line ~88). No notification area. No sync-status indicator. |
| `shell.jsx` — Sidebar | Primary navigation | Switch between 8 destinations (Panel, Movimientos, Saldo, Categorías, Etiquetas, Cuentas, Importación, Exportar) | Populated | Bottom "user strip" shows "Pedro Rocha · Admin" with a logout button — **this is a misleading artifact** (see §4, gap G1). |
| `panel.jsx` — PanelScreen | Dashboard overview | Glance at per-account balances, month KPIs, 12-month trend, recent tx, jump to full list | Populated, month = April 2026 | No empty state. No error state. No "last synced" marker. "Abril 2026" period button is inert. |
| `movimientos.jsx` — MovimientosScreen | Transaction list | Filter, select, bulk-categorize / bulk-tag, create new, export | Populated with 30 seeded tx | **Auto-loads all transactions on mount** (violates Pedro's "starts empty" rule — see gap G5). Bulk-action buttons wired to UI only, no modal/confirm. No sort controls. No pagination / virtualization. |
| `saldo.jsx` — SaldoScreen | Year-over-year comparison by category | Compare 2025 vs 2026 income/expense by category, net monthly | Populated | Time-granularity segmented control (Mes / Trimestre / Año) is inert — only "Año" is visually active. Export button inert. |
| `app.jsx` — TweaksPanel | Theme / density / accent / sidebar state | Adjust visual preferences (theme, density, accent, sidebar collapsed) | Overlay panel | This is a **prototype developer affordance**, not a product feature — it drives edit-mode messaging to a host iframe. Product "Settings" is a placeholder icon in the topbar (inert). |
| `saldo.jsx` — PlaceholderScreen | Placeholder for unbuilt routes | Explains scope ("centers on Panel/Movimientos/Saldo; others out of scope here") | Placeholder message | Renders for `categorias`, `etiquetas`, `cuentas`, `importacion`, `exportar`. |

### 1.2 Significant interactions (across implemented screens)

| Interaction | Screen | User task | State behavior in prototype |
|---|---|---|---|
| Click nav item | Sidebar | Navigate between screens | Persists `ot_route` in `localStorage` (prototype only); no URL state |
| Global search input | Topbar | Find transactions by description/subcategory | Typing auto-routes to Movimientos and filters on description+sub |
| Type filter chips (Todos / Ingresos / Gastos) | Movimientos | Narrow by type | Live filter; no loading state |
| Account / category / month dropdowns | Movimientos | Filter by facet | Live filter |
| Min / max amount inputs | Movimientos | Filter by range | Live filter |
| "Solo sin categorizar" toggle | Movimientos | Show uncategorized work | Live filter |
| "Limpiar filtros" | Movimientos | Reset all filters | Appears only when filters are set |
| Row select (checkbox) | Movimientos | Enter multi-select mode | Shows "N seleccionados" with inert `Categorizar` / `Etiquetar` buttons |
| "Select all" header checkbox | Movimientos | Bulk select | Works on filtered set |
| "Exportar" button (Movimientos, Saldo) | Movimientos / Saldo | Export data | Inert |
| "Nuevo Movimiento" button | Panel / Movimientos | Create a transaction | Inert — no form surface exists in the prototype |
| Period button "Abril 2026" | Panel | Change period | Inert |
| Time-granularity segmented (Mes/Trimestre/Año) | Saldo | Change granularity | Inert |
| "Ver todos los movimientos →" | Panel (recent list footer) | Jump to full list | Routes to Movimientos |
| User strip logout | Sidebar | Log out | Inert — **not applicable in desktop model** |
| Settings icon | Topbar | Configure app | Inert |
| Tweaks icon | Topbar | Adjust theme/density/accent | Opens `TweaksPanel` |

**Interactions that exist in the sidebar but have no implementation:** Categorías CRUD, Etiquetas CRUD, Cuentas CRUD, Importación (CSV wizard), Exportar (export center). These are acknowledged scope deferrals in the prototype's own PlaceholderScreen.

---

## 2. Canonical Screens for v1

Pedro's direction: **Movements, Saldo, Panel are the three core screens.** Confirmed.

### 2.1 Tier 1 — Canonical (prototype IS the v1 UX baseline; refine, don't reinvent)

| Screen | Status | UX contract the prototype sets |
|---|---|---|
| **Panel (Dashboard)** | ✅ Canonical | Multi-account balance cards with sparklines; three-KPI month strip (Ingresos / Gastos / Neto); 12-month bars (income vs expense); "recent tx" table capped at 8 with "see all" hand-off to Movements; primary CTA "Nuevo Movimiento". |
| **Movimientos (Transactions)** | ✅ Canonical (with one correction) | Filter bar with type chips + account/category/month dropdowns + min/max + uncategorized toggle + clear-all; summary strip (Ingresos/Gastos/Neto for the filtered set); row-level checkboxes → bulk actions; explicit status badge (pending/approved); sortable tx table. **Correction required:** empty-by-default — starts blank until a date range or preset is chosen (see gap G5). |
| **Saldo (Balance / YoY)** | ✅ Canonical | Top 3-KPI strip (Ingresos totales / Gastos totales / Saldo neto, with projection note); monthly net comparison chart (2025 vs 2026); side-by-side income/expense category tables with YoY delta and projection. |

**Challenge / clarification:** the prototype treats Panel's "Últimos movimientos" embedded table as a direct mirror of Movimientos rows. **That is almost right, but not quite:** Panel should show the 8 most-recent entries **regardless of date-range selection**, whereas Movements is gated on date range. These are different contracts for the same underlying data — document them distinctly.

### 2.2 Tier 2 — Shell patterns (canonical at the shell level, content TBD per screen)

These are not "screens" but set the app shell's contract:

- **Topbar** — org identity slot ("Demo NGO" → becomes the NGO name derived from the folder name or a first-run input), global search, settings, tweaks. Needs an **added slot for sync/status indicator** (see gap G3).
- **Sidebar** — three-section grouping (Principal / Configuración / Datos); icon + label; collapsible. **The user strip at the bottom must change** — no auth in the desktop model (see §4 and gap G1).
- **Placeholder state** pattern — diamond glyph + "not included" copy — reusable for any deferred feature in v1.

### 2.3 Tier 3 — Secondary screens (prototype gives us only placeholders; full specs required)

Categorías, Etiquetas, Cuentas, Importación, Exportar — all in-scope for v1 per vision §5. The prototype's placeholder message calls them "fuera del alcance aquí" which is a prototype-scope statement, not a product-scope statement. Link's PRDs will drive which are v1 (likely all five).

---

## 3. Prototype Strengths — What to Preserve

Concrete, specific behaviors the prototype gets right that we should carry forward as-is.

1. **Three-screen mental model as the primary loop** (Panel → Movements → Saldo). Matches how a treasurer actually works: glance at balances, work the tx list, look at the year. The sidebar reinforces this by placing these three under "Principal" and everything else under "Configuración" / "Datos".

2. **Fast data entry is a first-class CTA.** `Nuevo Movimiento` appears on both Panel and Movimientos in the primary button slot. Mirrors the cloud version's "Save & New" pattern goal. (The tx entry form itself does not exist in the prototype — specifying it is a Tier-1 UX task.)

3. **Movement filters are chips + dropdowns, not modals.** Type filter uses a chip group; account / category / month / amount use inline controls directly above the table. Friction is low and the state is visible at all times.

4. **Summary strip updates against the filtered set, not the full dataset.** The Ingresos/Gastos/Neto row above the table reflects what the user currently sees. Makes the filter bar feel causally connected to the data.

5. **Explicit transaction status** (`pending` vs `approved`) as a badge column and a filterable attribute. Cloud parity; critical for multi-person workflows where one person enters and another approves.

6. **Account identity is color-coded and reused consistently** — a per-account color (oklch) appears on Panel cards, tx table pills, and tag chips. Makes multi-account cognition cheap without requiring the user to read account names.

7. **Empty result state inside Movements is already handled** (`"No se encontraron movimientos con los filtros actuales."`) — but only for the filtered-set-is-empty case, NOT for the "nothing loaded yet" case (see gap G5).

8. **Categorized vs uncategorized is always visible at the row level** with a `Sin categorizar` badge + dedicated filter. Makes the "clean up the ledger" workflow discoverable.

9. **YoY comparison uses the delta / projected-for-year convention**, not raw numbers. Correctly answers the treasurer's real question ("are we ahead of last year?") vs. the wrong question ("what are the raw Q1 totals?").

10. **Uses ES locale money + date formatting consistently** via a single `fmt` helper. Sets the pattern for the i18n layer.

---

## 4. Prototype Gaps — What's Missing for v1

Numbered. Each gap carries severity and owner-for-fix. **Blocker** = v1 cannot ship without it. **Important** = v1 is meaningfully worse without it. **Nice-to-have** = improves v1 but can slip to v1.x.

**Traceability legend:** PRD-* to be filed by Link; R## → security requirements v0.2; C## → ADR-001 conditions; CS §# → crypto-spec section.

### G1 — No first-run / folder-selection flow
- **What's missing:** The prototype opens straight into a fully-populated Panel with seeded data. A real install lands the user on a blank app that must (a) ask them to pick or create a OneDrive folder, (b) detect whether `.treasury/escrow.json` exists, (c) branch into first-setup OR enrollment OR "resume normal operation", (d) generate device keys, (e) surface the R20 security-posture checklist (MFA, disk encryption, no public links, folder-ACL ≠ treasury-access).
- **Severity:** 🔴 **Blocker.** Install-to-first-transaction is impossible without this.
- **Owner:** Niobe (UX spec `flows/flow-001-first-run-setup.md`); Mouse (visual); Morpheus/Trinity (implementation); Switch (R20 copy review).
- **Traceability:** Vision §8 time-to-first-tx ≤10min; R20; CS §4; AR9 (SmartScreen copy).

### G2 — No device enrollment / pairing UX
- **What's missing:** When Juan installs the app and points at Maria's existing folder, the prototype has no concept of a "pending enrollment" state on Juan's side or an "approve request" state on Maria's side. The crypto spec (§5) specifies the technical flow — but there is no screen, no notification, no 6-char visual code display, no approve/reject modal.
- **Severity:** 🔴 **Blocker.** Multi-device is the entire desktop collaboration story. Without this, only the first installer can use the app.
- **Owner:** Niobe (UX spec `flows/flow-002-device-enrollment.md`); Mouse (visual); Switch (describes enrollment-code correctness semantics); Morpheus/Trinity (implementation).
- **Traceability:** Vision §2 "shares with 1–3 collaborators"; CS §5; R4; R20.

### G3 — No sync / offline / "last synced" status surface
- **What's missing:** Nowhere in the topbar or anywhere else does the app communicate "OneDrive is up-to-date", "sync lag — last foreign event 12 minutes ago", or "you are offline — changes will sync when you reconnect". For a file-based collaborative app, this is the treasurer's primary situational-awareness signal.
- **Severity:** 🔴 **Blocker.** Without this, two treasurers cannot trust that they're seeing each other's work.
- **Owner:** Niobe (spec); Mouse (visual — sync indicator + state variants); Neo/Morpheus (what signals to surface — OneDrive attribute bits vs. most-recent-foreign-event timestamp).
- **Traceability:** Vision Risk "OneDrive sync latency"; Principle 5 "offline-capable by default".

### G4 — No error states for crypto / integrity failures
- **What's missing:** The prototype has no UI for: (a) decryption failure (bad DEK / corrupted envelope / AAD mismatch), (b) audit-log chain break on load, (c) escrow.json signature failure, (d) update-signature verification failure, (e) "your device has been revoked — read-only fallback to cached data". Each of these has a specified technical failure mode (CS §2.1, §3, §8.2; R13.1), but no user-facing treatment.
- **Severity:** 🔴 **Blocker.** When these happen — and they will — the app cannot fall back to "generic error". Users need actionable, honest, non-cryptic messaging (e.g., "This treasury's audit log looks incomplete. We can restore from the most recent snapshot (2026-04-18, 14 minutes of data at risk). Proceed?").
- **Owner:** Niobe (error catalog + copy + flow branches); Switch (verifies technical accuracy); Mouse (visual treatment for error severities).
- **Traceability:** R5, R8, R13.1; CS §2.1, §3, §8; Principle "errors are actionable, never cryptic".

### G5 — Movements auto-loads everything (violates Pedro's "starts empty" rule)
- **What's missing:** Per team decision 2026-04-19, Movements starts EMPTY until the user selects a date range or preset. The prototype renders all 30 seeded transactions immediately on mount. There is no date-range picker; there is no "select a range to view transactions" empty prompt; the month dropdown only filters, it does not gate loading.
- **Severity:** 🔴 **Blocker.** This is a hard product rule and the prototype contradicts it.
- **Owner:** Niobe (spec `flows/flow-003-movements-date-range.md`); Mouse (date-range picker + presets visual); Morpheus (query layer — range is a required input, not an optional filter).
- **Traceability:** decisions.md 2026-04-19 "Transaction list starts empty"; vision §5.

### G6 — Empty database state (brand-new NGO, nothing seeded)
- **What's missing:** The prototype assumes pre-existing accounts, categories, tags, and transactions. A first-run NGO has none of these. Panel cannot render (no accounts → no balance cards; no transactions → no KPIs, no chart, no recent list). Saldo cannot render. Movements is empty by definition. Each screen needs a **first-use empty state** that teaches the user what to do next (create an account → import a CSV or record a first transaction → categorize it).
- **Severity:** 🟠 **Important** (blocker for adoption metrics; Panel literally renders broken charts without seed data).
- **Owner:** Niobe (empty-state copy per screen); Mouse (visual); Link (onboarding PRD scopes where "teach the user" lives).
- **Traceability:** Vision §8 setup success ≥90%; decisions.md project scope.

### G7 — No multi-user awareness
- **What's missing:** No indicator of "who else is on this dataset right now", no "Juan is also editing" hint, no conflict resolution UX if two devices queued edits before sync. Event-sourcing (ADR-001) eliminates most real conflicts, but the user still needs to *understand* that their co-treasurer touched data recently ("3 new transactions from Juan since you last looked").
- **Severity:** 🟡 **Nice-to-have** for v1; 🟠 **Important** for v1.x. v1 can ship with a "new activity since last view" badge on Movements and defer live presence.
- **Owner:** Niobe (design the minimum signal); Neo (what signals the event log makes available cheaply).
- **Traceability:** Vision §5 multi-user; Risk "OneDrive sync latency".

### G8 — No audit log viewer UX
- **What's missing:** The crypto spec (§8) and security requirements (R8) specify a tamper-evident audit log, visible to all authenticated members (Pedro 2026-04-19 resolution). The prototype has no viewer. The cloud version has no meaningful equivalent, so we cannot port a design — we must specify from scratch: timeline, filter by actor/action/target, export to decrypted JSON bundle.
- **Severity:** 🟠 **Important.** NGO auditors and presidents will ask for this. Governance transparency is in-scope.
- **Owner:** Niobe (spec); Mouse (visual — timeline component); Switch (export payload shape, signature verification UX).
- **Traceability:** R8; CS §8.3.

### G9 — No admin actions surface (enrollment approval, revocation, admin transfer, DEK rotation)
- **What's missing:** The crypto spec says Maria, as admin, must approve Juan's enrollment, revoke devices, transfer admin, and initiate DEK rotation. None of these have UI. The prototype's user strip implies admin status ("Pedro Rocha · Admin") but nothing is actionable.
- **Severity:** 🔴 **Blocker** for enrollment; 🟠 **Important** for revocation / transfer / rotation (the NGO will need these the first time anyone changes laptops).
- **Owner:** Niobe (UX); Mouse (visual — admin-only affordances treatment); Switch (copy for security-sensitive confirmations); Morpheus/Trinity (implementation).
- **Traceability:** CS §3.3, §5, §6, §7; R4; R20.

### G10 — Accessibility (keyboard nav, screen reader, focus management, contrast)
- **What's missing:** Prototype has no visible focus states beyond browser defaults; tab order through the filter bar is not specified; bulk-select checkboxes have no ARIA labels; the segmented controls are not keyboard operable as radio groups; modal/overlay focus trapping is unspecified (and will matter for date range, new-tx form, enrollment approval). Color-coded accounts must work under protanopia/deuteranopia (visual gap — Mouse).
- **Severity:** 🟠 **Important.** Volunteer treasurers include older users; screen-reader support is a floor, not a ceiling.
- **Owner:** Niobe (behavioral spec — focus order, ARIA roles, keyboard shortcuts); Mouse (focus ring + contrast tokens).
- **Traceability:** Principle "Treasurer-first, not developer-first".

### G11 — Localization (language coverage, dates, currency, number format)
- **What's missing:** Prototype is hard-coded Spanish (ES). Vision Q6 is still open (ES + EN, or ES-only with i18n scaffold). The string helpers (`fmt.eur`, `fmt.date`) are ES-locked. Language-switch affordance does not exist.
- **Severity:** 🟠 **Important.** Vision §5 says ES + EN in v1; decision is Pedro's (open).
- **Owner:** Niobe (spec — where the language switcher lives, how per-screen strings are extracted); Link (confirms scope).
- **Traceability:** Vision Q6; feature map row "i18n (ES + EN)".

### G12 — No "Settings / Configuración" destination
- **What's missing:** The topbar shows a settings icon (inert). In desktop v1, Settings is the home for: language, folder re-linking, "wipe local data" (R6), "Device name", "Show enrollment code for this device", "Advanced: rotate DEK" (admin-only), update channel, diagnostic log access. None of this is spec'd.
- **Severity:** 🟠 **Important.** Several individual items (folder re-link, wipe local data, device name) are hard requirements; they need a home.
- **Owner:** Niobe (spec — Settings information architecture); Mouse (visual — settings vs preferences hierarchy); Switch (confirms copy for security-sensitive settings).
- **Traceability:** R6 wipe local data; CS §5 enrollment code display; CS §3.1 device_name.

---

## 5. Divergence from Cloud OpenTreasury

UX patterns where Desktop v1 intentionally departs from the cloud product. "Rationale" is the reason desktop cannot / should not mirror cloud.

| UX pattern | Cloud (`rett-europe/opentreasury`) | Desktop v1 | Rationale |
|---|---|---|---|
| **Authentication / sign-in** | Entra ID / MSAL login screen, OAuth redirect, session expiry | **No login screen.** OneDrive already identifies the user; app reads the folder as the current OS user. User strip shows OS-level identity label only, no logout. | Vision Principle 2 "Permissions = folder permissions"; R7; cloud has `core/auth/`, we have no equivalent. |
| **Authorization / role management** | Admin vs Viewer RBAC with admin UI to assign roles | **No app-level RBAC.** Folder ACL (OneDrive) is the authorization boundary. "Admin" is a crypto-layer privilege (escrow-edit) not a role UI. | R7; vision §6 "RBAC — folder ACLs replace it". |
| **Tenant / organization** | Multi-tenant; org switcher; separate URL per tenant | **Folder = tenant.** Opening a different folder = different NGO. App can optionally remember recent folders. | Vision §6; product is desktop. |
| **Offline UX** | Online-only; errors when API unreachable | **Offline is first-class.** App fully usable with no network. OneDrive sync is a background transport, not a blocking dependency. | Principle 5. |
| **Notifications** | Browser toast / snackbar; email for async ops | **OS-level notifications** for "enrollment request received", "device revoked", "update available and installed". In-app banners for transient states. | Desktop platform; Electron `Notification` API. |
| **Sync indicator** | N/A (server is source of truth) | **First-class "last synced" indicator** in topbar. Surfaces offline / sync-lag / up-to-date states. | G3; OneDrive as transport, not source of truth. |
| **Conflict UX** | N/A (server serialization) | **Invisible when possible** (event-sourcing → no real conflicts); fall-back banner only for pathological cases. | ADR-001 §3 Option A; Risk "OneDrive conflicts". |
| **Data location indicator** | Implicit ("it's in the cloud") | **Explicit.** "Your treasury lives in: `OneDrive\NGOData\Treasury`" visible in Settings; "Change folder" exposed. | Vision Principle 3 "your data, your file". |
| **Audit log access** | Role-gated (admin-only in cloud, probably) | **All authenticated members** (Pedro resolution 2026-04-19). | CS §8.3. |
| **Device concept** | Session (browser / token) | **Persistent device identity** with its own keypair and enrollment lifecycle. | CS §2, §5, §6. |
| **Install / update** | Web app, always-latest | **Desktop installer + signed auto-update.** "Update available" and "Restart to apply" states. Install shows SmartScreen warning (AR9). | R13.1, AR9, AR10. |
| **Wipe-local-data** | N/A (clear browser cache) | **Explicit "wipe local data" in Settings** — zeroes keychain + cache. | R6. |
| **Language switching** | Likely in-app menu | **Same, plus** OS-language detection on first run. | Vision Q6. |
| **Export** | Server-rendered PDF/Excel | **Locally generated** (no server); progress indicator matters because large exports can take seconds. | Vision §5. |
| **Search** | Server-side full-text (indexed Cosmos query) | **Local in-app search** on decrypted data. OneDrive web-UI search of donor data is dead (AR3) — educate user. | AR3; Topbar search. |
| **Unknown-device / new-browser warning** | Standard OAuth new-device flow | **Enrollment flow** (completely different shape — visual code + admin approval). | CS §5; G2. |

---

## 6. UX Principles — Guiding Every UX Spec

These are the tie-breakers Niobe applies when specifying new surfaces. When in doubt, apply in order.

1. **Treasurer-first, not developer-first.** The user is a volunteer who can share a OneDrive folder but may not know what "JSON" is. No jargon unless we explicitly teach it. No error codes without plain-language explanation. No "Contact your administrator" — the treasurer IS the administrator.

2. **Nothing loads until you ask.** Generalization of Pedro's Movements rule. Large lists, long reports, and heavy operations wait for explicit user intent (date range, preset, button press). No surprise multi-second spinners on page open. Applies to: Movements (gated by range), Export (gated by period), Import (gated by file select), Audit log (gated by filter).

3. **Errors are actionable, never cryptic.** Every error the user sees names the problem in one sentence, offers a path forward in one button, and links to diagnostic detail only if they ask. "Could not decrypt file `01JK…`" is wrong. "One transaction from April 18 couldn't be read. It may have been damaged during sync. [Retry] [Restore from snapshot] [Show details]" is right.

4. **Sync is transparent, never invisible.** The user always knows whether they're current. A persistent, non-alarming indicator in the topbar. Never hide lag.

5. **Security decisions are user-visible and irreversible-by-default.** Enrollment approval, device revocation, DEK rotation, admin transfer — each requires an explicit confirm with a "this cannot be undone" note where true. No silent state changes. No auto-approve.

6. **Empty states teach.** First-run and first-of-its-kind screens explain the next useful action, not just "no data". Teach by affordance, not by a separate tutorial overlay.

7. **The prototype is a contract for the three core screens; a sketch everywhere else.** When writing specs, preserve prototype's Panel / Movements / Saldo interaction shapes. Everywhere else we are free to design, staying within the visual language Mouse establishes.

8. **Offline is a first-class state, not a failure.** Offline is not an error. Write offline copy as neutral information ("You're offline — changes will sync when you reconnect"). Never block workflows that can proceed offline (data entry, viewing, filtering, export-of-local-data).

---

## 7. Key UX Risks

Risks that could hurt adoption if not addressed. Each has a proposed mitigation that downstream UX specs must satisfy.

### UX-R1 — Enrollment flow is confusing and users bypass it
- **Risk:** Juan installs the app, picks the shared folder, sees "pending enrollment" screen, doesn't understand the 6-char code or that Maria must be online, and abandons. Maria never sees the request because her app isn't running.
- **Mitigation:** Enrollment UX must (a) explain the two-device handshake in one sentence; (b) show the code prominently with both a copy button and a "read it aloud" affordance; (c) make Maria's approval prompt unmissable (OS notification + in-app banner); (d) tell Juan exactly what to do if Maria is unavailable ("Ask her to open OpenTreasury. Until then, we'll wait here — your code stays valid.").
- **Downstream spec:** `flows/flow-002-device-enrollment.md`.

### UX-R2 — Treasurer loses data because they didn't understand folder-permissions vs. treasury-membership are decoupled
- **Risk:** Maria adds the new president to the OneDrive folder. President opens the app, sees only ciphertext / no-access, gets confused, calls support. Or worse: Maria removes someone from the folder believing it revokes treasury access, but the person still has the DEK cached.
- **Mitigation:** R20 first-run wizard teaches this explicitly. In Settings, a "Members" view shows folder-access AND treasury-enrollment status side by side so drift is visible. When the app notices drift (folder member without escrow entry, or vice versa), it banners it proactively.
- **Downstream spec:** Settings / Members spec (TBD — likely PRD-003-onboarding-admin companion).

### UX-R3 — SmartScreen install warning (AR9) kills first-run before the app opens
- **Risk:** Non-technical treasurer sees "Windows protected your PC — Unknown publisher", clicks "Don't run", never tries again. Adoption metric (time-to-first-tx ≤10min) is dead on arrival.
- **Mitigation:** Install guide (docs/guides) must show the exact expected dialog with screenshot and one-click walkthrough. A web-hosted page (GitHub Pages / README link) should be linked from the installer so the user sees guidance BEFORE clicking download. Optionally: the installer's right-click → Properties → "Unblock" checkbox also bypasses SmartScreen.
- **Downstream spec:** Install guide (docs/guides/install-windows.md — Niobe owns the walkthrough copy; DevRel owns the guide structure later); first-run wizard must not duplicate this pain.

### UX-R4 — Date-range gate on Movements feels slow instead of snappy
- **Risk:** User opens Movements, sees empty screen with "Select a range to view transactions", doesn't notice the range picker, or picks a 5-year range and waits 20 seconds. Perceived as broken.
- **Mitigation:** Default-open the range picker as soon as the screen mounts (no extra click). Provide quick presets (This month, Last month, This quarter, YTD, Last 12 months) FIRST — custom range is advanced. Cap the "YTD" and larger presets with a visible row-count estimate before loading.
- **Downstream spec:** `flows/flow-003-movements-date-range.md`.

### UX-R5 — Audit log is too raw / too chatty and nobody reads it
- **Risk:** Audit log records every tx.created, tx.updated, tx.deleted, login (there isn't one but import, export, rotation…) and the feed becomes noise. Or it records too little and misses the insider-threat detection point.
- **Mitigation:** Group related entries ("Maria imported 47 transactions from CSV" as one entry, not 47). Filter-default to "security-relevant only" (enrollments, revocations, rotations, admin transfers, exports) with a "Show all activity" toggle. Export flow provides the full JSON bundle for external auditors.
- **Downstream spec:** Audit log viewer spec (Tier-2 priority).

---

## 8. Hand-off and Open Questions

### Hand-offs

- **To Link (PM):** Gaps G1 (first-run), G2 (enrollment), G6 (empty DB), G8 (audit log viewer) each warrant a PRD line item. G5 (Movements date-range gate) is already a product decision — PRD should formalize the rule and its presets.
- **To Mouse (Designer):** The prototype's visual language (accents, density, icons, color-coded accounts, badge treatments) is Tier-1 material to extract into tokens. Additions needed: sync-status indicator visual, error-severity treatment, admin-only-affordance treatment, focus states, date-range picker.
- **To Neo / Morpheus / Trinity:** Sync signal surface (G3) needs a technical spec — what are the cheapest signals we can surface from OneDrive client metadata? Event-log-based "new activity since last view" (G7) is a cheap query against the event log.
- **To Switch:** Error copy for crypto failures (G4) needs a pass for technical correctness and for the right level of user disclosure (telling the truth without leaking information useful to an attacker).

### Open questions

1. Vision Q6 (ES + EN vs. ES-only scaffold) — blocks G11 scope.
2. Where does the "sync / last synced" indicator live — topbar only, or topbar + sidebar footer?
3. Does Panel's "recent transactions" respect the user's chosen Movements date range, or always show absolute-latest-8 regardless? (Recommendation: always-latest-8; Movements is gated, Panel is glanceable.)
4. Does the app remember the last-opened folder per OS user (reopen to that folder on next launch), or always prompt? (Recommendation: remember, with "Change folder" in Settings.)
5. Do we want a universal "New Transaction" keyboard shortcut (e.g., `Ctrl/Cmd+N`) available from any screen? (Recommendation: yes — accessibility + power-user affordance.)
6. Enrollment approval: should Maria see one prompt per pending device, or a queue? (Likely one-per-device for v1 simplicity.)
7. Is "Admin transfer" exposed as a first-class action in v1, or hidden until requested? (Recommendation: hidden behind Settings → Advanced in v1; file UX-R-style risk if we hide it too deep.)

---

*End of analysis v1. Next artifact:* [`ux-spec-plan.md`](./ux-spec-plan.md).
