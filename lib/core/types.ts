import type { LogLevel } from './constants';

/**
 * Represents a single log entry.
 */
export interface LogEntry {
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
}>;

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
  log(
    entry: LogEntry,
    options?: TransportOptions
  ): Promise<void>;

  /**
   * Flushes any pending log entries.
   * Should be called before application shutdown.
   */
  flush?(options?: TransportOptions): Promise<void>;
}

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
  fieldConfigs?: Record<string, {
    /** Specific replacement for this field/path */
    replacement?: string | ((value: any, context: { key: string; path: string; field: string; originalValue: unknown; target?: 'console' | 'file' }) => string);
    /** Custom redaction function for this field/path */
    customRedactor?: (value: unknown, context: { key: string; path: string; field: string; originalValue: unknown; target?: 'console' | 'file' }) => unknown;
    /** Whether to disable redaction for this specific field/path */
    disabled?: boolean;
  }>;
  
  /** Custom redaction function that takes precedence over built-in redaction */
  customRedactor?: (value: unknown, context: { key: string; path: string; field: string; originalValue: unknown; target?: 'console' | 'file' }) => unknown;
  
  /** Replacement text for redacted values or a function for custom replacement. Default: '[REDACTED]' */
  replacement?: string | ((value: any, context: { key: string; path: string; field: string; originalValue: unknown; target?: 'console' | 'file' }) => string);
  
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
  
  /** Whether to log when redaction occurs for debugging/auditing. Default: false */
  auditRedaction?: boolean;
  
  /** Custom audit hook function for handling redaction events */
  auditHook?: (event: {
    type: 'key' | 'value' | 'string' | 'custom' | 'field';
    context: { key: string; path: string; field: string; originalValue: unknown; target?: 'console' | 'file' };
    before: unknown;
    after: unknown;
    timestamp: Date;
    rule?: string;
  }) => void;
  
  /** Whether to deep clone objects before redaction to avoid mutating originals. Default: true */
  deepClone?: boolean;
  
  /** Maximum depth for recursive redaction to prevent infinite loops. Default: 10 */
  maxDepth?: number;
}

// Forward declaration to avoid circular dependency
export interface LogFormatter {
  format(entry: LogEntry): string;
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
  _logWithData(level: LogLevel, message: string, data?: Record<string, unknown>, ...args: unknown[]): void;
  flushAll(): Promise<void>;
  addTransport(transport: Transport): void;
  removeTransport(transport: Transport): void;
  clearTransports(): void;
  setTransports(transports: Transport[]): void;
}
