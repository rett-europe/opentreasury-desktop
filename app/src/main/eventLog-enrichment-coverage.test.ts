// SPEC-028 WI-1 (Tier 0) — Full-union attribution coverage test.
//
// Guarantees the append-time enrichment choke-point makes the event log a
// complete who/what/when ledger for EVERY DomainEvent variant. The test has
// two teeth:
//
//   1. Runtime exhaustiveness guard (the CI break). The set of event `type`
//      literals is discovered at runtime from the Zod schemas in
//      `core/events/schemas` (every exported ZodObject whose `type` field is a
//      literal). The SAMPLES table must cover that set EXACTLY. When a new
//      event variant + schema is added but no sample (and therefore no
//      attribution coverage proof) is provided, this assertion fails — so
//      `npm test` breaks in CI. A runtime guard is required because `*.test.ts`
//      is excluded from `tsc -b` and vitest transpiles without type-checking,
//      so a compile-time-only guard would never run in CI.
//
//   2. Per-variant enrichment proof. Each sample is appended through the real
//      `createEnrichingEventLog` wrapper (the same factory bootstrap wires into
//      `getEventLog()`) over an in-memory capture log, with a VALID identity
//      provider and a fixed clock. The persisted event must satisfy the strict
//      `eventHasAttribution` predicate (26-char actor/device/dataset ids, a
//      valid identitySource enum, a parseable ISO createdAt). Covers both the
//      `append` and `appendBatch` paths.
//
// The compile-time `SampleMap` annotation is kept as belt-and-suspenders dev
// ergonomics, but the runtime guard above is what actually fails CI.

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as eventSchemas from '../core/events/schemas.js';
import type { DomainEvent, EventLog } from '../core/eventLog/EventLog.js';
import { eventHasAttribution, PROFILE_PENDING_USER_ID, type EventAttribution } from '../core/eventLog/enrichEvent.js';
import { createEnrichingEventLog } from './eventLog-enrichment-wrapper.js';

// --- Fixtures ---------------------------------------------------------------

/** Deterministic 26-char ULID-shaped id from a short seed. */
function u(seed: string): string {
  return (seed + 'X'.repeat(26)).slice(0, 26);
}

const DAY = '2026-02-03';
/** Clock injected into the wrapper — fills `createdAt` on events that lack it. */
const CLOCK_ISO = '2026-02-03T04:05:06.000Z';
/** A timestamp an event carries itself (must be preserved, never overwritten). */
const EVT_ISO = '2026-01-15T10:00:00.000Z';

/** Valid identity provider — real 26-char ids so `eventHasAttribution` passes. */
const ATTRIBUTION: EventAttribution = {
  actorUserId: u('provider-user'),
  actorDeviceId: u('provider-device'),
  actorIdentitySource: 'local',
  datasetId: u('provider-dataset'),
};

const fixedClock = (): Date => new Date(CLOCK_ISO);

function makeCaptureLog(): { eventLog: EventLog; appended: DomainEvent[] } {
  const appended: DomainEvent[] = [];
  return {
    appended,
    eventLog: {
      append: async (event) => {
        appended.push(event);
      },
      appendBatch: async (events) => {
        appended.push(...events);
      },
      load: async () => [...appended],
    },
  };
}

// --- Sample table: one valid event per DomainEvent variant -------------------

// Mapped type forces a sample whose value matches its key's variant. (Compile-
// time only; the runtime guard below is the CI-enforced exhaustiveness check.)
type SampleMap = { [K in DomainEvent['type']]: Extract<DomainEvent, { type: K }> };

// Enveloped events carry their OWN distinct attribution so the no-overwrite
// assertion can prove enrichment preserves pre-existing values.
const OWN = {
  actorUserId: u('own-user'),
  actorDeviceId: u('own-device'),
  datasetId: u('own-dataset'),
  actorIdentitySource: 'aad' as const,
};

const SAMPLES: SampleMap = {
  'tx.created': {
    id: u('evt-txc'),
    type: 'tx.created',
    datasetId: OWN.datasetId,
    actorDeviceId: OWN.actorDeviceId,
    actorUserId: OWN.actorUserId,
    actorIdentitySource: OWN.actorIdentitySource,
    createdAt: EVT_ISO,
    dekVersion: 1,
    version: 1,
    payload: {
      id: u('tx'),
      date: DAY,
      type: 'expense',
      amount: 12.5,
      currency: 'EUR',
      description: 'sample',
      accountId: u('acc'),
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'approved',
      createdAt: EVT_ISO,
    },
  },
  'account.created': {
    id: u('evt-acc'),
    type: 'account.created',
    datasetId: OWN.datasetId,
    actorDeviceId: OWN.actorDeviceId,
    actorUserId: OWN.actorUserId,
    actorIdentitySource: OWN.actorIdentitySource,
    createdAt: EVT_ISO,
    dekVersion: 1,
    version: 1,
    payload: {
      id: u('acc'),
      bankName: 'Bank',
      bankNameShort: null,
      accountLabel: 'Checking',
      color: null,
      sortOrder: 0,
      isActive: true,
      createdAt: EVT_ISO,
    },
  },
  'category.created': {
    id: u('evt-cat'),
    type: 'category.created',
    datasetId: OWN.datasetId,
    actorDeviceId: OWN.actorDeviceId,
    actorUserId: OWN.actorUserId,
    actorIdentitySource: OWN.actorIdentitySource,
    createdAt: EVT_ISO,
    dekVersion: 1,
    version: 1,
    payload: {
      id: u('cat'),
      name: 'Groceries',
      description: null,
      categoryType: 'expense',
      sortOrder: 0,
      isActive: true,
      subcategories: [],
      createdAt: EVT_ISO,
    },
  },
  'tag.created': {
    id: u('evt-tag'),
    type: 'tag.created',
    datasetId: OWN.datasetId,
    actorDeviceId: OWN.actorDeviceId,
    actorUserId: OWN.actorUserId,
    actorIdentitySource: OWN.actorIdentitySource,
    createdAt: EVT_ISO,
    dekVersion: 1,
    version: 1,
    payload: {
      id: u('tag'),
      name: 'Urgent',
      color: null,
      sortOrder: 0,
      isActive: true,
      createdAt: EVT_ISO,
    },
  },
  AccountCreated: {
    type: 'AccountCreated',
    id: u('cfg-acc-c'),
    name: 'Account',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: 0,
    createdAt: EVT_ISO,
  },
  AccountUpdated: {
    type: 'AccountUpdated',
    id: u('cfg-acc-u'),
    accountId: u('acc'),
    changes: { name: 'Renamed' },
    updatedAt: EVT_ISO,
  },
  AccountArchived: {
    type: 'AccountArchived',
    id: u('cfg-acc-a'),
    accountId: u('acc'),
    archivedAt: EVT_ISO,
  },
  AccountUnarchived: {
    type: 'AccountUnarchived',
    id: u('cfg-acc-ua'),
    accountId: u('acc'),
    unarchivedAt: EVT_ISO,
  },
  CategoryCreated: {
    type: 'CategoryCreated',
    id: u('cfg-cat-c'),
    name: 'Category',
    sortOrder: 0,
    createdAt: EVT_ISO,
  },
  CategoryUpdated: {
    type: 'CategoryUpdated',
    id: u('cfg-cat-u'),
    categoryId: u('cat'),
    changes: { name: 'Renamed' },
    updatedAt: EVT_ISO,
  },
  CategoryArchived: {
    type: 'CategoryArchived',
    id: u('cfg-cat-a'),
    categoryId: u('cat'),
    archivedAt: EVT_ISO,
  },
  CategoryUnarchived: {
    type: 'CategoryUnarchived',
    id: u('cfg-cat-ua'),
    categoryId: u('cat'),
    unarchivedAt: EVT_ISO,
  },
  SubcategoryCreated: {
    type: 'SubcategoryCreated',
    id: u('cfg-sub-c'),
    parentCategoryId: u('cat'),
    name: 'Subcategory',
    createdAt: EVT_ISO,
  },
  SubcategoryUpdated: {
    type: 'SubcategoryUpdated',
    id: u('cfg-sub-u'),
    subcategoryId: u('sub'),
    parentCategoryId: u('cat'),
    changes: { name: 'Renamed' },
    updatedAt: EVT_ISO,
  },
  SubcategoryArchived: {
    type: 'SubcategoryArchived',
    id: u('cfg-sub-a'),
    subcategoryId: u('sub'),
    parentCategoryId: u('cat'),
    archivedAt: EVT_ISO,
  },
  SubcategoryUnarchived: {
    type: 'SubcategoryUnarchived',
    id: u('cfg-sub-ua'),
    subcategoryId: u('sub'),
    parentCategoryId: u('cat'),
    unarchivedAt: EVT_ISO,
  },
  TagCreated: {
    type: 'TagCreated',
    id: u('cfg-tag-c'),
    name: 'Tag',
    sortOrder: 0,
    createdAt: EVT_ISO,
  },
  TagUpdated: {
    type: 'TagUpdated',
    id: u('cfg-tag-u'),
    tagId: u('tag'),
    changes: { name: 'Renamed' },
    updatedAt: EVT_ISO,
  },
  TagArchived: {
    type: 'TagArchived',
    id: u('cfg-tag-a'),
    tagId: u('tag'),
    archivedAt: EVT_ISO,
  },
  TagUnarchived: {
    type: 'TagUnarchived',
    id: u('cfg-tag-ua'),
    tagId: u('tag'),
    unarchivedAt: EVT_ISO,
  },
  AccountDeleted: {
    type: 'AccountDeleted',
    id: u('cfg-acc-d'),
    accountId: u('acc'),
    deletedAt: EVT_ISO,
  },
  CategoryDeleted: {
    type: 'CategoryDeleted',
    id: u('cfg-cat-d'),
    categoryId: u('cat'),
    deletedAt: EVT_ISO,
  },
  SubcategoryDeleted: {
    type: 'SubcategoryDeleted',
    id: u('cfg-sub-d'),
    subcategoryId: u('sub'),
    parentCategoryId: u('cat'),
    deletedAt: EVT_ISO,
  },
  TagDeleted: {
    type: 'TagDeleted',
    id: u('cfg-tag-d'),
    tagId: u('tag'),
    deletedAt: EVT_ISO,
  },
  'movement.imported': {
    type: 'movement.imported',
    id: u('mov'),
    date: DAY,
    movementType: 'income',
    amount: 100,
    currency: 'EUR',
    description: 'import',
    accountId: u('acc'),
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'pending',
    createdAt: EVT_ISO,
    rowHash: '0123456789abcdef',
    sourceFileName: 'import.csv',
    importBatchId: u('batch'),
    rowIndex: 1,
  },
  'import.mapping.updated': {
    type: 'import.mapping.updated',
    id: u('map'),
    accountId: u('acc'),
    dateColumn: 'Date',
    amountColumn: 'Amount',
    descriptionColumn: 'Description',
    updatedAt: EVT_ISO,
  },
  'tx.note.added': {
    type: 'tx.note.added',
    id: u('note-a'),
    noteId: u('note'),
    txId: u('tx'),
    text: 'a note',
    createdAt: EVT_ISO,
  },
  'tx.note.edited': {
    type: 'tx.note.edited',
    id: u('note-e'),
    noteId: u('note'),
    txId: u('tx'),
    text: 'edited note',
    editedAt: EVT_ISO,
  },
  'tx.note.deleted': {
    type: 'tx.note.deleted',
    id: u('note-d'),
    noteId: u('note'),
    txId: u('tx'),
    deletedAt: EVT_ISO,
  },
  'tx.updated': {
    id: u('evt-txu'),
    type: 'tx.updated',
    datasetId: OWN.datasetId,
    actorDeviceId: OWN.actorDeviceId,
    actorUserId: OWN.actorUserId,
    actorIdentitySource: OWN.actorIdentitySource,
    createdAt: EVT_ISO,
    dekVersion: 1,
    version: 1,
    payload: {
      id: u('tx'),
      date: DAY,
      type: 'expense',
      amount: 12.5,
      currency: 'EUR',
      description: 'updated',
      accountId: u('acc'),
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'approved',
      createdAt: EVT_ISO,
      updatedAt: EVT_ISO,
    },
  },
  'tx.deleted': {
    type: 'tx.deleted',
    id: u('evt-txd'),
    txId: u('tx'),
    deletedAt: EVT_ISO,
    datasetId: OWN.datasetId,
    actorDeviceId: OWN.actorDeviceId,
    actorUserId: OWN.actorUserId,
    actorIdentitySource: OWN.actorIdentitySource,
    dekVersion: 1,
    version: 1,
  },
  'tx.split': {
    type: 'tx.split',
    id: u('split'),
    parentTxId: u('tx'),
    splits: [
      {
        splitId: u('split-1'),
        amountCents: 30000,
        categoryId: null,
        subcategoryId: null,
        comment: null,
        sortOrder: 0,
      },
      {
        splitId: u('split-2'),
        amountCents: 20000,
        categoryId: null,
        subcategoryId: null,
        comment: null,
        sortOrder: 1,
      },
    ],
    createdAt: EVT_ISO,
  },
  'tx.split.removed': {
    type: 'tx.split.removed',
    id: u('split-rm'),
    parentTxId: u('tx'),
    removedAt: EVT_ISO,
  },
};

// --- Runtime exhaustiveness guard (the CI break) ----------------------------

/**
 * Discover every event `type` literal at runtime from the Zod schemas: every
 * exported ZodObject whose `type` field is a ZodLiteral. Auto-includes any new
 * `*EventSchema` so adding a variant without a SAMPLES entry fails CI here.
 */
function discoverEventTypeLiterals(): Set<string> {
  const types = new Set<string>();
  for (const value of Object.values(eventSchemas)) {
    if (!(value instanceof z.ZodObject)) continue;
    const shape = value.shape as Record<string, unknown>;
    const typeField = shape['type'];
    if (typeField instanceof z.ZodLiteral && typeof typeField.value === 'string') {
      types.add(typeField.value);
    }
  }
  return types;
}

describe('SPEC-028 WI-1 — append-time attribution coverage', () => {
  it('SAMPLES covers every DomainEvent variant exactly (runtime exhaustiveness)', () => {
    const expected = discoverEventTypeLiterals();
    const covered = new Set(Object.keys(SAMPLES));

    // Sanity: discovery found a non-trivial number of variants.
    expect(expected.size).toBeGreaterThanOrEqual(33);

    const missing = [...expected].filter((t) => !covered.has(t)).sort();
    const extra = [...covered].filter((t) => !expected.has(t)).sort();

    expect(
      missing,
      `New event variant(s) lack an attribution-coverage sample. Add a SAMPLES entry ` +
        `for each so the choke-point's who/what/when stamping is proven: ${missing.join(', ')}`,
    ).toEqual([]);
    expect(extra, `SAMPLES has entries for unknown event type(s): ${extra.join(', ')}`).toEqual([]);
  });

  const sampleEntries = Object.entries(SAMPLES) as Array<[string, DomainEvent]>;

  it.each(sampleEntries)(
    'enriches "%s" with a complete who/what/when envelope via append()',
    async (type, sample) => {
      const { eventLog, appended } = makeCaptureLog();
      const enriching = createEnrichingEventLog(eventLog, () => ATTRIBUTION, fixedClock);

      await enriching.append(sample);

      expect(appended).toHaveLength(1);
      const persisted = appended[0];
      expect(persisted).toBeDefined();
      expect(persisted!.type).toBe(type);
      expect(eventHasAttribution(persisted!)).toBe(true);
    },
  );

  it('enriches every variant through the appendBatch() path', async () => {
    const { eventLog, appended } = makeCaptureLog();
    const enriching = createEnrichingEventLog(eventLog, () => ATTRIBUTION, fixedClock);

    const all = Object.values(SAMPLES) as DomainEvent[];
    await enriching.appendBatch(all);

    expect(appended).toHaveLength(all.length);
    for (const persisted of appended) {
      expect(eventHasAttribution(persisted)).toBe(true);
    }
  });

  it('fills createdAt = append time on events that carry only their own timestamp', async () => {
    const { eventLog, appended } = makeCaptureLog();
    const enriching = createEnrichingEventLog(eventLog, () => ATTRIBUTION, fixedClock);

    await enriching.append(SAMPLES.TagDeleted);

    const persisted = appended[0] as unknown as Record<string, unknown>;
    expect(persisted['createdAt']).toBe(CLOCK_ISO);
    expect(persisted['actorUserId']).toBe(ATTRIBUTION.actorUserId);
    expect(persisted['actorDeviceId']).toBe(ATTRIBUTION.actorDeviceId);
    expect(persisted['datasetId']).toBe(ATTRIBUTION.datasetId);
    expect(persisted['actorIdentitySource']).toBe(ATTRIBUTION.actorIdentitySource);
    // The event's own deletedAt is untouched.
    expect(persisted['deletedAt']).toBe(EVT_ISO);
  });

  it('never overwrites attribution an event already carries', async () => {
    const { eventLog, appended } = makeCaptureLog();
    const enriching = createEnrichingEventLog(eventLog, () => ATTRIBUTION, fixedClock);

    await enriching.append(SAMPLES['tx.created']);

    const persisted = appended[0] as unknown as Record<string, unknown>;
    expect(persisted['actorUserId']).toBe(OWN.actorUserId);
    expect(persisted['actorDeviceId']).toBe(OWN.actorDeviceId);
    expect(persisted['datasetId']).toBe(OWN.datasetId);
    expect(persisted['actorIdentitySource']).toBe(OWN.actorIdentitySource);
    // Its own createdAt survives — not replaced by the injected clock.
    expect(persisted['createdAt']).toBe(EVT_ISO);
    expect(persisted['actorUserId']).not.toBe(ATTRIBUTION.actorUserId);
  });

  // Reproduces the exact composition bootstrap.getEventLog() uses: an enriching
  // wrapper over a lazily-delegating inner that resolves the live event-log
  // instance per call. Proves enrichment still applies after the post-unlock
  // installEncryptedEventLog() instance swap.
  it('keeps enriching after the underlying event-log instance is swapped', async () => {
    let current = makeCaptureLog();
    const delegatingInner: EventLog = {
      append: (event) => current.eventLog.append(event),
      appendBatch: (events) => current.eventLog.appendBatch(events),
      load: () => current.eventLog.load(),
    };
    const enriching = createEnrichingEventLog(delegatingInner, () => ATTRIBUTION, fixedClock);

    // Swap the instance the delegator resolves (mirrors installEncryptedEventLog).
    const swapped = makeCaptureLog();
    current = swapped;

    await enriching.append(SAMPLES.TagDeleted);

    expect(swapped.appended).toHaveLength(1);
    expect(eventHasAttribution(swapped.appended[0]!)).toBe(true);
  });

  // The pending-profile sentinel is stamped onto EVERY event appended before a
  // user profile exists (config CRUD via the choke-point, tx.* via the IPC
  // handlers). It must therefore be a 26-char, ULID-shaped, Crockford-base32
  // value so those events satisfy both the envelope `length(26)` invariant that
  // Tier-1 anchoring enforces and our own strict `eventHasAttribution` check —
  // otherwise a pending-profile "enriched" event would read as unattributed.
  describe('PROFILE_PENDING sentinel (pending-profile attribution)', () => {
    it('is a 26-char Crockford-base32 ULID-shaped constant', () => {
      expect(PROFILE_PENDING_USER_ID).toHaveLength(26);
      // Crockford base32: 0-9 A-Z minus I, L, O, U.
      expect(PROFILE_PENDING_USER_ID).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('lets a pending-profile enriched event satisfy eventHasAttribution', async () => {
      const { eventLog, appended } = makeCaptureLog();
      // Identity as bootstrap builds it when the profile is pending: the
      // sentinel for actorUserId, real ids for the rest.
      const pending: EventAttribution = {
        actorUserId: PROFILE_PENDING_USER_ID,
        actorDeviceId: u('provider-device'),
        actorIdentitySource: 'local',
        datasetId: u('provider-dataset'),
      };
      const enriching = createEnrichingEventLog(eventLog, () => pending, fixedClock);

      // A flat event that carries no attribution of its own.
      await enriching.append(SAMPLES.TagDeleted);

      const persisted = appended[0]!;
      expect(eventHasAttribution(persisted)).toBe(true);
      expect((persisted as unknown as Record<string, unknown>)['actorUserId']).toBe(
        PROFILE_PENDING_USER_ID,
      );
    });
  });
});
