# Transports

Transports define where and how your log messages are output. JellyLogger supports multiple transports that can be used simultaneously, allowing you to send logs to different destinations like the console, files, or external services like Discord webhooks.

## What are Transports?

A transport is a storage device or output destination for your logs. Each transport implements the `Transport` interface and is responsible for:
- Writing logs to its specific destination
- Handling errors and connection issues gracefully
- Managing log rotation and cleanup (where applicable)
- Applying transport-specific formatting

## Transport Interface

All transports implement the `Transport` interface:

```typescript
interface Transport {
  /**
   * Logs an entry to the transport destination.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting and configuration
   */
  log(entry: LogEntry, options: LoggerOptions): Promise<void>;

  /**
   * Flushes any pending log entries.
   * Should be called before application shutdown.
   */
  flush?(options?: LoggerOptions): Promise<void>;
}
```

## Built-in Transports

### ConsoleTransport

The most basic transport that outputs logs to the console with colorized output support.

```typescript
import { logger, ConsoleTransport, LogLevel } from 'jellylogger';

logger.setOptions({
  transports: [new ConsoleTransport()],
  level: LogLevel.INFO,
  customConsoleColors: {
    [LogLevel.ERROR]: '#FF0000', // Custom red color
    [LogLevel.WARN]: '#FFD700',  // Custom yellow color
  }
});

logger.info('This will appear in the console with colors');
```

**Features:**
- Automatic colorization based on log level
- Custom color support via `customConsoleColors` option
- Proper console method mapping (console.error for ERROR/FATAL, console.warn for WARN, etc.)
- Support for human-readable timestamps
- Handles circular references in logged objects

### FileTransport

Writes logs to files with support for rotation, compression, and proper file locking using Bun's optimized file operations.

```typescript
import { FileTransport, LogLevel } from 'jellylogger';

const fileTransport = new FileTransport('./logs/app.log', {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  compress: true,
  dateRotation: true
});

logger.setOptions({
  transports: [fileTransport],
  level: LogLevel.DEBUG
});
```

**Constructor:**
```typescript
constructor(
  filePath: string, 
  rotationConfig?: LogRotationConfig,
  bunOps?: Partial<InjectedBunFileOperations>
)
```

**Rotation Configuration:**
```typescript
interface LogRotationConfig {
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

**Features:**
- Automatic log rotation by size or date
- Gzip compression of rotated files using Bun's native compression
- Proper file locking to prevent corruption
- Handles write errors gracefully
- Uses Bun's optimized `Bun.write()` operations for performance

### DiscordWebhookTransport

Sends log entries to a Discord webhook URL with intelligent batching to avoid rate limits.

```typescript
import { DiscordWebhookTransport } from 'jellylogger';

const discordTransport = new DiscordWebhookTransport(
  'https://discord.com/api/webhooks/your-webhook-url',
  {
    batchIntervalMs: 2000,
    maxBatchSize: 10,
    username: 'MyApp Logger',
    maxRetries: 3,
    suppressConsoleErrors: false
  }
);

logger.setOptions({
  transports: [discordTransport],
  discordWebhookUrl: 'https://discord.com/api/webhooks/your-webhook-url'
});

// Use the discord flag to send specific logs to Discord
logger.error('Critical error occurred!', { discord: true });
```

**Options:**
```typescript
interface DiscordWebhookTransportOptions {
  /** How often to send batches (ms). Default: 2000 */
  batchIntervalMs?: number;
  /** Max number of log entries per batch. Default: 10 */
  maxBatchSize?: number;
  /** Username for Discord webhook. Default: 'JellyLogger' */
  username?: string;
  /** Maximum retry attempts for failed batches. Default: 3 */
  maxRetries?: number;
  /** Suppress console.error output on webhook failure. Default: false */
  suppressConsoleErrors?: boolean;
}
```

**Features:**
- Intelligent batching to respect Discord rate limits
- Automatic retry with exponential backoff
- Rate limit detection and handling
- Message formatting for Discord (supports JSON code blocks)
- Singleton pattern for webhook URL reuse

### WebSocketTransport

Sends log entries over a WebSocket connection for real-time log streaming.

```typescript
import { WebSocketTransport } from 'jellylogger';

const wsTransport = new WebSocketTransport('ws://localhost:3000/logs');

logger.setOptions({
  transports: [wsTransport]
});
```

**Features:**
- Real-time log streaming over WebSocket
- Automatic reconnection on connection loss
- Buffering during disconnected states
- JSON serialization of log entries

## Using Multiple Transports

You can configure multiple transports simultaneously:

```typescript
import { ConsoleTransport, FileTransport, DiscordWebhookTransport, LogLevel } from 'jellylogger';

logger.setOptions({
  level: LogLevel.DEBUG,
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log', {
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      compress: true
    }),
    new DiscordWebhookTransport(process.env.DISCORD_WEBHOOK_URL!, {
      maxBatchSize: 5,
      suppressConsoleErrors: true
    })
  ],
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL
});

// This goes to console and file
logger.info('Application started');

// This goes to console, file, and Discord
logger.error('Database connection failed', { discord: true });
```

## Creating Custom Transports

Create custom transports by implementing the `Transport` interface. Here's an example using Bun's native HTTP server capabilities:

```typescript
import { Transport, LogEntry, LoggerOptions, LogLevel } from 'jellylogger';

class SlackTransport implements Transport {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Only send ERROR and FATAL to Slack
    if (entry.level > LogLevel.ERROR) return;

    const message = {
      text: `[${entry.levelName}] ${entry.message}`,
      attachments: entry.data ? [{
        color: entry.level === LogLevel.FATAL ? 'danger' : 'warning',
        fields: Object.entries(entry.data).map(([key, value]) => ({
          title: key,
          value: JSON.stringify(value),
          short: true
        }))
      }] : undefined
    };

    try {
      // Use Bun's optimized fetch
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status}`);
      }
    } catch (error: unknown) {
      console.error('Failed to send to Slack:', error);
    }
  }

  async flush(): Promise<void> {
    // No buffering, so nothing to flush
  }
}

// Use the custom transport
logger.setOptions({
  transports: [
    new ConsoleTransport(),
    new SlackTransport(process.env.SLACK_WEBHOOK_URL!)
  ]
});
```

## Advanced Features

### Redaction Support

JellyLogger supports automatic redaction of sensitive data:

```typescript
logger.setOptions({
  transports: [new ConsoleTransport(), new FileTransport('./logs/app.log')],
  redaction: {
    keys: ['password', 'token', 'apiKey', 'secret'],
    replacement: '[REDACTED]',
    caseInsensitive: true,
    redactIn: 'both' // 'console', 'file', or 'both'
  }
});

// The password will be redacted in both console and file output
logger.info('User login', { username: 'john', password: 'secret123' });
```

### Pluggable Formatters

Use custom formatters for consistent output across transports:

```typescript
import { LogfmtFormatter, NdjsonFormatter } from 'jellylogger';

// Using built-in logfmt formatter
logger.setOptions({
  transports: [new FileTransport('./logs/app.log')],
  pluggableFormatter: new LogfmtFormatter()
});

// Using built-in NDJSON formatter
logger.setOptions({
  transports: [new FileTransport('./logs/app.log')],
  pluggableFormatter: new NdjsonFormatter()
});

// Custom formatter
class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `${entry.timestamp} | ${entry.levelName} | ${entry.message}`;
  }
}

logger.setOptions({
  pluggableFormatter: new CustomFormatter()
});
```

### Error Handling

All transports handle errors gracefully and continue operation:

```typescript
// File transport continues even if file operations fail
const fileTransport = new FileTransport('./logs/app.log');

// Discord transport retries failed requests
const discordTransport = new DiscordWebhookTransport(webhookUrl, {
  maxRetries: 5,
  suppressConsoleErrors: true // Don't spam console with retry errors
});
```

### Flushing

Ensure all pending logs are written before shutdown using Bun's process handling:

```typescript
// Flush all transports
await logger.flushAll();

// Set up proper shutdown handling with Bun
process.on('SIGTERM', async () => {
  await logger.flushAll();
  process.exit(0);
});

// Or flush individual transports if you have references
await fileTransport.flush();
await discordTransport.flush();
```

## Best Practices

### Performance

1. **Use appropriate log levels** for each transport
2. **Batch operations** for remote transports (Discord handles this automatically)
3. **Use async operations** properly in custom transports
4. **Leverage Bun's performance** - use `Bun.write()` for file operations

### Configuration

```typescript
// Development setup with Bun
logger.setOptions({
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport()],
  useHumanReadableTime: true
});

// Production setup optimized for Bun
logger.setOptions({
  level: LogLevel.INFO,
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log', {
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 30,
      compress: true,
      dateRotation: true
    })
  ],
  redaction: {
    keys: ['password', 'token', 'apiKey', 'authorization'],
    redactIn: 'both'
  }
});
```

### Error Recovery

```typescript
// Custom transport with fallback using Bun's error handling
class ResilientTransport implements Transport {
  constructor(
    private primary: Transport,
    private fallback: Transport
  ) {}

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    try {
      await this.primary.log(entry, options);
    } catch (error: unknown) {
      console.warn('Primary transport failed, using fallback:', error);
      await this.fallback.log(entry, options);
    }
  }

  async flush(options?: LoggerOptions): Promise<void> {
    await Promise.allSettled([
      this.primary.flush?.(options),
      this.fallback.flush?.(options)
    ]);
  }
}
```

### Bun-Optimized File Transport Example

```typescript
class BunOptimizedFileTransport implements Transport {
  constructor(private filePath: string) {}

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    const logLine = this.formatEntry(entry) + '\n';
    
    try {
      // Use Bun's optimized file writing
      await Bun.write(this.filePath, logLine, { createPath: true });
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  private formatEntry(entry: LogEntry): string {
    return `${entry.timestamp} [${entry.levelName}] ${entry.message}`;
  }

  async flush(): Promise<void> {
    // Bun.write() is already synchronous, no need to flush
  }
}
```

This comprehensive transport system provides flexibility, reliability, and performance optimized for Bun's runtime capabilities.
