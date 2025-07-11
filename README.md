# JellyLogger

A fast, flexible logging library built specifically for the [Bun](https://bun.sh/) runtime. JellyLogger provides structured logging with multiple transports, automatic redaction, and TypeScript-first design.

[![npm version](https://badge.fury.io/js/jellylogger.svg)](https://www.npmjs.com/package/jellylogger)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2.14+-ff69b4.svg)](https://bun.sh/)
[![GitHub stars](https://img.shields.io/github/stars/JellisyWoes/jellylogger?style=social)](https://github.com/JellisyWoes/jellylogger/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/JellisyWoes/jellylogger)](https://github.com/JellisyWoes/jellylogger/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/JellisyWoes/jellylogger)](https://github.com/JellisyWoes/jellylogger/commits/main)
[![npm downloads](https://img.shields.io/npm/dm/jellylogger)](https://www.npmjs.com/package/jellylogger)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/jellylogger)](https://bundlephobia.com/package/jellylogger)

## ✨ Features

- 🚀 **Bun-Optimized**: Built specifically for Bun runtime with native API integration
- 🔌 **Multiple Transports**: Console, File, Discord Webhook, and WebSocket support
- 🎨 **Flexible Formatters**: JSON, Logfmt, NDJSON, and custom formatters
- 🔒 **Advanced Redaction**: Comprehensive data protection with patterns and field-specific rules
- 👶 **Child Loggers**: Context inheritance with prefix and data merging
- 🔄 **File Rotation**: Automatic log rotation with compression and date-based naming
- 📊 **Structured Logging**: Rich metadata and context support
- 🎯 **TypeScript-First**: Full type safety with extensive type definitions
- ⚡ **High Performance**: Optimized for speed and memory efficiency
- 🔧 **Extensible**: Plugin architecture for custom transports and formatters

## 📦 Installation

```bash
bun add jellylogger
```

## 🚀 Quick Start

```typescript
import { logger } from 'jellylogger';

// Basic logging
logger.info('Hello, JellyLogger!');
logger.error('Something went wrong', { error: 'Connection failed' });

// Structured logging with metadata
logger.info('User login', {
  userId: '12345',
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
});

// Using different log levels
logger.trace('Detailed debugging info');
logger.debug('Debug information');
logger.info('General information');
logger.warn('Warning message');
logger.error('Error occurred');
logger.fatal('Critical system error');
```

## 📝 Log Levels

JellyLogger supports 7 log levels (0-6):

```typescript
import { LogLevel } from 'jellylogger';

LogLevel.SILENT; // 0 - No logs
LogLevel.FATAL; // 1 - Critical errors
LogLevel.ERROR; // 2 - Errors
LogLevel.WARN; // 3 - Warnings
LogLevel.INFO; // 4 - Information
LogLevel.DEBUG; // 5 - Debug info
LogLevel.TRACE; // 6 - Detailed tracing
```

## 🎯 Multiple Transports

### Console Transport (Default)

```typescript
import { logger, ConsoleTransport } from 'jellylogger';

logger.addTransport(new ConsoleTransport());
```

### File Transport with Rotation

```typescript
import { logger, FileTransport } from 'jellylogger';

logger.addTransport(
  new FileTransport('app.log', {
    maxSize: '10MB',
    maxFiles: 5,
    compress: true,
    datePattern: 'YYYY-MM-DD',
  })
);
```

### Discord Webhook Transport

```typescript
import { logger, DiscordWebhookTransport } from 'jellylogger';

logger.addTransport(new DiscordWebhookTransport('https://discord.com/api/webhooks/...'));
```

### WebSocket Transport

```typescript
import { logger, WebSocketTransport } from 'jellylogger';

logger.addTransport(new WebSocketTransport('ws://localhost:8080/logs'));
```

### Transport Presets

JellyLogger provides convenient preset functions:

```typescript
import { useConsoleAndFile, useConsoleFileAndDiscord, useAllTransports } from 'jellylogger';

// Console + File
useConsoleAndFile('app.log');

// Console + File + Discord
useConsoleFileAndDiscord('app.log', 'https://discord.com/api/webhooks/...');

// All transports
useAllTransports('app.log', 'https://discord.com/api/webhooks/...', 'ws://localhost:8080/logs');
```

## 🎨 Formatters

### Built-in Formatters

```typescript
import { logger, createFormatter } from 'jellylogger';

// JSON formatter
logger.setOptions({
  format: createFormatter('ndjson'),
});

// Logfmt formatter
logger.setOptions({
  format: createFormatter('logfmt'),
});

// Default human-readable formatter
logger.setOptions({
  format: createFormatter('default'),
});
```

### Custom Formatters

```typescript
import type { LogFormatter, LogEntry } from 'jellylogger';

class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `[${entry.levelName}] ${entry.message} ${JSON.stringify(entry.data || {})}`;
  }
}

logger.setOptions({ format: new CustomFormatter() });
```

## 🔒 Data Redaction

### Basic Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', 'token', 'secret', '*.apiKey'],
    replacement: '[REDACTED]',
  },
});

logger.info('User data', {
  username: 'alice',
  password: 'hunter2', // Will be [REDACTED]
});
```

### Advanced Redaction with Patterns

```typescript
logger.setOptions({
  redaction: {
    keys: ['password', '*.credentials.*'],
    keyPatterns: [/secret/i, /token/i],
    valuePatterns: [/\b\d{4}-\d{4}-\d{4}-\d{4}\b/], // Credit cards
    redactStrings: true,
    stringPatterns: [
      /Bearer\s+[\w-]+/gi, // Bearer tokens
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Emails
    ],
    whitelist: ['user.id'],
    redactIn: 'file', // Only redact in file logs
  },
});
```

### Field-Specific Redaction

```typescript
logger.setOptions({
  redaction: {
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
  },
});
```

### Custom Redaction Functions

```typescript
logger.setOptions({
  redaction: {
    customRedactor: (value, context) => {
      if (context.path.includes('sensitive')) {
        return '[CUSTOM_REDACTED]';
      }
      return value;
    },
    auditHook: event => {
      console.debug(`Redacted ${event.type} at ${event.context.path}`);
    },
  },
});
```

## 👶 Child Loggers

Create contextual loggers that inherit parent configuration:

```typescript
// Create child logger with prefix
const userLogger = logger.child('USER');
userLogger.info('Login successful'); // [USER] Login successful

// Child logger with data context
const requestLogger = logger.child({
  data: { requestId: 'req-123', userId: 'user-456' },
});

requestLogger.info('Processing request');
// Includes requestId and userId in all logs

// Nested child loggers
const moduleLogger = requestLogger.child('AUTH');
moduleLogger.warn('Invalid token');
// [AUTH] Invalid token (with inherited context)
```

## ⚙️ Configuration

### Global Logger Options

```typescript
import { logger, LogLevel } from 'jellylogger';

logger.setOptions({
  level: LogLevel.INFO,
  format: createFormatter('ndjson'),
  colors: {
    info: 'blue',
    warn: 'yellow',
    error: 'red',
  },
  redaction: {
    keys: ['password', 'token'],
    redactIn: 'both',
  },
});
```

### Transport-Specific Options

```typescript
import { FileTransport } from 'jellylogger';

const fileTransport = new FileTransport('app.log', {
  maxSize: '50MB',
  maxFiles: 10,
  compress: true,
  datePattern: 'YYYY-MM-DD-HH',
});

logger.addTransport(fileTransport);
```

## 🔄 File Rotation

Automatic log rotation with flexible configuration:

```typescript
import { FileTransport } from 'jellylogger';

const transport = new FileTransport('logs/app.log', {
  maxSize: '100MB', // Rotate when file exceeds 100MB
  maxFiles: 30, // Keep 30 old files
  compress: true, // Compress rotated files with gzip
  datePattern: 'YYYY-MM-DD', // Daily rotation pattern
  auditFile: 'logs/.audit.json', // Track rotation events
});
```

## 🔌 Creating Custom Transports

```typescript
import type { Transport, LogEntry, TransportOptions } from 'jellylogger';

class DatabaseTransport implements Transport {
  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Apply redaction if needed
    const redacted = getRedactedEntry(entry, options?.redaction, 'file');

    // Store in database
    await this.database.insert('logs', {
      timestamp: redacted.timestamp,
      level: redacted.level,
      message: redacted.message,
      data: JSON.stringify(redacted.data),
    });
  }

  async flush(): Promise<void> {
    // Flush any pending writes
    await this.database.flush();
  }
}

logger.addTransport(new DatabaseTransport());
```

## 🧪 Testing

JellyLogger includes comprehensive test utilities:

```typescript
import { MemoryTransport, resetAllMocks } from 'jellylogger/test-utils';

// In your tests
beforeEach(() => {
  resetAllMocks();
});

const memoryTransport = new MemoryTransport();
logger.addTransport(memoryTransport);

// Test logging
logger.info('test message');
expect(memoryTransport.logs).toHaveLength(1);
expect(memoryTransport.logs[0].message).toBe('test message');
```

## 📚 Documentation

- [Usage Guide](./docs/usage.md) - Comprehensive usage examples
- [API Reference](./docs/api.md) - Complete API documentation
- [Extending JellyLogger](./docs/extending.md) - Custom transports and formatters
- [Migration Guide](./docs/migration.md) - Upgrading from other loggers
- [Linting & Code Quality](./docs/linting.md) - Development workflow and code standards

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`bun test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the [Bun](https://bun.sh/) runtime
- Inspired by popular logging libraries like Winston, Pino, and Bunyan
- TypeScript-first design for optimal developer experience

---

**Made with ❤️ for the Bun ecosystem**
