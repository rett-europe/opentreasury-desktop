// Mock movement data. Swapped out for the real IPC `tx:queryRange` call
// (ADR-001 C13, PRD-001 PR15) once Morpheus wires the read model.
//
// Shape matches `types/movement.ts`. IDs are UUIDs here; real impl uses ULID
// per crypto-spec §11.
//
// Dataset: ~50 entries across ~6 months, EUR, realistic small-NGO mix
// (Rett Spain pilot). Categories/accounts mirror docs/product/vision.md
// and the prototype reference app.

import type { DateRange, Movement } from '../types/movement.js';

type Seed = Omit<Movement, 'id' | 'currency'>;

// Deterministic entries so snapshots are stable. Dates are ISO YYYY-MM-DD.
// Amounts are positive; `type` carries the sign.
const SEED: readonly Seed[] = [
  // ── October 2025 ──
  {
    date: '2025-10-03',
    type: 'income',
    amount: 1200,
    description: 'Donación anónima #A102',
    account: 'Banco Santander',
    category: 'Donaciones',
    subcategory: 'Particulares',
  },
  {
    date: '2025-10-05',
    type: 'expense',
    amount: 820,
    description: 'Alquiler oficina — octubre',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2025-10-12',
    type: 'expense',
    amount: 65.4,
    description: 'Material oficina (folios, tóner)',
    account: 'Banco Santander',
    category: 'Material',
    subcategory: 'Oficina',
  },
  {
    date: '2025-10-18',
    type: 'income',
    amount: 50,
    description: 'Bizum recurrente — socia Rett',
    account: 'Bizum',
    category: 'Donaciones',
    subcategory: 'Socios',
  },
  {
    date: '2025-10-22',
    type: 'expense',
    amount: 340,
    description: 'Sesión terapia — familia M.',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Fisioterapia',
  },
  {
    date: '2025-10-28',
    type: 'expense',
    amount: 128.9,
    description: 'Viaje Madrid — reunión institucional',
    account: 'Banco Santander',
    category: 'Viajes',
    subcategory: null,
  },

  // ── November 2025 ──
  {
    date: '2025-11-02',
    type: 'income',
    amount: 3500,
    description: 'Subvención Ayto. Madrid — Q4',
    account: 'Banco Santander',
    category: 'Subvenciones',
    subcategory: 'Públicas',
  },
  {
    date: '2025-11-05',
    type: 'expense',
    amount: 820,
    description: 'Alquiler oficina — noviembre',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2025-11-07',
    type: 'income',
    amount: 75,
    description: 'PayPal — donación campaña web',
    account: 'PayPal',
    category: 'Donaciones',
    subcategory: 'Campañas',
  },
  {
    date: '2025-11-12',
    type: 'expense',
    amount: 1450,
    description: 'Nómina — coordinadora (media jornada)',
    account: 'Banco Santander',
    category: 'Nóminas',
    subcategory: null,
  },
  {
    date: '2025-11-18',
    type: 'income',
    amount: 200,
    description: 'Donación empresa asociada',
    account: 'Banco Santander',
    category: 'Donaciones',
    subcategory: 'Empresas',
  },
  {
    date: '2025-11-24',
    type: 'expense',
    amount: 280,
    description: 'Sesión terapia — familia G.',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Logopedia',
  },
  {
    date: '2025-11-29',
    type: 'expense',
    amount: 42.5,
    description: 'Caja — cafés reunión familias',
    account: 'Caja',
    category: 'Otros',
    subcategory: null,
  },

  // ── December 2025 ──
  {
    date: '2025-12-02',
    type: 'income',
    amount: 150,
    description: 'Donación navideña — socia',
    account: 'Bizum',
    category: 'Donaciones',
    subcategory: 'Socios',
  },
  {
    date: '2025-12-05',
    type: 'expense',
    amount: 820,
    description: 'Alquiler oficina — diciembre',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2025-12-10',
    type: 'income',
    amount: 2800,
    description: 'Campaña #GivingTuesday',
    account: 'PayPal',
    category: 'Donaciones',
    subcategory: 'Campañas',
  },
  {
    date: '2025-12-15',
    type: 'expense',
    amount: 1450,
    description: 'Nómina — coordinadora',
    account: 'Banco Santander',
    category: 'Nóminas',
    subcategory: null,
  },
  {
    date: '2025-12-18',
    type: 'expense',
    amount: 95,
    description: 'Material para taller familias',
    account: 'Banco Santander',
    category: 'Material',
    subcategory: 'Talleres',
  },
  {
    date: '2025-12-22',
    type: 'expense',
    amount: 420,
    description: 'Terapia grupal — diciembre',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Grupal',
  },
  {
    date: '2025-12-28',
    type: 'income',
    amount: 500,
    description: 'Donación empresa local',
    account: 'Banco Santander',
    category: 'Donaciones',
    subcategory: 'Empresas',
  },

  // ── January 2026 ──
  {
    date: '2026-01-03',
    type: 'income',
    amount: 40,
    description: 'Bizum — nueva socia',
    account: 'Bizum',
    category: 'Donaciones',
    subcategory: 'Socios',
  },
  {
    date: '2026-01-05',
    type: 'expense',
    amount: 840,
    description: 'Alquiler oficina — enero (subida IPC)',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2026-01-10',
    type: 'expense',
    amount: 1450,
    description: 'Nómina — coordinadora',
    account: 'Banco Santander',
    category: 'Nóminas',
    subcategory: null,
  },
  {
    date: '2026-01-15',
    type: 'income',
    amount: 4200,
    description: 'Subvención CAM — tramo 1/2',
    account: 'Banco Santander',
    category: 'Subvenciones',
    subcategory: 'Públicas',
  },
  {
    date: '2026-01-20',
    type: 'expense',
    amount: 310,
    description: 'Terapia individual — familia R.',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Fisioterapia',
  },
  {
    date: '2026-01-25',
    type: 'expense',
    amount: 58,
    description: 'Dominio web + hosting anual',
    account: 'PayPal',
    category: 'Otros',
    subcategory: 'Digital',
  },

  // ── February 2026 ──
  {
    date: '2026-02-02',
    type: 'expense',
    amount: 840,
    description: 'Alquiler oficina — febrero',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2026-02-06',
    type: 'income',
    amount: 125,
    description: 'Donación — recurrente mensual',
    account: 'Bizum',
    category: 'Donaciones',
    subcategory: 'Socios',
  },
  {
    date: '2026-02-10',
    type: 'expense',
    amount: 1450,
    description: 'Nómina — coordinadora',
    account: 'Banco Santander',
    category: 'Nóminas',
    subcategory: null,
  },
  {
    date: '2026-02-14',
    type: 'expense',
    amount: 180,
    description: 'Viaje Barcelona — encuentro asociaciones',
    account: 'Banco Santander',
    category: 'Viajes',
    subcategory: null,
  },
  {
    date: '2026-02-18',
    type: 'income',
    amount: 900,
    description: 'Donación puntual — evento benéfico',
    account: 'Banco Santander',
    category: 'Donaciones',
    subcategory: 'Eventos',
  },
  {
    date: '2026-02-22',
    type: 'expense',
    amount: 380,
    description: 'Terapia — familia L.',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Logopedia',
  },
  {
    date: '2026-02-27',
    type: 'expense',
    amount: 32,
    description: 'Caja — papelería',
    account: 'Caja',
    category: 'Material',
    subcategory: 'Oficina',
  },

  // ── March 2026 ──
  {
    date: '2026-03-03',
    type: 'expense',
    amount: 840,
    description: 'Alquiler oficina — marzo',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2026-03-07',
    type: 'income',
    amount: 60,
    description: 'Bizum — donación nueva familia',
    account: 'Bizum',
    category: 'Donaciones',
    subcategory: 'Particulares',
  },
  {
    date: '2026-03-11',
    type: 'expense',
    amount: 1450,
    description: 'Nómina — coordinadora',
    account: 'Banco Santander',
    category: 'Nóminas',
    subcategory: null,
  },
  {
    date: '2026-03-15',
    type: 'income',
    amount: 1800,
    description: 'Fondos campaña primavera',
    account: 'PayPal',
    category: 'Donaciones',
    subcategory: 'Campañas',
  },
  {
    date: '2026-03-18',
    type: 'expense',
    amount: 245,
    description: 'Material talleres marzo',
    account: 'Banco Santander',
    category: 'Material',
    subcategory: 'Talleres',
  },
  {
    date: '2026-03-22',
    type: 'expense',
    amount: 410,
    description: 'Terapia grupal — marzo',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Grupal',
  },
  {
    date: '2026-03-28',
    type: 'expense',
    amount: 95.6,
    description: 'Viaje Valencia — ponencia',
    account: 'Banco Santander',
    category: 'Viajes',
    subcategory: null,
  },

  // ── April 2026 (current month in project context) ──
  {
    date: '2026-04-02',
    type: 'expense',
    amount: 840,
    description: 'Alquiler oficina — abril',
    account: 'Banco Santander',
    category: 'Alquiler',
    subcategory: null,
  },
  {
    date: '2026-04-04',
    type: 'income',
    amount: 250,
    description: 'Donación — socia anual',
    account: 'Banco Santander',
    category: 'Donaciones',
    subcategory: 'Socios',
  },
  {
    date: '2026-04-08',
    type: 'income',
    amount: 3200,
    description: 'Subvención CAM — tramo 2/2',
    account: 'Banco Santander',
    category: 'Subvenciones',
    subcategory: 'Públicas',
  },
  {
    date: '2026-04-10',
    type: 'expense',
    amount: 1450,
    description: 'Nómina — coordinadora',
    account: 'Banco Santander',
    category: 'Nóminas',
    subcategory: null,
  },
  {
    date: '2026-04-12',
    type: 'expense',
    amount: 135,
    description: 'Material talleres — abril',
    account: 'Banco Santander',
    category: 'Material',
    subcategory: 'Talleres',
  },
  {
    date: '2026-04-14',
    type: 'income',
    amount: 85,
    description: 'Bizum — donación',
    account: 'Bizum',
    category: 'Donaciones',
    subcategory: 'Particulares',
  },
  {
    date: '2026-04-16',
    type: 'expense',
    amount: 290,
    description: 'Sesión terapia — familia V.',
    account: 'Banco Santander',
    category: 'Terapias',
    subcategory: 'Fisioterapia',
  },
  {
    date: '2026-04-18',
    type: 'expense',
    amount: 48.2,
    description: 'Caja — transporte voluntarios',
    account: 'Caja',
    category: 'Viajes',
    subcategory: null,
  },
];

function newId(): string {
  // crypto.randomUUID is available in modern Node (>=19) and in browsers.
  // Real impl: ULID per crypto-spec §11.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Deterministic fallback for non-Web contexts.
  return `mov-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

const ALL: readonly Movement[] = SEED.map((seed) => ({
  ...seed,
  id: newId(),
  currency: 'EUR' as const,
}));

/** Inclusive date comparison on the YYYY-MM-DD prefix (timezone-agnostic). */
function isInRange(isoDate: string, from: Date, to: Date): boolean {
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);
  return isoDate >= fromISO && isoDate <= toISO;
}

/**
 * Fetch movements for a given range. Simulates a 200 ms IPC round-trip.
 * Real impl: main-process query via preload bridge (ADR-001 C13).
 */
export async function getMockMovements(range: DateRange): Promise<Movement[]> {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return ALL.filter((m) => isInRange(m.date, range.from, range.to)).sort((a, b) =>
    // Descending date per PRD-001 PR3.
    b.date.localeCompare(a.date),
  );
}

/** Exposed for tests and for the empty-DB signal (when SEED has 0 entries). */
export function getMockMovementCount(): number {
  return ALL.length;
}
