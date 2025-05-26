# jellylogger

`jellylogger` is a flexible and easy-to-use logging library for Bun applications, written in TypeScript. It provides colorized console output, file logging with rotation, Discord webhook integration, structured logging, child loggers, sensitive data redaction, and supports custom transports with full async support.

## Table of Contents

- [jellylogger](#jellylogger)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Basic Logging](#basic-logging)
    - [Structured Logging](#structured-logging)
    - [Child Loggers](#child-loggers)
    - [Setting Log Level](#setting-log-level)
    - [Logging with Additional Data](#logging-with-additional-data)
    - [Discord Webhook Integration](#discord-webhook-integration)
    - [Customizing Timestamp Format](#customizing-timestamp-format)
    - [Using JSON Format](#using-json-format)
    - [Using a Custom Formatter](#using-a-custom-formatter)
    - [Custom Console Colors](#custom-console-colors)
    - [Using FileTransport](#using-filetransport)
      - [Basic File Logging](#basic-file-logging)
      - [Log Rotation by Size](#log-rotation-by-size)
      - [Log Rotation by Date](#log-rotation-by-date)
      - [Combined Rotation Settings](#combined-rotation-settings)
    - [Using Pluggable Formatters](#using-pluggable-formatters)
      - [Built-in Formatters](#built-in-formatters)
      - [Custom Formatters](#custom-formatters)
    - [Sensitive Data Redaction](#sensitive-data-redaction)
    - [Using Multiple Transports](#using-multiple-transports)
    - [Error Handling and Serialization](#error-handling-and-serialization)
    - [Graceful Shutdown](#graceful-shutdown)
  - [API Reference](#api-reference)
    - [`logger`](#logger)
    - [`ChildLogger`](#childlogger)
    - [`LogLevel` Enum](#loglevel-enum)
    - [`LoggerOptions` Interface](#loggeroptions-interface)
    - [`ChildLoggerOptions` Interface](#childloggeroptions-interface)
    - [`RedactionConfig` Interface](#redactionconfig-interface)
    - [`LogRotationConfig` Interface](#logrotationconfig-interface)
    - [`CustomConsoleColors` Type](#customconsolecolors-type)
    - [`Transport` Interface](#transport-interface)
    - [`LogEntry` Interface](#logentry-interface)
    - [`LogFormatter` Interface](#logformatter-interface)
    - [Built-in Transports](#built-in-transports)
      - [`ConsoleTransport`](#consoletransport)
      - [`FileTransport`](#filetransport)
      - [`DiscordWebhookTransport`](#discordwebhooktransport)
    - [Built-in Formatters](#built-in-formatters-1)
      - [`LogfmtFormatter`](#logfmtformatter)
      - [`NdjsonFormatter`](#ndjsonformatter)
  - [TypeScript Safety](#typescript-safety)
  - [Extending with Custom Transports and Formatters](#extending-with-custom-transports-and-formatters)
  - [Contributing](#contributing)
  - [License](#license)
  - [Local Development with `bun link`](#local-development-with-bun-link)

## Features

- **Multiple log levels**: `SILENT`, `FATAL`, `ERROR`, `WARN`, `INFO`, `DEBUG`, `TRACE` with color-coded console output
- **Structured logging**: Pass objects as structured data alongside messages with full type safety
- **Child loggers**: Create contextualized loggers with inherited configuration and automatic context merging
- **Enhanced console output**: Customizable colors using Bun's color API (hex, rgb, hsl, hsv, cmyk, ANSI)
- **File transport**: Write logs to files with comprehensive rotation, compression, and cleanup capabilities
- **Discord webhook transport**: Send logs to Discord channels with intelligent batching, rate limit handling, and per-log control
- **Async transport support**: Full Promise-based architecture with proper error handling and graceful degradation
- **Graceful shutdown**: `flushAll()` method ensures all logs are written before application exit
- **Flexible formatting**: Support for string, JSON, logfmt, NDJSON, and custom formats
- **Pluggable formatters**: Built-in and custom formatter support with clean interfaces
- **Sensitive data redaction**: Configurable redaction of sensitive keys in structured data and arguments
- **Circular reference handling**: Safe serialization of objects with circular references
- **Enhanced TypeScript safety**: Proper handling of `unknown` types, Error serialization, and type guards
- **Error serialization**: Deep serialization of Error objects including nested causes
- **Extensible architecture**: Easy to extend with custom transports and formatters

## Installation

Install `jellylogger` using Bun:

```bash
bun add jellylogger
```

The library is optimized for Bun but also works with npm/yarn:
```bash
npm install jellylogger
# or
yarn add jellylogger
```

## Usage

Import the `logger` and other necessary components:
```typescript
import { 
  logger, 
  LogLevel, 
  FileTransport, 
  ConsoleTransport, 
  DiscordWebhookTransport,
  LogfmtFormatter,
  NdjsonFormatter,
  type LoggerOptions 
} from 'jellylogger';
```

### Basic Logging
```typescript
logger.fatal('This is a fatal error message!');
logger.error('This is an error message.');
logger.warn('This is a warning message.');
logger.info('This is an informational message.');
logger.debug('This is a debug message.');
logger.trace('This is a trace message.');
```

### Structured Logging
Pass structured data as the first parameter for enhanced logging:
```typescript
// Structured data as first parameter (recommended approach)
logger.info('User logged in', { 
  userId: 123, 
  email: 'user@example.com',
  loginMethod: 'oauth',
  timestamp: new Date().toISOString()
});

// Mix structured data with additional arguments
logger.error('Database operation failed', 
  { query: 'SELECT * FROM users', duration: '1.2s' },
  'Connection timeout',
  { retryCount: 3 }
);

// Traditional argument-based logging still works
logger.info('Processing request', 'Some additional info', { requestId: 'abc-123' });

// Error objects are handled specially (not treated as structured data)
try {
  throw new Error('Something went wrong');
} catch (error) {
  logger.error('Operation failed', { operation: 'user-creation' }, error);
  // Error is serialized properly, not treated as structured data
}
```

### Child Loggers
Create child loggers with inherited configuration and automatic context merging:
```typescript
// Create a child logger with context
const userLogger = logger.child({ 
  context: { userId: 123, service: 'auth' }
});

userLogger.info('User action completed', { action: 'login' }); 
// Output includes both userId, service, and action

// Chain child loggers for nested contexts
const requestLogger = userLogger.child({ 
  context: { requestId: 'abc-123', endpoint: '/api/users' } 
});

requestLogger.debug('Processing step 1', { step: 'validation' }); 
// Context includes: userId, service, requestId, endpoint, and step

// Child loggers inherit all parent configuration
const operationLogger = requestLogger.child({
  context: { operationId: 'op-456' }
});

operationLogger.trace('Detailed operation step');
// All context is automatically merged and included
```

### Setting Log Level
Control which log levels are processed:
```typescript
// Only show WARN and above (WARN, ERROR, FATAL)
logger.setOptions({ level: LogLevel.WARN });

// Show all logs including debug information
logger.setOptions({ level: LogLevel.DEBUG });

// Show everything including trace logs
logger.setOptions({ level: LogLevel.TRACE });

// Disable all logging
logger.setOptions({ level: LogLevel.SILENT });

// Reset to default (INFO level)
logger.setOptions({ level: LogLevel.INFO });
```

### Logging with Additional Data
Multiple ways to pass additional data:
```typescript
const user = { id: 1, name: 'Jelly', role: 'admin' };

// Pass objects directly as arguments
logger.info('User logged in:', user);

// Use structured data (recommended for queries and analytics)
logger.info('User logged in', { 
  userId: user.id, 
  userName: user.name,
  userRole: user.role,
  sessionStart: Date.now()
});

// Handle errors properly - they're not treated as structured data
try {
  throw new Error('Something went wrong');
} catch (error) {
  logger.error('Operation failed', { operation: 'user-creation' }, error);
}

// Circular references are handled safely
const circular: any = { name: 'test' };
circular.self = circular;
logger.debug('Circular object', circular); // Safely serialized
```

### Discord Webhook Integration
Send specific logs to Discord using the `discord: true` flag:
```typescript
// Configure Discord webhook URL
logger.setOptions({
  discordWebhookUrl: 'https://discord.com/api/webhooks/your-webhook-id/your-webhook-token'
});

// Send logs to Discord using the discord flag in structured data
logger.error('Critical system error', { 
  discord: true,           // This log will be sent to Discord
  errorCode: 'SYS_001',
  severity: 'high',
  affectedUsers: 1250
});

logger.info('User login', { 
  userId: 123,
  // No discord flag - only goes to regular transports
});

logger.warn('High memory usage detected', {
  discord: true,           // Also sent to Discord
  memoryUsage: '85%',
  threshold: '80%'
});

// Discord integration works with all log levels
logger.fatal('System shutdown imminent', { 
  discord: true,
  reason: 'Critical failure detected',
  estimatedDowntime: '30 minutes'
});
```

### Customizing Timestamp Format
```typescript
// Use human-readable timestamps (YYYY-MM-DD HH:MM:SS AM/PM)
logger.setOptions({ useHumanReadableTime: true });
logger.info('This message has a human-readable timestamp.');

// Use ISO string timestamps (default)
logger.setOptions({ useHumanReadableTime: false });
logger.info('This message has an ISO timestamp.');
```

### Using JSON Format
```typescript
// Enable JSON output for all transports
logger.setOptions({ format: 'json' });
logger.info('This message will be in JSON format.', { 
  details: 'structured data',
  count: 42 
});

// Reset to string format
logger.setOptions({ format: 'string' });
```

### Using a Custom Formatter
```typescript
// Custom formatter function
logger.setOptions({
  formatter: (entry) => {
    const args = entry.args.length > 0 ? ` | Args: ${JSON.stringify(entry.args)}` : '';
    const data = entry.data ? ` | Data: ${JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.levelName}] ${entry.message}${args}${data}`;
  }
});

logger.warn('This message uses a custom formatter.', { customField: 'value' });

// Reset to default formatting
logger.resetOptions();
```

### Custom Console Colors
Customize console colors using Bun's color API with support for various color formats:
```typescript
logger.setOptions({
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF0000',        // Hex
    [LogLevel.WARN]: 'rgb(255, 165, 0)', // RGB
    [LogLevel.INFO]: 'hsl(120, 100%, 50%)', // HSL
    [LogLevel.DEBUG]: 'hsv(240, 100%, 100%)', // HSV
    bold: '\x1b[1m',                    // ANSI escape code
    reset: '\x1b[0m'                    // ANSI escape code
  }
});

logger.error('This error will be in custom red');
logger.warn('This warning will be in custom orange');
logger.info('This info will be in custom green');

// Reset to default colors
logger.resetOptions();
```

### Using FileTransport

#### Basic File Logging
```typescript
const fileTransport = new FileTransport('./app.log');
logger.setOptions({
  transports: [fileTransport],
  level: LogLevel.TRACE,
});

logger.info('This goes to app.log');
logger.error('This error also goes to app.log.', { errorCode: 500 });
```

#### Log Rotation by Size
```typescript
const fileTransport = new FileTransport('./app.log', {
  maxFileSize: 1024 * 1024, // 1MB
  maxFiles: 5,              // Keep 5 rotated files
  compress: true,           // Compress rotated files with gzip
});

logger.setOptions({
  transports: [fileTransport],
  level: LogLevel.TRACE,
});

// When app.log reaches 1MB, it becomes app.1.log.gz
// and a new app.log is created
```

#### Log Rotation by Date
```typescript
const fileTransport = new FileTransport('./daily.log', {
  dateRotation: true,   // Rotate daily
  maxFiles: 7,          // Keep 7 days of logs
  compress: true,       // Compress old logs
});

logger.setOptions({ transports: [fileTransport] });

// Logs rotate automatically at midnight
// daily.log becomes daily.1.log.gz, etc.
```

#### Combined Rotation Settings
```typescript
const fileTransport = new FileTransport('./combined.log', {
  maxFileSize: 10 * 1024 * 1024, // 10MB size limit
  dateRotation: true,             // Also rotate daily
  maxFiles: 14,                   // Keep 2 weeks of logs
  compress: true,                 // Compress all rotated logs
});

// Will rotate when either size limit is reached OR daily rotation occurs
```

### Using Pluggable Formatters

#### Built-in Formatters
```typescript
import { LogfmtFormatter, NdjsonFormatter } from 'jellylogger';

// Use logfmt format (key=value pairs)
logger.setOptions({
  pluggableFormatter: new LogfmtFormatter(),
});
logger.info('User action', { userId: 123, action: 'login' });
// Output: ts=2024-01-01T12:00:00.000Z level=info msg="User action" userId="123" action="login"

// Use NDJSON format (newline-delimited JSON)
logger.setOptions({
  pluggableFormatter: new NdjsonFormatter(),
});
logger.info('Processing request', { requestId: 'req-123', duration: 150 });
// Output: {"timestamp":"2024-01-01T12:00:00.000Z","level":"info","message":"Processing request","requestId":"req-123","duration":150}
```

#### Custom Formatters
```typescript
import { type LogFormatter, type LogEntry } from 'jellylogger';

class MyCustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).getTime();
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    return `${timestamp}|${entry.levelName}|${entry.message}${data}`;
  }
}

logger.setOptions({
  pluggableFormatter: new MyCustomFormatter(),
});
```

### Sensitive Data Redaction
Automatically redact sensitive information from logs:
```typescript
logger.setOptions({
  redaction: {
    keys: ['password', 'token', 'secret', 'apiKey', 'creditCard'],
    replacement: '[REDACTED]',     // Custom replacement text
    caseInsensitive: true,         // Match keys regardless of case
    redactIn: 'both',             // Redact in 'console', 'file', or 'both'
  }
});

// Sensitive data in structured logging
logger.info('User login attempt', { 
  username: 'alice', 
  password: 'hunter2',      // Will be redacted
  apiKey: 'secret-key-123'  // Will be redacted
});

// Sensitive data in arguments
logger.debug('Auth token received', { token: 'abc123' }); // Will be redacted

// Nested object redaction
logger.info('Payment processed', {
  user: { id: 123, name: 'Alice' },
  payment: { 
    amount: 100,
    creditCard: '4111-1111-1111-1111' // Will be redacted
  }
});
```

### Using Multiple Transports
Combine different transports for comprehensive logging:
```typescript
const consoleTransport = new ConsoleTransport();
const fileTransport = new FileTransport('./app.log', {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 10,
  compress: true
});

logger.setOptions({
  transports: [consoleTransport, fileTransport],
  level: LogLevel.DEBUG,
  discordWebhookUrl: 'https://discord.com/api/webhooks/your-webhook-url',
  redaction: {
    keys: ['password', 'token'],
    redactIn: 'file' // Only redact in file, not console
  }
});

// Regular log (console + file)
logger.info('Application started', { version: '1.0.0', env: 'production' });

// Critical log (console + file + Discord)
logger.error('Database connection failed', {
  discord: true,
  error: 'Connection timeout',
  retryCount: 3 
});
```

### Error Handling and Serialization
The logger properly handles and serializes Error objects with deep cause serialization:
```typescript
try {
  const rootCause = new Error('Database connection failed');
  const intermediateCause = new Error('Transaction rolled back', { cause: rootCause });
  throw new Error('User operation failed', { cause: intermediateCause });
} catch (error) {
  // Error objects are safely serialized with full cause chain (up to 3 levels deep)
  logger.error('Operation failed', { operation: 'data-processing' }, error);
}

// Handle non-Error thrown values
try {
  throw { message: 'Custom error object', code: 500 };
} catch (error) {
  logger.error('Non-standard error caught', error);
  // Safely handles error-like objects
}

// Functions, symbols, and other non-serializable types are handled
logger.debug('Debug info', {
  callback: () => console.log('test'), // Converted to [Function: anonymous]
  symbol: Symbol('test'),              // Converted to Symbol(test)
  bigint: 123n,                       // Converted to 123n
  undef: undefined                    // Converted to 'undefined'
});

// Circular references are detected and handled
const circular: any = { name: 'test' };
circular.self = circular;
logger.info('Circular reference test', circular); // Safely serialized as [Circular Reference]
```

### Graceful Shutdown
Ensure all logs are written before application shutdown:
```typescript
// Single flush call handles all transports including Discord
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await logger.flushAll();
  process.exit(0);
});

// Also works with child loggers (they share parent transports)
const apiLogger = logger.child({ context: { component: 'api' } });
await logger.flushAll(); // Flushes all transports including Discord singleton

// Manual flush for specific scenarios
await logger.flushAll();
console.log('All logs have been written');
```

## API Reference

### `logger`

The main logger object with comprehensive functionality.

**Properties:**
- `logger.options`: Current logger configuration

**Methods:**
- `logger.setOptions(newOptions: LoggerOptions): void`: Merge new options with existing configuration
- `logger.resetOptions(): void`: Reset all options to default values
- `logger.child(childOptions?: ChildLoggerOptions): ChildLogger`: Create a child logger with inherited config
- `logger.flushAll(): Promise<void>`: Flush all transports including Discord (essential for graceful shutdown)

**Logging Methods:** (all support structured data as first parameter when it's a plain object)
- `logger.fatal(message: string, ...args: unknown[]): void`
- `logger.error(message: string, ...args: unknown[]): void`
- `logger.warn(message: string, ...args: unknown[]): void`
- `logger.info(message: string, ...args: unknown[]): void`
- `logger.debug(message: string, ...args: unknown[]): void`
- `logger.trace(message: string, ...args: unknown[]): void`

### `ChildLogger`

Child loggers inherit parent configuration and merge their context with parent context.

**Methods:**
- All logging methods (`fatal`, `error`, `warn`, `info`, `debug`, `trace`)
- `child(childOptions?: ChildLoggerOptions): ChildLogger`: Create a nested child logger

### `LogLevel` Enum

```typescript
export enum LogLevel {
  SILENT = 0, // No logs
  FATAL = 1,  // Critical errors causing application termination
  ERROR = 2,  // Errors that don't necessarily stop the application
  WARN = 3,   // Warnings about potential issues
  INFO = 4,   // General informational messages
  DEBUG = 5,  // Detailed information for debugging
  TRACE = 6,  // Most granular information, for tracing code execution
}
```

### `LoggerOptions` Interface

```typescript
export interface LoggerOptions {
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
  /** Context for this logger (merged with child logger contexts) */
  context?: Record<string, unknown>;
}
```

### `ChildLoggerOptions` Interface

```typescript
export interface ChildLoggerOptions extends Partial<LoggerOptions> {
  /** Contextual data to include with every log entry from this child logger. */
  context?: Record<string, unknown>;
}
```

### `RedactionConfig` Interface

```typescript
export interface RedactionConfig {
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

### `LogRotationConfig` Interface

```typescript
export interface LogRotationConfig {
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

### `CustomConsoleColors` Type

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
Accepts color values as hex, rgb, hsl, hsv, cmyk, or ANSI escape codes.

### `Transport` Interface

```typescript
export interface Transport {
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;
  flush?(options?: LoggerOptions): Promise<void>; // Optional flush method for graceful shutdown
}
```

### `LogEntry` Interface

```typescript
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  args: unknown[]; // Type-safe argument handling
  data?: Record<string, unknown>; // Structured data
}
```

### `LogFormatter` Interface

```typescript
export interface LogFormatter {
  format(entry: LogEntry): string;
}
```

### Built-in Transports

#### `ConsoleTransport`
Writes log entries to the console with colorized output and appropriate console methods based on log level.

```typescript
const consoleTransport = new ConsoleTransport();
```

#### `FileTransport`
Writes log entries to a specified file with optional log rotation, compression, and cleanup.

```typescript
const fileTransport = new FileTransport(filePath: string, rotationConfig?: LogRotationConfig);
```

**Parameters:**
- `filePath`: Path to the log file
- `rotationConfig`: Optional rotation configuration

#### `DiscordWebhookTransport`
Sends log entries to a Discord webhook URL with intelligent batching and rate limit handling. Can be used directly as a transport or via the Discord webhook integration with `discord: true` flag.

```typescript
const discordTransport = new DiscordWebhookTransport(
  webhookUrl: string, 
  options?: DiscordWebhookTransportOptions
);
```

**Options:**
```typescript
interface DiscordWebhookTransportOptions {
  batchIntervalMs?: number;        // Default: 2000
  maxBatchSize?: number;           // Default: 10
  username?: string;               // Default: 'JellyLogger'
  maxRetries?: number;             // Default: 3
  suppressConsoleErrors?: boolean; // Default: false
}
```

### Built-in Formatters

#### `LogfmtFormatter`
Formats logs in logfmt style (key=value pairs).

```typescript
const formatter = new LogfmtFormatter();
logger.setOptions({ pluggableFormatter: formatter });
```

#### `NdjsonFormatter`
Formats logs as newline-delimited JSON.

```typescript
const formatter = new NdjsonFormatter();
logger.setOptions({ pluggableFormatter: formatter });
```

## TypeScript Safety

This library provides comprehensive TypeScript safety:

- **Type Guards**: Proper handling of `unknown` types with runtime type checking
- **Error Serialization**: Safe serialization of Error objects with configurable depth limiting for causes (default 3 levels)
- **Structured Data**: Type-safe structured logging support with proper Record types
- **Unknown Arrays**: Log arguments use `unknown[]` instead of `any[]` for better type safety
- **Null Safety**: Proper handling of null, undefined, and edge cases
- **Circular Reference Detection**: Safe handling of objects with circular references using WeakSet
- **Error-like Object Detection**: Type guards to distinguish between Error instances and error-like objects

Example of type-safe usage:
```typescript
// Type-safe structured logging
logger.info('User action', { userId: 123, action: 'login' });

// Proper error handling with type safety
try {
  throw new Error('Something went wrong');
} catch (error: unknown) {
  logger.error('Operation failed', { operation: 'test' }, error); // Error is safely serialized
}

// Type-safe child logger creation
const typedChild = logger.child({
  context: { service: 'auth', version: '1.0.0' }
});

// Circular reference handling
const circular: any = { name: 'test' };
circular.self = circular;
logger.debug('Circular test', circular); // Safely handled
```

## Extending with Custom Transports and Formatters

Create custom transports and formatters with proper TypeScript interfaces:

```typescript
import { 
  type Transport, 
  type LogEntry, 
  type LoggerOptions, 
  type LogFormatter 
} from 'jellylogger';

// Custom formatter
class XMLFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const data = entry.data ? Object.entries(entry.data)
      .map(([key, value]) => `<${key}>${value}</${key}>`)
      .join('') : '';
    
    return `<log level="${entry.levelName}" timestamp="${entry.timestamp}">
      <message>${entry.message}</message>
      ${data}
    </log>`;
  }
}

// Custom transport
class DatabaseTransport implements Transport {
  private connectionString: string;
  
  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }
  
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    const formatted = options.pluggableFormatter
      ? options.pluggableFormatter.format(entry)
      : `${entry.timestamp} [${entry.levelName}] ${entry.message}`;
    
    // Insert into database
    await this.insertLogEntry(formatted, entry);
  }
  
  async flush(): Promise<void> {
    // Flush any pending database operations
  }
  
  private async insertLogEntry(formatted: string, entry: LogEntry): Promise<void> {
    // Database insertion logic
  }
}

// Usage
const xmlFormatter = new XMLFormatter();
const dbTransport = new DatabaseTransport('postgresql://localhost/logs');

logger.setOptions({
  transports: [dbTransport],
  pluggableFormatter: xmlFormatter
});
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure TypeScript compilation passes
5. Update documentation as needed
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Local Development with `bun link`

For local development and testing:

1. In the `jellylogger` directory:
    ```bash
    bun run build
    bun link
    ```

2. In your test project:
    ```bash
    bun link jellylogger
    ```

3. After making changes to `jellylogger`, rebuild and your linked projects will use the updated version:
    ```bash
    bun run build
    ```

4. To unlink when done:
    ```bash
    # In your test project
    bun unlink jellylogger
    
    # In the jellylogger directory  
    bun unlink
    ```

5. Remember to run tests before publishing:
    ```bash
    bun test
    bun run build
    ```
