#!/usr/bin/env node
// SPEC-026 Option B — orchestrate Electron to produce an encrypted perf workspace
// (default `--dir` mode), with a legacy plaintext-NDJSON emit retained behind
// `--out=<path>` for the load-replay smoke test and `scripts/perf-measure.ts`.
//
// Why the dual mode?
//   - `--dir` mode (used by tests/e2e/movements-perf.spec.ts) needs a real
//     encrypted workspace because workspace:detect no longer accepts legacy
//     plaintext NDJSON (SPEC-026 cleanup, decision D2, 2026-05-13). It spawns
//     Electron with OT_HEADLESS_SEED=1 so the renderer can silent-unlock on
//     the next launch via safeStorage.
//   - `--out=<absolute>` mode (used by event-log-smoke.test.ts and
//     scripts/perf-measure.ts) is a pure-Node NDJSON emitter that doesn't
//     touch Electron. It only exists to validate the WI-23 envelope shape
//     against JsonFileEventLog.load() and to drive perf microbenchmarks — both
//     consumers explicitly want the legacy plaintext format.
//
// Contract:
//   npm run perf:seed -- --count=5000                       # spawns Electron
//   npm run perf:seed -- --count=2500 --dir=perf-events     # spawns Electron
//   npm run perf:seed -- --count=100 --out=/abs/path.ndjson # plaintext only

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

// ─── shared helpers ─────────────────────────────────────────────────────────
function fakeUlid(seedKey) {
  const upper = String(seedKey)
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(26)).slice(0, 26);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
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

// ─── --out path: legacy plaintext NDJSON emitter ────────────────────────────
// Mirrors the WI-23 unified flat envelope shape so JsonFileEventLog.load() and
// the WI-23 boot-guard accept it. Used ONLY by the load-replay smoke test and
// perf-measure.ts — production paths take the --dir branch below.
if (args.out) {
  const outPath = isAbsolute(args.out) ? args.out : resolve(process.cwd(), args.out);

  const mulberry32 = (seed) => {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rng = mulberry32(prngSeed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

  const DATASET_ID = fakeUlid('DATASET01');
  const DEVICE_ID = fakeUlid('DEVICE01');
  const USER_ID = fakeUlid('PERFUSER01');
  const BASE_TS = Date.parse('2026-04-19T08:00:00.000Z');
  const envelopeIso = (offsetMinutes) => new Date(BASE_TS + offsetMinutes * 60_000).toISOString();

  const ACCOUNTS = [
    { key: 'ACCUNI', bankName: 'Unicaja Banco', label: 'Principal' },
    { key: 'ACCOPS', bankName: 'CaixaBank', label: 'Operaciones' },
    { key: 'ACCFIN', bankName: 'CaixaBank', label: 'FinRett' },
    { key: 'ACCEVT', bankName: 'CaixaBank', label: 'Eventos' },
    { key: 'ACCPPL', bankName: 'PayPal', label: 'Donaciones' },
  ];
  const CATEGORIES = [
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
  const TAGS = [
    { key: 'TAGRAR', name: 'Día Enfermedades Raras', color: 'oklch(0.78 0.10 330)' },
    { key: 'TAGCAL', name: 'Calendarios 2026', color: 'oklch(0.78 0.10 280)' },
    { key: 'TAGGAL', name: 'Gala Benéfica 2026', color: 'oklch(0.78 0.10 55)' },
    { key: 'TAGRET', name: 'Reto Deportivo', color: 'oklch(0.78 0.10 220)' },
    { key: 'TAGSEM', name: 'Semana Rett', color: 'oklch(0.78 0.10 180)' },
    { key: 'TAGMER', name: 'Mercadillo Solidario', color: 'oklch(0.78 0.10 95)' },
  ];
  const DESCRIPTIONS = [
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

  const events = [];
  let envOrdinal = 0;
  ACCOUNTS.forEach((acc, sortOrder) => {
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
      createdAt: envelopeIso(envOrdinal++),
    });
  });
  CATEGORIES.forEach((cat, catIdx) => {
    const catId = fakeUlid(cat.key);
    events.push({
      type: 'CategoryCreated',
      id: catId,
      name: cat.name,
      kind: cat.type,
      sortOrder: catIdx,
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
  });
  TAGS.forEach((tag, tagIdx) => {
    events.push({
      type: 'TagCreated',
      id: fakeUlid(tag.key),
      name: tag.name,
      color: tag.color,
      sortOrder: tagIdx,
      createdAt: envelopeIso(envOrdinal++),
    });
  });

  const _now = new Date();
  const SEED_END_YEAR = _now.getUTCFullYear();
  const SEED_END_MONTH = _now.getUTCMonth() + 1;
  const SEED_START_YEAR = 2023;
  const randomDateIso = () => {
    const year = randInt(SEED_START_YEAR, SEED_END_YEAR);
    const maxMonth = year === SEED_END_YEAR ? SEED_END_MONTH : 12;
    const month = randInt(1, maxMonth);
    const maxDay = [4, 6, 9, 11].includes(month) ? 30 : month === 2 ? 28 : 31;
    const day = randInt(1, maxDay);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  for (let i = 0; i < count; i++) {
    const cat = CATEGORIES[Math.floor(rng() * CATEGORIES.length)];
    const subIdx = Math.floor(rng() * cat.subs.length);
    const acc = ACCOUNTS[Math.floor(rng() * ACCOUNTS.length)];
    const date = randomDateIso();
    const rawAmount = randInt(5, 5000) + rng();
    const tagIds = [];
    if (rng() < 0.12) tagIds.push(fakeUlid(pick(TAGS).key));
    const createdAt = `${date}T12:00:${String(i % 60).padStart(2, '0')}.000Z`;
    events.push({
      id: fakeUlid(`EVTTX${String(i).padStart(7, '0')}`),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      actorUserId: USER_ID,
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

  await mkdir(dirname(outPath), { recursive: true });
  const ndjson = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await writeFile(outPath, ndjson, { encoding: 'utf8' });
  console.log(
    `[perf-seed] (plaintext) wrote ${events.length} events (${count} tx + ${events.length - count} ref-data) → ${outPath}`,
  );
  process.exit(0);
}

// ─── --dir path: spawn Electron to produce an encrypted workspace ───────────
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

const udRoot = userDataRoot();
const dataDir = join(udRoot, subdir);

// 1. write app-config.json + (best-effort) profile.json so the next Electron
//    launch resolves the seeded folder AND AppShell renders the sidebar
//    instead of the ProfileSetupModal.
await mkdir(udRoot, { recursive: true });

const appConfigPath = join(udRoot, 'app-config.json');
const appConfig = { version: 1, dataDir, readOnly: false };
await writeFile(appConfigPath, JSON.stringify(appConfig, null, 2), { encoding: 'utf8' });
console.log(`[perf-seed] wrote app-config.json → ${appConfigPath}`);

const profilePath = join(udRoot, 'profile.json');
let profileExists = false;
try {
  await readFile(profilePath, 'utf8');
  profileExists = true;
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
if (!profileExists) {
  const seedProfile = {
    userId: fakeUlid('PERFUSER01'),
    name: 'Perf Tester',
    role: 'Treasurer',
    ngoName: 'OpenTreasury Perf',
    identitySource: 'local',
    createdAt: '2024-01-01T00:00:00.000Z',
  };
  await writeFile(profilePath, JSON.stringify(seedProfile, null, 2), { encoding: 'utf8' });
  console.log(`[perf-seed] wrote profile.json → ${profilePath}`);
}

// 2. wipe stale artifacts so reseeds are idempotent.
await mkdir(dataDir, { recursive: true });
const stale = [];
for (const name of readdirSync(dataDir)) {
  if (
    name === 'events.ndjson' ||
    name === 'events.key' ||
    /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/.test(name) ||
    name === 'dataset.json'
  ) {
    stale.push(name);
  }
}
for (const name of stale) {
  await rm(join(dataDir, name), { force: true });
}
if (stale.length > 0) {
  console.log(`[perf-seed] cleared ${stale.length} stale artifact(s) at ${dataDir}`);
}

// 3. spawn Electron in headless-seed mode. The `electron` npm package's
// default export is the absolute path to the platform's Electron binary.
const electronBin = require('electron');
if (typeof electronBin !== 'string') {
  console.error('[perf-seed] could not resolve Electron binary path');
  process.exit(1);
}

console.log(`[perf-seed] spawning Electron headless seed (count=${count}, dir=${subdir})…`);
// Chromium switches must be on the actual command line — appending them via
// app.commandLine.appendSwitch from JS happens after some early init paths,
// and on Linux that's too late for the safeStorage backend selection.
//
// `--no-sandbox` is required on GitHub Actions Ubuntu runners where Electron's
// SUID chrome-sandbox helper is not configured (it isn't owned by root with
// mode 4755). Safe here because this process renders nothing — no untrusted
// content is loaded; we only run the main process to write encrypted seed
// files and exit. Honors OT_PERF_SEED_NO_SANDBOX=0 to opt out for local debug.
//
// `--password-store=basic` forces Electron's safeStorage to use its built-in
// fallback cipher instead of trying to talk to libsecret / kwallet via DBus.
// Required on headless Linux CI where there's no working keyring; controlled
// by OT_PASSWORD_STORE (default 'basic' under CI, unset locally).
const electronArgs = ['.'];
const passwordStore = process.env.OT_PASSWORD_STORE ?? (process.env.CI ? 'basic' : '');
if (passwordStore) {
  electronArgs.unshift(`--password-store=${passwordStore}`);
}
if (process.env.OT_PERF_SEED_NO_SANDBOX !== '0') {
  electronArgs.unshift('--no-sandbox');
}
const result = spawnSync(electronBin, electronArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    OT_HEADLESS_SEED: '1',
    OT_HEADLESS_SEED_TX_COUNT: String(count),
    OT_DATA_DIR: subdir,
    OT_SEED: 'none',
    // Mirror the CLI switch into the env so app/src/main/index.ts can log
    // which backend is active for debugging (the CLI flag wins regardless).
    OT_PASSWORD_STORE: passwordStore,
  },
});

if (result.status !== 0) {
  console.error(`[perf-seed] Electron exited with status=${result.status} signal=${result.signal}`);
  process.exit(typeof result.status === 'number' && result.status !== 0 ? result.status : 1);
}

// 4. verify on-disk artifacts.
const after = readdirSync(dataDir);
const hasKey = after.includes('events.key');
const hasDeviceLog = after.some((f) => /^events-[0-9A-HJKMNP-TV-Z]{26}\.ndjson$/.test(f));
if (!hasKey || !hasDeviceLog) {
  console.error(
    `[perf-seed] post-seed verification failed at ${dataDir} ` +
      `(events.key=${hasKey}, deviceLog=${hasDeviceLog})`,
  );
  process.exit(1);
}
if (existsSync(join(dataDir, 'events.ndjson'))) {
  console.error(`[perf-seed] unexpected legacy events.ndjson at ${dataDir}`);
  process.exit(1);
}

console.log(`[perf-seed] OK — encrypted workspace ready at ${dataDir}`);
