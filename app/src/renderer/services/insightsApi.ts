/**
 * Insights API — wrapper for insights:landing-summary IPC.
 *
 * MOCK IMPLEMENTATION — returns type-perfect fixture data until
 * Mouse's PR #100 (handler) lands. Swap to real IPC after merge.
 */

import type {
  InsightsLandingSummaryRequest,
  InsightsLandingSummaryResponse,
} from '../../shared/ipc-contracts/insights.js';

/**
 * Fetches landing page summary (KPIs + tag cards).
 *
 * TODO: Swap to real IPC once Mouse's PR #100 lands:
 *   return window.api.invoke('insights:landing-summary', request);
 */
export async function getInsightsLandingSummary(
  _request?: InsightsLandingSummaryRequest,
): Promise<InsightsLandingSummaryResponse> {
  // MOCK DATA — Rett-flavored fixture matching the schema
  await new Promise((resolve) => setTimeout(resolve, 300)); // Simulate network delay

  const mockResponse: InsightsLandingSummaryResponse = {
    kpis: {
      etiquetasActivasCount: 5,
      etiquetasTotalesCount: 8,
      ingresosEtiquetadosCents: 1855000, // €18,550
      gastosEtiquetadosCents: 125000, // €1,250
    },
    tags: [
      {
        tagId: 'tag-1',
        name: 'Día Enfermedades Raras',
        color: '#d4a5d4',
        archived: false,
        ingresosCents: 1015000, // €10,150
        gastosCents: 0,
        netoCents: 1015000,
        movimientosCount: 4,
        topCategorias: [
          { categoryId: 'cat-donations', name: 'Donaciones' },
          { categoryId: 'cat-grants', name: 'Subvenciones' },
        ],
        sparklineNetCents: [200000, 250000, 300000, 265000], // 4 months
      },
      {
        tagId: 'tag-2',
        name: 'Gala Benéfica',
        color: '#f4a261',
        archived: false,
        ingresosCents: 320000, // €3,200
        gastosCents: 0,
        netoCents: 320000,
        movimientosCount: 1,
        topCategorias: [{ categoryId: 'cat-events', name: 'Eventos' }],
      },
      {
        tagId: 'tag-3',
        name: 'Calendarios',
        color: '#6a9fb5',
        archived: false,
        ingresosCents: 120000, // €1,200
        gastosCents: 45000, // €450
        netoCents: 75000, // €750
        movimientosCount: 2,
        topCategorias: [
          { categoryId: 'cat-events', name: 'Eventos' },
          { categoryId: 'cat-admin', name: 'Administrativo' },
        ],
        sparklineNetCents: [18000, 22000, 20000, 15000],
      },
      {
        tagId: 'tag-4',
        name: 'Mercadillo Solidario',
        color: '#e9c46a',
        archived: false,
        ingresosCents: 75000, // €750
        gastosCents: 0,
        netoCents: 75000,
        movimientosCount: 1,
        topCategorias: [{ categoryId: 'cat-events', name: 'Eventos' }],
      },
      {
        tagId: 'tag-5',
        name: 'Reto Deportivo',
        color: '#2a9d8f',
        archived: false,
        ingresosCents: 20000, // €200
        gastosCents: 0,
        netoCents: 20000,
        movimientosCount: 1,
        topCategorias: [{ categoryId: 'cat-donations', name: 'Donaciones' }],
      },
    ],
    otrasBucket: null, // Only 5 tags, no tail aggregation
    windowStart: '2026-01-01',
    windowEnd: '2026-05-02',
  };

  return mockResponse;
}
