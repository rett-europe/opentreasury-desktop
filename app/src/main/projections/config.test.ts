// WI-15-lite projections — rehydration test.
// Feeds a sequence of AccountCreated / CategoryCreated / TagCreated events
// into replayEvents() and asserts the three selectors project them correctly
// (same contract exercised at app startup by main/bootstrap.ts).

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  ConfigAccountCreatedEvent,
  ConfigCategoryCreatedEvent,
  ConfigTagCreatedEvent,
  DomainEvent,
} from '../../core/events/schemas';
import { getReadModel, replayEvents, resetReadModel } from '../../core/query/reducers';
import { selectAccounts, selectCategories, selectTags } from './config';

function accountEvt(
  id: string,
  name: string,
  extras: Partial<ConfigAccountCreatedEvent> = {},
): ConfigAccountCreatedEvent {
  return {
    type: 'AccountCreated',
    id,
    name,
    currency: 'EUR',
    openingBalance: 0,
    createdAt: '2026-04-20T12:00:00.000Z',
    ...extras,
  };
}

function categoryEvt(id: string, name: string, color?: string): ConfigCategoryCreatedEvent {
  return {
    type: 'CategoryCreated',
    id,
    name,
    createdAt: '2026-04-20T12:00:00.000Z',
    ...(color !== undefined ? { color } : {}),
  };
}

function tagEvt(id: string, name: string): ConfigTagCreatedEvent {
  return {
    type: 'TagCreated',
    id,
    name,
    createdAt: '2026-04-20T12:00:00.000Z',
  };
}

describe('WI-15-lite projections — rehydration', () => {
  beforeEach(() => resetReadModel());

  it('replays all three event types into the read model', () => {
    const events: DomainEvent[] = [
      accountEvt('A1', 'Unicaja', { bankName: 'Unicaja Banco', openingBalance: 100 }),
      accountEvt('A2', 'Caixa'),
      categoryEvt('C1', 'Donaciones'),
      categoryEvt('C2', 'Gastos', '#cc0000'),
      tagEvt('T1', 'raras'),
      tagEvt('T2', 'gala'),
    ];

    replayEvents(events);
    const model = getReadModel();

    expect(selectAccounts(model)).toHaveLength(2);
    expect(selectAccounts(model)[0]).toEqual({
      id: 'A1',
      name: 'Unicaja',
      bankName: 'Unicaja Banco',
      currency: 'EUR',
      openingBalance: 100,
      createdAt: '2026-04-20T12:00:00.000Z',
    });

    expect(selectCategories(model)).toHaveLength(2);
    expect(selectCategories(model)[1]).toEqual({
      id: 'C2',
      name: 'Gastos',
      color: '#cc0000',
      createdAt: '2026-04-20T12:00:00.000Z',
    });

    expect(selectTags(model)).toHaveLength(2);
    expect(selectTags(model).map((t) => t.name)).toEqual(['raras', 'gala']);
  });

  it('empty event stream yields empty projections', () => {
    replayEvents([]);
    const model = getReadModel();
    expect(selectAccounts(model)).toEqual([]);
    expect(selectCategories(model)).toEqual([]);
    expect(selectTags(model)).toEqual([]);
  });

  it('ignores unknown event types (forward compatibility)', () => {
    const unknown = {
      id: 'U1',
      type: 'FutureEvent',
      createdAt: '2026-04-20T12:00:00.000Z',
    } as unknown as DomainEvent;
    replayEvents([unknown, accountEvt('A1', 'Caja')]);
    expect(selectAccounts(getReadModel())).toHaveLength(1);
  });
});
