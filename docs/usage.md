# JellyLogger Usage Guide

JellyLogger is a fast, feature-rich logging library for Bun that supports multiple transports, structured logging, and advanced features like redaction and Discord webhooks.

## Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Log Levels](#log-levels)
- [Structured Logging](#structured-logging)
- [Configuration](#configuration)
- [Transports](#transports)
- [Child Loggers](#child-loggers)
- [Redaction](#redaction)
- [Discord Integration](#discord-integration)
- [Advanced Features](#advanced-features)

## Installation

```bash
bun add jellylogger
```

## Basic Usage

```typescript
import { logger, LogLevel } from 'jellylogger';

// Basic logging
logger.info('Application started');
logger.warn('This is a warning');
logger.error('Something went wrong');
logger.debug('Debug information');
```

## Log Levels

JellyLogger supports 7 log levels in order of severity:

```typescript
import { LogLevel } from 'jellylogger';

// Available levels (from most severe to least)
LogLevel.SILENT  // 0 - No logs
LogLevel.FATAL   // 1 - Critical errors causing termination
LogLevel.ERROR   // 2 - Errors that don't stop the application
LogLevel.WARN    // 3 - Warnings about potential issues
LogLevel.INFO    // 4 - General informational messages
LogLevel.DEBUG   // 5 - Detailed debugging information
LogLevel.TRACE   // 6 - Most granular tracing information
```

### Setting Log Level

```typescript
import { logger, LogLevel } from 'jellylogger';

// Set minimum log level
logger.setOptions({
  level: LogLevel.DEBUG
});

// Only logs at DEBUG level and above will be output
logger.trace('This will not be shown');
logger.debug('This will be shown');
logger.info('This will be shown');
```

## Structured Logging

Pass an object as the first argument for structured logging:

```typescript
// Structured data as first argument
logger.info({ userId: 123, action: 'login' }, 'User logged in');
logger.error({ error: 'ENOENT', file: '/tmp/missing.txt' }, 'File not found');

// With additional arguments
logger.warn({ 
  temperature: 85, 
  threshold: 80 
}, 'Temperature warning', 'Check cooling system');
```

### Error Logging

JellyLogger automatically serializes Error objects:

```typescript
try {
  throw new Error('Something failed');
} catch (error) {
  logger.error('Operation failed', error);
  
  // Or with structured data
  logger.error({ 
    operation: 'file-read',
    retries: 3 
  }, 'Operation failed', error);
}
```

## Configuration

### Basic Configuration

```typescript
import { logger, LogLevel, ConsoleTransport, FileTransport } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  useHumanReadableTime: true,
  format: 'json',
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log')
  ]
});
```

### Custom Colors

```typescript
logger.setOptions({
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF0000',    // Hex colors
    [LogLevel.WARN]: 'rgb(255,165,0)', // RGB
    [LogLevel.INFO]: 'hsl(120,100%,50%)', // HSL
    bold: '\x1b[1m',                // Direct ANSI codes
    reset: '\x1b[0m'
  }
});
```

### Custom Formatter

```typescript
logger.setOptions({
  formatter: (entry) => {
    return `${entry.timestamp} [${entry.levelName}] ${entry.message}`;
  }
});
```

## Transports

### Console Transport

```typescript
import { ConsoleTransport } from 'jellylogger';

const consoleTransport = new ConsoleTransport();
logger.setOptions({
  transports: [consoleTransport]
});
```

### File Transport

```typescript
import { FileTransport } from 'jellylogger';

// Basic file logging
const fileTransport = new FileTransport('./logs/app.log');

// With log rotation
const rotatingFileTransport = new FileTransport('./logs/app.log', {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  compress: true,
  dateRotation: false
});

logger.setOptions({
  transports: [rotatingFileTransport]
});
```

### Discord Webhook Transport

```typescript
import { DiscordWebhookTransport } from 'jellylogger';

const discordTransport = new DiscordWebhookTransport(
  'https://discord.com/api/webhooks/your/webhook/url',
  {
    batchIntervalMs: 2000,
    maxBatchSize: 10,
    username: 'MyApp Logger',
    maxRetries: 3
  }
);

logger.setOptions({
  transports: [discordTransport]
});
```

### Multiple Transports

```typescript
logger.setOptions({
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log'),
    new DiscordWebhookTransport(webhookUrl)
  ]
});
```

## Child Loggers

Create child loggers with inherited configuration and additional context:

```typescript
// Create a child logger with context
const userLogger = logger.child({
  context: { module: 'user-service', version: '1.0.0' }
});

// Child loggers inherit parent configuration
userLogger.info('User created'); // Includes context automatically

// Create nested child loggers
const authLogger = userLogger.child({
  context: { component: 'authentication' }
});

authLogger.error('Login failed'); // Includes both parent and child context
```

## Redaction

Protect sensitive data with automatic redaction:

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', 'token', 'apiKey', 'creditCard'],
    keyPatterns: [/secret/i, /auth/i],
    valuePatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/], // Credit card numbers
    replacement: '[REDACTED]',
    caseInsensitive: true,
    redactIn: 'both', // 'console', 'file', or 'both'
    redactStrings: true,
    stringPatterns: [/\b\d{3}-\d{2}-\d{4}\b/], // SSN pattern
    auditRedaction: false
  }
});

// Sensitive data will be automatically redacted
logger.info({ 
  username: 'john',
  password: 'secret123',  // Will be redacted
  apiKey: 'sk-abc123'     // Will be redacted
}, 'User login attempt');
```

## Discord Integration

### Quick Discord Logging

Use the `discord` flag for one-off Discord messages:

```typescript
// Configure Discord webhook URL
logger.setOptions({
  discordWebhookUrl: 'https://discord.com/api/webhooks/your/webhook/url'
});

// Send to Discord using the discord flag
logger.error({ discord: true }, 'Critical error occurred!');
logger.info({ discord: true, userId: 123 }, 'Important event');
```

### Dedicated Discord Transport

```typescript
import { DiscordWebhookTransport } from 'jellylogger';

logger.setOptions({
  transports: [
    new ConsoleTransport(),
    new DiscordWebhookTransport(webhookUrl, {
      username: 'Production Logger',
      batchIntervalMs: 5000,
      maxBatchSize: 5
    })
  ]
});
```

## Advanced Features

### Pluggable Formatters

```typescript
import { LogfmtFormatter, NdjsonFormatter } from 'jellylogger';

// Use built-in logfmt formatter
logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

// Use built-in NDJSON formatter
logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});
```

### Async Logging and Flushing

```typescript
// Ensure all logs are written before shutdown
process.on('SIGTERM', async () => {
  await logger.flushAll();
  process.exit(0);
});

// Manual flush
await logger.flushAll();
```

### Performance Considerations

```typescript
// Set appropriate log level for production
logger.setOptions({
  level: LogLevel.WARN // Only warnings and errors in production
});

// Use structured logging sparingly in high-frequency code
for (let i = 0; i < 1000000; i++) {
  // Avoid this in tight loops
  logger.debug({ iteration: i }, 'Processing item');
  
  // Better: Log periodically
  if (i % 10000 === 0) {
    logger.debug({ processed: i }, 'Batch processed');
  }
}
```

## Complete Example

```typescript
import { 
  logger, 
  LogLevel, 
  ConsoleTransport, 
  FileTransport,
  DiscordWebhookTransport,
  LogfmtFormatter
} from 'jellylogger';

// Configure logger
logger.setOptions({
  level: LogLevel.INFO,
  useHumanReadableTime: true,
  format: 'string',
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log', {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      compress: true
    })
  ],
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  redaction: {
    keys: ['password', 'token', 'apiKey'],
    replacement: '[REDACTED]'
  },
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF4444',
    [LogLevel.WARN]: '#FFAA00'
  },
  pluggableFormatter: new LogfmtFormatter()
});

// Create service-specific loggers
const dbLogger = logger.child({ context: { service: 'database' } });
const apiLogger = logger.child({ context: { service: 'api' } });

// Application code
logger.info('Application starting');

try {
  // Database operations
  dbLogger.info({ query: 'SELECT * FROM users' }, 'Executing query');
  
  // API operations
  apiLogger.info({ 
    method: 'POST', 
    path: '/api/users',
    userId: 123 
  }, 'API request');
  
  // Critical error with Discord notification
  logger.error({ 
    discord: true,
    error: 'DATABASE_DOWN',
    lastSeen: new Date()
  }, 'Database connection lost');
  
} catch (error) {
  logger.error({ discord: true }, 'Unhandled error', error);
} finally {
  // Ensure all logs are written
  await logger.flushAll();
}
```
