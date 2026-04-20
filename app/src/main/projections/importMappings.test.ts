// importMappings.test.ts — WI-17 projection tests.

import { describe, it, expect, beforeEach } from 'vitest';
import { resetReadModel, applyEvent, getReadModel } from '../../core/query/reducers.js';
import type { ImportMappingUpdatedEvent } from '../../core/events/schemas.js';
import { selectLastMappingForAccount } from './importMappings.js';

describe('importMappings projection', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('returns null when no mapping exists for account', () => {
    const mapping = selectLastMappingForAccount(getReadModel(), '01HX5YJHZ0Q0AABBCCDDEEFFGG');
    expect(mapping).toBeNull();
  });

  it('stores and retrieves a mapping', () => {
    const event: ImportMappingUpdatedEvent = {
      type: 'import.mapping.updated',
      id: '01HX5YJHZ0Q0AABBCCDDEEFFGG',
      accountId: '01HX5YJHZ0ACCOUNT1111111',
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
      updatedAt: '2024-04-20T10:00:00.000Z',
    };

    applyEvent(event);

    const mapping = selectLastMappingForAccount(getReadModel(), '01HX5YJHZ0ACCOUNT1111111');
    expect(mapping).toEqual({
      accountId: '01HX5YJHZ0ACCOUNT1111111',
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
      updatedAt: '2024-04-20T10:00:00.000Z',
    });
  });

  it('updates an existing mapping for the same account', () => {
    const event1: ImportMappingUpdatedEvent = {
      type: 'import.mapping.updated',
      id: '01HX5YJHZ0Q0AABBCCDDEEFF01',
      accountId: '01HX5YJHZ0ACCOUNT1111111',
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
      updatedAt: '2024-04-20T10:00:00.000Z',
    };

    const event2: ImportMappingUpdatedEvent = {
      type: 'import.mapping.updated',
      id: '01HX5YJHZ0Q0AABBCCDDEEFF02',
      accountId: '01HX5YJHZ0ACCOUNT1111111',
      dateColumn: 'Fecha',
      amountColumn: 'Importe',
      descriptionColumn: 'Concepto',
      updatedAt: '2024-04-21T11:00:00.000Z',
    };

    applyEvent(event1);
    applyEvent(event2);

    const mapping = selectLastMappingForAccount(getReadModel(), '01HX5YJHZ0ACCOUNT1111111');
    expect(mapping).toEqual({
      accountId: '01HX5YJHZ0ACCOUNT1111111',
      dateColumn: 'Fecha',
      amountColumn: 'Importe',
      descriptionColumn: 'Concepto',
      updatedAt: '2024-04-21T11:00:00.000Z',
    });
  });

  it('stores separate mappings for different accounts', () => {
    const event1: ImportMappingUpdatedEvent = {
      type: 'import.mapping.updated',
      id: '01HX5YJHZ0Q0AABBCCDDEEFF01',
      accountId: '01HX5YJHZ0ACCOUNT1111111',
      dateColumn: 'Date',
      amountColumn: 'Amount',
      descriptionColumn: 'Description',
      updatedAt: '2024-04-20T10:00:00.000Z',
    };

    const event2: ImportMappingUpdatedEvent = {
      type: 'import.mapping.updated',
      id: '01HX5YJHZ0Q0AABBCCDDEEFF02',
      accountId: '01HX5YJHZ0ACCOUNT2222222',
      dateColumn: 'Fecha',
      amountColumn: 'Importe',
      descriptionColumn: 'Concepto',
      updatedAt: '2024-04-21T11:00:00.000Z',
    };

    applyEvent(event1);
    applyEvent(event2);

    const mapping1 = selectLastMappingForAccount(getReadModel(), '01HX5YJHZ0ACCOUNT1111111');
    expect(mapping1?.dateColumn).toBe('Date');

    const mapping2 = selectLastMappingForAccount(getReadModel(), '01HX5YJHZ0ACCOUNT2222222');
    expect(mapping2?.dateColumn).toBe('Fecha');
  });
});
