<div align="center">
  <h1>JellyLogger</h1>
  <p>
    A fast, flexible logging library built specifically for the <a href="https://bun.sh/">Bun</a> runtime.<br>
    JellyLogger provides structured logging with multiple transports, automatic redaction, and TypeScript-first design.
  </p>
  <p>
    <a href="https://www.npmjs.com/package/jellylogger"><img src="https://badge.fury.io/js/jellylogger.svg" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/jellylogger"><img src="https://img.shields.io/npm/dm/jellylogger" alt="npm downloads"></a>
    <a href="https://bundlephobia.com/package/jellylogger"><img src="https://img.shields.io/bundlephobia/min/jellylogger" alt="npm bundle size"></a>
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8.3-blue.svg" alt="TypeScript"></a>
    <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.2.11+-ff69b4.svg" alt="Bun"></a>
    <a href="https://github.com/JellisyWoes/jellylogger/stargazers"><img src="https://img.shields.io/github/stars/JellisyWoes/jellylogger?style=social" alt="GitHub stars"></a>
    <a href="https://github.com/JellisyWoes/jellylogger/issues"><img src="https://img.shields.io/github/issues/JellisyWoes/jellylogger" alt="GitHub issues"></a>
    <a href="https://github.com/JellisyWoes/jellylogger/commits/main"><img src="https://img.shields.io/github/last-commit/JellisyWoes/jellylogger" alt="GitHub last commit"></a>
  </p>
</div>

<hr>

<a id="features"></a>

<h2>✨ Features</h2>

- 🚀 **Bun-Optimized**: Built specifically for Bun runtime with native API integration
- 🔌 **Multiple Transports**: Console, File, Discord Webhook, and WebSocket support
- 🎨 **Flexible Formatters**: JSON, Logfmt, NDJSON, and custom formatters
- 🔒 **Advanced Redaction**: Comprehensive data protection with patterns and field-specific rules
- 👶 **Child Loggers**: Context inheritance with message prefixes
- 🔄 **File Rotation**: Automatic log rotation with compression and date-based naming
- 📊 **Structured Logging**: Rich metadata and context support
- 🎯 **TypeScript-First**: Full type safety with extensive type definitions
- ⚡ **High Performance**: Optimized for speed and memory efficiency
- 🔧 **Extensible**: Plugin architecture for custom transports and formatters

<hr>
<a id="installation"></a>
<h2>📦 Installation</h2>

```bash
bun add jellylogger
```

<hr>
<a id="quickstart"></a>
<h2>🚀 Quick Start</h2>

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

<hr>
<a id="loglevels"></a>
<h2>📝 Log Levels</h2>

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

<hr>
<a id="transports"></a>
<h2>🎯 Multiple Transports</h2>

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

<hr>
<a id="formatters"></a>
<h2>🎨 Formatters</h2>

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

<hr>
<a id="redaction"></a>
<h2>🔒 Data Redaction</h2>

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

<hr>
<a id="childloggers"></a>
<h2>👶 Child Loggers</h2>

Create contextual loggers that inherit parent configuration:

```typescript
// Create child logger with prefix
const userLogger = logger.child({ messagePrefix: 'USER' });
userLogger.info('Login successful'); // [USER] Login successful

// Child logger with data context (passed with each log)
const requestLogger = logger.child({
  messagePrefix: 'REQUEST',
});

requestLogger.info('Processing request', {
  requestId: 'req-123',
  userId: 'user-456',
});

// Nested child loggers
const moduleLogger = requestLogger.child({ messagePrefix: 'AUTH' });
moduleLogger.warn('Invalid token');
// [REQUEST] [AUTH] Invalid token
```

<hr>
<a id="configuration"></a>
<h2>⚙️ Configuration</h2>

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

<hr>
<a id="filerotation"></a>
<h2>🔄 File Rotation</h2>

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

<hr>
<a id="customtransports"></a>
<h2>🔌 Creating Custom Transports</h2>

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

<hr>
<a id="testing"></a>
<h2>🧪 Testing</h2>

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

<hr>
<a id="documentation"></a>
<h2>📚 Documentation</h2>

- [Usage Guide](./docs/usage.md) - Comprehensive usage examples
- [API Reference](./docs/api.md) - Complete API documentation
- [Extending JellyLogger](./docs/extending.md) - Custom transports and formatters
- [Migration Guide](./docs/migration.md) - Upgrading from other loggers
- [Linting & Code Quality](./docs/linting.md) - Development workflow and code standards

<hr>
<a id="contributing"></a>
<h2>🤝 Contributing</h2>

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`bun test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

<hr>
<a id="license"></a>
<h2>📄 License</h2>

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

<hr>
<a id="acknowledgments"></a>
<h2>🙏 Acknowledgments</h2>

- Built for the [Bun](https://bun.sh/) runtime
- Inspired by popular logging libraries like Winston, Pino, and Bunyan
- TypeScript-first design for optimal developer experience

---

<p align="center"><b>Made with ❤️ for the Bun ecosystem</b></p>
