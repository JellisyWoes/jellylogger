# JellyLogger Usage Guide

JellyLogger is a fast, feature-rich logging library for Bun that supports multiple transports, structured logging, advanced redaction, and Discord/websocket/file integration.

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

logger.info('Application started');
logger.warn('This is a warning');
logger.error('Something went wrong');
logger.debug('Debug information');
```

## Log Levels

JellyLogger supports 7 log levels in order of severity:

```typescript
import { LogLevel } from 'jellylogger';

LogLevel.SILENT  // 0
LogLevel.FATAL   // 1
LogLevel.ERROR   // 2
LogLevel.WARN    // 3
LogLevel.INFO    // 4
LogLevel.DEBUG   // 5
LogLevel.TRACE   // 6
```

### Setting Log Level

```typescript
logger.setOptions({ level: LogLevel.DEBUG });

logger.trace('This will not be shown');
logger.debug('This will be shown');
logger.info('This will be shown');
```

## Structured Logging

JellyLogger supports rich structured logging with automatic separation of structured data from other arguments. Structured data is displayed inline with log messages in both console and file outputs.

### Basic Structured Logging

```typescript
// Simple structured data
logger.info('User logged in', { userId: 123, action: 'login' });
// Output: [timestamp] INFO : User logged in {"userId":123,"action":"login"}

// Multiple data objects are merged
logger.info('Transaction processed', 
  { transactionId: 'tx-123', amount: 99.99 }, 
  { currency: 'USD', method: 'credit_card' }
);
// Output: [timestamp] INFO : Transaction processed {"transactionId":"tx-123","amount":99.99,"currency":"USD","method":"credit_card"}

// Mixed structured data and other arguments
logger.warn('Temperature warning', 
  { temperature: 85, threshold: 80 }, 
  'Check cooling system',
  { location: 'server-room-1' }
);
// Output: [timestamp] WARN : Temperature warning {"temperature":85,"threshold":80,"location":"server-room-1"} Check cooling system
```

### Handling Circular References

JellyLogger safely handles circular references in objects by detecting them and replacing with descriptive placeholders:

```typescript
// Circular reference handling
const circular: any = { name: 'example' };
circular.self = circular;

logger.info('Processing circular object', circular);
// Output: [timestamp] INFO : Processing circular object [Object - Circular or Non-serializable]

// Complex objects with circular refs are also handled
const complex = {
  user: { id: 123, name: 'John' },
  cache: new Map()
};
complex.reference = complex;

logger.info('Complex object', complex);
// Circular parts are safely replaced with placeholders
```

### Nested Structured Data

```typescript
// Complex nested objects are properly displayed
logger.info('API request completed', {
  request: {
    method: 'POST',
    path: '/api/users',
    headers: { 'content-type': 'application/json' }
  },
  response: {
    status: 201,
    timing: { total: 45, db: 12, validation: 3 }
  },
  user: { id: 123, role: 'admin' }
});
// All nested data is JSON-formatted and displayed inline
```

### Error Logging with Structured Data

```typescript
try {
  throw new Error('Database connection failed');
} catch (error) {
  // Error objects are processed separately from structured data
  logger.error('Operation failed', 
    { operation: 'user-create', retries: 3, userId: 456 }, 
    error
  );
  // Output shows structured data and error details separately
}
```

### Bun-Specific Structured Logging

```typescript
try {
  const file = Bun.file('./config.json');
  const data = await file.json();
  logger.info('Config loaded', { 
    file: './config.json',
    size: file.size,
    configKeys: Object.keys(data),
    loadTime: performance.now()
  });
} catch (error) {
  logger.error('Failed to load config', 
    { 
      file: './config.json', 
      error: (error as any).code || 'UNKNOWN',
      attempted: new Date().toISOString()
    }, 
    error
  );
}
```

## Configuration

### Basic Configuration

```typescript
import { logger, LogLevel, ConsoleTransport, FileTransport } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  useHumanReadableTime: true,
  format: 'json', // 'string' or 'json'
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log')
  ]
});
```

### JSON vs String Format

```typescript
// String format (default) - human readable with inline structured data
logger.setOptions({ format: 'string' });
logger.info('User created', { userId: 123, email: 'user@example.com' });
// Output: [2023-12-01T10:30:00.000Z] INFO : User created {"userId":123,"email":"user@example.com"}

// JSON format - machine readable
logger.setOptions({ format: 'json' });
logger.info('User created', { userId: 123, email: 'user@example.com' });
// Output: {"timestamp":"2023-12-01T10:30:00.000Z","level":4,"levelName":"INFO","message":"User created","args":[],"data":{"userId":123,"email":"user@example.com"}}
```

### Custom Colors

```typescript
import { LogLevel } from 'jellylogger';

logger.setOptions({
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF0000',
    [LogLevel.WARN]: 'rgb(255,165,0)',
    [LogLevel.INFO]: 'hsl(120,100%,50%)',
    bold: '\x1b[1m',
    reset: '\x1b[0m'
  }
});
```

### Custom Formatter

```typescript
logger.setOptions({
  formatter: (entry) => `${entry.timestamp} [${entry.levelName}] ${entry.message}${entry.data ? ' ' + JSON.stringify(entry.data) : ''}`
});
```

### Environment-Based Configuration

```typescript
const isDev = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'DEBUG' : 'INFO');

logger.setOptions({
  level: LogLevel[logLevel as keyof typeof LogLevel] ?? LogLevel.INFO,
  useHumanReadableTime: isDev,
  format: isDev ? 'string' : 'json'
});
```

## Transports

### Console Transport

```typescript
import { ConsoleTransport } from 'jellylogger';

logger.setOptions({ transports: [new ConsoleTransport()] });
```

### File Transport

JellyLogger's FileTransport is designed for reliability and continues logging even when errors occur:

```typescript
import { FileTransport } from 'jellylogger';

const fileTransport = new FileTransport('./logs/app.log', {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  compress: true,
  dateRotation: false
});

logger.setOptions({ transports: [fileTransport] });

// FileTransport handles errors gracefully
// Write failures are logged to console but don't throw exceptions
// This ensures your application continues running even if logging fails
```

#### File Transport Error Handling

The FileTransport is designed to be resilient:

- **Non-blocking**: File write errors don't throw exceptions or crash your app
- **Error logging**: Write failures are logged to console for debugging
- **Graceful degradation**: Continues attempting to log even after errors
- **Circular reference safety**: Automatically handles circular references in logged objects

```typescript
// These operations won't crash your app even if file system issues occur
logger.info('Starting operation', { complexObject: someCircularRef });
logger.error('Error occurred', someErrorObject);

// Ensure all logs are flushed before shutdown
process.on('SIGTERM', async () => {
  await logger.flushAll(); // Safely flushes even if previous errors occurred
  process.exit(0);
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

logger.setOptions({ transports: [discordTransport] });
```

### WebSocket Transport

```typescript
import { WebSocketTransport } from 'jellylogger';

const wsTransport = new WebSocketTransport('ws://localhost:8080/logs');

logger.setOptions({ transports: [wsTransport] });
```

### Multiple Transports

```typescript
logger.setOptions({
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log'),
    new DiscordWebhookTransport('https://discord.com/api/webhooks/your/webhook/url')
  ]
});
```

## Child Loggers

```typescript
const userLogger = logger.child({
  context: { service: 'user-management', version: '1.0.0' }
});

userLogger.info('User created', { userId: 123 });

const dbLogger = logger.child({ context: { component: 'database', pool: 'primary' } });
const apiLogger = logger.child({ context: { component: 'api', port: 3000 } });

const authDbLogger = dbLogger.child({ context: { table: 'users', operation: 'auth' } });
```

## Redaction

JellyLogger provides comprehensive redaction capabilities for sensitive data in both structured objects and strings. Redaction works on the structured data that gets displayed inline with log messages.

### Basic Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', 'token', 'apiKey', 'creditCard'],
    replacement: '[REDACTED]'
  }
});

// Structured data is redacted before display
logger.info('User login attempt', { 
  username: 'john',
  password: 'secret123',  // This will be redacted
  apiKey: 'sk-abc123'     // This will be redacted
});
// Output: [timestamp] INFO : User login attempt {"username":"john","password":"[REDACTED]","apiKey":"[REDACTED]"}
```

### Advanced Redaction with Nested Objects

```typescript
logger.setOptions({
  redaction: {
    keys: ['*.password', 'user.*Token', 'config.*.secret'],
    keyPatterns: [/secret/i, /auth/i],
    valuePatterns: [
      /\d{4}-\d{4}-\d{4}-\d{4}/, // Credit card numbers
      /sk-[a-zA-Z0-9]{24}/        // API keys
    ],
    replacement: '[REDACTED]',
    caseInsensitive: true
  }
});

logger.info('Payment processed', {
  user: {
    id: 123,
    authToken: 'abc123',  // Redacted by key pattern
    profile: { password: 'secret' }  // Redacted by wildcard
  },
  payment: {
    amount: 99.99,
    creditCard: '1234-5678-9012-3456'  // Redacted by value pattern
  }
});
```

### String Pattern Redaction

```typescript
logger.setOptions({
  redaction: {
    redactStrings: true,
    stringPatterns: [
      /\b\d{3}-\d{2}-\d{4}\b/,  // SSN
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i  // Email
    ],
    replacement: '[REDACTED]'
  }
});

logger.info('Processing user data: SSN 123-45-6789 and email user@example.com');
// Output: [timestamp] INFO : Processing user data: SSN [REDACTED] and email [REDACTED]
```

### Context-Aware Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ['secret'],
    replacement: (value, context) => {
      if (typeof value === 'string' && value.length > 10) {
        return `[REDACTED:${value.length} chars]`;
      }
      return '[REDACTED]';
    },
    auditRedaction: true  // Log when redaction occurs
  }
});
```

## Discord Integration

### Quick Discord Logging

```typescript
logger.setOptions({
  discordWebhookUrl: 'https://discord.com/api/webhooks/your/webhook/url'
});

logger.error('Critical error occurred!', { discord: true });
logger.info('Important event', { discord: true, userId: 123 });
```

### Dedicated Discord Transport

```typescript
import { DiscordWebhookTransport } from 'jellylogger';

logger.setOptions({
  transports: [
    new ConsoleTransport(),
    new DiscordWebhookTransport('https://discord.com/api/webhooks/your/webhook/url', {
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

logger.setOptions({ pluggableFormatter: new LogfmtFormatter() });
logger.setOptions({ pluggableFormatter: new NdjsonFormatter() });
```

### Async Logging and Flushing

```typescript
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

### Error Resilience

JellyLogger is designed to continue operating even when individual transports fail:

```typescript
// Configure multiple transports for redundancy
logger.setOptions({
  transports: [
    new ConsoleTransport(),           // Always works
    new FileTransport('./app.log'),   // May fail due to disk issues
    new DiscordWebhookTransport(url)  // May fail due to network issues
  ]
});

// Even if file or Discord transports fail, console logging continues
logger.error('Critical system error', {
  error: 'DATABASE_DOWN',
  timestamp: new Date().toISOString(),
  affectedServices: ['user-auth', 'payments']
});

// The application continues running even if some transports fail
```

### Performance Considerations with Bun

```typescript
logger.setOptions({ level: LogLevel.WARN });

const performBulkOperation = async (items: any[]) => {
  const startTime = performance.now();
  logger.info('Starting bulk operation', { itemCount: items.length, operation: 'bulk-process' });
  
  for (let i = 0; i < items.length; i++) {
    if (i % 1000 === 0) {
      logger.debug('Bulk operation progress', { processed: i, total: items.length });
    }
    await processItem(items[i]);
  }
  
  const duration = performance.now() - startTime;
  logger.info('Bulk operation completed', {
    itemCount: items.length,
    duration: `${duration.toFixed(2)}ms`
  });
};
```

### Integration with Bun's HTTP Server

```typescript
import { logger } from 'jellylogger';

const requestLogger = (req: Request) => {
  const startTime = performance.now();
  const requestId = crypto.randomUUID();
  const reqLogger = logger.child({ context: { requestId, method: req.method, url: req.url } });
  reqLogger.info('Request started');
  return {
    logger: reqLogger,
    logResponse: (response: Response) => {
      const duration = performance.now() - startTime;
      reqLogger.info('Request completed', { status: response.status, duration: `${duration.toFixed(2)}ms` });
    }
  };
};

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

logger.setOptions({
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  useHumanReadableTime: process.env.NODE_ENV !== 'production',
  format: 'string',
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log', {
      maxFileSize: 50 * 1024 * 1024,
      maxFiles: 10,
      compress: true
    })
  ],
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  redaction: {
    keys: ['password', 'token', 'apiKey', '*.secret'],
    valuePatterns: [/sk-[a-zA-Z0-9]{24}/, /\d{4}-\d{4}-\d{4}-\d{4}/],
    replacement: '[REDACTED]',
    redactStrings: true,
    stringPatterns: [/\b\d{3}-\d{2}-\d{4}\b/]
  },
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF4444',
    [LogLevel.WARN]: '#FFAA00'
  }
});

const dbLogger = logger.child({ 
  context: { service: 'database', pool: 'primary' } 
});
const apiLogger = logger.child({ 
  context: { service: 'api', version: '1.0.0' } 
});

const startApp = async () => {
  logger.info('Application starting', { 
    bunVersion: Bun.version, 
    nodeEnv: process.env.NODE_ENV,
    memoryUsage: process.memoryUsage()
  });
  
  try {
    dbLogger.info('Connecting to database', {
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      ssl: !!process.env.DB_SSL
    });
    
    const server = Bun.serve({
      port: 3000,
      fetch(req) {
        const requestId = crypto.randomUUID();
        const reqLogger = apiLogger.child({ 
          context: { requestId } 
        });
        
        const startTime = performance.now();
        reqLogger.info('API request received', { 
          method: req.method, 
          path: new URL(req.url).pathname,
          userAgent: req.headers.get('user-agent')
        });
        
        const response = new Response('Hello from JellyLogger!');
        const duration = performance.now() - startTime;
        
        reqLogger.info('API request completed', {
          status: response.status,
          duration: `${duration.toFixed(2)}ms`,
          responseSize: response.body?.length || 0
        });
        
        return response;
      },
    });
    
    apiLogger.info('API server started', { 
      port: server.port,
      url: `http://localhost:${server.port}`
    });
    
    // Simulate a critical error with Discord notification
    setTimeout(() => {
      logger.error('Simulated critical error', { 
        discord: true, 
        error: 'SYSTEM_OVERLOAD', 
        metrics: {
          cpuUsage: '95%',
          memoryUsage: '89%',
          activeConnections: 1250
        },
        timestamp: new Date().toISOString() 
      });
    }, 5000);
    
  } catch (error) {
    logger.error('Startup failed', { 
      discord: true,
      startupPhase: 'server_init',
      attemptedPort: 3000
    }, error);
    process.exit(1);
  }
};

const shutdown = async () => {
  logger.info('Shutting down gracefully', {
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
  await logger.flushAll();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startApp().catch((error) => {
  logger.fatal('Failed to start application', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
```