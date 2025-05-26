// Core logger
export { logger, defaultOptions, type BaseLogger, type ChildLoggerOptions } from './logger';
export { ChildLogger } from './logger';

// Log levels and types
export { LogLevel, type LoggerOptions, type CustomConsoleColors, type Transport } from './transports/ConsoleTransport';
export type { LogEntry, RedactionConfig } from './features/redaction';
export type { LogRotationConfig } from './transports/FileTransport';

// Transports
export { ConsoleTransport } from './transports/ConsoleTransport';
export { FileTransport } from './transports/FileTransport';
export { DiscordWebhookTransport } from './transports/DiscordWebhookTransport';

// Formatters
export { type LogFormatter, LogfmtFormatter, NdjsonFormatter } from './features/formatters';

// Helper functions
export { isRecord, isErrorLike } from './features/typeGuards';
export { getTimestamp, serializeError, processLogArgs, toAnsiColor } from './features/helpers';
export { 
  shouldRedactKey, 
  shouldRedactValue, 
  redactString, 
  redactObject,
  getRedactedEntry,
  needsRedaction 
} from './features/redaction';

// Add missing type exports that are in the .d.ts
export type { InjectedBunFileOperations } from './transports/FileTransport';
export type { DiscordRateLimitResponse } from './transports/DiscordWebhookTransport';