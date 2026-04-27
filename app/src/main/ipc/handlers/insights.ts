// Insights IPC handlers — landing summary and tag analytics.
// Thin aggregation layer over the read model. Per UX-005 final spec §6.2.

import type {
  InsightsLandingSummaryRequest,
  InsightsLandingSummaryResponse,
  TagSummary,
  LandingKPIs,
  InsightsLabelSummaryRequest,
  InsightsLabelSummaryResponse,
  InsightsLabelByCategoryRequest,
  InsightsLabelByCategoryResponse,
  CategorySlice,
  InsightsLabelBySubcategoryRequest,
  InsightsLabelBySubcategoryResponse,
  SubcategoryRow,
  InsightsLabelMonthlyEvolutionRequest,
  InsightsLabelMonthlyEvolutionResponse,
  MonthBucket,
  InsightsLabelByAccountRequest,
  InsightsLabelByAccountResponse,
  AccountBucket,
} from '../../../shared/ipc-contracts/insights.js';
import { getReadModel } from '../../../core/query/reducers.js';
import type { ReadModel, Transaction, ConfigTag } from '../../../core/query/types.js';

// ============================================================================
// Date helpers (UTC, inclusive)
// ============================================================================

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getCurrentYearWindow(): { start: string; end: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const today = formatUtcDate(now);
  const yearEnd = `${year}-12-31`;
  return {
    start: `${year}-01-01`,
    end: today < yearEnd ? today : yearEnd,
  };
}

function isInWindow(txDate: string, start: string, end: string): boolean {
  return txDate >= start && txDate <= end;
}

// ============================================================================
// Aggregation helpers
// ============================================================================

/**
 * Returns the amounts to use for aggregation.
 * If the transaction has active splits, returns split amounts (converted from cents).
 * Otherwise, returns the parent's single amount with its category.
 */
function effectiveAmounts(
  tx: Transaction,
  model: ReadModel,
): readonly { amount: number; categoryId: string | null; subcategoryId: string | null }[] {
  if (model.splitParentIds.has(tx.id)) {
    const splits = model.splits.get(tx.id) ?? [];
    return splits.map((s) => ({
      amount: s.amountCents / 100, // cents → EUR
      categoryId: s.categoryId,
      subcategoryId: s.subcategoryId,
    }));
  }
  return [{ amount: tx.amount, categoryId: tx.categoryId, subcategoryId: tx.subcategoryId }];
}

function resolveCategoryName(categoryId: string | null, model: ReadModel): string | null {
  if (categoryId === null) return null;
  const c = model.configCategories.find((x) => x.id === categoryId);
  return c?.name ?? null;
}

/**
 * Aggregates transactions for a single tag.
 * Returns cents-based metrics + top categories + sparkline data.
 */
function aggregateTagMetrics(
  tag: ConfigTag,
  transactions: readonly Transaction[],
  model: ReadModel,
  windowStart: string,
  windowEnd: string,
): TagSummary | null {
  // Filter transactions with this tag in the window
  const tagTxs = transactions.filter(
    (tx) => tx.tagIds.includes(tag.id) && isInWindow(tx.date, windowStart, windowEnd),
  );

  if (tagTxs.length === 0) {
    return null; // No activity for this tag
  }

  // Aggregate income/expense in cents
  let ingresosCents = 0;
  let gastosCents = 0;
  const categoryVolumes = new Map<string, { name: string; volume: number }>();

  for (const tx of tagTxs) {
    const amounts = effectiveAmounts(tx, model);
    for (const { amount, categoryId } of amounts) {
      const cents = Math.round(amount * 100);
      if (tx.type === 'income') {
        ingresosCents += cents;
      } else {
        gastosCents += cents;
      }

      // Track category volumes for "top categorías"
      if (categoryId) {
        const existing = categoryVolumes.get(categoryId);
        if (existing) {
          existing.volume += cents;
        } else {
          const name = resolveCategoryName(categoryId, model) ?? '';
          categoryVolumes.set(categoryId, { name, volume: cents });
        }
      }
    }
  }

  const netoCents = ingresosCents - gastosCents;

  // Top 2 categories by volume (income + expense magnitude)
  const topCategorias = Array.from(categoryVolumes.entries())
    .sort(([, a], [, b]) => b.volume - a.volume)
    .slice(0, 2)
    .map(([categoryId, { name }]) => ({ categoryId, name }));

  // Sparkline: net per month (only if ≥3 months with data)
  let sparklineNetCents: number[] | undefined;
  const monthlyNets = new Map<string, number>(); // YYYY-MM -> net in cents

  for (const tx of tagTxs) {
    const monthKey = tx.date.substring(0, 7); // YYYY-MM
    const amounts = effectiveAmounts(tx, model);
    for (const { amount } of amounts) {
      const cents = Math.round(amount * 100);
      const existing = monthlyNets.get(monthKey) ?? 0;
      monthlyNets.set(monthKey, existing + (tx.type === 'income' ? cents : -cents));
    }
  }

  if (monthlyNets.size >= 3) {
    const sortedMonths = Array.from(monthlyNets.keys()).sort();
    sparklineNetCents = sortedMonths.map((m) => monthlyNets.get(m)!);
  }

  return {
    tagId: tag.id,
    name: tag.name,
    color: tag.color,
    archived: !!tag.archivedAt,
    ingresosCents,
    gastosCents,
    netoCents,
    movimientosCount: tagTxs.length,
    topCategorias,
    sparklineNetCents,
  };
}

/**
 * Main handler for insights:landing-summary.
 * Returns global KPIs + top-N tags + "Otras" bucket.
 *
 * Multi-label overlap: A transaction with multiple tags counts toward EACH tag's totals.
 * This is acknowledged per spec — the footer note on the UI side explains this.
 */
export async function handleInsightsLandingSummary(
  request: InsightsLandingSummaryRequest,
): Promise<InsightsLandingSummaryResponse> {
  const model = getReadModel();

  // Resolve date window (default: current year)
  const { start: windowStart, end: windowEnd } = request?.dateWindow
    ? { start: request.dateWindow.startISO, end: request.dateWindow.endISO }
    : getCurrentYearWindow();

  // Optional account filter
  const accountId = request?.accountId;

  // Filter transactions: non-archived accounts, optional accountId filter
  const activeAccountIds = new Set(
    model.configAccounts.filter((a) => !a.archivedAt).map((a) => a.id),
  );

  const relevantTxs = model.transactions.filter((tx) => {
    if (!activeAccountIds.has(tx.accountId)) return false;
    if (accountId && tx.accountId !== accountId) return false;
    return isInWindow(tx.date, windowStart, windowEnd);
  });

  // Aggregate per-tag metrics
  const tagMetrics: TagSummary[] = [];
  for (const tag of model.configTags) {
    if (tag.archivedAt) continue; // Skip archived tags from landing
    const metrics = aggregateTagMetrics(tag, relevantTxs, model, windowStart, windowEnd);
    if (metrics) {
      tagMetrics.push(metrics);
    }
  }

  // Sort by magnitude (|net|) descending
  tagMetrics.sort((a, b) => Math.abs(b.netoCents) - Math.abs(a.netoCents));

  // Top-N split (default N=8)
  const TOP_N = 8;
  const topTags = tagMetrics.slice(0, TOP_N);
  const tailTags = tagMetrics.slice(TOP_N);

  // "Otras" bucket: aggregate tail
  let otrasBucket: TagSummary | null = null;
  if (tailTags.length > 0) {
    const otrasIngresos = tailTags.reduce((sum, t) => sum + t.ingresosCents, 0);
    const otrasGastos = tailTags.reduce((sum, t) => sum + t.gastosCents, 0);
    const otrasNeto = otrasIngresos - otrasGastos;
    const otrasMovimientos = tailTags.reduce((sum, t) => sum + t.movimientosCount, 0);

    // Top 2 categories across ALL tail tags
    const categoryVolumes = new Map<string, { name: string; volume: number }>();
    for (const tag of tailTags) {
      for (const cat of tag.topCategorias) {
        const existing = categoryVolumes.get(cat.categoryId);
        const volume = tag.ingresosCents + tag.gastosCents; // Approximate volume per tag
        if (existing) {
          existing.volume += volume;
        } else {
          categoryVolumes.set(cat.categoryId, { name: cat.name, volume });
        }
      }
    }
    const otrasTopCategorias = Array.from(categoryVolumes.entries())
      .sort(([, a], [, b]) => b.volume - a.volume)
      .slice(0, 2)
      .map(([categoryId, { name }]) => ({ categoryId, name }));

    otrasBucket = {
      tagId: '__otras__',
      name: 'Otras',
      archived: false,
      ingresosCents: otrasIngresos,
      gastosCents: otrasGastos,
      netoCents: otrasNeto,
      movimientosCount: otrasMovimientos,
      topCategorias: otrasTopCategorias,
      // No sparkline for Otras bucket
    };
  }

  // Global KPIs
  const etiquetasTotalesCount = model.configTags.filter((t) => !t.archivedAt).length;
  const etiquetasActivasCount = tagMetrics.length;

  // Global ingreso/gasto: sum across all TAGGED transactions (multi-label overlap applies)
  let ingresosEtiquetadosCents = 0;
  let gastosEtiquetadosCents = 0;

  for (const tx of relevantTxs) {
    if (tx.tagIds.length === 0) continue; // Skip untagged
    const amounts = effectiveAmounts(tx, model);
    for (const { amount } of amounts) {
      const cents = Math.round(amount * 100);
      if (tx.type === 'income') {
        ingresosEtiquetadosCents += cents;
      } else {
        gastosEtiquetadosCents += cents;
      }
    }
  }

  const kpis: LandingKPIs = {
    etiquetasActivasCount,
    etiquetasTotalesCount,
    ingresosEtiquetadosCents,
    gastosEtiquetadosCents,
  };

  return {
    kpis,
    tags: topTags,
    otrasBucket,
    windowStart,
    windowEnd,
  };
}

// ============================================================================
// Drilldown (label-detail) handlers — UX-005 final spec §6.3 – §6.7
// ============================================================================
//
// Multi-tag semantics: a transaction qualifies for the drilldown if it carries
// ANY of the requested tagIds (OR — locked by spec §9 OQ-2 + task brief).
// Each qualifying transaction contributes exactly once to the aggregate (the
// "no dedupe" rule of OQ-2 applies across LANDING tag *cards*; within a single
// drilldown aggregate a tx is summed once regardless of how many of the
// selected tags it carries — anything else would double-count amounts).
//
// All five handlers share the same filtering pipeline:
//   1. resolve window (default current year) and optional accountId filter
//   2. drop transactions on archived accounts (parity with landing)
//   3. keep only txs whose `tagIds` intersect the requested set
// They then diverge only in how they project/aggregate the matching txs.

interface ResolvedDrilldownFilters {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly tagIdSet: ReadonlySet<string>;
  readonly accountId: string | undefined;
}

function resolveDrilldownFilters(request: {
  tagIds: readonly string[];
  windowStart?: string | undefined;
  windowEnd?: string | undefined;
  accountId?: string | undefined;
}): ResolvedDrilldownFilters {
  const { start, end } =
    request.windowStart && request.windowEnd
      ? { start: request.windowStart, end: request.windowEnd }
      : getCurrentYearWindow();
  return {
    windowStart: start,
    windowEnd: end,
    tagIdSet: new Set(request.tagIds),
    accountId: request.accountId,
  };
}

function filterMatchingTransactions(
  model: ReadModel,
  filters: ResolvedDrilldownFilters,
): Transaction[] {
  const activeAccountIds = new Set(
    model.configAccounts.filter((a) => !a.archivedAt).map((a) => a.id),
  );
  return model.transactions.filter((tx) => {
    if (!activeAccountIds.has(tx.accountId)) return false;
    if (filters.accountId && tx.accountId !== filters.accountId) return false;
    if (!isInWindow(tx.date, filters.windowStart, filters.windowEnd)) return false;
    // OR semantics: any matching tag qualifies the transaction.
    for (const tagId of tx.tagIds) {
      if (filters.tagIdSet.has(tagId)) return true;
    }
    return false;
  });
}

function resolveCategoryNameOrFallback(categoryId: string | null, model: ReadModel): string {
  if (categoryId === null) return 'Sin categoría';
  return resolveCategoryName(categoryId, model) ?? 'Sin categoría';
}

function resolveSubcategoryName(
  categoryId: string | null,
  subcategoryId: string | null,
  model: ReadModel,
): string {
  if (subcategoryId === null) return 'Sin subcategoría';
  if (categoryId !== null) {
    const cat = model.configCategories.find((c) => c.id === categoryId);
    const sub = cat?.subcategories.find((s) => s.id === subcategoryId);
    if (sub) return sub.name;
  }
  // Fallback: scan all categories (subcategoryId without matching parent — defensive).
  for (const cat of model.configCategories) {
    const sub = cat.subcategories.find((s) => s.id === subcategoryId);
    if (sub) return sub.name;
  }
  return 'Sin subcategoría';
}

// ---------------------------------------------------------------------------
// §6.3 — handleInsightsLabelSummary (header KPIs)
// ---------------------------------------------------------------------------

export async function handleInsightsLabelSummary(
  request: InsightsLabelSummaryRequest,
): Promise<InsightsLabelSummaryResponse> {
  const model = getReadModel();
  const filters = resolveDrilldownFilters(request);
  const matching = filterMatchingTransactions(model, filters);

  let incomeCents = 0;
  let expenseCents = 0;
  const categoryIds = new Set<string>();
  const accountIds = new Set<string>();

  for (const tx of matching) {
    accountIds.add(tx.accountId);
    const amounts = effectiveAmounts(tx, model);
    for (const ea of amounts) {
      const cents = Math.round(ea.amount * 100);
      if (tx.type === 'income') incomeCents += cents;
      else expenseCents += cents;
      if (ea.categoryId) categoryIds.add(ea.categoryId);
    }
  }

  return {
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    txCount: matching.length,
    categoryCount: categoryIds.size,
    accountCount: accountIds.size,
    windowStart: filters.windowStart,
    windowEnd: filters.windowEnd,
  };
}

// ---------------------------------------------------------------------------
// §6.4 — handleInsightsLabelByCategory (donut data)
// ---------------------------------------------------------------------------

export async function handleInsightsLabelByCategory(
  request: InsightsLabelByCategoryRequest,
): Promise<InsightsLabelByCategoryResponse> {
  const model = getReadModel();
  const filters = resolveDrilldownFilters(request);
  const matching = filterMatchingTransactions(model, filters);

  // Map keyed by categoryId (or '__null__' sentinel) → income/expense cents.
  const NULL_KEY = '__null__';
  const buckets = new Map<string, { categoryId: string | null; income: number; expense: number }>();

  for (const tx of matching) {
    const amounts = effectiveAmounts(tx, model);
    for (const ea of amounts) {
      const key = ea.categoryId ?? NULL_KEY;
      const entry = buckets.get(key) ?? {
        categoryId: ea.categoryId,
        income: 0,
        expense: 0,
      };
      const cents = Math.round(ea.amount * 100);
      if (tx.type === 'income') entry.income += cents;
      else entry.expense += cents;
      buckets.set(key, entry);
    }
  }

  const categories: CategorySlice[] = Array.from(buckets.values())
    .map((b) => ({
      categoryId: b.categoryId,
      categoryName: resolveCategoryNameOrFallback(b.categoryId, model),
      incomeCents: b.income,
      expenseCents: b.expense,
    }))
    // Stable order: total magnitude desc, then name asc — renderer can re-sort
    // for income-only / expense-only donuts.
    .sort((a, b) => {
      const magB = b.incomeCents + b.expenseCents;
      const magA = a.incomeCents + a.expenseCents;
      if (magB !== magA) return magB - magA;
      return a.categoryName.localeCompare(b.categoryName);
    });

  return { categories };
}

// ---------------------------------------------------------------------------
// §6.5 — handleInsightsLabelBySubcategory (table rows)
// ---------------------------------------------------------------------------

export async function handleInsightsLabelBySubcategory(
  request: InsightsLabelBySubcategoryRequest,
): Promise<InsightsLabelBySubcategoryResponse> {
  const model = getReadModel();
  const filters = resolveDrilldownFilters(request);
  const matching = filterMatchingTransactions(model, filters);

  const NULL_CAT = '__null_cat__';
  const NULL_SUB = '__null_sub__';
  const buckets = new Map<
    string,
    {
      categoryId: string | null;
      subcategoryId: string | null;
      income: number;
      expense: number;
    }
  >();

  for (const tx of matching) {
    const amounts = effectiveAmounts(tx, model);
    for (const ea of amounts) {
      const key = `${ea.categoryId ?? NULL_CAT}::${ea.subcategoryId ?? NULL_SUB}`;
      const entry = buckets.get(key) ?? {
        categoryId: ea.categoryId,
        subcategoryId: ea.subcategoryId,
        income: 0,
        expense: 0,
      };
      const cents = Math.round(ea.amount * 100);
      if (tx.type === 'income') entry.income += cents;
      else entry.expense += cents;
      buckets.set(key, entry);
    }
  }

  const rows: SubcategoryRow[] = Array.from(buckets.values())
    .map((b) => ({
      categoryId: b.categoryId,
      categoryName: resolveCategoryNameOrFallback(b.categoryId, model),
      subcategoryId: b.subcategoryId,
      subcategoryName: resolveSubcategoryName(b.categoryId, b.subcategoryId, model),
      incomeCents: b.income,
      expenseCents: b.expense,
    }))
    .sort((a, b) => {
      const magB = b.incomeCents + b.expenseCents;
      const magA = a.incomeCents + a.expenseCents;
      if (magB !== magA) return magB - magA;
      const catCmp = a.categoryName.localeCompare(b.categoryName);
      if (catCmp !== 0) return catCmp;
      return a.subcategoryName.localeCompare(b.subcategoryName);
    });

  return { rows };
}

// ---------------------------------------------------------------------------
// §6.6 — handleInsightsLabelMonthlyEvolution (sparkline buckets)
// ---------------------------------------------------------------------------

export async function handleInsightsLabelMonthlyEvolution(
  request: InsightsLabelMonthlyEvolutionRequest,
): Promise<InsightsLabelMonthlyEvolutionResponse> {
  const model = getReadModel();
  const filters = resolveDrilldownFilters(request);
  const matching = filterMatchingTransactions(model, filters);

  // YYYY-MM → income/expense cents. Buckets sparse — we only emit months that
  // appear in the matching set (renderer fills gaps if needed).
  const buckets = new Map<string, { income: number; expense: number }>();

  for (const tx of matching) {
    const monthIso = tx.date.substring(0, 7);
    const entry = buckets.get(monthIso) ?? { income: 0, expense: 0 };
    const amounts = effectiveAmounts(tx, model);
    for (const ea of amounts) {
      const cents = Math.round(ea.amount * 100);
      if (tx.type === 'income') entry.income += cents;
      else entry.expense += cents;
    }
    buckets.set(monthIso, entry);
  }

  const months: MonthBucket[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthIso, { income, expense }]) => ({
      monthIso,
      incomeCents: income,
      expenseCents: expense,
    }));

  return { months };
}

// ---------------------------------------------------------------------------
// §6.7 — handleInsightsLabelByAccount (per-account horizontal bars)
// ---------------------------------------------------------------------------

export async function handleInsightsLabelByAccount(
  request: InsightsLabelByAccountRequest,
): Promise<InsightsLabelByAccountResponse> {
  const model = getReadModel();
  const filters = resolveDrilldownFilters(request);
  const matching = filterMatchingTransactions(model, filters);

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const tx of matching) {
    const entry = buckets.get(tx.accountId) ?? { income: 0, expense: 0 };
    const amounts = effectiveAmounts(tx, model);
    for (const ea of amounts) {
      const cents = Math.round(ea.amount * 100);
      if (tx.type === 'income') entry.income += cents;
      else entry.expense += cents;
    }
    buckets.set(tx.accountId, entry);
  }

  const accounts: AccountBucket[] = Array.from(buckets.entries())
    .map(([accountId, { income, expense }]) => {
      const account = model.configAccounts.find((a) => a.id === accountId);
      const accountName = account ? (account.label ?? account.name) : 'Cuenta desconocida';
      const accountColor = account?.color ?? '';
      return {
        accountId,
        accountName,
        accountColor,
        incomeCents: income,
        expenseCents: expense,
      };
    })
    .sort((a, b) => {
      const magB = b.incomeCents + b.expenseCents;
      const magA = a.incomeCents + a.expenseCents;
      if (magB !== magA) return magB - magA;
      return a.accountName.localeCompare(b.accountName);
    });

  return { accounts };
}
