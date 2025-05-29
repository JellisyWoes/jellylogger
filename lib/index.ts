// Core logger
export { logger, defaultOptions } from './core/logger';
export { ChildLogger } from './core/logger';
export type { BaseLogger, ChildLoggerOptions, Transport, JellyLogger } from './core/types';

// Log levels and types
export { LogLevel } from './core/constants';
export type { LoggerOptions, CustomConsoleColors, LogEntry, RedactionConfig, TransportOptions } from './core/types';
export type { LogRotationConfig } from './transports/FileTransport';

// Transports
export { ConsoleTransport } from './transports/ConsoleTransport';
export { FileTransport } from './transports/FileTransport';
export { DiscordWebhookTransport } from './transports/DiscordWebhookTransport';
export { WebSocketTransport } from './transports/WebSocketTransport';

// Formatters
export type { LogFormatter } from './formatters/LogFormatter';
export { LogfmtFormatter } from './formatters/LogfmtFormatter';
export { NdjsonFormatter } from './formatters/NdjsonFormatter';

// Helper functions
export { isRecord, isErrorLike } from './utils/typeGuards';
export { getTimestamp, serializeError, processLogArgs } from './utils/serialization';
export { toAnsiColor } from './utils/colors';

// Transport preset helpers
export {
  useConsoleAndFile,
  useConsoleFileAndDiscord,
  useConsoleAndWebSocket,
  useAllTransports,
  addFileLogging,
  addDiscordLogging,
  addWebSocketLogging
} from './utils/presets';

// Re-export redaction functionality
export { 
  shouldRedactKey, 
  shouldRedactValue, 
  redactString, 
  redactObject,
  getRedactedEntry,
  needsRedaction,
  redactLogEntry,
  isWhitelisted
} from './redaction';

// Add missing type exports that are in the .d.ts
export type { InjectedBunFileOperations } from './transports/FileTransport';
export type { DiscordRateLimitResponse } from './transports/DiscordWebhookTransport';