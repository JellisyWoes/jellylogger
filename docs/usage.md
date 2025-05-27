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

Pass an object as an argument for structured logging:

```typescript
// Structured data as argument
logger.info('User logged in', { userId: 123, action: 'login' });
logger.error('File not found', { error: 'ENOENT', file: '/tmp/missing.txt' });

// Multiple arguments are processed automatically
logger.warn('Temperature warning', { temperature: 85, threshold: 80 }, 'Check cooling system');
```

### Error Logging

JellyLogger automatically serializes Error objects:

```typescript
try {
  throw new Error('Something failed');
} catch (error) {
  logger.error('Operation failed', error);
  
  // Or with structured data
  logger.error('Operation failed', { 
    operation: 'file-read',
    retries: 3 
  }, error);
}
```

### Bun-Specific Error Handling

```typescript
// Using Bun's file operations with error logging
try {
  const data = await Bun.file('./config.json').json();
  logger.info('Config loaded successfully', { configKeys: Object.keys(data) });
} catch (error) {
  logger.error('Failed to load config', { 
    file: './config.json',
    error: error.code || 'UNKNOWN'
  }, error);
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

### Environment-Based Configuration

```typescript
// Use Bun's environment variable handling
const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'DEBUG' : 'INFO');

logger.setOptions({
  level: LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO,
  useHumanReadableTime: isDevelopment,
  format: isDevelopment ? 'string' : 'json'
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

// With log rotation optimized for Bun
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

### WebSocket Transport

```typescript
import { WebSocketTransport } from 'jellylogger';

const wsTransport = new WebSocketTransport('ws://localhost:8080/logs');

logger.setOptions({
  transports: [wsTransport]
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
  context: { service: 'user-management', version: '1.0.0' }
});

// Child loggers inherit parent configuration
userLogger.info('User created', { userId: 123 }); 
// Output includes context: { service: 'user-management', version: '1.0.0', userId: 123 }

// Create service-specific child loggers
const dbLogger = logger.child({
  context: { component: 'database', pool: 'primary' }
});

const apiLogger = logger.child({
  context: { component: 'api', port: 3000 }
});

// Nested child loggers
const authDbLogger = dbLogger.child({
  context: { table: 'users', operation: 'auth' }
});
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
logger.info('User login attempt', { 
  username: 'john',
  password: 'secret123',  // Will be redacted
  apiKey: 'sk-abc123'     // Will be redacted
});
```

### Advanced Redaction Patterns

```typescript
logger.setOptions({
  redaction: {
    // Wildcard patterns
    keys: ['*.password', 'user.*Token', 'config.*.secret'],
    
    // Complex patterns for sensitive data
    valuePatterns: [
      /sk-[a-zA-Z0-9]{24}/,     // API keys
      /\b[A-Z0-9]{20,}\b/,      // Generic tokens
      /eyJ[a-zA-Z0-9_-]*\./     // JWT tokens
    ],
    
    // Custom replacement function
    replacement: (value, key, path) => {
      if (typeof value === 'string' && value.length > 10) {
        return `[REDACTED:${value.length}]`;
      }
      return '[REDACTED]';
    }
  }
});
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
logger.error('Critical error occurred!', { discord: true });
logger.info('Important event', { discord: true, userId: 123 });
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
// Ensure all logs are written before shutdown using Bun's process handling
process.on('SIGTERM', async () => {
  await logger.flushAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  await logger.flushAll();
  process.exit(0);
});

// Manual flush
await logger.flushAll();
```

### Performance Considerations with Bun

```typescript
// Set appropriate log level for production
logger.setOptions({
  level: LogLevel.WARN // Only warnings and errors in production
});

// Use structured logging efficiently
const performBulkOperation = async (items: any[]) => {
  const startTime = performance.now();
  
  // Log start of operation
  logger.info('Starting bulk operation', { 
    itemCount: items.length,
    operation: 'bulk-process'
  });
  
  for (let i = 0; i < items.length; i++) {
    // Avoid logging in tight loops - log periodically
    if (i % 1000 === 0) {
      logger.debug('Bulk operation progress', { 
        processed: i, 
        total: items.length,
        percentComplete: Math.round((i / items.length) * 100)
      });
    }
    
    // Process item
    await processItem(items[i]);
  }
  
  const duration = performance.now() - startTime;
  logger.info('Bulk operation completed', {
    itemCount: items.length,
    duration: `${duration.toFixed(2)}ms`,
    throughput: `${(items.length / (duration / 1000)).toFixed(2)} items/sec`
  });
};
```

### Integration with Bun's HTTP Server

```typescript
import { logger } from 'jellylogger';

// HTTP request logging middleware
const requestLogger = (req: Request) => {
  const startTime = performance.now();
  const requestId = crypto.randomUUID();
  
  // Create request-scoped logger
  const reqLogger = logger.child({
    context: { requestId, method: req.method, url: req.url }
  });
  
  reqLogger.info('Request started');
  
  return {
    logger: reqLogger,
    logResponse: (response: Response) => {
      const duration = performance.now() - startTime;
      reqLogger.info('Request completed', {
        status: response.status,
        duration: `${duration.toFixed(2)}ms`
      });
    }
  };
};

// Use with Bun's server
const server = Bun.serve({
  port: 3000,
  fetch(req) {
    const { logger: reqLogger, logResponse } = requestLogger(req);
    
    try {
      const response = new Response('Hello World!');
      logResponse(response);
      return response;
    } catch (error) {
      reqLogger.error('Request failed', error);
      const errorResponse = new Response('Internal Server Error', { status: 500 });
      logResponse(errorResponse);
      return errorResponse;
    }
  },
});

logger.info('Server started', { port: server.port });
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

// Configure logger for Bun application
logger.setOptions({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  useHumanReadableTime: process.env.NODE_ENV !== 'production',
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
const dbLogger = logger.child({ 
  context: { service: 'database', pool: 'primary' } 
});

const apiLogger = logger.child({ 
  context: { service: 'api', version: '1.0.0' } 
});

// Application startup
const startApp = async () => {
  logger.info('Application starting', { 
    bunVersion: Bun.version,
    nodeEnv: process.env.NODE_ENV 
  });

  try {
    // Database connection with Bun's optimized operations
    dbLogger.info('Connecting to database');
    
    // API server startup
    const server = Bun.serve({
      port: 3000,
      fetch(req) {
        const reqLogger = apiLogger.child({
          context: { requestId: crypto.randomUUID() }
        });
        
        reqLogger.info('API request', { 
          method: req.method, 
          path: new URL(req.url).pathname 
        });
        
        return new Response('Hello from JellyLogger!');
      },
    });
    
    apiLogger.info('API server started', { port: server.port });
    
    // Critical error with Discord notification
    setTimeout(() => {
      logger.error('Simulated critical error', { 
        discord: true,
        error: 'SYSTEM_OVERLOAD',
        timestamp: new Date().toISOString()
      });
    }, 5000);
    
  } catch (error) {
    logger.error('Startup failed', { discord: true }, error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down gracefully');
  await logger.flushAll();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the application
startApp().catch((error) => {
  logger.fatal('Failed to start application', error);
  process.exit(1);
});
```

This comprehensive usage guide demonstrates how to leverage JellyLogger's full feature set while taking advantage of Bun's performance optimizations and native APIs.
