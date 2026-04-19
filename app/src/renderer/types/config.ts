// Renderer-side re-exports for WI-15-lite Configuración contracts.
//
// The canonical types + Zod schemas live in `app/src/shared/ipc-contracts/`
// (see Morpheus — WI-15-lite IPC contracts, 2026-04-19). This shim keeps the
// existing import paths in the renderer (`../../types/config.js`) working
// while pointing at the frozen shared contracts.

export type {
  AccountRecord,
  AccountCreatedEvent,
  CreateAccountRequest,
  CreateAccountResponse,
  AccountsListResponse,
  ListAccountsResponse,
  AccountError,
  AccountErrorCode,
} from '../../shared/ipc-contracts/accounts.js';

export type {
  CategoryRecord,
  CategoryCreatedEvent,
  CreateCategoryRequest,
  CreateCategoryResponse,
  CategoriesListResponse,
  ListCategoriesResponse,
  CategoryError,
  CategoryErrorCode,
} from '../../shared/ipc-contracts/categories.js';

export type {
  TagRecord,
  TagCreatedEvent,
  CreateTagRequest,
  CreateTagResponse,
  TagsListResponse,
  ListTagsResponse,
  TagError,
  TagErrorCode,
} from '../../shared/ipc-contracts/tags.js';

// Union type covering all three entity error codes — used by the shared
// error-mapper in components/ConfigModals/errorMap.ts.
export type ConfigErrorCode =
  | 'NAME_EMPTY'
  | 'NAME_TOO_LONG'
  | 'NAME_DUPLICATE'
  | 'OPENING_BALANCE_INVALID'
  | 'COLOR_INVALID'
  | 'SCHEMA_INVALID'
  | 'INTERNAL';

export interface ConfigError {
  readonly code: ConfigErrorCode | string;
  readonly message: string;
  readonly field?: string;
}

// ConfigApi — forward-declared alias. Morpheus's preload now exposes these
// under OpenTreasuryApi directly, so this interface exists only for any
// renderer code that still references ConfigApi by name.
import type {
  AccountsListResponse as _AccountsListResponse,
  CreateAccountRequest as _CreateAccountRequest,
  CreateAccountResponse as _CreateAccountResponse,
} from '../../shared/ipc-contracts/accounts.js';
import type {
  CategoriesListResponse as _CategoriesListResponse,
  CreateCategoryRequest as _CreateCategoryRequest,
  CreateCategoryResponse as _CreateCategoryResponse,
} from '../../shared/ipc-contracts/categories.js';
import type {
  CreateTagRequest as _CreateTagRequest,
  CreateTagResponse as _CreateTagResponse,
  TagsListResponse as _TagsListResponse,
} from '../../shared/ipc-contracts/tags.js';

export interface ConfigApi {
  readonly accounts: {
    readonly list: () => Promise<_AccountsListResponse>;
    readonly create: (req: _CreateAccountRequest) => Promise<_CreateAccountResponse>;
  };
  readonly categories: {
    readonly list: () => Promise<_CategoriesListResponse>;
    readonly create: (req: _CreateCategoryRequest) => Promise<_CreateCategoryResponse>;
  };
  readonly tags: {
    readonly list: () => Promise<_TagsListResponse>;
    readonly create: (req: _CreateTagRequest) => Promise<_CreateTagResponse>;
  };
}
