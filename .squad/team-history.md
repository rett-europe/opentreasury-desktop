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

## PR #104 (2026-04-XX)

[Team history begins with PR #105 Wave 2. Earlier PRs logged separately in decisions.md.]
