/// <reference types="vite/client" />

// Window augmentation — declares window.opentreasury typed surface exposed by preload.
//
// The base `OpenTreasuryApi` is authored in the preload (Morpheus owns that
// wiring per ADR-002 §4.1). WI-12 adds `transaction.create` and `movements.list`;
// we intersect the renderer-visible surface here so the new client wrappers type-check
// even before Morpheus's preload commit lands. Once the preload ships those
// methods, the intersection becomes a no-op (same shape) and can be removed.
import type { OpenTreasuryApi } from '../preload/index.js';
import type {
  CreateTransactionInput,
  CreateTransactionResult,
} from './types/transaction.js';
import type {
  MovementRecord,
  MovementsFilter,
} from './types/movementsFilter.js';

type OpenTreasuryApiExtended = OpenTreasuryApi & {
  readonly transaction: {
    create(input: CreateTransactionInput): Promise<CreateTransactionResult>;
  };
  readonly movements: {
    list(filter?: MovementsFilter): Promise<MovementRecord[]>;
  };
};

declare global {
  interface Window {
    opentreasury: OpenTreasuryApiExtended;
  }
}
