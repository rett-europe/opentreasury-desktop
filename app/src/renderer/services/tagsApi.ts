// Tags API client — thin wrapper over window.opentreasury.tags.*
// WI-15-lite (Trinity).

import type {
  CreateTagRequest,
  CreateTagResponse,
  TagsListResponse,
} from '../../shared/ipc-contracts/tags.js';

export async function listTags(): Promise<TagsListResponse> {
  return window.opentreasury.tags.list();
}

export async function createTag(input: CreateTagRequest): Promise<CreateTagResponse> {
  return window.opentreasury.tags.create(input);
}
