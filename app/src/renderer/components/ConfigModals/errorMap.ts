// Map error codes from the IPC contract → i18n key suffixes under
// `configuracion.errors.*`. Unknown codes fall through to a generic message.

export function mapConfigErrorToFieldKey(code: string): string {
  switch (code) {
    case 'NAME_EMPTY':
      return 'nameEmpty';
    case 'NAME_TOO_LONG':
      return 'nameTooLong';
    case 'NAME_DUPLICATE':
      return 'nameDuplicate';
    case 'OPENING_BALANCE_INVALID':
      return 'openingBalanceInvalid';
    case 'COLOR_INVALID':
      return 'colorInvalid';
    case 'SCHEMA_INVALID':
      return 'schemaInvalid';
    case 'NOT_FOUND':
      return 'notFound';
    case 'ALREADY_ARCHIVED':
      return 'alreadyArchived';
    case 'NOT_ARCHIVED':
      return 'notArchived';
    case 'INTERNAL':
      return 'internal';
    default:
      return 'submitFailed';
  }
}

/**
 * Map a ConfigMutationError (code + optional field) to a localized message via
 * the provided translator. Used by non-create call sites (edit catch blocks,
 * archive/unarchive handlers, archive dialog) so English `err.message` doesn't
 * leak into the Spanish UI.
 */
export function mapConfigMutationErrorToMessage(
  err: { readonly code: string; readonly message: string; readonly field?: string | undefined },
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const key = mapConfigErrorToFieldKey(err.code);
  return t(`configuracion.errors.${key}`, { defaultValue: err.message });
}
