# JellyLogger Usage Guide

This guide covers common usage patterns and best practices for JellyLogger.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Logging](#basic-logging)
3. [Log Levels](#log-levels)
4. [Transport System](#transport-system)
5. [Child Loggers](#child-loggers)
6. [Formatters](#formatters)
7. [Redacting Sensitive Data](#redacting-sensitive-data)
8. [Configuration](#configuration)
9. [File Rotation](#file-rotation)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)

---

## Getting Started

### Installation

```bash
bun add jellylogger
```

### Basic Setup

```typescript
import { logger } from 'jellylogger';

// Logger comes pre-configured with ConsoleTransport
logger.info('Hello, JellyLogger!');
```

---

## Basic Logging

### Simple Messages

```typescript
import { logger } from 'jellylogger';

logger.trace('Detailed debugging info');
logger.debug('Debug information');
logger.info('General information');
logger.warn('Warning message');
logger.error('Error occurred');
logger.fatal('Critical system error');
```

### Structured Logging with Data

```typescript
// Objects in arguments are automatically treated as structured data
logger.info('User login', {
  userId: '12345',
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  timestamp: new Date().toISOString(),
});

// Multiple data objects are merged
logger.error(
  'Database error',
  { query: 'SELECT * FROM users' },
  { error: 'Connection timeout' },
  { retryCount: 3 }
);
```

### Mixed Arguments

```typescript
// Combine strings, numbers, objects, and other types
logger.info('Processing order', { orderId: 'order-123', amount: 99.99 }, 'with priority', 5, [
  'item1',
  'item2',
]);
```

---

## Log Levels

JellyLogger supports 7 log levels:

```typescript
import { LogLevel } from 'jellylogger';

LogLevel.SILENT; // 0 - No logs
LogLevel.FATAL; // 1 - Critical errors
LogLevel.ERROR; // 2 - Errors
LogLevel.WARN; // 3 - Warnings
LogLevel.INFO; // 4 - Information (default)
LogLevel.DEBUG; // 5 - Debug info
LogLevel.TRACE; // 6 - Detailed tracing
```

### Setting Log Level

```typescript
import { logger, LogLevel } from 'jellylogger';

// Only log WARN and above (WARN, ERROR, FATAL)
logger.setOptions({
  level: LogLevel.WARN,
});

// Development mode - show everything
logger.setOptions({
  level: LogLevel.TRACE,
});

// Production mode - errors and warnings only
logger.setOptions({
  level: LogLevel.WARN,
});
```

---

## Transport System

### Adding Individual Transports

```typescript
import { logger, FileTransport, DiscordWebhookTransport, WebSocketTransport } from 'jellylogger';

// File logging with rotation
logger.addTransport(
  new FileTransport('./logs/app.log', {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5, // Keep 5 rotated files
    compress: true, // Gzip old files
    dateRotation: true, // Rotate daily
  })
);

// Discord webhook (with batching to avoid rate limits)
logger.addTransport(
  new DiscordWebhookTransport('https://discord.com/api/webhooks/...', {
    batchIntervalMs: 2000,
    maxBatchSize: 10,
    username: 'MyApp Logger',
  })
);

// WebSocket streaming
logger.addTransport(
  new WebSocketTransport('ws://localhost:8080/logs', {
    reconnectIntervalMs: 1000,
    maxReconnectIntervalMs: 30000,
  })
);
```

### Transport Management

```typescript
// Replace all transports
logger.setTransports([new ConsoleTransport(), new FileTransport('./logs/app.log')]);

// Remove specific transport
const fileTransport = new FileTransport('./logs/temp.log');
logger.addTransport(fileTransport);
logger.removeTransport(fileTransport);

// Clear all transports
logger.clearTransports();
```

### Transport Presets

Use convenient preset functions for common configurations:

```typescript
import { useConsoleAndFile, useConsoleFileAndDiscord, useAllTransports } from 'jellylogger';

// Console + File
useConsoleAndFile('./logs/app.log');

// Console + File + Discord
useConsoleFileAndDiscord('./logs/app.log', 'https://discord.com/api/webhooks/...');

// All transports
useAllTransports(
  './logs/app.log',
  'https://discord.com/api/webhooks/...',
  'ws://localhost:8080/logs'
);
```

---

## Child Loggers

Create contextual loggers that inherit parent configuration:

### Prefix-Based Child Loggers

```typescript
// Create child logger with prefix
const userLogger = logger.child({ messagePrefix: 'USER' });
userLogger.info('Login successful');
// Output: [USER] Login successful

const authLogger = logger.child({ messagePrefix: 'AUTH' });
authLogger.error('Invalid credentials');
// Output: [AUTH] Invalid credentials
```

### Context-Based Child Loggers

**Note**: The current implementation only supports `messagePrefix` for child loggers. Context data must be passed explicitly with each log call.

```typescript
// Child logger with message prefix only
const requestLogger = logger.child({
  messagePrefix: 'REQUEST',
});

// Context data must be passed with each log call
requestLogger.info('Processing request', {
  requestId: 'req-123',
  userId: 'user-456',
});

// Multiple child loggers with different prefixes
const serviceLogger = logger.child({
  messagePrefix: 'PAYMENT',
});

serviceLogger.info('Service started', {
  service: 'payment-processor',
  version: '1.2.3',
});
```

### Nested Child Loggers

```typescript
// Child loggers can create their own children
const moduleLogger = requestLogger.child({ messagePrefix: 'AUTH' });
moduleLogger.warn('Invalid token');
// Output: [REQUEST] [AUTH] Invalid token

// Deep nesting with prefix combination
const subModuleLogger = moduleLogger.child({ messagePrefix: 'JWT' });
subModuleLogger.debug('Token validation');
// Output: [REQUEST] [AUTH] [JWT] Token validation
```

### Contextual Logging Patterns

```typescript
// Request-scoped logging
function handleRequest(req: Request) {
  const requestLogger = logger.child({
    context: {
      requestId: req.headers.get('x-request-id'),
      method: req.method,
      url: req.url,
      userAgent: req.headers.get('user-agent'),
    },
  });

  requestLogger.info('Request started');

  try {
    // Process request...
    requestLogger.info('Request processed successfully');
  } catch (error) {
    requestLogger.error('Request failed', { error: error.message });
  }
}

// Service-scoped logging
class DatabaseService {
  private logger = logger.child({
    messagePrefix: 'DB',
  });

  private serviceContext = {
    service: 'database',
    version: '2.1.0',
  };

  async query(sql: string) {
    this.logger.debug('Executing query', {
      ...this.serviceContext,
      sql,
    });

    try {
      // Execute query...
      this.logger.info('Query successful', {
        ...this.serviceContext,
        rowCount: result.length,
      });
    } catch (error) {
      this.logger.error('Query failed', {
        ...this.serviceContext,
        sql,
        error: error.message,
      });
      throw error;
    }
  }
}
```

---

## Formatters

### Built-in Formatters

```typescript
import { logger, createFormatter } from 'jellylogger';

// Human-readable format (default)
logger.setOptions({
  pluggableFormatter: createFormatter('default'),
});

// JSON format - one object per line
logger.setOptions({
  pluggableFormatter: createFormatter('ndjson'),
});

// Logfmt format - key=value pairs
logger.setOptions({
  pluggableFormatter: createFormatter('logfmt'),
});

// Pretty console format - multi-line with enhanced readability
logger.setOptions({
  pluggableFormatter: createFormatter('pretty'),
});
```

### Custom Formatters

```typescript
import type { LogFormatter, LogEntry } from 'jellylogger';

class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `${entry.timestamp} | ${entry.levelName} | ${entry.message}`;
  }
}

logger.setOptions({
  pluggableFormatter: new CustomFormatter(),
});
```

### Per-Transport Formatting

```typescript
// Different formats for different transports
const consoleTransport = new ConsoleTransport();
const fileTransport = new FileTransport('./logs/app.log');

logger.setTransports([consoleTransport, fileTransport]);

// Use JSON for files, readable format for console
logger.setOptions({
  pluggableFormatter: createFormatter('default'), // Console gets this
});

// File transport will use JSON format internally for structured storage
```

---

## Redacting Sensitive Data

### Basic Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', 'token', 'secret', 'apiKey'],
    replacement: '[REDACTED]',
  },
});

logger.info('User data', {
  username: 'alice',
  password: 'hunter2', // Will be [REDACTED]
  email: 'alice@example.com',
});
```

### Wildcard Patterns

```typescript
logger.setOptions({
  redaction: {
    keys: [
      '*.password', // any field ending with .password
      'user.credentials.*', // any field under user.credentials
      '*token*', // any field containing "token"
    ],
  },
});
```

### Regular Expression Patterns

```typescript
logger.setOptions({
  redaction: {
    keyPatterns: [/secret/i, /token/i],
    valuePatterns: [/\b\d{4}-\d{4}-\d{4}-\d{4}\b/], // Credit cards
    redactStrings: true,
    stringPatterns: [
      /Bearer\s+[\w-]+/gi, // Bearer tokens
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails
    ],
  },
});
```

### Advanced Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', '*.credentials.*'],
    keyPatterns: [/secret/i, /token/i],
    whitelist: ['user.id', 'auth.method'],
    replacement: (value, context) => `[REDACTED:${context.path}]`,
    fieldConfigs: {
      'user.email': {
        replacement: '[EMAIL_REDACTED]',
      },
      'debug.*': {
        disabled: true, // Never redact debug fields
      },
      'financial.*': {
        customRedactor: (value, context) => {
          return context.target === 'console' ? value : '[FINANCIAL_DATA]';
        },
      },
    },
    auditRedaction: true, // Log when redaction occurs
    redactIn: 'file', // Only redact in file logs, not console
  },
});
```

### Target-Specific Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', 'ssn'],
    redactIn: 'file', // Only redact in file outputs
    // Console shows original values, files show redacted
  },
});
```

---

## Configuration

### Global Configuration

```typescript
import { logger, LogLevel, createFormatter } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  useHumanReadableTime: true,
  format: 'json',
  pluggableFormatter: createFormatter('ndjson'),
  customConsoleColors: {
    [LogLevel.INFO]: '#00ff00',
    [LogLevel.ERROR]: '#ff0000',
    [LogLevel.WARN]: '#ffff00',
  },
  redaction: {
    keys: ['password', 'token'],
    redactIn: 'both',
  },
});
```

### Environment-Based Configuration

```typescript
function configureLogger() {
  const env = process.env.NODE_ENV;

  if (env === 'development') {
    logger.setOptions({
      level: LogLevel.DEBUG,
      useHumanReadableTime: true,
      transports: [new ConsoleTransport()],
      pluggableFormatter: createFormatter('default'),
    });
  } else if (env === 'production') {
    logger.setOptions({
      level: LogLevel.INFO,
      useHumanReadableTime: false,
      transports: [
        new ConsoleTransport(),
        new FileTransport('./logs/app.log', {
          maxFileSize: 100 * 1024 * 1024,
          maxFiles: 7,
          compress: true,
        }),
      ],
      pluggableFormatter: createFormatter('ndjson'),
      redaction: {
        keys: ['password', 'token', 'secret', 'apiKey'],
        stringPatterns: [/Bearer\s+[\w-]+/gi],
      },
    });
  }
}

configureLogger();
```

---

## File Rotation

### Size-Based Rotation

```typescript
import { FileTransport } from 'jellylogger';

const transport = new FileTransport('./logs/app.log', {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 10, // Keep 10 rotated files
  compress: true, // Gzip old files
  dateRotation: false, // Size-based only
});

logger.addTransport(transport);
```

### Date-Based Rotation

```typescript
const transport = new FileTransport('./logs/app.log', {
  dateRotation: true, // Rotate daily
  maxFiles: 30, // Keep 30 days
  compress: true,
});
```

### Combined Rotation

```typescript
const transport = new FileTransport('./logs/app.log', {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 7, // 7 files max
  dateRotation: true, // Daily rotation
  compress: true, // Compress old files
});
```

---

## Error Handling

### Transport Error Handling

JellyLogger handles transport errors gracefully:

```typescript
// Transports won't crash the application if they fail
logger.addTransport(new FileTransport('/invalid/path/app.log'));
logger.info('This will still work'); // Console transport continues working
```

### Async Error Handling

```typescript
// Errors in async transports are caught and logged
logger.addTransport(new WebSocketTransport('ws://invalid-url'));
logger.info('Message'); // Error logged to console, app continues
```

### Flushing Before Shutdown

```typescript
// Ensure all logs are written before shutdown
async function gracefulShutdown() {
  console.log('Shutting down...');
  await logger.flushAll();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

---

## Best Practices

### 1. Use Structured Logging

```typescript
// Good: Structured data for searchability
logger.info('User login', {
  userId: user.id,
  email: user.email,
  ip: req.ip,
  timestamp: new Date().toISOString(),
});

// Avoid: String interpolation
logger.info(`User ${user.email} logged in from ${req.ip}`);
```

### 2. Use Appropriate Log Levels

```typescript
// FATAL: Application cannot continue
logger.fatal('Database connection lost', { error: dbError });

// ERROR: Something failed but app continues
logger.error('Failed to send email', { recipient, error });

// WARN: Potential issues
logger.warn('High memory usage', { usage: '85%' });

// INFO: General application flow
logger.info('User registered', { userId, email });

// DEBUG: Development debugging
logger.debug('Cache hit', { key, ttl });

// TRACE: Very detailed tracing
logger.trace('Function entry', { args, timestamp });
```

### 3. Use Child Loggers for Context

```typescript
// Create context-specific loggers
const userLogger = logger.child({
  context: { userId: user.id, sessionId: session.id },
});

// All logs from this logger include the context
userLogger.info('Profile updated');
userLogger.warn('Invalid preference');
```

### 4. Configure for Environment

```typescript
// Different configurations for different environments
const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NODE_ENV === 'production';

logger.setOptions({
  level: isDev ? LogLevel.DEBUG : LogLevel.INFO,
  useHumanReadableTime: isDev,
  pluggableFormatter: isDev ? createFormatter('default') : createFormatter('ndjson'),
});
```

### 5. Always Redact Sensitive Data

```typescript
logger.setOptions({
  redaction: {
    keys: [
      'password',
      'passwd',
      'pass',
      'token',
      'auth',
      'authorization',
      'secret',
      'key',
      'credential',
      'ssn',
      'social',
      '*.password',
      '*.token',
      '*.secret',
    ],
    stringPatterns: [
      /Bearer\s+[\w-]+/gi, // Bearer tokens
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, // Credit cards
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails
    ],
    redactStrings: true,
  },
});
```

### 6. Use File Rotation in Production

```typescript
// Production file transport with rotation
logger.addTransport(
  new FileTransport('./logs/app.log', {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 30, // 30 files (30 days if daily rotation)
    compress: true, // Save disk space
    dateRotation: true, // Daily rotation
  })
);
```

### 7. Monitor Transport Health

```typescript
// Flush regularly to ensure logs are written
setInterval(async () => {
  try {
    await logger.flushAll();
  } catch (error) {
    console.error('Failed to flush logs:', error);
  }
}, 30000); // Every 30 seconds
```

---

## Next Steps

- [API Reference](./api.md) - Complete API documentation
- [Transports Guide](./transports.md) - Detailed transport documentation
- [Extending JellyLogger](./extending.md) - Custom transports and formatters
- [Migration Guide](./migration.md) - Migrating from other loggers
