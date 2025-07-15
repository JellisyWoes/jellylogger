# JellyLogger Migration Guide

This guide helps you migrate to JellyLogger from other popular logging libraries, or upgrade between JellyLogger versions.

---

## Table of Contents

1. [Migration from Winston](#migration-from-winston)
2. [Migration from Pino](#migration-from-pino)
3. [Migration from Bunyan](#migration-from-bunyan)
4. [Migration from console.log](#migration-from-consolelog)
5. [Upgrading JellyLogger Versions](#upgrading-jellylogger-versions)
6. [Configuration Migration](#configuration-migration)
7. [Common Migration Patterns](#common-migration-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Migration from Winston

Winston is one of the most popular Node.js logging libraries. Here's how to migrate to JellyLogger:

### Basic Setup Migration

**Winston:**

```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console(),
  ],
});
```

**JellyLogger:**

```typescript
import { logger, FileTransport, ConsoleTransport, LogLevel, createFormatter } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  pluggableFormatter: createFormatter('ndjson'),
  transports: [
    new FileTransport('error.log'), // Handle level filtering in app logic
    new FileTransport('combined.log'),
    new ConsoleTransport(),
  ],
});
```

### Log Level Mapping

| Winston   | JellyLogger | Notes                |
| --------- | ----------- | -------------------- |
| `error`   | `error`     | Direct mapping       |
| `warn`    | `warn`      | Direct mapping       |
| `info`    | `info`      | Direct mapping       |
| `http`    | `debug`     | No direct equivalent |
| `verbose` | `debug`     | Similar purpose      |
| `debug`   | `debug`     | Direct mapping       |
| `silly`   | `trace`     | Most verbose level   |

### Structured Logging Migration

**Winston:**

```typescript
logger.info('User login', {
  userId: 123,
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
});
```

**JellyLogger:**

```typescript
// Identical syntax!
logger.info('User login', {
  userId: 123,
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
});
```

### Child Logger Migration

**Winston:**

```typescript
const childLogger = logger.child({
  service: 'auth',
  version: '1.0.0',
});

childLogger.info('Authentication successful');
```

**JellyLogger:**

```typescript
const childLogger = logger.child({
  messagePrefix: 'AUTH',
});

childLogger.info('Authentication successful', {
  service: 'auth',
  version: '1.0.0',
});
```

### Custom Transport Migration

**Winston:**

```typescript
class CustomTransport extends winston.Transport {
  log(info, callback) {
    // Send to external service
    this.sendToService(info);
    callback();
  }
}

logger.add(new CustomTransport());
```

**JellyLogger:**

```typescript
import type { Transport, LogEntry, TransportOptions } from 'jellylogger';

class CustomTransport implements Transport {
  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Send to external service
    await this.sendToService(entry);
  }
}

logger.addTransport(new CustomTransport());
```

### Format Migration

**Winston Formats → JellyLogger Formatters:**

| Winston Format            | JellyLogger Formatter              |
| ------------------------- | ---------------------------------- |
| `winston.format.json()`   | `createFormatter("ndjson")`        |
| `winston.format.simple()` | `createFormatter("default")`       |
| `winston.format.logfmt()` | `createFormatter("logfmt")`        |
| Custom format             | Custom LogFormatter implementation |

---

## Migration from Pino

Pino is a fast JSON logger. JellyLogger provides similar performance with additional features:

### Basic Setup Migration

**Pino:**

```typescript
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});
```

**JellyLogger:**

```typescript
import { logger, LogLevel, createFormatter } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  pluggableFormatter: createFormatter('default'), // Pretty format for development
  useHumanReadableTime: true,
});
```

### Structured Logging Migration

**Pino:**

```typescript
logger.info({ userId: 123, action: 'login' }, 'User logged in');
```

**JellyLogger:**

```typescript
// Object-first syntax becomes object-last
logger.info('User logged in', { userId: 123, action: 'login' });
```

### Child Logger Migration

**Pino:**

```typescript
const child = logger.child({ module: 'auth' });
child.info('Processing authentication');
```

**JellyLogger:**

```typescript
const child = logger.child({
  messagePrefix: 'AUTH',
});
child.info('Processing authentication', { module: 'auth' });
```

### Serializers Migration

**Pino:**

```typescript
const logger = pino({
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
  },
});
```

**JellyLogger:**

```typescript
// Built-in error serialization
logger.error('Request failed', new Error('Connection timeout'));

// Custom serialization via redaction/formatting
logger.setOptions({
  redaction: {
    customRedactor: (value, context) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    },
  },
});
```

---

## Migration from Bunyan

Bunyan is another popular structured logger:

### Basic Setup Migration

**Bunyan:**

```typescript
import bunyan from 'bunyan';

const logger = bunyan.createLogger({
  name: 'myapp',
  level: 'info',
  streams: [{ stream: process.stdout }, { path: '/var/log/myapp.log' }],
});
```

**JellyLogger:**

```typescript
import { logger, LogLevel, FileTransport, ConsoleTransport } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  transports: [new ConsoleTransport(), new FileTransport('/var/log/myapp.log')],
});
```

### Log Level Mapping

| Bunyan  | JellyLogger | Notes          |
| ------- | ----------- | -------------- |
| `fatal` | `fatal`     | Direct mapping |
| `error` | `error`     | Direct mapping |
| `warn`  | `warn`      | Direct mapping |
| `info`  | `info`      | Direct mapping |
| `debug` | `debug`     | Direct mapping |
| `trace` | `trace`     | Direct mapping |

### Child Logger Migration

**Bunyan:**

```typescript
const childLogger = logger.child({
  widget_type: 'wid-47',
});
```

**JellyLogger:**

```typescript
const childLogger = logger.child({
  messagePrefix: 'WIDGET',
});
childLogger.info('Widget created', {
  widget_type: 'wid-47',
});
```

---

## Migration from console.log

Moving from basic console logging to structured logging:

### Basic Migration

**console.log:**

```typescript
console.log('User logged in:', username);
console.error('Database error:', error.message);
console.warn('Memory usage high:', usage);
```

**JellyLogger:**

```typescript
import { logger } from 'jellylogger';

logger.info('User logged in', { username });
logger.error('Database error', { error: error.message });
logger.warn('Memory usage high', { usage });
```

### Development vs Production

**Before:**

```typescript
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info:', data);
}
```

**After:**

```typescript
// Automatically handled by log levels
logger.setOptions({
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
});

logger.debug('Debug info', { data });
```

### Error Handling Migration

**Before:**

```typescript
try {
  await processData();
} catch (error) {
  console.error('Process failed:', error);
}
```

**After:**

```typescript
try {
  await processData();
} catch (error) {
  logger.error('Process failed', {
    error: error.message,
    stack: error.stack,
    operation: 'processData',
  });
}
```

---

## Upgrading JellyLogger Versions

### From v1.x to v2.x

#### Breaking Changes

1. **Formatter API Changed:**

   ```typescript
   // v1.x
   logger.setOptions({
     format: 'json',
   });

   // v2.x
   logger.setOptions({
     pluggableFormatter: createFormatter('ndjson'),
   });
   ```

2. **Transport Constructor Changes:**

   ```typescript
   // v1.x
   new FileTransport('app.log', { maxSize: '10MB' });

   // v2.x
   new FileTransport('app.log', { maxFileSize: 10 * 1024 * 1024 });
   ```

3. **Redaction API Enhanced:**

   ```typescript
   // v1.x - Basic redaction
   logger.setOptions({
     redaction: {
       keys: ['password'],
     },
   });

   // v2.x - Enhanced redaction
   logger.setOptions({
     redaction: {
       keys: ['password'],
       fieldConfigs: {
         'user.email': {
           replacement: '[EMAIL_REDACTED]',
         },
       },
       customRedactor: (value, context) => {
         // Custom logic
         return value;
       },
     },
   });
   ```

#### Migration Steps

1. **Update Dependencies:**

   ```bash
   bun remove jellylogger
   bun add jellylogger@latest
   ```

2. **Update Formatter Usage:**

   ```typescript
   // Replace old format options
   logger.setOptions({
     pluggableFormatter: createFormatter('ndjson'),
   });
   ```

3. **Update File Transport Config:**

   ```typescript
   // Convert size strings to bytes
   const transport = new FileTransport('app.log', {
     maxFileSize: 50 * 1024 * 1024, // 50MB in bytes
     maxFiles: 10,
     compress: true,
     dateRotation: true,
   });
   ```

4. **Test Redaction Rules:**
   ```typescript
   // Verify redaction still works as expected
   logger.info('Test', { password: 'secret' });
   // Should output with password redacted
   ```

---

## Configuration Migration

### Environment-Based Configuration

**Old approach (various libraries):**

```typescript
const config = {
  development: {
    level: 'debug',
    colorize: true,
    prettyPrint: true,
  },
  production: {
    level: 'info',
    json: true,
    file: '/var/log/app.log',
  },
};

const logger = createLogger(config[process.env.NODE_ENV]);
```

**JellyLogger approach:**

```typescript
function configureLogger() {
  const env = process.env.NODE_ENV || 'development';

  const baseConfig: Partial<LoggerOptions> = {
    useHumanReadableTime: true,
    redaction: {
      keys: ['password', 'token', 'secret', 'apiKey'],
      stringPatterns: [/Bearer\s+[\w-]+/gi],
    },
  };

  switch (env) {
    case 'development':
      logger.setOptions({
        ...baseConfig,
        level: LogLevel.DEBUG,
        transports: [new ConsoleTransport()],
        pluggableFormatter: createFormatter('default'),
      });
      break;

    case 'test':
      logger.setOptions({
        ...baseConfig,
        level: LogLevel.WARN,
        transports: [new FileTransport('./test.log')],
        pluggableFormatter: createFormatter('ndjson'),
      });
      break;

    case 'production':
      logger.setOptions({
        ...baseConfig,
        level: LogLevel.INFO,
        transports: [
          new ConsoleTransport(),
          new FileTransport('/var/log/app.log', {
            maxFileSize: 100 * 1024 * 1024,
            maxFiles: 30,
            compress: true,
            dateRotation: true,
          }),
        ],
        pluggableFormatter: createFormatter('ndjson'),
      });
      break;
  }
}

configureLogger();
```

---

## Common Migration Patterns

### 1. Express.js Middleware

**Before (various loggers):**

```typescript
app.use(morgan('combined'));
```

**After (JellyLogger):**

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  const requestLogger = logger.child({
    context: {
      requestId: req.headers['x-request-id'] || generateUUID(),
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    },
  });

  req.logger = requestLogger;
  requestLogger.info('Request started');

  res.on('finish', () => {
    const duration = Date.now() - start;
    requestLogger.info('Request completed', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
});
```

### 2. Error Handling

**Before:**

```typescript
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
```

**After:**

```typescript
process.on('uncaughtException', err => {
  logger.fatal('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
    type: 'uncaughtException',
  });

  // Flush logs before exit
  logger.flushAll().finally(() => {
    process.exit(1);
  });
});
```

### 3. Database Query Logging

**Before:**

```typescript
console.log(`Executing query: ${sql}`);
```

**After:**

```typescript
const dbLogger = logger.child({ messagePrefix: 'DB' });

function logQuery(sql: string, params?: any[], duration?: number) {
  dbLogger.debug('SQL Query', {
    sql: sanitizeSQL(sql),
    paramCount: params?.length || 0,
    duration: duration ? `${duration}ms` : undefined,
  });
}
```

---

## Troubleshooting

### Common Issues

#### 1. Performance Differences

**Issue:** JellyLogger seems slower than previous logger
**Solution:**

```typescript
// Optimize for production
logger.setOptions({
  level: LogLevel.INFO, // Disable debug/trace in production
  pluggableFormatter: createFormatter('ndjson'), // Use JSON for speed
  redaction: {
    // Minimize redaction rules in hot paths
    keys: ['password', 'token'],
  },
});
```

#### 2. File Rotation Issues

**Issue:** Log files not rotating as expected
**Solution:**

```typescript
// Ensure proper rotation configuration
const transport = new FileTransport('app.log', {
  maxFileSize: 50 * 1024 * 1024, // 50MB in bytes, not string
  maxFiles: 10,
  compress: true,
  dateRotation: true, // Enable if you want daily rotation
});
```

#### 3. Missing Logs

**Issue:** Some logs not appearing
**Solution:**

```typescript
// Check log level configuration
logger.setOptions({
  level: LogLevel.DEBUG, // Ensure level is low enough
});

// Ensure flush before exit
process.on('exit', async () => {
  await logger.flushAll();
});
```

#### 4. Format Differences

**Issue:** Log format looks different from previous logger
**Solution:**

```typescript
// Create custom formatter to match old format
class LegacyFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    // Implement your legacy format
    return `${entry.timestamp} [${entry.levelName}] ${entry.message}`;
  }
}

logger.setOptions({
  pluggableFormatter: new LegacyFormatter(),
});
```

### Migration Checklist

- [ ] Update dependency in package.json
- [ ] Replace logger initialization
- [ ] Update transport configurations
- [ ] Migrate formatter/format options
- [ ] Update redaction rules (if any)
- [ ] Update child logger creation
- [ ] Test log levels work correctly
- [ ] Verify file rotation (if used)
- [ ] Check structured logging output
- [ ] Test graceful shutdown with flush
- [ ] Verify performance in production

### Getting Help

If you encounter issues during migration:

1. **Check the GitHub Issues**: Search for similar migration issues
2. **Review Examples**: Look at the examples in the documentation
3. **Test Incrementally**: Migrate one feature at a time
4. **Compare Outputs**: Use both loggers temporarily to compare output

---

## Next Steps

After successful migration:

- [Usage Guide](./usage.md) - Learn advanced usage patterns
- [API Reference](./api.md) - Explore the complete API
- [Transports Guide](./transports.md) - Understanding transport options
- [Extending JellyLogger](./extending.md) - Custom transports and formatters
