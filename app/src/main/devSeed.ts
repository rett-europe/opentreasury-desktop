// WI-4′ — dev-only seed events that mirror prototype/data.js in shape.
//
// Gating lives in bootstrap.ts (only seeded when events.ndjson is empty AND
// NODE_ENV !== 'production'). This module is pure data + event-shaping.
//
// IDs use a deterministic "fake ULID" scheme (prefix padded with zeros to the
// 26-char length required by the event envelope schema). This keeps seed
// runs reproducible across restarts while still satisfying z.string().length(26).
// Real production data will use crypto-random ULIDs (ADR-001 C11).

import type { DomainEvent } from '../core/eventLog/index.js';

// Crockford base32 (ULID alphabet) excludes I, L, O, U. For seed we only need
// length compliance; we uppercase, strip anything not in the alphabet, and
// right-pad with '0'.
function fakeUlid(seedKey: string): string {
  const upper = seedKey.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

const DATASET_ID = fakeUlid('DATASET01');
const DEVICE_ID = fakeUlid('DEVICE01');

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

function txCreatedAt(date: string, ordinal: number): string {
  // Spread within the day so sort-by-createdAt DESC mirrors the seed order.
  // Seconds encode the ordinal (0..59 safe for 30 rows).
  return `${date}T12:00:${String(ordinal).padStart(2, '0')}.000Z`;
}

export function buildDevSeedEvents(): DomainEvent[] {
  const events: DomainEvent[] = [];
  let envOrdinal = 0;

  // 1. Accounts
  for (const acc of ACCOUNTS) {
    events.push({
      id: fakeUlid(`EVTACC${acc.key}`),
      type: 'account.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: envelopeIso(envOrdinal++),
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(acc.key),
        bankName: acc.bankName,
        bankNameShort: acc.bankNameShort,
        accountLabel: acc.label,
        color: acc.color,
        sortOrder: acc.sortOrder,
        isActive: true,
        createdAt: envelopeIso(envOrdinal),
      },
    } as DomainEvent);
  }

  // 2. Categories (with embedded subcategories)
  for (const cat of CATEGORIES) {
    events.push({
      id: fakeUlid(`EVTCAT${cat.key}`),
      type: 'category.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: envelopeIso(envOrdinal++),
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(cat.key),
        name: cat.name,
        description: null,
        categoryType: cat.type,
        sortOrder: 0,
        isActive: true,
        subcategories: cat.subs.map((name, i) => ({
          id: fakeUlid(`${cat.key}S${i}`),
          name,
          isActive: true,
        })),
        createdAt: envelopeIso(envOrdinal),
      },
    } as DomainEvent);
  }

  // 3. Tags
  for (const tag of TAGS) {
    events.push({
      id: fakeUlid(`EVTTAG${tag.key}`),
      type: 'tag.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: envelopeIso(envOrdinal++),
      dekVersion: 0,
      version: 1,
      payload: {
        id: fakeUlid(tag.key),
        name: tag.name,
        color: tag.color,
        sortOrder: 0,
        isActive: true,
        createdAt: envelopeIso(envOrdinal),
      },
    } as DomainEvent);
  }

  // 4. Transactions — sort ascending by (date, id) so envelope createdAt is
  //    monotonic (good hygiene; reducers don't require it).
  const sorted = [...TRANSACTIONS].sort((a, b) => {
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
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
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
