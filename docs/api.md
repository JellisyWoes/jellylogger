# JellyLogger API Reference

Complete API documentation for JellyLogger classes, interfaces, types, and functions.

---

## Table of Contents

- [Core Logger](#core-logger)
- [Log Levels](#log-levels)
- [Transports](#transports)
- [Formatters](#formatters)
- [Redaction](#redaction)
- [Type Definitions](#type-definitions)
- [Utility Functions](#utility-functions)
- [Preset Helpers](#preset-helpers)

---

## Core Logger

### logger

The main singleton logger instance.

```typescript
import { logger } from "jellylogger";
```

#### Methods

##### Logging Methods

```typescript
logger.fatal(message: string, ...args: unknown[]): void
logger.error(message: string, ...args: unknown[]): void
logger.warn(message: string, ...args: unknown[]): void
logger.info(message: string, ...args: unknown[]): void
logger.debug(message: string, ...args: unknown[]): void
logger.trace(message: string, ...args: unknown[]): void
```

**Parameters:**
- `message` - The log message
- `...args` - Additional arguments (objects, errors, primitives)

**Example:**
```typescript
logger.info("User action", { userId: 123 }, "Additional context");
logger.error("Database error", error, { query: "SELECT * FROM users" });
```

##### Configuration Methods

```typescript
logger.setOptions(newOptions: LoggerOptions): void
```

Sets logger configuration options. Options are merged with existing configuration.

**Parameters:**
- `newOptions` - Configuration object

**Example:**
```typescript
logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,
  format: "json"
});
```

```typescript
logger.resetOptions(): void
```

Resets logger to default configuration.

```typescript
logger.child(childOptions?: ChildLoggerOptions): ChildLogger
```

Creates a child logger with inherited configuration.

**Parameters:**
- `childOptions` - Child-specific configuration

**Example:**
```typescript
const requestLogger = logger.child({
  messagePrefix: "[REQ-123]",
  context: { requestId: "abc123" }
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

#### Properties

```typescript
logger.options: LoggerOptions
```

Current logger configuration (read-only).

---

## Log Levels

### LogLevel Enum

```typescript
enum LogLevel {
  SILENT = 0,  // No logs
  FATAL = 1,   // Critical errors causing application termination
  ERROR = 2,   // Errors that don't necessarily stop the application
  WARN = 3,    // Warnings about potential issues
  INFO = 4,    // General informational messages
  DEBUG = 5,   // Detailed information for debugging
  TRACE = 6,   // Most granular information, for tracing code execution
}
```

**Usage:**
```typescript
import { LogLevel } from "jellylogger";

logger.setOptions({ level: LogLevel.DEBUG });
```

---

## Transports

### ConsoleTransport

Writes logs to the console with colorized output.

```typescript
new ConsoleTransport()
```

**Example:**
```typescript
import { ConsoleTransport } from "jellylogger";

const consoleTransport = new ConsoleTransport();
logger.addTransport(consoleTransport);
```

### FileTransport

Writes logs to files with optional rotation.

```typescript
new FileTransport(filePath: string, rotationConfig?: LogRotationConfig)
```

**Parameters:**
- `filePath` - Path to the log file
- `rotationConfig` - Optional rotation configuration

**Example:**
```typescript
import { FileTransport } from "jellylogger";

const fileTransport = new FileTransport("./logs/app.log", {
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5,
  compress: true,
  dateRotation: true
});
```

#### LogRotationConfig

```typescript
interface LogRotationConfig {
  maxFileSize?: number;     // Maximum file size in bytes before rotation (default: 10MB)
  maxFiles?: number;        // Maximum number of rotated files to keep (default: 5)
  compress?: boolean;       // Whether to compress rotated files with gzip (default: true)
  dateRotation?: boolean;   // Whether to rotate based on date (daily) (default: false)
}
```

### DiscordWebhookTransport

Sends logs to Discord via webhook with batching to avoid rate limits.

```typescript
new DiscordWebhookTransport(webhookUrl: string, options?: DiscordWebhookTransportOptions)
```

**Parameters:**
- `webhookUrl` - Discord webhook URL
- `options` - Optional configuration

**Example:**
```typescript
import { DiscordWebhookTransport } from "jellylogger";

const discordTransport = new DiscordWebhookTransport(
  "https://discord.com/api/webhooks/...",
  {
    batchIntervalMs: 2000,
    maxBatchSize: 10,
    username: "MyApp Logger"
  }
);
```

#### DiscordWebhookTransportOptions

```typescript
interface DiscordWebhookTransportOptions {
  batchIntervalMs?: number;        // How often to send batches (ms) (default: 2000)
  maxBatchSize?: number;           // Max entries per batch (default: 10)
  username?: string;               // Username for Discord webhook (default: 'JellyLogger')
  maxRetries?: number;             // Maximum retry attempts (default: 3)
  suppressConsoleErrors?: boolean; // Suppress console.error on failure (default: false)
}
```

### WebSocketTransport

Streams logs to a WebSocket server in real-time.

```typescript
new WebSocketTransport(url: string, options?: WebSocketTransportOptions)
```

**Parameters:**
- `url` - WebSocket server URL
- `options` - Optional configuration

**Example:**
```typescript
import { WebSocketTransport } from "jellylogger";

const wsTransport = new WebSocketTransport("ws://localhost:8080/logs", {
  reconnectIntervalMs: 1000,
  maxReconnectIntervalMs: 30000
});
```

#### WebSocketTransportOptions

```typescript
interface WebSocketTransportOptions {
  reconnectIntervalMs?: number;    // Reconnect interval in ms (initial) (default: 1000)
  maxReconnectIntervalMs?: number; // Maximum reconnect interval in ms (default: 30000)
  redact?: boolean;                // Whether to redact logs for this transport (default: true)
  serializer?: (entry: LogEntry) => string; // Custom serialization function
}
```

### Transport Interface

All transports implement this interface:

```typescript
interface Transport {
  log(entry: LogEntry, options?: TransportOptions): Promise<void>;
  flush?(options?: TransportOptions): Promise<void>;
}
```

---

## Formatters

### LogFormatter Interface

```typescript
interface LogFormatter {
  format(entry: LogEntry): string;
}
```

### Built-in Formatters

#### LogfmtFormatter

Formats logs in logfmt style.

```typescript
import { LogfmtFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

// Output: ts=2024-01-15T10:30:45.123Z level=info msg="User login" userId=123
```

#### NdjsonFormatter

Formats logs as newline-delimited JSON.

```typescript
import { NdjsonFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});

// Output: {"timestamp":"2024-01-15T10:30:45.123Z","level":"info","message":"User login","userId":123}
```

### Custom Formatters

```typescript
// Function formatter
logger.setOptions({
  formatter: (entry: LogEntry) => {
    return `[${entry.timestamp}] ${entry.levelName}: ${entry.message}`;
  }
});

// Pluggable formatter class
class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `CUSTOM: ${entry.message}`;
  }
}

logger.setOptions({
  pluggableFormatter: new CustomFormatter()
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

### FieldRedactionConfig Interface

```typescript
interface FieldRedactionConfig {
  replacement?: string | ReplacementFunction;  // Field-specific replacement
  customRedactor?: CustomRedactor;             // Field-specific custom redactor
  disabled?: boolean;                          // Disable redaction for this field
}
```

### Type Definitions

```typescript
type CustomRedactor = (value: unknown, context: RedactionContext) => unknown;

type ReplacementFunction = (value: any, context: RedactionContext) => string;

type AuditHook = (event: RedactionAuditEvent) => void;

interface RedactionContext {
  key: string;           // The key being processed
  path: string;          // Full path to the current location
  field: string;         // The field in the log entry being processed
  originalValue: unknown; // The original value before redaction
  target?: 'console' | 'file'; // Target where redaction will be applied
}

interface RedactionAuditEvent {
  type: 'key' | 'value' | 'string' | 'custom' | 'field';
  context: RedactionContext;
  before: unknown;
  after: unknown;
  timestamp: Date;
  rule?: string;
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

## Type Definitions

### LogEntry Interface

```typescript
interface LogEntry {
  timestamp: string;               // ISO timestamp or human-readable
  level: LogLevel;                // Numeric log level
  levelName: string;              // String representation of level
  message: string;                // Log message
  args: unknown[];                // Additional arguments
  data?: Record<string, unknown>; // Structured data
}
```

### LoggerOptions Interface

```typescript
interface LoggerOptions {
  level?: LogLevel;                        // Minimum log level (default: LogLevel.INFO)
  useHumanReadableTime?: boolean;          // Human-readable timestamps (default: false)
  transports?: Transport[];                // Array of transports (default: [new ConsoleTransport()])
  format?: 'string' | 'json';             // Output format (default: 'string')
  formatter?: (entry: LogEntry) => string; // Custom formatter function
  customConsoleColors?: CustomConsoleColors; // Custom console colors
  redaction?: RedactionConfig;             // Redaction configuration
  pluggableFormatter?: LogFormatter;       // Pluggable formatter instance
  discordWebhookUrl?: string;             // Discord webhook URL for discord: true flag
  context?: Record<string, unknown>;       // Logger context
  [key: string]: unknown;                 // Additional properties
}
```

### ChildLoggerOptions Interface

```typescript
interface ChildLoggerOptions {
  messagePrefix?: string;                  // Prefix for all messages
  defaultData?: Record<string, unknown>;   // Default structured data
  context?: Record<string, unknown>;       // Context data (alias for defaultData)
}
```

### CustomConsoleColors Type

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

### TransportOptions Interface

```typescript
interface TransportOptions {
  format?: 'string' | 'json';             // Output format for this transport
  formatter?: (entry: LogEntry) => string; // Custom formatter for this transport
  pluggableFormatter?: LogFormatter;       // Pluggable formatter for this transport
  [key: string]: unknown;                 // Additional transport-specific options
}
```

---

## Utility Functions

### Type Guards

```typescript
function isRecord(value: unknown): value is Record<string, unknown>
```

Checks if a value is a plain object record.

```typescript
function isErrorLike(value: unknown): value is { name: string; message: string; stack?: string; cause?: unknown }
```

Checks if a value looks like an Error object.

```typescript
function isSerializable(value: unknown): boolean
```

Checks if a value can be safely JSON.stringify'd.

```typescript
function isPrimitive(value: unknown): value is string | number | boolean | null | undefined
```

Checks if a value is a primitive type.

### Serialization

```typescript
function getTimestamp(humanReadable?: boolean): string
```

Generates timestamp string (ISO or human-readable).

```typescript
function serializeError(error: Error, maxDepth?: number): Record<string, unknown>
```

Serializes error objects with optional depth limiting.

```typescript
function processLogArgs(args: unknown[]): unknown[]
```

Safely processes log arguments for serialization.

### Colors

```typescript
function toAnsiColor(color?: string, fallback?: string): string
```

Converts color input to ANSI escape code using Bun.color.

### Redaction Functions

```typescript
function shouldRedactKey(keyPath: string, key: string, config: RedactionConfig): boolean
```

Checks if a key should be redacted based on configuration.

```typescript
function shouldRedactValue(value: any, config: RedactionConfig): boolean
```

Checks if a value should be redacted based on patterns.

```typescript
function redactString(str: string, config: RedactionConfig, context?: RedactionContext): string
```

Redacts sensitive patterns in strings.

```typescript
function redactObject(obj: unknown, config: RedactionConfig, context?: Partial<RedactionContext>): unknown
```

Recursively redacts objects based on configuration.

```typescript
function getRedactedEntry(entry: LogEntry, redactionConfig?: RedactionConfig, target?: 'console' | 'file'): LogEntry
```

Returns a redacted copy of a log entry.

```typescript
function needsRedaction(obj: unknown, config: RedactionConfig, path?: string): boolean
```

Checks if an object needs redaction to avoid unnecessary cloning.

---

## Preset Helpers

Quick setup functions for common transport configurations:

```typescript
function useConsoleAndFile(filePath: string, rotationConfig?: LogRotationConfig): void
```

Configures logger with console and file transports.

```typescript
function useConsoleFileAndDiscord(
  filePath: string,
  discordWebhookUrl: string,
  rotationConfig?: LogRotationConfig
): void
```

Configures logger with console, file, and Discord transports.

```typescript
function useConsoleAndWebSocket(websocketUrl: string): void
```

Configures logger with console and WebSocket transports.

```typescript
function useAllTransports(
  filePath: string,
  discordWebhookUrl: string,
  websocketUrl: string,
  rotationConfig?: LogRotationConfig
): void
```

Configures logger with all available transports.

```typescript
function addFileLogging(filePath: string, rotationConfig?: LogRotationConfig): void
```

Adds file logging to current configuration.

```typescript
function addDiscordLogging(discordWebhookUrl: string): void
```

Adds Discord webhook logging to current configuration.

```typescript
function addWebSocketLogging(websocketUrl: string): void
```

Adds WebSocket logging to current configuration.

**Example:**
```typescript
import { useConsoleAndFile, addDiscordLogging } from "jellylogger";

// Quick setup
useConsoleAndFile("./logs/app.log");

// Add Discord later
addDiscordLogging("https://discord.com/api/webhooks/...");
```

---

## Advanced Usage Examples

### Custom Transport

```typescript
import type { Transport, LogEntry, TransportOptions } from "jellylogger";

class DatabaseTransport implements Transport {
  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Implementation
  }

  async flush(): Promise<void> {
    // Implementation
  }
}

logger.addTransport(new DatabaseTransport());
```

### Complex Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ["*.password", "auth.*", "credentials.*"],
    valuePatterns: [/\b\d{4}-\d{4}-\d{4}-\d{4}\b/], // Credit cards
    stringPatterns: [/Bearer\s+[\w-]+/gi],
    whitelist: ["auth.method", "user.id"],
    fieldConfigs: {
      "user.email": {
        replacement: (value, context) => {
          const email = String(value);
          const [, domain] = email.split('@');
          return `***@${domain}`;
        }
      },
      "debug.*": { disabled: true }
    },
    customRedactor: (value, context) => {
      if (context.target === 'file' && context.path.includes('internal')) {
        return '[FILE_REDACTED]';
      }
      return value;
    }
  }
});
```

### Production Logger Setup

```typescript
import { 
  logger, 
  LogLevel, 
  FileTransport, 
  DiscordWebhookTransport 
} from "jellylogger";

// Production configuration
logger.setOptions({
  level: LogLevel.INFO,
  useHumanReadableTime: false,
  format: "json",
  transports: [
    new FileTransport("./logs/app.log", {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 10,
      compress: true,
      dateRotation: true
    }),
    new DiscordWebhookTransport(process.env.DISCORD_WEBHOOK_URL!, {
      batchIntervalMs: 5000,
      maxBatchSize: 5,
      suppressConsoleErrors: true
    })
  ],
  redaction: {
    keys: [
      "password", "token", "secret", "apiKey", "authorization",
      "*.password", "*.token", "*.secret", "auth.*", "credentials.*"
    ],
    stringPatterns: [
      /Bearer\s+[\w-]+/gi,
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g
    ],
    redactStrings: true,
    replacement: "[REDACTED]"
  }
});

// Error handling
process.on('uncaughtException', async (error) => {
  logger.fatal("Uncaught exception", error, { discord: true });
  await logger.flushAll();
  process.exit(1);
});
```

---

## Error Handling

All transport operations are designed to be non-blocking and include comprehensive error handling:

- **Console Transport**: Errors are logged to stderr
- **File Transport**: Falls back gracefully on write failures
- **Discord Transport**: Includes retry logic and rate limiting
- **WebSocket Transport**: Automatic reconnection with exponential backoff

Example error handling:

```typescript
// Logger never throws - errors are handled gracefully
logger.info("This will not crash", { problematic: circularReference });

// Use flushAll() before exit to ensure all logs are written
process.on('SIGTERM', async () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  await logger.flushAll();
  process.exit(0);
});
```

---

## TypeScript Integration

JellyLogger is fully typed and provides excellent TypeScript support:

```typescript
import type { 
  LogLevel, 
  LogEntry, 
  LoggerOptions, 
  Transport,
  RedactionConfig,
  ChildLoggerOptions 
} from "jellylogger";

// All types are exported for custom implementations
class MyTransport implements Transport {
  async log(entry: LogEntry): Promise<void> {
    // Full type safety
  }
}

const config: LoggerOptions = {
  level: LogLevel.DEBUG,
  // Autocomplete available for all options
};
```

---

## More Resources

- [Usage Guide](./usage.md) - Complete usage documentation  
- [Transports](./transports.md) - Transport configuration details
- [Formatters](./formatters.md) - Formatting system guide
- [Extending](./extending.md) - Creating custom extensions
- [Examples](./examples.md) - Real-world usage examples

---
