# SKILL: Mirror Web Reference to Desktop

**Pattern:** Porting a full-featured web application (SPA + REST API) into an event-sourced Electron desktop twin.

**When to use:**
- You have a working web reference implementation (Next.js, Angular, React + Express/FastAPI/Rails).
- You need to build a desktop version with similar features but different architecture (event-sourcing, local-first, offline-first).
- You want to minimize reinvention while adapting to the desktop runtime.

---

## Step-by-Step Process

### 1. Inventory the Reference App

**Goal:** Catalog what exists in the web app so you know what to mirror.

**Actions:**
- Browse API routes (`/api/accounts`, `/api/categories`, `/api/transactions`, etc.).
- Identify CRUD operations (GET list, POST create, PUT update, DELETE).
- Document business rules (uniqueness constraints, soft-delete protection, parent-child relationships).
- Document UX patterns (modal dialogs, inline toggles, confirmation dialogs, multi-step wizards).
- Find the domain schema (Prisma, Drizzle, Pydantic, TypeORM) — this maps to your event payloads.

**Artifacts:**
- Inventory table: for each entity (Account, Category, Tag, Transaction), list operations + rules + UX + reference file paths.
- Example: See Section A of `neo-wi15-configuracion-datos-scope.md`.

---

### 2. Map API Endpoints → Commands

**Goal:** Translate REST endpoints into event-sourced commands.

**Pattern:**
- **POST /api/accounts** → `createAccount` command → appends `AccountCreated` event.
- **PUT /api/accounts/{id}** → `updateAccount` command → appends `AccountUpdated` event.
- **DELETE /api/accounts/{id}** → `deleteAccount` command → appends `AccountDeleted` event (after validation).

**Key insight:** Each endpoint = one command. Commands encapsulate validation + event append logic.

**Validation rules port directly:**
- Web API checks IBAN uniqueness? Desktop command checks projection before appending event.
- Web API counts transactions before delete? Desktop command queries projection, rejects if count > 0.

---

### 3. Port Service Layer → Command Logic

**Goal:** Reuse business logic from web app's service layer.

**Actions:**
- Find the service files (e.g., `account_service.py`, `category_service.py`).
- Extract validation logic (IBAN format, color palette enforcement, parent-child constraints).
- Port to desktop command layer (TypeScript/JavaScript).
- **Do NOT port database queries** — desktop uses event log, not SQL/NoSQL. Replace `SELECT * FROM accounts` with `queryAccounts()` projection.

**Example (from Python to TypeScript):**

Web app (Python):
```python
def delete_account(account_id: str, user_id: str):
    count = txn_repo.count_by_account(account_id)
    if count > 0:
        raise ValueError(f"Cannot delete account: {count} transactions reference it.")
    account_repo.soft_delete(account_id, user_id)
```

Desktop (TypeScript):
```typescript
async function deleteAccount(accountId: Ulid, actorDeviceId: Ulid): Promise<Result<void, Error>> {
  const count = await queryTransactionCountByAccount(accountId);
  if (count > 0) {
    return Err(new Error(`Cannot delete account: ${count} transactions reference it.`));
  }
  await appendEvent({
    type: 'account.deleted',
    payload: { accountId, isDeleted: true },
    meta: { actorDeviceId, ... },
  });
  return Ok(undefined);
}
```

---

### 4. Port Frontend Components → React/Svelte/Vue

**Goal:** Replicate UX patterns without rewriting from scratch.

**Pattern:**
- Web uses **modal dialog** for create/edit? Desktop uses same pattern (React Modal, Dialog element, etc.).
- Web uses **inline toggle** for isActive? Desktop uses same (Checkbox component).
- Web uses **confirmation dialog** before delete? Desktop uses same (with transaction count message).

**Actions:**
- Screenshot web app's forms/dialogs/lists.
- Identify components (AccountFormDialog, CategoryList, TagFormDialog).
- Port to desktop UI framework (React, Svelte, Vue) — **structure**, not pixel-perfect copy.
- Reuse validation (same field constraints: max length, required, IBAN format).

**Key insight:** UI patterns transfer cleanly across frameworks. Angular → React is straightforward (both component-based). Focus on **behavior** (form validation, error states, success toasts), not styling.

---

### 5. Schema Conversion: Documents → Events

**Goal:** Translate web app's database schema into event payloads.

**Pattern:**
- Web stores `Account` document with fields: `id`, `bankName`, `iban`, `isActive`, `isDeleted`, `createdAt`, `updatedAt`.
- Desktop stores events:
  - `AccountCreated` (id, bankName, iban, isActive: true)
  - `AccountUpdated` (id, updates: { bankName, iban })
  - `AccountDeactivated` (id, isActive: false)
  - `AccountDeleted` (id, isDeleted: true)

**Projection rebuilds document state:**
```typescript
function projectAccounts(events: DomainEvent[]): Account[] {
  const accounts = new Map<Ulid, Account>();
  for (const event of events) {
    if (event.type === 'account.created') {
      accounts.set(event.payload.accountId, { ...event.payload });
    } else if (event.type === 'account.updated') {
      const acc = accounts.get(event.payload.accountId);
      Object.assign(acc, event.payload.updates);
    } else if (event.type === 'account.deactivated') {
      accounts.get(event.payload.accountId).isActive = false;
    } else if (event.type === 'account.deleted') {
      accounts.delete(event.payload.accountId); // or set isDeleted: true
    }
  }
  return Array.from(accounts.values());
}
```

**Key insight:** Event-sourced apps **replay history** to rebuild state. Web apps store **current state** directly. Schema conversion is the biggest architectural difference.

---

### 6. Complex Flows: Import Wizard Example

**Goal:** Port multi-step wizards without losing business logic.

**Pattern (3-step import wizard):**

**Web app:**
1. Upload file → `POST /api/imports/preview` → returns preview object (new categories, duplicates, errors).
2. User selects sheet, overrides category types → cached in frontend state (no re-upload).
3. Confirm → `POST /api/imports/workbook` with metadata → creates categories, inserts transactions.

**Desktop:**
1. Upload file → main-process parses XLSX, computes preview → returns to renderer.
2. Renderer caches preview, user selects sheet/overrides.
3. Confirm → renderer sends `importWorkbook` IPC call with metadata → main-process appends events (CategoryCreated × N, TransactionCreated × M).

**Port the parser logic:**
- Web uses `openpyxl` (Python). Desktop uses `exceljs` or `xlsx` (Node.js).
- **Same column alias lookup** (port constants from web app).
- **Same hash logic** for duplicate detection (`md5(accountId + date + amount + description)`).
- **Same category auto-creation** (keyword-based type guessing + user override).

**Key insight:** Complex flows have **3 layers**: (1) parsing/business logic, (2) API contract, (3) UI wizard. Port layer 1 directly (same algorithm), adapt layer 2 (REST → IPC), replicate layer 3 (same UX steps).

---

## Checklist for Porting a Feature

Use this for each feature (e.g., Accounts, Categories, Import):

- [ ] **Inventory:** List all CRUD operations + business rules + UX patterns from web app.
- [ ] **Commands:** Map each POST/PUT/DELETE endpoint to a desktop command.
- [ ] **Events:** Define event types + payloads (based on web schema).
- [ ] **Validation:** Port service layer validation logic to command layer.
- [ ] **Projection:** Write query function that rebuilds state from events.
- [ ] **IPC Contract:** Define Zod schemas for command inputs + response DTOs.
- [ ] **UI Components:** Port frontend components (modal dialogs, lists, forms).
- [ ] **Integration Test:** Create entity in UI → verify event appended → verify projection updated.

---

## Common Pitfalls

1. **Don't port database queries literally.**
   - ❌ `SELECT * FROM accounts WHERE isActive = true`
   - ✅ `queryAccounts().filter(a => a.isActive)`

2. **Don't skip validation.**
   - Web app checks transaction count before delete? Desktop MUST do same (query projection).

3. **Don't invent new UX.**
   - If web app uses modal for create/edit, desktop should too. Divergence = wasted UX design effort.

4. **Don't over-engineer the first pass.**
   - Web app has 5 filters on export? Start with 2 (date range + account). Add rest later.

5. **Don't ignore edge cases in web app.**
   - Web app shows "0 imported, 150 skipped" on all-duplicates import? Desktop must handle same.

---

## When NOT to Use This Pattern

- Web app uses features unavailable in desktop (e.g., server-side rendering, database triggers, cloud-only APIs).
- Web app has no clear domain logic (e.g., CRUD admin panel with no validation — just port schema).
- Desktop needs fundamentally different UX (e.g., web is wizard-heavy, desktop should be keyboard-driven).

In these cases, **reference the web app for requirements**, but design desktop from scratch.

---

## Example: Porting Import Flow (Case Study)

**Web app (Angular + Python FastAPI):**
- Import service: `/api/app/services/import_service.py` (1300 lines — column mapping, hash de-dup, category auto-creation).
- Import component: `/frontend/src/app/features/import/import.component.ts` (800 lines — 3-step wizard).
- API routes: `POST /api/imports/preview`, `POST /api/imports/workbook`.

**Desktop port (React + Electron):**
1. **Parser:** Port `import_service.py` → `app/src/main/services/import-parser.ts` (use `exceljs` instead of `openpyxl`).
2. **Command:** New `importWorkbook` command → appends CategoryCreated + TransactionCreated events.
3. **IPC:** Define `import:preview`, `import:commit` contracts.
4. **UI:** Port 3-step wizard → `app/src/renderer/pages/ImportWizard.tsx`.
5. **Test:** Import XLSX with new categories → verify events appended → verify transactions appear in Panel.

**Result:** Same UX, same business logic, different architecture (event-sourced instead of SQL insert).

---

## Summary

**Mirror, don't clone.** The web app is a **reference** (requirements + UX + validation logic), not a blueprint. Adapt its structure to the desktop's event-sourced, local-first architecture. Port validation rules and UX patterns, but rebuild the persistence layer from scratch (events, not database).

**Key insight:** API endpoints = command surface. Service layer = business logic. Frontend components = UI patterns. Database schema = event payloads. Port each layer independently, test integration end-to-end.
