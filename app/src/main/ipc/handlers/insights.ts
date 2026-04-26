// Insights IPC handlers — landing summary and tag analytics.
// Thin aggregation layer over the read model. Per UX-005 final spec §6.2.

import type {
  InsightsLandingSummaryRequest,
  InsightsLandingSummaryResponse,
  TagSummary,
  LandingKPIs,
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
