// WI-4′ — barrel export for the event log module.
export type { EventLog, DomainEvent } from './EventLog.js';
export { JsonFileEventLog } from './JsonFileEventLog.js';
export type { JsonFileEventLogOptions } from './JsonFileEventLog.js';
export {
  EncryptedMultiDeviceEventLog,
  eventsFileName,
  ENCRYPTED_EVENT_AUTH_FAILED,
} from './EncryptedMultiDeviceEventLog.js';
export type { EncryptedMultiDeviceEventLogOptions } from './EncryptedMultiDeviceEventLog.js';
export {
  loadKeyFile,
  saveKeyFile,
  migrateKeyFileV1ToV2,
  keyFileV1Schema,
  keyFileV2Schema,
  KEY_FILE_NAME,
  KEY_FILE_VERSION,
  KEY_FILE_NOT_FOUND,
  KEY_FILE_INVALID_JSON,
  KEY_FILE_SCHEMA_INVALID,
  KEY_FILE_UNSUPPORTED_VERSION,
} from './keyFile.js';
export type {
  KeyFileV1,
  KeyFileV2,
  DeviceWrap,
  Argon2ParamsPersisted,
  V1MigrationContext,
  LoadKeyFileOptions,
  LoadKeyFileResult,
  KeyFileError,
} from './keyFile.js';
