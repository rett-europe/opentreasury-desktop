// Categories API client — thin wrapper over window.opentreasury.categories.*
// WI-15-lite (Trinity). Categories do NOT carry a `type` field (Pedro Q4 ruling).

import type {
  CategoriesListResponse,
  CreateCategoryRequest,
  CreateCategoryResponse,
} from '../../shared/ipc-contracts/categories.js';

export async function listCategories(): Promise<CategoriesListResponse> {
  return window.opentreasury.categories.list();
}

export async function createCategory(
  input: CreateCategoryRequest,
): Promise<CreateCategoryResponse> {
  return window.opentreasury.categories.create(input);
}
