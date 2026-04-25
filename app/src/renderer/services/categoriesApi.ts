// Categories API client — thin wrapper over window.opentreasury.categories.*
// WI-15-lite (Trinity). Categories do NOT carry a `type` field (Pedro Q4 ruling).

import type {
  CategoriesListRequest,
  CategoriesListResponse,
  CategoriesUsageResponse,
  CreateCategoryRequest,
  CreateCategoryResponse,
} from '../../shared/ipc-contracts/categories.js';

export async function listCategories(req?: CategoriesListRequest): Promise<CategoriesListResponse> {
  return window.opentreasury.categories.list(req);
}

export async function createCategory(
  input: CreateCategoryRequest,
): Promise<CreateCategoryResponse> {
  return window.opentreasury.categories.create(input);
}

// issue #52 — per-category usage counters (transaction + classified totals).
export async function getCategoriesUsage(): Promise<CategoriesUsageResponse> {
  return window.opentreasury.categories.usage();
}
