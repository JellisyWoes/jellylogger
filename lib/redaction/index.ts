export type {
  RedactionConfig,
  RedactionContext,
  RedactionAuditEvent,
  FieldRedactionConfig,
  CustomRedactor,
  AuditHook,
} from './config';
export type { LogEntry } from '../core/types';
export {
  shouldRedactKey,
  shouldRedactValue,
  redactString,
  redactObject,
  getRedactedEntry,
  needsRedaction,
  redactLogEntry,
  isWhitelisted,
} from './redactor';
