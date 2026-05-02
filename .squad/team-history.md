# Squad Team History

## PR #105 Wave 2 (2026-04-27)

**Agents:** Mouse, Morpheus  
**Branch:** `squad/dashboard-bugs-tags-recent-chart`  
**Commits:** `a372019` (Mouse), `b56ee21` (Morpheus)

Two follow-up fixes landed after initial PR #105 review:

1. **Mouse — `a372019` — Chart Color Alignment**
   - PanelScreen monthly trend chart now uses canonical income/expense colors (`--color-income-default` green / `--color-expense-default` red)
   - Explicitly passes `barClassNames` + legend `className` props to `GroupedBarChart`
   - Aligns with existing Dashboard Saldo chart and canonical color token pattern (PR #104)
   - TS+lint clean

2. **Morpheus — `b56ee21` — Recent Transactions Sort Fix**
   - Root cause: `queryRecentTransactions` sorted by `createdAt` (entry timestamp) only, not by `date` (transaction date)
   - Fixed to sort by date DESC, createdAt DESC tiebreaker — matches Movements query pattern
   - Unblocks cross-account transaction visibility in Panel screen
   - TS+lint+714 tests clean

**Decision artifacts:** Two team patterns merged into `.squad/decisions.md`:
- Recent Transactions Sort Order pattern (Morpheus) — prioritize business date over import timestamp for user-facing "recent" queries
- Chart Colors: Canonical Income/Expense Token Extension (Mouse) — semantic financial data types get consistent color pairs across all UI elements

---

## PR #105 Wave 3 (2026-05-02)

**Agent:** Trinity  
**Branch:** `squad/dashboard-bugs-tags-recent-chart`  
**Commit:** `2ef25df` — `fix(panel): align recent transactions table with Movements headers`

Dashboard's recent-transactions table now mirrors Movements screen columns and rendering:
- **Column parity:** Type, Date, Account, Description, Category, Subcategory, Tags, Status, Amount
- **Row rendering:** Tag chips, status badges, account pills, income/expense amount colors
- **Pattern:** Duplicated JSX rather than extracting shared component (different screen types)
- TS+lint clean

**Decision merged into `.squad/decisions.md`:**
- Chart Component Reuse Pattern (Trinity) — `GroupedBarChart` shared across Panel and Saldo, with flexible color/legend props for income/expense semantic contexts

---

## PR #105 Wave 4 (2026-04-29)

**Agent:** Trinity  
**Branch:** `squad/dashboard-bugs-tags-recent-chart`  
**Commit:** `fe45e7a` — `fix(panel): align recent transactions column widths with Movements`

Dashboard's recent-transactions table column widths now match MovementsScreen exactly:
- **Applied widths:** Type 32px, Date 88px, Account 100px, Description 200px, Category 120px, Subcategory 120px, Tags 140px, Status 80px, Amount 100px
- **Source:** MovementsScreen.css canonical widths (lines 418-480)
- **Root cause:** CSS missing explicit nth-child widths; STATUS defaulted too wide, pushing Date/Account/Description off grid
- **TS+lint clean**

**Drift Pattern Identified:** This is the 2nd unplanned sync incident (Wave 3 added missing columns, Wave 4 fixed widths). Trinity documented the duplication-drift risk in `.squad/decisions.md` with recommendation to extract shared `<TransactionsTable>` component on next drift trigger, rather than continue manual syncing.

**Decision merged into `.squad/decisions.md`:**
- TransactionsTable Duplication Drift Pattern (Trinity) — when identical table logic appears 2+ screens with config-only differences, extract shared component early to prevent manual sync waste

---

## PR #105 Wave 5 (2026-05-02)

**Agent:** Trinity  
**Branch:** `squad/dashboard-bugs-tags-recent-chart`  
**Commits:** `71c0845` (refactor) + `b1cf32d` (docs)

Extracted shared `TransactionsTable` component used by both MovementsScreen and PanelScreen:
- **New component:** `app/src/renderer/components/TransactionsTable/{tsx,css,index.ts}` (~570 lines)
- **Deleted:** ~200 lines JSX from MovementsScreen + ~150 from PanelScreen, plus 147 + 152 CSS lines
- **Pattern:** Each screen maps native type (Movement/RecentTransaction) → shared `TransactionRow` at boundary; passes lookup maps (accounts/tags/categories/subcategories)
- **TS+lint clean, 654 tests pass**

Resolves the duplication-drift chain triggered in Waves 3–4. Both screens now pull column widths, headers, and cell rendering from a single source of truth.

**Decisions merged into `.squad/decisions.md`:**
- **Reuse-First Directive (Pedro, via Copilot)** — locked rule: extract shared components early for UI appearing 2+ times; configuration beats duplication
- **Shared TransactionsTable Pattern (Trinity)** — component API, screen migration pattern, generalization for future transaction-list screens

---

## PR #243–#245 (Sessions #153 + #154, 2026-05-02)

**Agents:** Cypher (2 attempts on #154)  
**Branch:** `test/trial-readiness` (merged as #243), documented in PR #244, verified in #245  
**Commits:** `8b15403` (#243), `877f5f9` (#244), `4d91035` (#245)

### Issue #153: Extract createTestDeps() Helper

**PR #243** — `test: introduce createTestDeps() helper, remove hardcoded fake ULIDs`

Cypher extracted test-fixture dependency injection pattern used across test suites:
- **Problem:** Hardcoded fake ULID strings (`01ARZ3NDEKTSV4RRFFQ69G5FAV`) duplicated in setup
- **Solution:** `createTestDeps()` factory in `tests/fixtures/testDeps.ts` generates consistent fake entities (account, category, tags)
- **Applied to:** Movement tests, Account tests, filtering tests
- **Outcome:** ✅ TS+lint clean, 714 tests pass

**Learning captured in PR #244** — Document test-dependency injection pattern for test author reuse.

---

### Issue #154: E2E ReadOnly Mode Verification (First Attempt ❌ → Second Attempt ✅)

**PR #245** — `test(e2e): readOnly mode write-block + config-allowed` (**Second Attempt**)

#### First Attempt (1095s) — FAILED
- **Root Cause:** Agent guessed IPC contract shapes without reading source files
  - Assumed wrong response fields: `result.account.id`
  - Used non-existent request fields: `currency`, `initialBalance`
  - No reference to actual `GetAccountRpc`, `AccountSnapshot` types
- **Result:** E2E spec broken; IPC calls would have failed at runtime
- **Decision:** Re-spawn with contract details provided upfront

#### Second Attempt (339s) — SUCCESS ✅
- **Prompt Discipline:** Included verified contract excerpts in agent instructions:
  - Response shape: `{ result: { account: { id, name, type, balance, currency }, status } }`
  - Request fields: `accountId` (correct, not `currency`/`initialBalance`)
  - Two-launch pattern documented: initial read + mutation attempt
- **Test Coverage:** Verified that `readOnly=true` blocks `SetAccount*` calls, `readOnly=false` allows config mutations
- **Outcome:** ✅ Green e2e tests, spec matched actual IPC contract

**Pattern Recommendation:** When spawning agents to write tests against IPC/API surfaces, always include verified contract excerpts in the prompt — do NOT let them infer schema from test names or partial imports. This prevents 1095s→339s failure-retry waste cycles.

---

## PR #104 (2026-04-XX)

[Team history begins with PR #105 Wave 2. Earlier PRs logged separately in decisions.md.]
