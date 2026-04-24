#!/usr/bin/env node
// Issue #39 — Phase 1 perf harness.
//
// Writes an NDJSON event log containing:
//   - 5  account.created   events
//   - 8  CategoryCreated   events (flat WI-15-lite envelope)
//   - 24 SubcategoryCreated events
//   - 6  TagCreated        events
//   - N  tx.created        events (configurable; default 2500)
//
// Output format mirrors `app/src/main/devSeed.ts` exactly so the file can be
// consumed by the real bootstrap path (launch with `OT_DATA_DIR=perf-events
// npm run dev` to run the app against the seeded data).
//
// Usage:
//   npm run perf:seed -- --count=5000
//   npm run perf:seed -- --count=10000 --out=/tmp/events.ndjson
//   npm run perf:seed -- --count=2500 --dir=perf-events   (default)
//
// Flags:
//   --count=N   number of tx.created events (default 2500)
//   --out=PATH  explicit output file (takes precedence over --dir)
//   --dir=NAME  plain sub-folder under the Electron userData root
//               (default "perf-events" — NEVER "dev-events" to avoid
//               clobbering the demo seed)
//   --seed=N    PRNG seed (default 0x52657474 / 'Rett') for reproducibility
//
// Exit non-zero on invalid flags or if the output would fall inside the
// default demo-seed folder.
//
// Deterministic: re-running with the same flags produces byte-identical
// output (used by perf-measure.mjs for stable benchmarking).
//
// Gitignored: *.ndjson is already in .gitignore.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── flag parsing ───────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    if (!a.startsWith('--')) return [];
    const [k, v = 'true'] = a.slice(2).split('=');
    return [[k, v]];
  }),
);

const count = Number.parseInt(args.count ?? '2500', 10);
if (!Number.isFinite(count) || count <= 0) {
  console.error(`[perf-seed] invalid --count: ${args.count}`);
  process.exit(1);
}

const prngSeed = Number.parseInt(args.seed ?? '1382115444', 10); // 0x52657474

// ─── resolve output path ────────────────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(resolve(here, '..', 'package.json'), 'utf8'));
const appFolder = pkg.build?.productName ?? pkg.name;

function userDataRoot() {
  switch (platform()) {
    case 'win32':
      return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), appFolder);
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', appFolder);
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), appFolder);
  }
}

let outPath;
if (args.out) {
  outPath = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out);
} else {
  const subdir = (args.dir ?? 'perf-events').trim();
  if (/[\\/]/.test(subdir) || subdir === '..' || subdir === '.') {
    console.error(`[perf-seed] --dir must be a plain folder name (got: ${subdir})`);
    process.exit(1);
  }
  if (subdir === 'dev-events') {
    console.error('[perf-seed] refusing to overwrite the demo-seed folder (dev-events/).');
    console.error('            Pick a different --dir (default is perf-events).');
    process.exit(1);
  }
  outPath = join(userDataRoot(), subdir, 'events.ndjson');
}

// ─── ULID-shape id helper (matches devSeed.fakeUlid) ───────────────────────
function fakeUlid(seedKey) {
  const upper = String(seedKey)
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

// Deterministic PRNG (mulberry32 — same as devSeed.ts L185)
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(prngSeed);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

// ─── seed reference data (shapes mirror devSeed.ts) ─────────────────────────
const DATASET_ID = fakeUlid('DATASET01');
const DEVICE_ID = fakeUlid('DEVICE01');
const BASE_TS = Date.parse('2026-04-19T08:00:00.000Z');
const envelopeIso = (offsetMinutes) => new Date(BASE_TS + offsetMinutes * 60_000).toISOString();

const ACCOUNTS = [
  { key: 'ACCUNI', bankName: 'Unicaja Banco', bankNameShort: 'Unicaja', label: 'Principal' },
  { key: 'ACCOPS', bankName: 'CaixaBank', bankNameShort: 'Caixa 5315', label: 'Operaciones' },
  { key: 'ACCFIN', bankName: 'CaixaBank', bankNameShort: 'Caixa FinRett', label: 'FinRett' },
  { key: 'ACCEVT', bankName: 'CaixaBank', bankNameShort: 'Caixa 0951', label: 'Eventos' },
  { key: 'ACCPPL', bankName: 'PayPal', bankNameShort: 'PayPal', label: 'Donaciones' },
];

const CATEGORIES = [
  { key: 'CATACT', name: 'Actividades', type: 'expense', subs: ['Talleres', 'Terapias', 'Formación'] },
  { key: 'CATADM', name: 'Administrativo', type: 'expense', subs: ['Material oficina', 'Servicios profesionales', 'Seguros', 'Comisiones'] },
  { key: 'CATCUO', name: 'Cuotas', type: 'income', subs: ['Cuota Socio Anual', 'Cuota Socio Mensual', 'Cuota Familia'] },
  { key: 'CATDON', name: 'Donaciones', type: 'income', subs: ['Individuales', 'Empresas', 'Anónimas'] },
  { key: 'CATEVT', name: 'Eventos', type: 'income', subs: ['Galas benéficas', 'Mercadillos', 'Carreras solidarias', 'Charlas'] },
  { key: 'CATGAS', name: 'Gastos', type: 'expense', subs: ['Alquiler', 'Suministros', 'Transporte', 'Comunicación', 'Comisiones'] },
  { key: 'CATSUB', name: 'Subvenciones', type: 'income', subs: ['Públicas', 'Privadas'] },
  { key: 'CATTEA', name: 'Teaming', type: 'income', subs: ['Teaming'] },
];

const TAGS = [
  { key: 'TAGRAR', name: 'Día Enfermedades Raras', color: 'oklch(0.78 0.10 330)' },
  { key: 'TAGCAL', name: 'Calendarios 2026', color: 'oklch(0.78 0.10 280)' },
  { key: 'TAGGAL', name: 'Gala Benéfica 2026', color: 'oklch(0.78 0.10 55)' },
  { key: 'TAGRET', name: 'Reto Deportivo', color: 'oklch(0.78 0.10 220)' },
  { key: 'TAGSEM', name: 'Semana Rett', color: 'oklch(0.78 0.10 180)' },
  { key: 'TAGMER', name: 'Mercadillo Solidario', color: 'oklch(0.78 0.10 95)' },
];

// ─── build events ───────────────────────────────────────────────────────────
const events = [];
let envOrdinal = 0;

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
      color: 'oklch(0.72 0.11 265)',
      sortOrder: ACCOUNTS.indexOf(acc),
      isActive: true,
      createdAt: envelopeIso(envOrdinal),
    },
  });
}

for (const cat of CATEGORIES) {
  const catId = fakeUlid(cat.key);
  events.push({
    type: 'CategoryCreated',
    id: catId,
    name: cat.name,
    kind: cat.type,
    createdAt: envelopeIso(envOrdinal++),
  });
  cat.subs.forEach((subName, i) => {
    events.push({
      type: 'SubcategoryCreated',
      id: fakeUlid(`${cat.key}S${i}`),
      parentCategoryId: catId,
      name: subName,
      createdAt: envelopeIso(envOrdinal++),
    });
  });
}

for (const tag of TAGS) {
  events.push({
    type: 'TagCreated',
    id: fakeUlid(tag.key),
    name: tag.name,
    color: tag.color,
    createdAt: envelopeIso(envOrdinal++),
  });
}

// ─── transactions ──────────────────────────────────────────────────────────
// Spread across 2023-01-01 .. 2026-04-30 (~40 months). For N=10k, ~250/month.
function randomDateIso() {
  const year = randInt(2023, 2026);
  const maxMonth = year === 2026 ? 4 : 12;
  const month = randInt(1, maxMonth);
  const maxDay = [4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 28 : 31;
  const day = randInt(1, maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const DESCRIPTIONS = [
  'Donante', 'Cuota socio', 'Cuota familia', 'Subvención pública',
  'Donación corporativa', 'Recaudación gala', 'Recaudación mercadillo',
  'Pago taller', 'Pago terapia', 'Recibo alquiler', 'Recibo suministros',
  'Envío postal', 'Compra material oficina', 'Servicio imprenta',
  'Seguro RC', 'Comisión mantenimiento', 'Teaming mensual',
];

for (let i = 0; i < count; i++) {
  const catIdx = Math.floor(rng() * CATEGORIES.length);
  const cat = CATEGORIES[catIdx];
  const subIdx = Math.floor(rng() * cat.subs.length);
  const accIdx = Math.floor(rng() * ACCOUNTS.length);
  const acc = ACCOUNTS[accIdx];
  const date = randomDateIso();
  const rawAmount = randInt(5, 5000) + rng();
  const type = cat.type;
  const tagCount = rng() < 0.12 ? 1 : 0;
  const tagIds = [];
  if (tagCount > 0) {
    tagIds.push(fakeUlid(pick(TAGS).key));
  }
  const createdAt = `${date}T12:00:${String(i % 60).padStart(2, '0')}.000Z`;
  events.push({
    id: fakeUlid(`EVTTX${String(i).padStart(7, '0')}`),
    type: 'tx.created',
    datasetId: DATASET_ID,
    actorDeviceId: DEVICE_ID,
    createdAt,
    dekVersion: 0,
    version: 1,
    payload: {
      id: fakeUlid(`TX${String(i).padStart(7, '0')}`),
      date,
      type,
      amount: Math.round(rawAmount * 100) / 100,
      currency: 'EUR',
      description: `${pick(DESCRIPTIONS)} #${String(i).padStart(5, '0')}`,
      accountId: fakeUlid(acc.key),
      categoryId: fakeUlid(cat.key),
      subcategoryId: fakeUlid(`${cat.key}S${subIdx}`),
      tagIds,
      status: rng() < 0.05 ? 'pending' : 'approved',
      createdAt,
    },
  });
}

// ─── write ──────────────────────────────────────────────────────────────────
await mkdir(dirname(outPath), { recursive: true });
const ndjson = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
await writeFile(outPath, ndjson, { encoding: 'utf8' });

console.log(
  `[perf-seed] wrote ${events.length} events (${count} tx + ${events.length - count} ref-data) → ${outPath}`,
);
console.log(`[perf-seed] file size: ${(ndjson.length / 1024).toFixed(1)} KiB`);
