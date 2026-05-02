// Test-helper factory for command/handler/query deps — #153 trial-readiness.
//
// Provides `createTestDeps()` that returns the dependency bundle expected by:
//   - core/commands/*.ts (CreateTransactionDeps, UpdateTransactionDeps, etc.)
//   - main/ipc/handlers/*.ts (TransactionCreateHandlerDeps, etc.)
//
// Generates stable, deterministic test IDs using a local ULID-like helper.
// Replaces hardcoded `DATASET_ID` / `ACTOR_DEVICE_ID` constants from the
// pre-trial test code.

import type { ReadModel } from './query/types';

/**
 * Deterministic ULID-like helper for tests.
 * Pads `suffix` to 26 chars uppercase — not cryptographically random, but
 * stable and distinct enough for test assertions.
 */
export function testUlid(suffix: string): string {
  return (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();
}

/**
 * Minimal ReadModel factory for tests that don't need pre-seeded data.
 * Tests that require accounts/transactions/categories should build their own
 * or call `createTestDeps({ readModel: customReadModel() })`.
 */
export function emptyReadModel(): ReadModel {
  return {
    transactions: [],
    configAccounts: [],
    configCategories: [],
    configTags: [],
    importMappings: [],
    rowHashes: new Set<string>(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
  };
}

/**
 * Core command dependency bundle.
 * Used by: createTransaction, updateTransaction, deleteTransaction, bulkUpdate*, etc.
 */
export interface TestCommandDeps {
  now: () => Date;
  newId: () => string;
  readModel: ReadModel;
  datasetId: string;
  actorDeviceId: string;
  actorUserId: string;
  actorIdentitySource: 'local' | 'aad';
  dekVersion?: number;
}

/**
 * IPC handler dependency bundle (superset of command deps).
 * Used by: createTransactionCreateHandler, etc.
 */
export interface TestHandlerDeps extends TestCommandDeps {
  eventLog: EventLog | InMemoryEventLog; // EventLog type or stub
  getReadModel: () => ReadModel;
  applyEvent?: (event: DomainEvent) => void;
}

// For backward compatibility with existing tests that don't import EventLog
type EventLog = {
  append(event: unknown): Promise<void>;
  appendBatch(events: readonly unknown[]): Promise<void>;
  load(): Promise<unknown[]>;
};

type InMemoryEventLog = EventLog;

type DomainEvent = unknown;

export interface CreateTestDepsOptions {
  /**
   * Clock function. Defaults to `() => new Date('2026-04-20T10:00:00.000Z')`.
   */
  now?: () => Date;
  /**
   * ID generator. Defaults to a counter-based deterministic generator that
   * returns 'ID000000000000000000000001', 'ID000000000000000000000002', etc.
   */
  newId?: () => string;
  /**
   * ReadModel. Defaults to `emptyReadModel()`.
   */
  readModel?: ReadModel;
  /**
   * Dataset ID (ULID). Defaults to `testUlid('DATASET')`.
   */
  datasetId?: string;
  /**
   * Actor device ID (ULID). Defaults to `testUlid('DEVICE')`.
   */
  actorDeviceId?: string;
  /**
   * Actor user ID (ULID). Defaults to `testUlid('USER')` — P0-1 trial-readiness.
   */
  actorUserId?: string;
  /**
   * Identity source. Defaults to `'local'`.
   */
  actorIdentitySource?: 'local' | 'aad';
  /**
   * DEK version. Defaults to `1`.
   */
  dekVersion?: number;
  /**
   * For handler deps: EventLog stub.
   */
  eventLog?: EventLog | InMemoryEventLog;
  /**
   * For handler deps: getReadModel function. Defaults to `() => readModel`.
   */
  getReadModel?: () => ReadModel;
  /**
   * For handler deps: applyEvent override.
   */
  applyEvent?: (event: DomainEvent) => void;
}

/**
 * Creates a test dependency bundle suitable for core commands or IPC handlers.
 *
 * Example (command test):
 * ```ts
 * const deps = createTestDeps();
 * const result = createTransaction(input, deps);
 * ```
 *
 * Example (custom IDs):
 * ```ts
 * const ids = ['EVT1', 'TX01'];
 * let i = 0;
 * const deps = createTestDeps({
 *   newId: () => testUlid(ids[i++]!),
 * });
 * ```
 *
 * Example (handler test):
 * ```ts
 * const eventLog = new InMemoryEventLog();
 * const deps = createTestDeps({ eventLog, getReadModel });
 * const handle = createTransactionCreateHandler(deps);
 * ```
 */
export function createTestDeps(
  options: CreateTestDepsOptions = {},
): TestCommandDeps & Partial<TestHandlerDeps> {
  let idCounter = 0;
  const defaultNewId = () => {
    idCounter += 1;
    return testUlid(`ID${String(idCounter).padStart(21, '0')}`);
  };

  const readModel = options.readModel ?? emptyReadModel();

  const deps: TestCommandDeps & Partial<TestHandlerDeps> = {
    now: options.now ?? (() => new Date('2026-04-20T10:00:00.000Z')),
    newId: options.newId ?? defaultNewId,
    readModel,
    datasetId: options.datasetId ?? testUlid('DATASET'),
    actorDeviceId: options.actorDeviceId ?? testUlid('DEVICE'),
    actorUserId: options.actorUserId ?? testUlid('USER'),
    actorIdentitySource: options.actorIdentitySource ?? 'local',
    dekVersion: options.dekVersion ?? 1,
  };

  // Handler-specific deps (optional)
  if (options.eventLog !== undefined) {
    deps.eventLog = options.eventLog;
  }
  if (options.getReadModel !== undefined) {
    deps.getReadModel = options.getReadModel;
  } else if (options.eventLog !== undefined) {
    // If eventLog is provided but getReadModel is not, default to returning the readModel
    deps.getReadModel = () => readModel;
  }
  if (options.applyEvent !== undefined) {
    deps.applyEvent = options.applyEvent;
  }

  return deps;
}
