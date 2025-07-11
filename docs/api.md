# JellyLogger API Reference

Complete API documentation for JellyLogger.

---

## Table of Contents

1. [Core Logger](#core-logger)
2. [Log Levels](#log-levels)
3. [Interfaces](#interfaces)
4. [Transports](#transports)
5. [Formatters](#formatters)
6. [Redaction](#redaction)
7. [Utility Functions](#utility-functions)
8. [Types](#types)

---

## Core Logger

### logger

The main logger instance that serves as the entry point for JellyLogger.

```typescript
import { logger } from "jellylogger";
```

#### Methods

##### Logging Methods

```typescript
logger.trace(message: string, ...args: unknown[]): void
```

Logs a TRACE level message (level 6). Most granular logging level.

```typescript
logger.debug(message: string, ...args: unknown[]): void
```

Logs a DEBUG level message (level 5). For debugging information.

```typescript
logger.info(message: string, ...args: unknown[]): void
```

Logs an INFO level message (level 4). General information messages.

```typescript
logger.warn(message: string, ...args: unknown[]): void
```

Logs a WARN level message (level 3). Warning messages for potential issues.

```typescript
logger.error(message: string, ...args: unknown[]): void
```

Logs an ERROR level message (level 2). Error messages that don't stop the application.

```typescript
logger.fatal(message: string, ...args: unknown[]): void
```

Logs a FATAL level message (level 1). Critical errors that may cause application termination.

**Examples:**
```typescript
logger.info("User logged in", { userId: "123", ip: "192.168.1.1" });
logger.error("Database connection failed", error);
logger.debug("Processing step completed", { step: 5, duration: "120ms" });
```

##### Configuration Methods

```typescript
logger.setOptions(options: Partial<LoggerOptions>): void
```

Updates the logger configuration. Options are merged with existing configuration.

```typescript
logger.resetOptions(): void
```

Resets the logger configuration to default values.

**Example:**
```typescript
logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,
  redaction: {
    keys: ["password", "token"]
  }
});
```

##### Transport Management

```typescript
logger.addTransport(transport: Transport): void
```

Adds a transport to the logger.

```typescript
logger.removeTransport(transport: Transport): void
```

Removes a specific transport from the logger.

```typescript
logger.clearTransports(): void
```

Removes all transports from the logger.

```typescript
logger.setTransports(transports: Transport[]): void
```

Replaces all transports with the provided array.

```typescript
logger.flushAll(): Promise<void>
```

Flushes all transports, ensuring all pending logs are written.

**Example:**
```typescript
const fileTransport = new FileTransport("./logs/app.log");
logger.addTransport(fileTransport);

// Before application shutdown
await logger.flushAll();
```

##### Child Logger Creation

```typescript
logger.child(options?: ChildLoggerOptions): ChildLogger
```

Creates a child logger that inherits the parent's configuration but can have its own context.

**Example:**
```typescript
const userLogger = logger.child({
  messagePrefix: "USER",
  context: { userId: "123" }
});

userLogger.info("Profile updated"); // [USER] Profile updated
```

---

## Log Levels

### LogLevel Enum

```typescript
enum LogLevel {
  SILENT = 0,  // No logs
  FATAL = 1,   // Critical errors
  ERROR = 2,   // Errors
  WARN = 3,    // Warnings  
  INFO = 4,    // Information (default)
  DEBUG = 5,   // Debug info
  TRACE = 6    // Detailed tracing
}
```

**Usage:**
```typescript
import { LogLevel } from "jellylogger";

logger.setOptions({ level: LogLevel.DEBUG });
```

---

## Interfaces

### LoggerOptions

Configuration interface for the main logger.

```typescript
interface LoggerOptions {
  level?: LogLevel;                      // Minimum log level (default: INFO)
  useHumanReadableTime?: boolean;        // Human-readable timestamps (default: true)
  transports?: Transport[];              // Array of transports (default: [ConsoleTransport])
  format?: 'string' | 'json';           // Legacy format option
  formatter?: (entry: LogEntry) => string; // Legacy custom formatter
  customConsoleColors?: CustomConsoleColors; // Custom console colors
  redaction?: RedactionConfig;           // Redaction configuration
  pluggableFormatter?: LogFormatter;     // Pluggable formatter instance
  [key: string]: unknown;               // Allow additional properties
}
```

### ChildLoggerOptions

Configuration for child loggers.

```typescript
interface ChildLoggerOptions {
  messagePrefix?: string;                // Prefix for all messages
  defaultData?: Record<string, unknown>; // Default data context
  context?: Record<string, unknown>;     // Alias for defaultData
}
```

### LogEntry

Represents a single log entry.

```typescript
interface LogEntry {
  timestamp: string;                     // ISO timestamp
  level: LogLevel;                       // Numeric log level
  levelName: string;                     // String log level name
  message: string;                       // Primary message
  args: {                                // Processed arguments
    processedArgs: unknown[];
    hasComplexArgs: boolean;
  };
  data?: Record<string, unknown>;        // Structured data
}
```

### BaseLogger

Base interface for logger functionality.

```typescript
interface BaseLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
  flushAll(): Promise<void>;
}
```

---

## Transports

### Transport Interface

All transports implement this interface:

```typescript
interface Transport {
  log(entry: LogEntry, options?: TransportOptions): Promise<void>;
  flush?(options?: TransportOptions): Promise<void>;
}
```

### TransportOptions

Options passed to transport methods:

```typescript
interface TransportOptions {
  format?: 'string' | 'json';           // Output format
  formatter?: (entry: LogEntry) => string; // Custom formatter
  pluggableFormatter?: LogFormatter;     // Pluggable formatter
  [key: string]: unknown;               // Additional options
}
```

### Built-in Transports

#### ConsoleTransport

Outputs logs to the console with color support.

```typescript
import { ConsoleTransport } from "jellylogger";

const transport = new ConsoleTransport();
logger.addTransport(transport);
```

#### FileTransport

Writes logs to files with rotation support.

```typescript
import { FileTransport } from "jellylogger";

const transport = new FileTransport(filePath: string, config?: LogRotationConfig);
logger.addTransport(transport);
```

#### DiscordWebhookTransport

Sends logs to Discord via webhooks.

```typescript
import { DiscordWebhookTransport } from "jellylogger";

const transport = new DiscordWebhookTransport(webhookUrl: string);
logger.addTransport(transport);
```

#### WebSocketTransport

Streams logs over WebSocket connections.

```typescript
import { WebSocketTransport } from "jellylogger";

const transport = new WebSocketTransport(url: string);
logger.addTransport(transport);
```

### LogRotationConfig

Configuration for file rotation:

```typescript
interface LogRotationConfig {
  maxFileSize?: number;    // Max size in bytes before rotation (default: 10MB)
  maxFiles?: number;       // Number of rotated files to keep (default: 5)
  compress?: boolean;      // Compress rotated files with gzip (default: true)
  dateRotation?: boolean;  // Enable daily rotation (default: false)
}
```

---

## Formatters

### LogFormatter Interface

Interface for creating custom formatters:

```typescript
interface LogFormatter {
  format(entry: LogEntry, options?: {
    consoleColors?: CustomConsoleColors;
    useColors?: boolean;
  }): string;
}
```

### Built-in Formatters

#### createFormatter Function

Factory function for built-in formatters:

```typescript
function createFormatter(name: BuiltInFormatterName): LogFormatter
```

**Available formatters:**
- `"default"` - Human-readable format
- `"ndjson"` - Newline-delimited JSON
- `"logfmt"` - Key=value pairs format

**Example:**
```typescript
import { createFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: createFormatter("ndjson")
});
```

#### DefaultFormatter

The standard human-readable formatter:

```typescript
import { DefaultFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new DefaultFormatter()
});
```

#### NdjsonFormatter

JSON formatter with one object per line:

```typescript
import { NdjsonFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});
```

#### LogfmtFormatter

Key=value pairs formatter:

```typescript
import { LogfmtFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});
```

---

## Redaction

### RedactionConfig Interface

```typescript
interface RedactionConfig {
  fields?: string[];                    // Target log entry fields (default: ['args', 'data', 'message'])
  keys?: string[];                      // Keys to redact (supports wildcards)
  keyPatterns?: RegExp[];               // Regular expressions for key matching
  valuePatterns?: RegExp[];             // Regular expressions for value matching
  redactStrings?: boolean;              // Whether to redact string patterns (default: false)
  stringPatterns?: RegExp[];            // String patterns to redact
  whitelist?: string[];                 // Keys to whitelist from redaction
  whitelistPatterns?: RegExp[];         // Regex patterns for whitelisting
  fieldConfigs?: Record<string, FieldRedactionConfig>; // Per-field configurations
  customRedactor?: CustomRedactor;      // Custom redaction function
  replacement?: string | ReplacementFunction; // Replacement value or function
  caseInsensitive?: boolean;            // Case-insensitive key matching (default: true)
  redactIn?: 'console' | 'file' | 'both'; // Where to apply redaction (default: 'both')
  auditRedaction?: boolean;             // Log redaction events (default: false)
  auditHook?: AuditHook;               // Custom audit function
  deepClone?: boolean;                  // Deep clone before redaction (default: true)
  maxDepth?: number;                    // Maximum redaction depth (default: 10)
}
```

### FieldRedactionConfig

Per-field redaction configuration:

```typescript
interface FieldRedactionConfig {
  replacement?: string | ReplacementFunction; // Field-specific replacement
  customRedactor?: CustomRedactor;           // Field-specific redactor
  disabled?: boolean;                        // Disable redaction for this field
}
```

### Custom Functions

#### CustomRedactor

```typescript
type CustomRedactor = (
  value: unknown, 
  context: RedactionContext
) => unknown;
```

#### ReplacementFunction

```typescript
type ReplacementFunction = (
  value: unknown, 
  context: RedactionContext
) => string;
```

#### RedactionContext

```typescript
interface RedactionContext {
  key: string;                    // Current key
  path: string;                   // Full path (e.g., "user.profile.email")
  field: string;                  // Log entry field (e.g., "data", "args")
  originalValue: unknown;         // Original value before redaction
  target?: 'console' | 'file';   // Target transport type
}
```

### Example Usage

```typescript
logger.setOptions({
  redaction: {
    keys: ["password", "*.token", "user.credentials.*"],
    stringPatterns: [/Bearer\s+[\w-]+/gi],
    fieldConfigs: {
      "user.email": {
        replacement: "[EMAIL_REDACTED]"
      },
      "debug.*": {
        disabled: true
      }
    },
    customRedactor: (value, context) => {
      if (context.path.includes('sensitive')) {
        return '[CUSTOM_REDACTED]';
      }
      return value;
    },
    auditHook: (event) => {
      console.debug(`Redacted ${event.type} at ${event.context.path}`);
    }
  }
});
```

---

## Utility Functions

### Redaction Functions

```typescript
function getRedactedEntry(
  entry: LogEntry, 
  config?: RedactionConfig, 
  target?: 'console' | 'file'
): LogEntry
```

Applies redaction to a log entry.

```typescript
function shouldRedactKey(path: string, key: string, config: RedactionConfig): boolean
```

Checks if a key should be redacted.

```typescript
function shouldRedactValue(value: unknown, config: RedactionConfig): boolean
```

Checks if a value should be redacted based on patterns.

### Serialization Functions

```typescript
function getTimestamp(useHumanReadable?: boolean): string
```

Generates timestamps for log entries.

```typescript
function processLogArgs(args: unknown[]): { processedArgs: unknown[]; hasComplexArgs: boolean }
```

Processes log arguments for structured logging.

```typescript
function serializeError(error: Error): Record<string, unknown>
```

Safely serializes Error objects.

### Type Guards

```typescript
function isRecord(value: unknown): value is Record<string, unknown>
```

Type guard for plain objects.

```typescript
function isErrorLike(value: unknown): value is Error
```

Type guard for Error-like objects.

---

## Types

### CustomConsoleColors

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
}> & {
  [key: string]: string | undefined;
};
```

### Built-in Formatter Names

```typescript
type BuiltInFormatterName = 'default' | 'logfmt' | 'ndjson';
```

---

## Error Handling

JellyLogger is designed to be fault-tolerant:

- **Transport Errors**: If a transport fails, other transports continue working
- **Formatter Errors**: Falls back to default formatting if custom formatters fail
- **Redaction Errors**: Continues with original values if redaction fails
- **Async Errors**: Caught and logged without crashing the application

### Example Error Handling

```typescript
// This won't crash your application
logger.addTransport(new FileTransport("/invalid/path"));
logger.info("This message will still appear in console");

// Async transport errors are caught
logger.addTransport(new WebSocketTransport("ws://invalid-url"));
logger.info("This continues to work");
```

---

## Performance Considerations

- **Synchronous File Operations**: FileTransport uses sync writes for reliability
- **Background Rotation**: File rotation happens asynchronously
- **Transport Parallelism**: All transports receive logs in parallel
- **Memory Management**: Circular reference detection prevents memory leaks
- **Lazy Evaluation**: Log processing only occurs if the log level is enabled

---

## Version Compatibility

This API documentation is for JellyLogger v2.2.1+. For migration information from earlier versions, see the [Migration Guide](./migration.md).
