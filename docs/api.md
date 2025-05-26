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
  level: LogLevel;
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

Configuration for sensitive data redaction.

```typescript
interface RedactionConfig {
  /** Keys to redact in structured data and objects */
  keys: string[];
  /** Replacement text for redacted values. Default: '[REDACTED]' */
  replacement?: string;
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
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

## Classes

### ConsoleTransport

Writes log entries to the console with colorized output.

```typescript
class ConsoleTransport implements Transport {
  /**
   * Logs an entry to the console.
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

#### Usage

```typescript
import { ConsoleTransport } from 'jellylogger';

const transport = new ConsoleTransport();
```

### FileTransport

Writes log entries to a file with optional rotation.

```typescript
class FileTransport implements Transport {
  /**
   * Creates a new FileTransport instance.
   * @param filePath - Path to the log file
   * @param rotationConfig - Optional log rotation configuration
   */
  constructor(filePath: string, rotationConfig?: LogRotationConfig)

  /**
   * Logs an entry to the file.
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

#### Usage

```typescript
import { FileTransport } from 'jellylogger';

// Basic file transport
const transport = new FileTransport('./logs/app.log');

// With rotation
const rotatingTransport = new FileTransport('./logs/app.log', {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  compress: true,
  dateRotation: false
});
```

### DiscordWebhookTransport

Sends log entries to a Discord webhook with batching and rate limiting.

```typescript
class DiscordWebhookTransport implements Transport {
  /**
   * Creates a new Discord webhook transport.
   * @param webhookUrl - Discord webhook URL
   * @param opts - Optional configuration
   */
  constructor(webhookUrl: string, opts?: DiscordWebhookTransportOptions)

  /**
   * Logs an entry to Discord.
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

#### Usage

```typescript
import { DiscordWebhookTransport } from 'jellylogger';

const transport = new DiscordWebhookTransport(
  'https://discord.com/api/webhooks/your/webhook/url',
  {
    batchIntervalMs: 2000,
    maxBatchSize: 10,
    username: 'MyApp Logger',
    maxRetries: 3
  }
);
```

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

  // Implements all BaseLogger methods
  fatal(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  trace(message: string, ...args: unknown[]): void
  child(childOptions?: ChildLoggerOptions): ChildLogger
}
```

#### Usage

```typescript
import { logger } from 'jellylogger';

const childLogger = logger.child({
  context: { module: 'user-service' }
});

childLogger.info('User created'); // Includes context automatically
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

#### Usage

```typescript
import { logger, LogfmtFormatter } from 'jellylogger';

logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

logger.info({ userId: 123 }, 'User login');
// Output: ts=2024-01-15T10:30:00.000Z level=info msg="User login" userId="123"
```

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

#### Usage

```typescript
import { logger, NdjsonFormatter } from 'jellylogger';

logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});

logger.info({ userId: 123 }, 'User login');
// Output: {"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"User login","userId":123}
```

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

**Parameters:**
- `newOptions` - New options to merge with existing configuration

**Example:**
```typescript
import { logger, LogLevel } from 'jellylogger';

logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,
  format: 'json'
});
```

#### resetOptions()

Resets logger options to defaults.

```typescript
resetOptions(): void
```

**Example:**
```typescript
logger.resetOptions();
```

#### flushAll()

Flushes all transports including singleton Discord transport.

```typescript
flushAll(): Promise<void>
```

**Example:**
```typescript
// Ensure all logs are written before shutdown
process.on('SIGTERM', async () => {
  await logger.flushAll();
  process.exit(0);
});
```

#### Logging Methods

All logging methods support structured logging by passing an object as the first argument.

```typescript
fatal(message: string, ...args: unknown[]): void
error(message: string, ...args: unknown[]): void
warn(message: string, ...args: unknown[]): void
info(message: string, ...args: unknown[]): void
debug(message: string, ...args: unknown[]): void
trace(message: string, ...args: unknown[]): void
```

**Basic Usage:**
```typescript
logger.info('Application started');
logger.error('Database connection failed');
```

**Structured Logging:**
```typescript
logger.info({ userId: 123, action: 'login' }, 'User logged in');
logger.error({ error: 'ECONNREFUSED', host: 'db.example.com' }, 'Connection failed');
```

**Discord Integration:**
```typescript
// Configure webhook URL first
logger.setOptions({
  discordWebhookUrl: 'https://discord.com/api/webhooks/your/webhook/url'
});

// Send to Discord
logger.error({ discord: true, severity: 'critical' }, 'System failure detected');
```

#### child(childOptions?)

Creates a child logger with inherited configuration.

```typescript
child(childOptions?: ChildLoggerOptions): ChildLogger
```

**Parameters:**
- `childOptions` - Optional configuration for the child logger

**Example:**
```typescript
const dbLogger = logger.child({
  context: { module: 'database', version: '1.0.0' }
});

dbLogger.info('Query executed'); // Includes context automatically
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

Accepts color values as:
- Hex: `#FF0000`
- RGB: `rgb(255,0,0)`
- HSL: `hsl(0,100%,50%)`
- HSV: `hsv(0,100%,100%)`
- CMYK: `cmyk(0,100,100,0)`
- ANSI escape codes: `\x1b[31m`

**Example:**
```typescript
logger.setOptions({
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF4444',
    [LogLevel.WARN]: 'rgb(255,165,0)',
    [LogLevel.INFO]: 'hsl(120,100%,50%)',
    bold: '\x1b[1m'
  }
});
```

## Utility Functions

### Error Serialization

JellyLogger automatically serializes Error objects with support for nested causes:

```typescript
try {
  throw new Error('Database connection failed');
} catch (error) {
  logger.error('Operation failed', error);
  // Error will be automatically serialized with stack trace
}
```

### Circular Reference Handling

All objects are automatically processed to handle circular references:

```typescript
const obj = { name: 'test' };
obj.self = obj; // Circular reference

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
