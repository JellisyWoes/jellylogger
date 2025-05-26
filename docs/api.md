# JellyLogger API Reference

This document provides a complete API reference for JellyLogger, including all interfaces, classes, enums, and methods.

## Table of Contents

- [Enums](#enums)
- [Interfaces](#interfaces)
- [Classes](#classes)
- [Global Logger](#global-logger)
- [Type Definitions](#type-definitions)
- [Utility Functions](#utility-functions)

## Enums

### LogLevel

Defines the available log levels in order of severity.

```typescript
enum LogLevel {
  SILENT = 0, // No logs
  FATAL = 1,  // Critical errors causing application termination
  ERROR = 2,  // Errors that don't necessarily stop the application
  WARN = 3,   // Warnings about potential issues
  INFO = 4,   // General informational messages
  DEBUG = 5,  // Detailed information for debugging
  TRACE = 6,  // Most granular information, for tracing code execution
}
```

## Interfaces

### LogEntry

Represents a single log entry with all its metadata.

```typescript
interface LogEntry {
  /** ISO timestamp string of when the log was created */
  timestamp: string;
  /** Numeric log level */
  level: number;
  /** String representation of the log level */
  levelName: string;
  /** The log message */
  message: string;
  /** Additional arguments passed to the logging method */
  args: unknown[];
  /** Structured data for the log entry */
  data?: Record<string, unknown>;
}
```

### Transport

Interface that all transports must implement.

```typescript
interface Transport {
  /**
   * Logs an entry to the transport destination.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting and configuration
   */
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;

  /**
   * Flushes any pending log entries.
   * Should be called before application shutdown.
   */
  flush?(options?: LoggerOptions): Promise<void>;
}
```

### LogFormatter

Interface for pluggable formatters.

```typescript
interface LogFormatter {
  /**
   * Format a log entry into a string.
   * @param entry - The log entry to format
   * @returns Formatted log string
   */
  format(entry: LogEntry): string;
}
```

### LoggerOptions

Configuration options for the logger.

```typescript
interface LoggerOptions {
  /** Minimum log level to process. Defaults to LogLevel.INFO. */
  level?: LogLevel;
  /** If true, timestamps will be human-readable. Defaults to false. */
  useHumanReadableTime?: boolean;
  /** Array of transports to use. Defaults to [new ConsoleTransport()]. */
  transports?: Transport[];
  /** Output format. Defaults to 'string'. */
  format?: 'string' | 'json';
  /** Custom function to format a log entry into a string. */
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
}
```

### ChildLoggerOptions

Options for creating child loggers.

```typescript
interface ChildLoggerOptions extends Partial<LoggerOptions> {
  /** Contextual data to include with every log entry from this child logger. */
  context?: Record<string, unknown>;
}
```

### BaseLogger

Base interface for all logger methods.

```typescript
interface BaseLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
}
```

### RedactionConfig

Configuration for sensitive data redaction with advanced pattern matching.

```typescript
interface RedactionConfig {
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
  /** Replacement text for redacted values or a function for custom replacement. Default: '[REDACTED]' */
  replacement?: string | ((value: any, key: string, path: string) => string);
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
  /** Whether to log when redaction occurs for debugging/auditing. Default: false */
  auditRedaction?: boolean;
}
```

### LogRotationConfig

Configuration for log file rotation.

```typescript
interface LogRotationConfig {
  /** Maximum file size in bytes before rotation. Default: 10MB */
  maxFileSize?: number;
  /** Maximum number of rotated files to keep. Default: 5 */
  maxFiles?: number;
  /** Whether to compress rotated files with gzip. Default: true */
  compress?: boolean;
  /** Whether to rotate based on date (daily). Default: false */
  dateRotation?: boolean;
}
```

### DiscordWebhookTransportOptions

Options for Discord webhook transport batching.

```typescript
interface DiscordWebhookTransportOptions {
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
```

### DiscordRateLimitResponse

Interface for Discord rate limit responses.

```typescript
interface DiscordRateLimitResponse {
  retry_after: number;
}
```

## Classes

### ConsoleTransport

Writes log entries to the console with colorized output.

```typescript
class ConsoleTransport implements Transport {
  /**
   * Logs an entry to the console with automatic colorization.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void>

  /**
   * Console transport doesn't need to flush anything.
   */
  async flush(options?: LoggerOptions): Promise<void>
}
```

#### Features
- Automatic colorization based on log level
- Custom color support via `customConsoleColors` option  
- Proper console method mapping
- Handles circular references in logged objects
- Support for human-readable timestamps

### FileTransport

Writes log entries to a file with optional rotation and proper locking.

```typescript
class FileTransport implements Transport {
  /**
   * Creates a new FileTransport instance.
   * @param filePath - Path to the log file
   * @param rotationConfig - Optional log rotation configuration
   * @param bunOps - Optional Bun operations for dependency injection
   */
  constructor(
    filePath: string, 
    rotationConfig?: LogRotationConfig,
    bunOps?: Partial<InjectedBunFileOperations>
  )

  /**
   * Logs an entry to the file with proper write locking.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void>

  /**
   * Wait for all pending writes to complete.
   */
  async flush(options?: LoggerOptions): Promise<void>
}
```

#### Features
- Automatic log rotation by size or date
- Gzip compression of rotated files
- Proper file locking to prevent corruption
- Handles write errors gracefully
- Uses Bun's optimized file operations

### DiscordWebhookTransport

Sends log entries to a Discord webhook with intelligent batching and rate limiting.

```typescript
class DiscordWebhookTransport implements Transport {
  /**
   * Creates a new Discord webhook transport.
   * @param webhookUrl - Discord webhook URL
   * @param opts - Optional configuration
   */
  constructor(webhookUrl: string, opts?: DiscordWebhookTransportOptions)

  /**
   * Logs an entry to Discord with batching.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void>

  /**
   * Flushes pending log entries to Discord.
   */
  async flush(options?: LoggerOptions): Promise<void>
}
```

#### Features
- Intelligent batching to respect Discord rate limits
- Automatic retry with exponential backoff
- Rate limit detection and handling
- Message formatting for Discord (supports JSON code blocks)
- Message truncation to fit Discord's 2000 character limit

### ChildLogger

Creates loggers with inherited configuration and specific context.

```typescript
class ChildLogger implements BaseLogger {
  /**
   * Creates a new child logger.
   * @param parent - Parent logger instance
   * @param options - Child logger options
   */
  constructor(parent: BaseLogger, options: ChildLoggerOptions = {})

  // Implements all BaseLogger methods with context inheritance
  fatal(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  trace(message: string, ...args: unknown[]): void
  child(childOptions?: ChildLoggerOptions): ChildLogger
}
```

### LogfmtFormatter

Built-in formatter that outputs logs in logfmt format.

```typescript
class LogfmtFormatter implements LogFormatter {
  /**
   * Format a log entry as logfmt (key=value pairs).
   * @param entry - The log entry to format
   * @returns Formatted logfmt string
   */
  format(entry: LogEntry): string
}
```

#### Features
- Automatic quote escaping for string values
- Timestamp as `ts` field
- Log level as `level` field
- Message as `msg` field
- Structured data as additional key=value pairs
- Arguments as `arg0`, `arg1`, etc.

### NdjsonFormatter

Built-in formatter that outputs logs as newline-delimited JSON.

```typescript
class NdjsonFormatter implements LogFormatter {
  /**
   * Format a log entry as NDJSON.
   * @param entry - The log entry to format
   * @returns Formatted JSON string
   */
  format(entry: LogEntry): string
}
```

#### Features
- Each log entry is valid JSON
- Easy to parse programmatically
- Compatible with log aggregation tools
- Preserves data types (numbers, booleans, etc.)
- Arguments included as `args` array when present

## Global Logger

The main logger instance with additional utility methods.

```typescript
const logger: BaseLogger & {
  options: LoggerOptions;
  setOptions(newOptions: LoggerOptions): void;
  resetOptions(): void;
  flushAll(): Promise<void>;
}
```

### Methods

#### setOptions(newOptions)

Updates logger configuration by merging with existing options.

```typescript
setOptions(newOptions: LoggerOptions): void
```

#### resetOptions()

Resets logger options to defaults.

```typescript
resetOptions(): void
```

#### flushAll()

Flushes all transports including singleton Discord transport.

```typescript
flushAll(): Promise<void>
```

#### Logging Methods

All logging methods support structured logging and automatic redaction.

```typescript
fatal(message: string, ...args: unknown[]): void
error(message: string, ...args: unknown[]): void
warn(message: string, ...args: unknown[]): void
info(message: string, ...args: unknown[]): void
debug(message: string, ...args: unknown[]): void
trace(message: string, ...args: unknown[]): void
```

**Structured Logging:**
```typescript
logger.info({ userId: 123, action: 'login' }, 'User logged in');
logger.error({ error: 'ECONNREFUSED', host: 'db.example.com' }, 'Connection failed');
```

**Discord Integration:**
```typescript
logger.error({ discord: true, severity: 'critical' }, 'System failure detected');
```

#### child(childOptions?)

Creates a child logger with inherited configuration.

```typescript
child(childOptions?: ChildLoggerOptions): ChildLogger
```

## Type Definitions

### CustomConsoleColors

Type for custom console color definitions.

```typescript
type CustomConsoleColors = Partial<{
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
```

## Utility Functions

The following utility functions are available for type checking and data processing:

### Type Guards

```typescript
/**
 * Type guard to check if a value is a record (plain object).
 */
function isRecord(value: unknown): value is Record<string, unknown>

/**
 * Type guard to check if a value looks like an Error object.
 */
function isErrorLike(value: unknown): value is { name: string; message: string; stack?: string; cause?: unknown }
```

### Error Serialization

```typescript
/**
 * Serializes an error object with optional depth limiting for causes.
 */
function serializeError(error: Error, maxDepth?: number): Record<string, unknown>
```

### Argument Processing

```typescript
/**
 * Safely converts unknown arguments to serializable format with circular reference detection.
 */
function processLogArgs(args: unknown[]): unknown[]
```

### Redaction Functions

```typescript
/**
 * Applies redaction to a log entry.
 */
function getRedactedEntry(
  entry: LogEntry,
  redactionConfig?: RedactionConfig,
  target?: 'console' | 'file'
): LogEntry

/**
 * Deeply clones and redacts an object based on the redaction configuration.
 */
function redactObject(
  obj: unknown, 
  config: RedactionConfig, 
  path?: string, 
  seen?: WeakSet<object>
): unknown
```

## Configuration Examples

### Production Configuration

```typescript
import { 
  logger, 
  LogLevel, 
  FileTransport,
  NdjsonFormatter 
} from 'jellylogger';

logger.setOptions({
  level: LogLevel.WARN,
  format: 'json',
  pluggableFormatter: new NdjsonFormatter(),
  transports: [
    new FileTransport('./logs/production.log', {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10,
      compress: true
    })
  ],
  redaction: {
    keys: ['password', 'token', 'apiKey', 'secret'],
    keyPatterns: [/auth/i, /secret/i],
    valuePatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/], // Credit cards
    redactStrings: true,
    stringPatterns: [/\b\d{3}-\d{2}-\d{4}\b/], // SSN
    replacement: '[REDACTED]'
  }
});
```

### Development Configuration

```typescript
import { 
  logger, 
  LogLevel, 
  ConsoleTransport 
} from 'jellylogger';

logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,
  format: 'string',
  transports: [new ConsoleTransport()],
  customConsoleColors: {
    [LogLevel.DEBUG]: '#00FFFF',
    [LogLevel.INFO]: '#00FF00'
  }
});
```
logger.info({ data: obj }, 'Object with circular reference');
// Circular references are safely handled
```

### Automatic Type Coercion

JellyLogger safely handles various data types:

```typescript
logger.info('Mixed types', 123, true, null, undefined, Symbol('test'), BigInt(123));
// All types are safely converted for logging
```

## Configuration Examples

### Production Configuration

```typescript
import { 
  logger, 
  LogLevel, 
  FileTransport,
  NdjsonFormatter 
} from 'jellylogger';

logger.setOptions({
  level: LogLevel.WARN,
  format: 'json',
  pluggableFormatter: new NdjsonFormatter(),
  transports: [
    new FileTransport('./logs/production.log', {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10,
      compress: true
    })
  ],
  redaction: {
    keys: ['password', 'token', 'apiKey', 'secret'],
    replacement: '[REDACTED]'
  }
});
```

### Development Configuration

```typescript
import { 
  logger, 
  LogLevel, 
  ConsoleTransport 
} from 'jellylogger';

logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,
  format: 'string',
  transports: [new ConsoleTransport()],
  customConsoleColors: {
    [LogLevel.DEBUG]: '#00FFFF',
    [LogLevel.INFO]: '#00FF00'
  }
});
```

### Multi-Transport Configuration

```typescript
import { 
  logger, 
  ConsoleTransport, 
  FileTransport,
  DiscordWebhookTransport 
} from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log'),
    new DiscordWebhookTransport(process.env.DISCORD_WEBHOOK_URL!, {
      maxBatchSize: 5,
      batchIntervalMs: 3000
    })
  ],
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL
});
```
