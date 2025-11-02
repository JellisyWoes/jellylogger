// Core logger
export { ChildLogger, defaultOptions, logger } from './core/logger';
export type { BaseLogger, ChildLoggerOptions, JellyLogger, Transport } from './core/types';

// Log levels and types
export { LogLevel } from './core/constants';
export type {
  CustomConsoleColors,
  LogEntry,
  LoggerOptions,
  RedactionConfig,
  RedactionContext,
  RedactionAuditEvent,
  FieldRedactionConfig,
  CustomRedactor,
  AuditHook,
  TransportOptions,
} from './core/types';
export type { LogRotationConfig } from './transports/FileTransport';

// Transports
export { ConsoleTransport } from './transports/ConsoleTransport';
export { DiscordWebhookTransport } from './transports/DiscordWebhookTransport';
export { FileTransport } from './transports/FileTransport';
export { WebSocketTransport } from './transports/WebSocketTransport';

// Formatters - Re-export all formatter classes and types
// Export only formatter registry and factory from formatters
export { BUILT_IN_FORMATTERS, createFormatter } from './formatters';

// Helper functions
export {
  DEFAULT_COLORS,
  ENHANCED_DEFAULT_COLORS,
  getFormatterColors,
  toAnsiColor,
} from './utils/colors';
export { getTimestamp, processLogArgs, serializeError } from './utils/serialization';
export { isErrorLike, isRecord } from './utils/typeGuards';

// Transport preset helpers
export {
  addDiscordLogging,
  addFileLogging,
  addWebSocketLogging,
  useAllTransports,
  useConsoleAndFile,
  useConsoleAndWebSocket,
  useConsoleFileAndDiscord,
} from './utils/presets';

// Re-export redaction functionality
export {
  getRedactedEntry,
  isWhitelisted,
  needsRedaction,
  redactLogEntry,
  redactObject,
  redactString,
  shouldRedactKey,
  shouldRedactValue,
} from './redaction';

// Re-export internal error handlers
export {
  logInternalDebug,
  logInternalError,
  logInternalWarning,
  setInternalDebugHandler,
  setInternalErrorHandler,
  setInternalWarningHandler,
} from './utils/internalErrorHandler';
export type {
  InternalDebugHandler,
  InternalErrorHandler,
  InternalWarningHandler,
} from './utils/internalErrorHandler';

// Add missing type exports that are in the .d.ts
export type { DiscordRateLimitResponse } from './transports/DiscordWebhookTransport';
export type { InjectedBunFileOperations } from './transports/FileTransport';

// Bun HTTP request logger utility
export { bunRequestLogger } from './utils/bunRequestLogger';
export type {
  BunRequestField,
  BunRequestInfo,
  BunRequestLoggerOptions,
} from './core/types';
