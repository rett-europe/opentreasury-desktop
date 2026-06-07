// WI-4′ — dev-only seed events that mirror prototype/data.js in shape.
//
// Gating lives in bootstrap.ts (only seeded when events.ndjson is empty AND
// NODE_ENV !== 'production'). This module is pure data + event-shaping.
//
// IDs use a deterministic "fake ULID" scheme (prefix padded with zeros to the
// 26-char length required by the event envelope schema). This keeps seed
// runs reproducible across restarts while still satisfying z.string().length(26).
// Real production data will use crypto-random ULIDs (ADR-001 C11).
//
// P1-1: The fake IDs here are ONLY for seed entity IDs (accounts, categories, etc.).
// The datasetId, actorDeviceId, actorUserId are now sourced from the real
// bootstrap-loaded values (device.json, dataset.json, profile.json) — those are
// passed into buildDevSeedEvents() from bootstrap.ts.

import type { DomainEvent } from '../core/eventLog/index.js';

// Crockford base32 (ULID alphabet) excludes I, L, O, U. For seed we only need
// length compliance; we uppercase, strip anything not in the alphabet, and
// right-pad with '0'.
function fakeUlid(seedKey: string): string {
  const upper = seedKey.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

interface AccountSeed {
  key: string; // short prototype id, used to derive ULID deterministically
  bankName: string;
  bankNameShort: string;
  label: string;
  color: string;
  sortOrder: number;
}

const ACCOUNTS: readonly AccountSeed[] = [
  {
    key: 'ACCUNI',
    bankName: 'Unicaja Banco',
    bankNameShort: 'Unicaja',
    label: 'Principal',
    color: 'oklch(0.72 0.11 265)',
    sortOrder: 0,
  },
  {
    key: 'ACCOPS',
    bankName: 'CaixaBank',
    bankNameShort: 'Caixa 5315',
    label: 'Operaciones',
    color: 'oklch(0.72 0.11 160)',
    sortOrder: 1,
  },
  {
    key: 'ACCFIN',
    bankName: 'CaixaBank',
    bankNameShort: 'Caixa FinRett',
    label: 'FinRett',
    color: 'oklch(0.72 0.11 55)',
    sortOrder: 2,
  },
  {
    key: 'ACCEVT',
    bankName: 'CaixaBank',
    bankNameShort: 'Caixa 0951',
    label: 'Eventos',
    color: 'oklch(0.72 0.11 20)',
    sortOrder: 3,
  },
  {
    key: 'ACCPPL',
    bankName: 'PayPal',
    bankNameShort: 'PayPal',
    label: 'Donaciones',
    color: 'oklch(0.72 0.11 305)',
    sortOrder: 4,
  },
];

// Map the prototype's short account ids to our seed keys so we can translate
// transactions below.
const ACCOUNT_BY_SHORT: Readonly<Record<string, string>> = {
  unicaja: 'ACCUNI',
  'caixa-ops': 'ACCOPS',
  'caixa-fin': 'ACCFIN',
  'caixa-0951': 'ACCEVT',
  paypal: 'ACCPPL',
};

interface CategorySeed {
  key: string;
  name: string;
  type: 'income' | 'expense';
  subs: readonly string[];
}

const CATEGORIES: readonly CategorySeed[] = [
  {
    key: 'CATACT',
    name: 'Actividades',
    type: 'expense',
    subs: ['Talleres', 'Terapias', 'Formación'],
  },
  {
    key: 'CATADM',
    name: 'Administrativo',
    type: 'expense',
    subs: ['Material oficina', 'Servicios profesionales', 'Seguros', 'Comisiones'],
  },
  {
    key: 'CATCUO',
    name: 'Cuotas',
    type: 'income',
    subs: ['Cuota Socio Anual', 'Cuota Socio Mensual', 'Cuota Familia'],
  },
  {
    key: 'CATDON',
    name: 'Donaciones',
    type: 'income',
    subs: ['Individuales', 'Empresas', 'Anónimas'],
  },
  {
    key: 'CATEVT',
    name: 'Eventos',
    type: 'income',
    subs: ['Galas benéficas', 'Mercadillos', 'Carreras solidarias', 'Charlas'],
  },
  {
    key: 'CATGAS',
    name: 'Gastos',
    type: 'expense',
    subs: ['Alquiler', 'Suministros', 'Transporte', 'Comunicación', 'Comisiones'],
  },
  { key: 'CATSUB', name: 'Subvenciones', type: 'income', subs: ['Públicas', 'Privadas'] },
  { key: 'CATTEA', name: 'Teaming', type: 'income', subs: ['Teaming'] },
];

const CATEGORY_BY_SHORT: Readonly<Record<string, string>> = {
  actividades: 'CATACT',
  administrativo: 'CATADM',
  cuotas: 'CATCUO',
  donaciones: 'CATDON',
  eventos: 'CATEVT',
  gastos: 'CATGAS',
  subvenciones: 'CATSUB',
  teaming: 'CATTEA',
};

interface TagSeed {
  key: string;
  name: string;
  color: string;
}

const TAGS: readonly TagSeed[] = [
  { key: 'TAGRAR', name: 'Día Enfermedades Raras', color: 'oklch(0.78 0.10 330)' },
  { key: 'TAGCAL', name: 'Calendarios 2026', color: 'oklch(0.78 0.10 280)' },
  { key: 'TAGGAL', name: 'Gala Benéfica 2026', color: 'oklch(0.78 0.10 55)' },
  { key: 'TAGRET', name: 'Reto Deportivo', color: 'oklch(0.78 0.10 220)' },
  { key: 'TAGSEM', name: 'Semana Rett', color: 'oklch(0.78 0.10 180)' },
  { key: 'TAGMER', name: 'Mercadillo Solidario', color: 'oklch(0.78 0.10 95)' },
];

const TAG_BY_SHORT: Readonly<Record<string, string>> = {
  raras: 'TAGRAR',
  cal: 'TAGCAL',
  gala: 'TAGGAL',
  reto: 'TAGRET',
  semana: 'TAGSEM',
  merca: 'TAGMER',
};

interface TxSeed {
  id: string;
  date: string;
  signedAmount: number;
  desc: string;
  account: keyof typeof ACCOUNT_BY_SHORT;
  cat: keyof typeof CATEGORY_BY_SHORT | null;
  sub: string | null;
  tagIds: readonly (keyof typeof TAG_BY_SHORT)[];
  status: 'pending' | 'approved';
}

// ----------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — seeded with constant for reproducibility.
// NO Math.random() — re-runs must produce byte-identical events.
// ----------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  return function (): number {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRNG_SEED = 0x52657474; // 'Rett' as hex
const rng = mulberry32(PRNG_SEED);

// Pick from an array deterministically
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

// Random int [min, max] inclusive
function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Random amount with realistic distribution per category type
function randAmount(type: 'small' | 'mid' | 'large' | 'grant'): number {
  if (type === 'small') return randInt(5, 50);
  if (type === 'mid') return randInt(80, 500);
  if (type === 'large') return randInt(700, 2000);
  // grant
  return randInt(2500, 6000);
}

// ----------------------------------------------------------------------------
// Backfill generator: ~100 tx in 2025 (Jan-Dec), ~70 tx in 2026 (Jan-Apr).
// Keeps existing curated `t001`-`t030` untouched; generates new ids `g0001`+.
// ----------------------------------------------------------------------------
function generateBackfillTransactions(): TxSeed[] {
  const backfill: TxSeed[] = [];
  let counter = 1;

  // Description templates per subcategory for variety
  const descTemplates: Record<string, (n: number) => string> = {
    // Income
    'Cuota Socio Anual': (n) => `Socio #S${String(n).padStart(4, '0')}`,
    'Cuota Socio Mensual': (n) => `Socio #S${String(n).padStart(4, '0')}`,
    'Cuota Familia': (n) => `Cuota familia #F${String(n).padStart(3, '0')}`,
    Individuales: (n) => `Donante #W${String(n).padStart(4, '0')}`,
    Empresas: (n) => `Donación corporativa — Empresa #E${String(n).padStart(3, '0')}`,
    Anónimas: () => 'Donación anónima',
    'Galas benéficas': (n) => `Recaudación gala benéfica #G${n}`,
    Mercadillos: (n) => `Recaudación mercadillo #M${n}`,
    'Carreras solidarias': (n) => `Recaudación carrera solidaria #R${n}`,
    Charlas: (n) => `Recaudación charla #C${n}`,
    Públicas: (n) => `Subvención pública — Programa #${n}`,
    Privadas: (n) => `Subvención privada — Fundación #${n}`,
    Teaming: () => 'Teaming mensual',
    // Expense
    Talleres: (n) => `Pago taller — Grupo #T${n}`,
    Terapias: (n) => `Pago sesiones terapéuticas — Profesional #P${String(n).padStart(2, '0')}`,
    Formación: (n) => `Curso formación — Módulo #${n}`,
    'Material oficina': () => pick(['Compra material oficina', 'Papelería', 'Consumibles']),
    'Servicios profesionales': () =>
      pick(['Servicio imprenta', 'Asesoría contable', 'Servicio diseño gráfico']),
    Seguros: () => pick(['Seguro RC anual', 'Seguro multirriesgo']),
    Comisiones: () => pick(['Comisión mantenimiento', 'Comisión devolución recibo']),
    Alquiler: () => 'Recibo alquiler — Local sede',
    Suministros: () => pick(['Recibo suministro eléctrico', 'Recibo agua']),
    Transporte: () => pick(['Envío postal', 'Gastos desplazamiento', 'Combustible']),
    Comunicación: () => 'Recibo telefonía — Línea oficina',
  };

  // Per-year generation
  for (const year of [2025, 2026]) {
    const startMonth = year === 2025 ? 1 : 1;
    const endMonth = year === 2025 ? 12 : 4; // 2026 through April
    const targetPerMonth = year === 2025 ? 8 : 17; // ~100 / 12 ≈ 8; ~70 / 4 ≈ 17

    for (let m = startMonth; m <= endMonth; m++) {
      for (let i = 0; i < targetPerMonth; i++) {
        const dayOfMonth = randInt(1, m === 2 ? 28 : [4, 6, 9, 11].includes(m) ? 30 : 31);
        const dateStr = `${year}-${String(m).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

        // Weighted category selection: bias for diversity
        const catChoice = rng();
        let cat: CategorySeed;
        if (catChoice < 0.25) cat = CATEGORIES.find((c) => c.key === 'CATCUO')!;
        else if (catChoice < 0.45) cat = CATEGORIES.find((c) => c.key === 'CATDON')!;
        else if (catChoice < 0.55) cat = CATEGORIES.find((c) => c.key === 'CATSUB')!;
        else if (catChoice < 0.65) cat = CATEGORIES.find((c) => c.key === 'CATEVT')!;
        else if (catChoice < 0.75) cat = CATEGORIES.find((c) => c.key === 'CATGAS')!;
        else if (catChoice < 0.85) cat = CATEGORIES.find((c) => c.key === 'CATADM')!;
        else if (catChoice < 0.95) cat = CATEGORIES.find((c) => c.key === 'CATACT')!;
        else cat = CATEGORIES.find((c) => c.key === 'CATTEA')!;

        const subName = pick(cat.subs);
        const catShort = Object.keys(CATEGORY_BY_SHORT).find(
          (k) => CATEGORY_BY_SHORT[k] === cat.key,
        )!;

        // Amount scaling by subcategory
        let amountType: 'small' | 'mid' | 'large' | 'grant' = 'mid';
        if (cat.key === 'CATSUB') amountType = 'grant';
        else if (
          cat.key === 'CATEVT' &&
          (subName === 'Galas benéficas' || subName === 'Mercadillos')
        )
          amountType = 'large';
        else if (cat.key === 'CATDON' && subName === 'Empresas') amountType = 'large';
        else if (cat.key === 'CATDON' || cat.key === 'CATTEA') amountType = 'small';
        else if (cat.key === 'CATGAS' && subName === 'Alquiler') amountType = 'large';

        const rawAmount = randAmount(amountType);
        const signedAmount = cat.type === 'income' ? rawAmount : -rawAmount;

        // Account distribution: ~70% unicaja, rest split
        const accountChoice = rng();
        let account: keyof typeof ACCOUNT_BY_SHORT;
        if (accountChoice < 0.7) account = 'unicaja';
        else if (accountChoice < 0.8) account = 'paypal';
        else if (accountChoice < 0.85) account = 'caixa-ops';
        else if (accountChoice < 0.95) account = 'caixa-0951';
        else account = 'caixa-fin';

        // Tags: ~10-15% get a tag, biased to event categories
        const tagIds: (keyof typeof TAG_BY_SHORT)[] = [];
        if (cat.key === 'CATEVT' && rng() < 0.3) {
          if (subName === 'Galas benéficas') tagIds.push('gala');
          else if (subName === 'Mercadillos') tagIds.push('merca');
          else if (subName === 'Carreras solidarias') tagIds.push('reto');
        } else if (rng() < 0.05) {
          tagIds.push(pick(['raras', 'cal', 'semana'] as const));
        }

        // Description
        const descFn = descTemplates[subName] ?? (() => `${cat.name} — ${subName}`);
        const desc = descFn(counter);

        // Status: mostly approved; a handful of recent 2026 entries as pending
        let status: 'pending' | 'approved' = 'approved';
        if (year === 2026 && m === 4 && dayOfMonth >= 20 && rng() < 0.3) {
          status = 'pending';
        }

        backfill.push({
          id: `g${String(counter).padStart(4, '0')}`,
          date: dateStr,
          signedAmount,
          desc,
          account,
          cat: catShort,
          sub: subName,
          tagIds,
          status,
        });
        counter++;
      }
    }
  }

  return backfill;
}

// ----------------------------------------------------------------------------
// Curated transactions (existing 30, kept untouched).
// ----------------------------------------------------------------------------
const TRANSACTIONS: readonly TxSeed[] = [
  {
    id: 't001',
    date: '2026-04-10',
    signedAmount: 5.0,
    desc: 'Donante #A2041',
    account: 'paypal',
    cat: null,
    sub: null,
    tagIds: [],
    status: 'pending',
  },
  {
    id: 't002',
    date: '2026-04-10',
    signedAmount: 20.0,
    desc: 'Donante #A2042',
    account: 'paypal',
    cat: null,
    sub: null,
    tagIds: [],
    status: 'pending',
  },
  {
    id: 't003',
    date: '2026-04-08',
    signedAmount: -3.03,
    desc: 'Comisión devolución recibo',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Comisiones',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't004',
    date: '2026-04-08',
    signedAmount: -450.0,
    desc: 'Ref. asociación 20260401/001',
    account: 'unicaja',
    cat: 'cuotas',
    sub: 'Cuota Socio Anual',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't005',
    date: '2026-04-08',
    signedAmount: 20.0,
    desc: 'Socio #S0128',
    account: 'unicaja',
    cat: 'cuotas',
    sub: 'Cuota Socio Mensual',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't006',
    date: '2026-04-08',
    signedAmount: -5.0,
    desc: 'Comisión de mantenimiento',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Comisiones',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't007',
    date: '2026-04-08',
    signedAmount: 50.0,
    desc: 'Socio #S0094',
    account: 'unicaja',
    cat: 'cuotas',
    sub: 'Cuota Socio Anual',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't008',
    date: '2026-04-07',
    signedAmount: -1.0,
    desc: 'Microdonación plataforma',
    account: 'unicaja',
    cat: 'administrativo',
    sub: 'Teaming',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't009',
    date: '2026-04-06',
    signedAmount: 2500.0,
    desc: 'Donación corporativa — Empresa #E014',
    account: 'unicaja',
    cat: 'donaciones',
    sub: 'Empresas',
    tagIds: ['raras'],
    status: 'approved',
  },
  {
    id: 't010',
    date: '2026-04-05',
    signedAmount: 5000.0,
    desc: 'Subvención autonómica — Programa anual',
    account: 'unicaja',
    cat: 'subvenciones',
    sub: 'Públicas',
    tagIds: ['raras'],
    status: 'approved',
  },
  {
    id: 't011',
    date: '2026-04-05',
    signedAmount: -92.4,
    desc: 'Recibo telefonía — Línea oficina',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Comunicación',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't012',
    date: '2026-04-04',
    signedAmount: 750.0,
    desc: 'Recaudación mercadillo solidario',
    account: 'caixa-0951',
    cat: 'eventos',
    sub: 'Mercadillos',
    tagIds: ['merca'],
    status: 'approved',
  },
  {
    id: 't013',
    date: '2026-04-03',
    signedAmount: -340.0,
    desc: 'Pago sesiones terapéuticas — Profesional #P03',
    account: 'unicaja',
    cat: 'actividades',
    sub: 'Terapias',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't014',
    date: '2026-04-03',
    signedAmount: -45.0,
    desc: 'Envío postal — Material solidario',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Transporte',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't015',
    date: '2026-04-02',
    signedAmount: 200.0,
    desc: 'Donación web — Campaña deportiva',
    account: 'paypal',
    cat: 'donaciones',
    sub: 'Individuales',
    tagIds: ['reto'],
    status: 'approved',
  },
  {
    id: 't016',
    date: '2026-04-02',
    signedAmount: 25.0,
    desc: 'Donación web — Donante #W0312',
    account: 'paypal',
    cat: 'donaciones',
    sub: 'Individuales',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't017',
    date: '2026-04-01',
    signedAmount: -850.0,
    desc: 'Recibo alquiler — Local sede',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Alquiler',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't018',
    date: '2026-04-01',
    signedAmount: 75.0,
    desc: 'Cuota familia #F058',
    account: 'unicaja',
    cat: 'cuotas',
    sub: 'Cuota Familia',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't019',
    date: '2026-03-28',
    signedAmount: 150.0,
    desc: 'Donación anónima',
    account: 'paypal',
    cat: 'donaciones',
    sub: 'Anónimas',
    tagIds: ['raras'],
    status: 'approved',
  },
  {
    id: 't020',
    date: '2026-03-25',
    signedAmount: 3200.0,
    desc: 'Recaudación gala benéfica',
    account: 'caixa-0951',
    cat: 'eventos',
    sub: 'Galas benéficas',
    tagIds: ['gala'],
    status: 'approved',
  },
  {
    id: 't021',
    date: '2026-03-22',
    signedAmount: -1500.0,
    desc: 'Seguro RC anual',
    account: 'caixa-fin',
    cat: 'administrativo',
    sub: 'Seguros',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't022',
    date: '2026-03-19',
    signedAmount: 85.0,
    desc: 'Donación web — Donante #W0298',
    account: 'paypal',
    cat: 'donaciones',
    sub: 'Individuales',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't023',
    date: '2026-03-17',
    signedAmount: 500.0,
    desc: 'Subvención municipal — Actividades',
    account: 'unicaja',
    cat: 'subvenciones',
    sub: 'Públicas',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't024',
    date: '2026-03-15',
    signedAmount: -178.3,
    desc: 'Recibo suministro eléctrico',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Suministros',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't025',
    date: '2026-03-14',
    signedAmount: -450.0,
    desc: 'Servicio imprenta — Material campaña',
    account: 'unicaja',
    cat: 'administrativo',
    sub: 'Servicios profesionales',
    tagIds: ['cal'],
    status: 'approved',
  },
  {
    id: 't026',
    date: '2026-03-12',
    signedAmount: 1200.0,
    desc: 'Venta artículos solidarios — Campaña',
    account: 'caixa-0951',
    cat: 'eventos',
    sub: 'Mercadillos',
    tagIds: ['cal'],
    status: 'approved',
  },
  {
    id: 't027',
    date: '2026-03-10',
    signedAmount: -89.9,
    desc: 'Recibo telefonía — Línea oficina',
    account: 'unicaja',
    cat: 'gastos',
    sub: 'Comunicación',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't028',
    date: '2026-03-08',
    signedAmount: -320.0,
    desc: 'Pago sesiones terapéuticas — Profesional #P03',
    account: 'unicaja',
    cat: 'actividades',
    sub: 'Terapias',
    tagIds: [],
    status: 'approved',
  },
  {
    id: 't029',
    date: '2026-03-06',
    signedAmount: 2500.0,
    desc: 'Donación corporativa — Empresa #E014',
    account: 'unicaja',
    cat: 'donaciones',
    sub: 'Empresas',
    tagIds: ['raras'],
    status: 'approved',
  },
  {
    id: 't030',
    date: '2026-03-05',
    signedAmount: -125.5,
    desc: 'Compra material oficina',
    account: 'unicaja',
    cat: 'administrativo',
    sub: 'Material oficina',
    tagIds: [],
    status: 'approved',
  },
];

const BASE_TS = '2026-04-19T08:00:00.000Z';

function envelopeIso(offsetMinutes: number): string {
  const base = new Date(BASE_TS).getTime();
  return new Date(base + offsetMinutes * 60_000).toISOString();
}

export function txCreatedAt(date: string, ordinal: number): string {
  // Spread within the day so sort-by-createdAt DESC mirrors the seed order.
  // Encode the ordinal as a within-day time offset (hh:mm:ss) so the result is
  // always a valid ISO datetime, even when there are more than 60 rows. (Encoding
  // the ordinal directly into the seconds field overflowed past 59 once the merged
  // seed grew past 60 rows, producing invalid strings like `...T12:00:159.000Z`.)
  const s = ordinal % 86400; // safety wrap at 24h; current seed (~194 rows) never wraps
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${date}T${hh}:${mm}:${ss}.000Z`;
}

export interface DevSeedDeps {
  datasetId: string;
  actorDeviceId: string;
  actorUserId: string;
}

export function buildDevSeedEvents(deps: DevSeedDeps): DomainEvent[] {
  const { datasetId, actorDeviceId, actorUserId } = deps;

  const events: DomainEvent[] = [];
  let envOrdinal = 0;

  // 1. Accounts — WI-23: emit unified flat `AccountCreated` events (same
  //    shape user-created accounts use via the Cuentas screen). The id
  //    matches `fakeUlid(acc.key)` so `transaction.accountId` continues to
  //    resolve against the same ULIDs.
  for (const acc of ACCOUNTS) {
    events.push({
      type: 'AccountCreated',
      id: fakeUlid(acc.key),
      name: acc.label,
      bankName: acc.bankName,
      label: acc.label,
      color: acc.color,
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: acc.sortOrder,
      createdAt: envelopeIso(envOrdinal++),
    } as DomainEvent);
  }

  // 2. Categories (WI-15-lite flat envelope → configCategories projection).
  //    Each subcategory is a separate SubcategoryCreated event referencing
  //    its parent by id. These are the events every post-PR#15 consumer
  //    (Panel / Movements / Saldo / Configuración) reads through
  //    `listCategories()` → `selectActiveCategories(configCategories)`.
  CATEGORIES.forEach((cat, catIdx) => {
    const catId = fakeUlid(cat.key);
    const catIso = envelopeIso(envOrdinal++);
    events.push({
      type: 'CategoryCreated',
      id: catId,
      name: cat.name,
      kind: cat.type,
      sortOrder: catIdx,
      createdAt: catIso,
    } as DomainEvent);
    cat.subs.forEach((subName, i) => {
      events.push({
        type: 'SubcategoryCreated',
        id: fakeUlid(`${cat.key}S${i}`),
        parentCategoryId: catId,
        name: subName,
        createdAt: envelopeIso(envOrdinal++),
      } as DomainEvent);
    });
  });

  // 3. Tags (WI-15-lite flat envelope → configTags projection).
  TAGS.forEach((tag, tagIdx) => {
    events.push({
      type: 'TagCreated',
      id: fakeUlid(tag.key),
      name: tag.name,
      color: tag.color,
      sortOrder: tagIdx,
      createdAt: envelopeIso(envOrdinal++),
    } as DomainEvent);
  });

  // 4. Transactions — merge curated + backfill, then sort ascending by (date, id)
  //    so envelope createdAt is monotonic (good hygiene; reducers don't require it).
  const backfillTx = generateBackfillTransactions();
  const allTx = [...TRANSACTIONS, ...backfillTx];
  const sorted = allTx.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });

  let txOrdinal = 0;
  for (const tx of sorted) {
    const accountKey = ACCOUNT_BY_SHORT[tx.account];
    const categoryKey = tx.cat === null ? null : (CATEGORY_BY_SHORT[tx.cat] ?? null);
    if (accountKey === undefined) continue; // defensive — won't happen with current seed

    const createdAt = txCreatedAt(tx.date, txOrdinal++);
    events.push({
      id: fakeUlid(`EVT${tx.id.toUpperCase()}`),
      type: 'tx.created',
      datasetId,
      actorDeviceId,
      actorUserId,
      actorIdentitySource: 'local', // P0-1 trial-readiness
      createdAt,
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(`TX${tx.id.toUpperCase()}`),
        date: tx.date,
        type: tx.signedAmount >= 0 ? 'income' : 'expense',
        amount: Math.abs(tx.signedAmount),
        currency: 'EUR',
        description: tx.desc,
        accountId: fakeUlid(accountKey),
        categoryId: categoryKey === null ? null : fakeUlid(categoryKey),
        // Subcategories are embedded in the category payload and keyed by
        // `${category.key}S${index}`. For dev-seed we resolve by name to the
        // matching subcategory id.
        subcategoryId:
          tx.sub === null || categoryKey === null ? null : resolveSubId(categoryKey, tx.sub),
        tagIds: tx.tagIds.map((t) => fakeUlid(TAG_BY_SHORT[t] ?? 'TAGUNK')),
        status: tx.status,
        createdAt,
      },
    } as DomainEvent);
  }

  return events;
}

function resolveSubId(categoryKey: string, subName: string): string | null {
  const cat = CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return null;
  const idx = cat.subs.indexOf(subName);
  if (idx < 0) return null;
  return fakeUlid(`${categoryKey}S${idx}`);
}

// ============================================================================
// Perf-seed builder — Option B for the e2e perf gate.
//
// Mirrors the deterministic structure that scripts/perf-seed.mjs used in its
// pre-SPEC-026 (plaintext NDJSON) life: 5 accounts, 8 categories, 24
// subcategories, 6 tags, and N tx.created events generated through a mulberry32
// PRNG seeded with 0x52657474 ('Rett'). The output is byte-deterministic
// across runs with the same `txCount` and PRNG seed, which is what perf
// benchmarking requires for stable medians.
//
// Why separate from buildDevSeedEvents:
//   - The dev demo seed (TRANSACTIONS + backfill) is curated for UX
//     screenshots and tutorial flows. It must stay untouched so `npm run dev`
//     keeps producing the exact data dev/QA expect to see.
//   - The perf seed is a synthetic blob optimised for volume + determinism
//     against the same WI-23 flat envelope shape the rest of the app consumes.
// ============================================================================

const PERF_PRNG_SEED = 0x52657474; // 'Rett' as hex — must match perf-seed.mjs

interface PerfAccountSeed {
  key: string;
  bankName: string;
  bankNameShort: string;
  label: string;
}

interface PerfCategorySeed {
  key: string;
  name: string;
  type: 'income' | 'expense';
  subs: readonly string[];
}

interface PerfTagSeed {
  key: string;
  name: string;
  color: string;
}

const PERF_ACCOUNTS: readonly PerfAccountSeed[] = [
  { key: 'ACCUNI', bankName: 'Unicaja Banco', bankNameShort: 'Unicaja', label: 'Principal' },
  { key: 'ACCOPS', bankName: 'CaixaBank', bankNameShort: 'Caixa 5315', label: 'Operaciones' },
  { key: 'ACCFIN', bankName: 'CaixaBank', bankNameShort: 'Caixa FinRett', label: 'FinRett' },
  { key: 'ACCEVT', bankName: 'CaixaBank', bankNameShort: 'Caixa 0951', label: 'Eventos' },
  { key: 'ACCPPL', bankName: 'PayPal', bankNameShort: 'PayPal', label: 'Donaciones' },
];

const PERF_CATEGORIES: readonly PerfCategorySeed[] = [
  {
    key: 'CATACT',
    name: 'Actividades',
    type: 'expense',
    subs: ['Talleres', 'Terapias', 'Formación'],
  },
  {
    key: 'CATADM',
    name: 'Administrativo',
    type: 'expense',
    subs: ['Material oficina', 'Servicios profesionales', 'Seguros', 'Comisiones'],
  },
  {
    key: 'CATCUO',
    name: 'Cuotas',
    type: 'income',
    subs: ['Cuota Socio Anual', 'Cuota Socio Mensual', 'Cuota Familia'],
  },
  {
    key: 'CATDON',
    name: 'Donaciones',
    type: 'income',
    subs: ['Individuales', 'Empresas', 'Anónimas'],
  },
  {
    key: 'CATEVT',
    name: 'Eventos',
    type: 'income',
    subs: ['Galas benéficas', 'Mercadillos', 'Carreras solidarias', 'Charlas'],
  },
  {
    key: 'CATGAS',
    name: 'Gastos',
    type: 'expense',
    subs: ['Alquiler', 'Suministros', 'Transporte', 'Comunicación', 'Comisiones'],
  },
  { key: 'CATSUB', name: 'Subvenciones', type: 'income', subs: ['Públicas', 'Privadas'] },
  { key: 'CATTEA', name: 'Teaming', type: 'income', subs: ['Teaming'] },
];

const PERF_TAGS: readonly PerfTagSeed[] = [
  { key: 'TAGRAR', name: 'Día Enfermedades Raras', color: 'oklch(0.78 0.10 330)' },
  { key: 'TAGCAL', name: 'Calendarios 2026', color: 'oklch(0.78 0.10 280)' },
  { key: 'TAGGAL', name: 'Gala Benéfica 2026', color: 'oklch(0.78 0.10 55)' },
  { key: 'TAGRET', name: 'Reto Deportivo', color: 'oklch(0.78 0.10 220)' },
  { key: 'TAGSEM', name: 'Semana Rett', color: 'oklch(0.78 0.10 180)' },
  { key: 'TAGMER', name: 'Mercadillo Solidario', color: 'oklch(0.78 0.10 95)' },
];

const PERF_DESCRIPTIONS: readonly string[] = [
  'Donante',
  'Cuota socio',
  'Cuota familia',
  'Subvención pública',
  'Donación corporativa',
  'Recaudación gala',
  'Recaudación mercadillo',
  'Pago taller',
  'Pago terapia',
  'Recibo alquiler',
  'Recibo suministros',
  'Envío postal',
  'Compra material oficina',
  'Servicio imprenta',
  'Seguro RC',
  'Comisión mantenimiento',
  'Teaming mensual',
];

const PERF_BASE_TS = Date.parse('2026-04-19T08:00:00.000Z');
function perfEnvelopeIso(offsetMinutes: number): string {
  return new Date(PERF_BASE_TS + offsetMinutes * 60_000).toISOString();
}

export interface PerfSeedDeps {
  datasetId: string;
  actorDeviceId: string;
  actorUserId: string;
  txCount: number;
  /**
   * Optional PRNG seed override. Defaults to 0x52657474 ('Rett'). Tests use
   * this to verify determinism across two calls with the same seed.
   */
  prngSeed?: number;
}

/**
 * Build a deterministic event stream for perf benchmarking.
 *
 * Output:
 *   - 5 × AccountCreated
 *   - 8 × CategoryCreated + 24 × SubcategoryCreated
 *   - 6 × TagCreated
 *   - txCount × tx.created  (WI-23 unified flat envelope)
 *
 * Two calls with the same `{ txCount, prngSeed }` produce byte-identical
 * payloads — required for stable medians in `tests/e2e/movements-perf.spec.ts`.
 * The date range walks 2023-01-01 → current month so the "this month" filter
 * always sees data regardless of when CI runs.
 */
export function buildPerfSeedEvents(deps: PerfSeedDeps): DomainEvent[] {
  const { datasetId, actorDeviceId, actorUserId, txCount } = deps;
  if (!Number.isFinite(txCount) || txCount < 0 || !Number.isInteger(txCount)) {
    throw new Error(`[devSeed] buildPerfSeedEvents: invalid txCount=${String(txCount)}`);
  }

  const rng = mulberry32(deps.prngSeed ?? PERF_PRNG_SEED);
  const pickP = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
  const randIntP = (min: number, max: number): number => Math.floor(rng() * (max - min + 1)) + min;

  const events: DomainEvent[] = [];
  let envOrdinal = 0;

  PERF_ACCOUNTS.forEach((acc, sortOrder) => {
    events.push({
      type: 'AccountCreated',
      id: fakeUlid(acc.key),
      name: acc.label,
      bankName: acc.bankName,
      label: acc.label,
      color: 'oklch(0.72 0.11 265)',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder,
      createdAt: perfEnvelopeIso(envOrdinal++),
    } as DomainEvent);
  });

  PERF_CATEGORIES.forEach((cat, catIdx) => {
    const catId = fakeUlid(cat.key);
    events.push({
      type: 'CategoryCreated',
      id: catId,
      name: cat.name,
      kind: cat.type,
      sortOrder: catIdx,
      createdAt: perfEnvelopeIso(envOrdinal++),
    } as DomainEvent);
    cat.subs.forEach((subName, i) => {
      events.push({
        type: 'SubcategoryCreated',
        id: fakeUlid(`${cat.key}S${i}`),
        parentCategoryId: catId,
        name: subName,
        createdAt: perfEnvelopeIso(envOrdinal++),
      } as DomainEvent);
    });
  });

  PERF_TAGS.forEach((tag, tagIdx) => {
    events.push({
      type: 'TagCreated',
      id: fakeUlid(tag.key),
      name: tag.name,
      color: tag.color,
      sortOrder: tagIdx,
      createdAt: perfEnvelopeIso(envOrdinal++),
    } as DomainEvent);
  });

  // Date window — rolls forward so "current month" always has hits.
  const _now = new Date();
  const SEED_END_YEAR = _now.getUTCFullYear();
  const SEED_END_MONTH = _now.getUTCMonth() + 1;
  const SEED_START_YEAR = 2023;

  const randomDateIso = (): string => {
    const year = randIntP(SEED_START_YEAR, SEED_END_YEAR);
    const maxMonth = year === SEED_END_YEAR ? SEED_END_MONTH : 12;
    const month = randIntP(1, maxMonth);
    const maxDay = [4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 28 : 31;
    const day = randIntP(1, maxDay);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  for (let i = 0; i < txCount; i++) {
    const cat = PERF_CATEGORIES[Math.floor(rng() * PERF_CATEGORIES.length)]!;
    const subIdx = Math.floor(rng() * cat.subs.length);
    const acc = PERF_ACCOUNTS[Math.floor(rng() * PERF_ACCOUNTS.length)]!;
    const date = randomDateIso();
    const rawAmount = randIntP(5, 5000) + rng();
    const tagIds: string[] = [];
    if (rng() < 0.12) {
      tagIds.push(fakeUlid(pickP(PERF_TAGS).key));
    }
    const createdAt = txCreatedAt(date, i);
    events.push({
      id: fakeUlid(`EVTTX${String(i).padStart(7, '0')}`),
      type: 'tx.created',
      datasetId,
      actorDeviceId,
      actorUserId,
      actorIdentitySource: 'local',
      createdAt,
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(`TX${String(i).padStart(7, '0')}`),
        date,
        type: cat.type,
        amount: Math.round(rawAmount * 100) / 100,
        currency: 'EUR',
        description: `${pickP(PERF_DESCRIPTIONS)} #${String(i).padStart(5, '0')}`,
        accountId: fakeUlid(acc.key),
        categoryId: fakeUlid(cat.key),
        subcategoryId: fakeUlid(`${cat.key}S${subIdx}`),
        tagIds,
        status: rng() < 0.05 ? 'pending' : 'approved',
        createdAt,
      },
    } as DomainEvent);
  }

  return events;
}
