/**
 * Fields that can be extracted from a Bun Request object.
 */
export type BunRequestField =
  | 'method'
  | 'url'
  | 'headers'
  | 'body'
  | 'redirect'
  | 'referrer'
  | 'referrerPolicy'
  | 'credentials'
  | 'integrity'
  | 'mode'
  | 'cache'
  | 'destination'
  | 'bodyUsed'
  | 'remoteAddress';

/**
 * Information extracted from a Bun HTTP request.
 */
export interface BunRequestInfo {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: string;
  credentials?: RequestCredentials;
  integrity?: string;
  mode?: RequestMode;
  cache?: RequestCache;
  destination?: RequestDestination;
  bodyUsed?: boolean;
  remoteAddress?: string;
}

/**
 * Configuration options for the Bun request logger.
 */


export interface BunRequestLoggerOptions {
  /**
   * Whether to include request headers in the log.
   * @default true
   */
  includeHeaders?: boolean;

  /**
   * Whether to include the request body in the log.
   * Note: Reading the body consumes it, so this may interfere with handlers that need the body.
   * @default false
   */
  includeBody?: boolean;

  /**
   * Whether to include request metadata (redirect, referrer, referrerPolicy, credentials, integrity, mode, cache, destination, bodyUsed).
   * @default false
   */
  includeMeta?: boolean;

  /**
   * Whether to include the remote address (client IP) in the log.
   * @default true
   */
  includeRemoteAddress?: boolean;

  /**
   * Specific request fields to include in the log.
   * If provided, this takes precedence over the include* boolean options.
   * @example ['method', 'url', 'headers', 'remoteAddress']
   */
  fields?: BunRequestField[];

  /**
   * Specific header names to redact (case-insensitive).
   * Commonly used for sensitive headers like 'authorization', 'cookie', 'x-api-key'.
   * @example ['authorization', 'cookie', 'x-api-key']
   */
  redactHeaders?: string[];

  /**
   * Full redaction configuration for advanced use cases.
   * If provided, this is used instead of redactHeaders.
   */
  redaction?: RedactionConfig;

  /**
   * Custom logger instance to use instead of the default logger.
   */
  logger?: JellyLogger;

  /**
   * Log level to use for request logs.
   * @default 'info'
   */
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  /**
   * Custom message prefix for request logs.
   * @default 'HTTP Request'
   */
  messagePrefix?: string;

  /**
   * Maximum body size in bytes to include in logs.
   * Bodies larger than this will be truncated with a note.
   * @default 10000 (10KB)
   */
  maxBodySize?: number;

  /**
   * Pluggable formatter instance for pretty/ndjson/logfmt output.
   */
  pluggableFormatter?: LogFormatter;
}
import type { LogLevel } from './constants';

/**
 * Represents a single log entry.
 */
export interface LogEntry {
  /** ISO timestamp string */
  timestamp: string;
  /** Numeric log level */
  level: LogLevel;
  /** String representation of log level */
  levelName: string;
  /** Primary log message */
  message: string;
  /** Processed arguments from processLogArgs function */
  args: { processedArgs: unknown[]; hasComplexArgs: boolean };
  /** Optional structured data object */
  data?: Record<string, unknown>;
}

/**
 * Type for custom console color definitions.
 * Allows overriding specific log levels or properties like reset, bold, dim.
 * Accepts color values as hex, rgb, hsl, hsv, cmyk, or ANSI escape codes.
 */
export type CustomConsoleColors = Partial<{
  reset: string;
  bold: string;
  dim: string;
  [LogLevel.FATAL]: string;
  [LogLevel.ERROR]: string;
  [LogLevel.WARN]: string;
  [LogLevel.INFO]: string;
  [LogLevel.DEBUG]: string;
  [LogLevel.TRACE]: string;
}> & {
  [key: string]: string | undefined;
};

/**
 * Interface for pluggable formatters.
 */
export interface LogFormatter {
  /**
   * Format a log entry into a string.
   * @param entry - The log entry to format
   * @param options - Optional console colors for colorized output
   * @returns Formatted log string
   */
  format(
    entry: LogEntry,
    options?: {
      consoleColors?: CustomConsoleColors;
      useColors?: boolean;
    }
  ): string;
}

/**
 * Options for transport operations.
 */
export interface TransportOptions {
  /** Output format for this specific transport operation */
  format?: 'string' | 'json';
  /** Custom formatter function for this transport operation */
  formatter?: (entry: LogEntry) => string;
  /** Pluggable formatter instance for this transport operation */
  pluggableFormatter?: LogFormatter;
  /** Additional transport-specific options */
  [key: string]: unknown;
}

/**
 * Interface for log transports.
 * Transports are responsible for writing log entries to a destination.
 */
export interface Transport {
  /**
   * Logs an entry to the transport destination.
   * @param entry - The log entry to write
   * @param options - Transport options for formatting and configuration
   */
  log(entry: LogEntry, options?: TransportOptions): Promise<void>;

  /**
   * Flushes any pending log entries.
   * Should be called before application shutdown.
   */
  flush?(options?: TransportOptions): Promise<void>;
}

/**
 * Context provided to custom redaction functions and audit hooks.
 */
export interface RedactionContext {
  /** The key being processed */
  key: string;
  /** Full path to the current location (e.g., 'user.credentials.password') */
  path: string;
  /** The field in the log entry being processed (e.g., 'args', 'data', 'message') */
  field: string;
  /** The original value before redaction */
  originalValue: unknown;
  /** Target where this redaction will be applied */
  target?: 'console' | 'file';
}

/**
 * Audit event information for redaction operations.
 */
export interface RedactionAuditEvent {
  /** Type of redaction operation */
  type: 'key' | 'value' | 'string' | 'custom' | 'field';
  /** Context of the redaction */
  context: RedactionContext;
  /** Value before redaction */
  before: unknown;
  /** Value after redaction */
  after: unknown;
  /** Timestamp of the redaction */
  timestamp: Date;
  /** Rule that triggered the redaction */
  rule?: string;
}

/**
 * Per-field or per-path specific redaction configuration.
 */
export interface FieldRedactionConfig {
  /** Specific replacement for this field/path */
  replacement?: string | ((value: unknown, context: RedactionContext) => string);
  /** Custom redaction function for this field/path */
  customRedactor?: (value: unknown, context: RedactionContext) => unknown;
  /** Whether to disable redaction for this specific field/path */
  disabled?: boolean;
}

/**
 * Custom redaction function type for user-defined redaction logic.
 */
export type CustomRedactor = (value: unknown, context: RedactionContext) => unknown;

/**
 * Audit event handler for tracking redaction operations.
 */
export type AuditHook = (event: RedactionAuditEvent) => void;

/**
 * Configuration for sensitive data redaction.
 */
export interface RedactionConfig {
  /** Target log entry fields to apply redaction to. Default: ['args', 'data', 'message'] */
  fields?: string[];

  /** Keys to redact in structured data and objects. Supports dot notation for nested keys (e.g., 'user.password') and wildcards (e.g., '*.token', 'user.*') */
  keys?: string[];

  /** Regular expressions for key matching. More flexible than string keys. */
  keyPatterns?: RegExp[];

  /** Regular expressions to match and redact values regardless of their keys */
  valuePatterns?: RegExp[];

  /** Whether to redact sensitive patterns in log messages and string arguments. Default: false */
  redactStrings?: boolean;

  /** String patterns to redact in messages and string args (e.g., credit card numbers, SSNs) */
  stringPatterns?: RegExp[];

  /** Paths/keys to whitelist from redaction (takes precedence over redaction rules) */
  whitelist?: string[];

  /** Regular expressions for whitelisting paths/keys */
  whitelistPatterns?: RegExp[];

  /** Per-field or per-path specific redaction configurations */
  fieldConfigs?: Record<string, FieldRedactionConfig>;

  /** Custom redaction function that takes precedence over built-in redaction */
  customRedactor?: CustomRedactor;

  /** Replacement text for redacted values or a function for custom replacement. Default: '[REDACTED]' */
  replacement?: string | ((value: unknown, context: RedactionContext) => string);

  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;

  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';

  /** Whether to log when redaction occurs for debugging/auditing. Default: false */
  auditRedaction?: boolean;

  /** Custom audit hook function for handling redaction events */
  auditHook?: AuditHook;

  /** Whether to deep clone objects before redaction to avoid mutating originals. Default: true */
  deepClone?: boolean;

  /** Maximum depth for recursive redaction to prevent infinite loops. Default: 10 */
  maxDepth?: number;
}

/**
 * Interface for logger configuration options.
 */
export interface LoggerOptions {
  /** Minimum log level to process. Defaults to LogLevel.INFO. */
  level?: LogLevel;
  /** If true, timestamps will be human-readable. Defaults to false. */
  useHumanReadableTime?: boolean;
  /** Array of transports to use. Defaults to [new ConsoleTransport()]. */
  transports?: Transport[];
  /** Output format. Defaults to 'string'. If a custom `formatter` is provided, this may be ignored by the formatter. */
  format?: 'string' | 'json';
  /** Custom function to format a log entry into a string. If provided, this typically overrides the default string/JSON formatting of transports. */
  formatter?: (entry: LogEntry) => string;
  /** Custom console colors to override defaults. */
  customConsoleColors?: CustomConsoleColors;
  /** Configuration for sensitive data redaction */
  redaction?: RedactionConfig;
  /** Pluggable formatter instance */
  pluggableFormatter?: LogFormatter;
  /** Discord webhook URL for sending logs with discord: true flag */
  discordWebhookUrl?: string;
  /** Context for this logger */
  context?: Record<string, unknown>;
  /** Custom handler for library internal errors. If not provided, console.error is used. */
  internalErrorHandler?: (message: string, error?: unknown) => void;
  /** Custom handler for library internal warnings. If not provided, console.warn is used. */
  internalWarningHandler?: (message: string, error?: unknown) => void;
  /** Custom handler for library internal debug messages. If not provided, console.debug is used. */
  internalDebugHandler?: (message: string, data?: unknown) => void;
  /** Index signature to allow additional properties and ensure compatibility with TransportOptions */
  [key: string]: unknown;
}

/**
 * Options for creating a child logger.
 */
export interface ChildLoggerOptions {
  /** Prefix to add to all log messages from this child logger */
  messagePrefix?: string;
  /** Contextual data to include with every log entry from this child logger */
  defaultData?: Record<string, unknown>;
  /** Context to include with every log entry from this child logger (alias for defaultData) */
  context?: Record<string, unknown>;
}

/**
 * Base interface for logger methods.
 */
export interface BaseLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
  flushAll(): Promise<void>;
}

// Forward declaration for ChildLogger
export interface ChildLogger extends BaseLogger {}

/**
 * Interface for the main logger instance, including transport management.
 */
export interface JellyLogger extends BaseLogger {
  options: LoggerOptions;
  setOptions(newOptions: LoggerOptions): void;
  resetOptions(): void;
  _log(level: LogLevel, message: string, ...args: unknown[]): void;
  _logWithData(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    ...args: unknown[]
  ): void;
  flushAll(): Promise<void>;
  addTransport(transport: Transport): void;
  removeTransport(transport: Transport): void;
  clearTransports(): void;
  setTransports(transports: Transport[]): void;
}
