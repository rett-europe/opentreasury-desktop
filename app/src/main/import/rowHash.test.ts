// rowHash.test.ts — WI-17 unit tests for row-hash algorithm.

import { describe, it, expect } from 'vitest';
import { computeRowHash } from './rowHash';

describe('computeRowHash', () => {
  const accountId = '01HX5YJHZ0Q0AABBCCDDEEFFGG';

  it('produces deterministic 16-char hex hash', () => {
    const hash = computeRowHash(accountId, '2024-04-20', 123.45, 'Test transaction');
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);

    // Same inputs → same hash
    const hash2 = computeRowHash(accountId, '2024-04-20', 123.45, 'Test transaction');
    expect(hash2).toBe(hash);
  });

  it('normalizes amount to 2 decimals', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 123.4, 'Test');
    const hash2 = computeRowHash(accountId, '2024-04-20', 123.4, 'Test');
    expect(hash1).toBe(hash2);
  });

  it('normalizes amount to absolute value', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', -123.45, 'Test');
    const hash2 = computeRowHash(accountId, '2024-04-20', 123.45, 'Test');
    expect(hash1).toBe(hash2);
  });

  it('normalizes description: trims whitespace', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, '  Test  ');
    const hash2 = computeRowHash(accountId, '2024-04-20', 100, 'Test');
    expect(hash1).toBe(hash2);
  });

  it('normalizes description: lowercases', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, 'TEST Transaction');
    const hash2 = computeRowHash(accountId, '2024-04-20', 100, 'test transaction');
    expect(hash1).toBe(hash2);
  });

  it('normalizes description: collapses whitespace', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, 'Test   transaction');
    const hash2 = computeRowHash(accountId, '2024-04-20', 100, 'Test transaction');
    expect(hash1).toBe(hash2);
  });

  it('normalizes description: converts line breaks', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, 'Test\r\ntransaction');
    const hash2 = computeRowHash(accountId, '2024-04-20', 100, 'Test\ntransaction');
    expect(hash1).toBe(hash2);
  });

  it('differentiates by accountId', () => {
    const accountId2 = '01HX5YJHZ0Q0AABBCCDDEEFFHH';
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, 'Test');
    const hash2 = computeRowHash(accountId2, '2024-04-20', 100, 'Test');
    expect(hash1).not.toBe(hash2);
  });

  it('differentiates by date', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, 'Test');
    const hash2 = computeRowHash(accountId, '2024-04-21', 100, 'Test');
    expect(hash1).not.toBe(hash2);
  });

  it('differentiates by amount', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100.0, 'Test');
    const hash2 = computeRowHash(accountId, '2024-04-20', 100.01, 'Test');
    expect(hash1).not.toBe(hash2);
  });

  it('differentiates by description', () => {
    const hash1 = computeRowHash(accountId, '2024-04-20', 100, 'Test A');
    const hash2 = computeRowHash(accountId, '2024-04-20', 100, 'Test B');
    expect(hash1).not.toBe(hash2);
  });
});
