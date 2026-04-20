// Import mappings projection — WI-17.
//
// Read-side selector for last-used column mappings per account.

import type { ReadModel } from '../../core/query/types.js';

export interface ImportMappingRecord {
  accountId: string;
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  updatedAt: string;
}

export function selectLastMappingForAccount(
  model: ReadModel,
  accountId: string,
): ImportMappingRecord | null {
  const mapping = model.importMappings.find((m) => m.accountId === accountId);
  if (!mapping) {
    return null;
  }

  return {
    accountId: mapping.accountId,
    dateColumn: mapping.dateColumn,
    amountColumn: mapping.amountColumn,
    descriptionColumn: mapping.descriptionColumn,
    updatedAt: mapping.updatedAt,
  };
}
