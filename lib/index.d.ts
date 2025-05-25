/**
 * Defines the available log levels.
 */
declare enum LogLevel {
  SILENT = 0,
  FATAL = 1,
  ERROR = 2,
  WARN = 3,
  INFO = 4,
  DEBUG = 5,
  TRACE = 6,
}

/**
 * Represents a single log entry.
 */
declare interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  args: unknown[];
  /** Structured data for the log entry */
  data?: Record<string, unknown>;
}

/**
 * Type for custom console color definitions.
 * Accepts color values as hex, rgb, hsl, hsv, cmyk, or ANSI escape codes.
 */
declare type CustomConsoleColors = Partial<{
    reset: string;
    bold: string;
    dim: string;
    [LogLevel.FATAL]: string;
    [LogLevel.ERROR]: string;
    [LogLevel.WARN]: string;
    [LogLevel.INFO]: string;
    [LogLevel.DEBUG]: string;
    [LogLevel.TRACE]: string;
}>;

/**
 * Configuration for sensitive data redaction.
 */
declare interface RedactionConfig {
  /** Keys to redact in structured data and objects */
  keys: string[];
  /** Replacement text for redacted values. Default: '[REDACTED]' */
  replacement?: string;
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
}

/**
 * Configuration for log rotation.
 */
declare interface LogRotationConfig {
  /** Maximum file size in bytes before rotation. Default: 10MB */
  maxFileSize?: number;
  /** Maximum number of rotated files to keep. Default: 5 */
  maxFiles?: number;
  /** Whether to compress rotated files with gzip. Default: true */
  compress?: boolean;
  /** Whether to rotate based on date (daily). Default: false */
  dateRotation?: boolean;
}

/**
 * Interface for pluggable formatters.
 */
declare interface LogFormatter {
  /**
   * Format a log entry into a string.
   * @param entry - The log entry to format
   * @returns Formatted log string
   */
  format(entry: LogEntry): string;
}

/**
 * Built-in logfmt formatter.
 */
declare class LogfmtFormatter implements LogFormatter {
  format(entry: LogEntry): string;
}

/**
 * Built-in NDJSON (newline-delimited JSON) formatter.
 */
declare class NdjsonFormatter implements LogFormatter {
  format(entry: LogEntry): string;
}

/**
 * Interface for logger configuration options.
 */
declare interface LoggerOptions {
  /** Minimum log level to process. Defaults to LogLevel.INFO. */
  level?: LogLevel;
  /** If true, timestamps in logs will be in a human-readable format. Defaults to false. */
  useHumanReadableTime?: boolean;
  /** Array of transports to use. Defaults to [new ConsoleTransport()]. */
  transports?: Transport[];
  /** Output format. Defaults to 'string'. */
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
}

/**
 * Interface for child logger options.
 */
declare interface ChildLoggerOptions {
  /** Default structured data to include in all log entries */
  defaultData?: Record<string, unknown>;
  /** Prefix to add to all log messages */
  messagePrefix?: string;
}

/**
 * Base logger interface defining core logging methods.
 */
declare interface BaseLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
}

/**
 * Interface for log transports.
 */
declare interface Transport {
  /**
   * Logs an entry to the transport destination.
   */
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;
  /**
   * Flushes any pending log entries.
   */
  flush?(options?: LoggerOptions): Promise<void>;
}

/**
 * ConsoleTransport writes log entries to the console.
 */
declare class ConsoleTransport implements Transport {
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;
  flush(options?: LoggerOptions): Promise<void>;
}

/**
 * Options for DiscordWebhookTransport batching.
 */
declare interface DiscordWebhookTransportOptions {
  /** How often to send batches (ms). Default: 2000 */
  batchIntervalMs?: number;
  /** Max number of log entries per batch. Default: 10 */
  maxBatchSize?: number;
  /** Username for Discord webhook. Default: 'JellyLogger' */
  username?: string;
  /** Maximum retry attempts for failed batches. Default: 3 */
  maxRetries?: number;
  /** Suppress console.error output on webhook failure. Default: false */
  suppressConsoleErrors?: boolean;
}

/**
 * Interface for the expected Discord rate limit response.
 */
declare interface DiscordRateLimitResponse {
  retry_after: number;
}

/**
 * DiscordWebhookTransport sends log entries to a Discord webhook URL, batching them to avoid rate limits.
 */
declare class DiscordWebhookTransport implements Transport {
  constructor(webhookUrl: string, opts?: DiscordWebhookTransportOptions);
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;
  flush(options?: LoggerOptions): Promise<void>;
}

/**
 * Interface for Bun file operations, subset of `typeof Bun`.
 * Used for dependency injection in FileTransport.
 */
declare interface InjectedBunFileOperations {
  file: (path: string | number | URL, options?: { type?: string | undefined; } | undefined) => import("bun").BunFile;
  write: (path: string | URL | import("bun").BunFile | number, data: string | Blob | ArrayBuffer | SharedArrayBuffer | Uint8Array | Response | ReadableStream<any>) => Promise<number>;
}

/**
 * FileTransport writes log entries to a file.
 */
declare class FileTransport implements Transport {
  constructor(filePath: string, rotationConfig?: LogRotationConfig, bunOps?: Partial<InjectedBunFileOperations>);
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;
  flush(options?: LoggerOptions): Promise<void>;
}

/**
 * ChildLogger class to create loggers with inherited configuration and specific context.
 */
declare class ChildLogger implements BaseLogger {
  constructor(parentLogger: typeof logger, childOptions?: ChildLoggerOptions);
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
}

/**
 * Logger utility for consistent output.
 */
declare const logger: {
  options: Omit<Required<LoggerOptions>, 'formatter' | 'customConsoleColors' | 'redaction' | 'pluggableFormatter' | 'discordWebhookUrl'> & { 
    formatter?: LoggerOptions['formatter'], 
    customConsoleColors?: LoggerOptions['customConsoleColors'],
    redaction?: LoggerOptions['redaction'],
    pluggableFormatter?: LoggerOptions['pluggableFormatter'],
    discordWebhookUrl?: LoggerOptions['discordWebhookUrl']
  };
  setOptions(newOptions: LoggerOptions): void;
  resetOptions(): void;
  fatal: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  trace: (message: string, ...args: unknown[]) => void;
  child: (childOptions?: ChildLoggerOptions) => ChildLogger;
  flushAll: () => Promise<void>;
};

/**
 * Helper to check if a value is a plain object (record).
 */
declare function isRecord(value: unknown): value is Record<string, unknown>;

/**
 * Helper to check if a value looks like an Error object.
 */
declare function isErrorLike(value: unknown): value is { name: string; message: string; stack?: string; cause?: unknown };

/**
 * Serializes an Error object with optional depth limiting for causes.
 */
declare function serializeError(error: Error, maxDepth?: number): Record<string, unknown>;

/**
 * Safely converts unknown arguments to serializable format with circular reference detection.
 */
declare function processLogArgs(args: unknown[]): unknown[];

/**
 * Applies redaction to a log entry.
 * @param entry - The log entry to redact
 * @param redactionConfig - Optional redaction configuration
 * @param target - Where the redaction should apply ('console', 'file', or 'both')
 * @returns A new log entry with redacted data, or the original entry if no redaction is needed.
 */
declare function getRedactedEntry(
  entry: LogEntry,
  redactionConfig?: RedactionConfig,
  target?: 'console' | 'file'
): LogEntry;

/**
 * Deeply clones and redacts an object based on the redaction configuration.
 * @param obj - The object to redact
 * @param config - Redaction configuration
 * @param path - Current path in the object (used for recursion)
 * @param seen - Set to detect circular references
 * @returns A new object with redacted values
 */
declare function redactObject(
  obj: any,
  config: RedactionConfig,
  path?: string,
  seen?: WeakSet<object>
): any;

/**
 * Default logger options.
 */
declare const defaultOptions: LoggerOptions;

export {
  LogLevel,
  LogEntry,
  LoggerOptions,
  ChildLoggerOptions,
  BaseLogger,
  Transport,
  ConsoleTransport,
  DiscordWebhookTransportOptions,
  DiscordWebhookTransport,
  FileTransport,
  ChildLogger,
  LogFormatter,
  LogfmtFormatter,
  NdjsonFormatter,
  RedactionConfig,
  LogRotationConfig,
  logger,
  CustomConsoleColors,
  DiscordRateLimitResponse,
  isRecord,
  isErrorLike,
  serializeError,
  processLogArgs,
  getRedactedEntry,
  redactObject,
  defaultOptions,
};
