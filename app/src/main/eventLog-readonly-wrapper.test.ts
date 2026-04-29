// P1-3 trial-readiness — read-only EventLog wrapper tests.

import { describe, it, expect, vi } from 'vitest';
import { createReadOnlyEventLog, ReadOnlyEventLogError } from './eventLog-readonly-wrapper';
import type { EventLog, DomainEvent } from '../core/eventLog/EventLog';

describe('ReadOnlyEventLogError', () => {
  it('has correct name and message', () => {
    const err = new ReadOnlyEventLogError();
    expect(err.name).toBe('ReadOnlyEventLogError');
    expect(err.message).toContain('read-only mode');
    expect(err.message).toContain('Change in Settings');
  });

  it('accepts custom message', () => {
    const err = new ReadOnlyEventLogError('Custom message');
    expect(err.message).toBe('Custom message');
  });

  it('is an instance of Error', () => {
    const err = new ReadOnlyEventLogError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ReadOnlyEventLogError);
  });
});

describe('createReadOnlyEventLog', () => {
  const mockEvent: DomainEvent = {
    id: 'event123',
    type: 'tx.created' as const,
    datasetId: 'dataset01',
    actorDeviceId: 'device01',
    createdAt: '2026-05-01T10:00:00.000Z',
    dekVersion: 0,
    version: 1,
    payload: {
      id: 'tx123',
      date: '2026-05-01',
      type: 'expense',
      amount: 100,
      currency: 'EUR',
      description: 'Test',
      accountId: 'account01',
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'approved',
      createdAt: '2026-05-01T10:00:00.000Z',
    },
  };

  describe('append', () => {
    it('throws ReadOnlyEventLogError', async () => {
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn(),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      await expect(readOnlyLog.append(mockEvent)).rejects.toThrow(ReadOnlyEventLogError);
      await expect(readOnlyLog.append(mockEvent)).rejects.toThrow('read-only mode');

      // Verify inner log was never called
      expect(innerLog.append).not.toHaveBeenCalled();
    });
  });

  describe('appendBatch', () => {
    it('throws ReadOnlyEventLogError', async () => {
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn(),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      await expect(readOnlyLog.appendBatch([mockEvent])).rejects.toThrow(ReadOnlyEventLogError);
      await expect(readOnlyLog.appendBatch([mockEvent])).rejects.toThrow('read-only mode');

      // Verify inner log was never called
      expect(innerLog.appendBatch).not.toHaveBeenCalled();
    });

    it('throws even for empty batch', async () => {
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn(),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      await expect(readOnlyLog.appendBatch([])).rejects.toThrow(ReadOnlyEventLogError);
    });
  });

  describe('load', () => {
    it('forwards to inner log', async () => {
      const mockEvents: DomainEvent[] = [mockEvent];
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn().mockResolvedValue(mockEvents),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      const result = await readOnlyLog.load();

      expect(result).toBe(mockEvents);
      expect(innerLog.load).toHaveBeenCalledOnce();
    });

    it('forwards empty array from inner log', async () => {
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn().mockResolvedValue([]),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      const result = await readOnlyLog.load();

      expect(result).toEqual([]);
      expect(innerLog.load).toHaveBeenCalledOnce();
    });

    it('propagates errors from inner log', async () => {
      const expectedError = new Error('Disk read failed');
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn().mockRejectedValue(expectedError),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      await expect(readOnlyLog.load()).rejects.toThrow('Disk read failed');
    });
  });

  describe('integration — read-only mode workflow', () => {
    it('allows reads while blocking writes', async () => {
      const mockEvents: DomainEvent[] = [mockEvent];
      const innerLog: EventLog = {
        append: vi.fn(),
        appendBatch: vi.fn(),
        load: vi.fn().mockResolvedValue(mockEvents),
      };
      const readOnlyLog = createReadOnlyEventLog(innerLog);

      // Read succeeds
      const loaded = await readOnlyLog.load();
      expect(loaded).toBe(mockEvents);

      // Write fails
      await expect(readOnlyLog.append(mockEvent)).rejects.toThrow(ReadOnlyEventLogError);

      // Batch write fails
      await expect(readOnlyLog.appendBatch([mockEvent])).rejects.toThrow(ReadOnlyEventLogError);

      // Inner log's append/appendBatch were never called
      expect(innerLog.append).not.toHaveBeenCalled();
      expect(innerLog.appendBatch).not.toHaveBeenCalled();

      // Inner log's load was called once
      expect(innerLog.load).toHaveBeenCalledOnce();
    });
  });
});
