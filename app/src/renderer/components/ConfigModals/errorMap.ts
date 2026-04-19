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
    default:
      return 'submitFailed';
  }
}
