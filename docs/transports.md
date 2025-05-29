# JellyLogger Transports Guide

Transports in JellyLogger determine where your logs are sent. Each transport handles a specific destination and can be configured independently with its own formatting, redaction, and behavior options.

---

## Overview

JellyLogger supports multiple transport types:

- **ConsoleTransport** - Outputs to console with colors
- **FileTransport** - Writes to files with rotation support
- **DiscordWebhookTransport** - Sends logs to Discord channels
- **WebSocketTransport** - Streams logs to WebSocket servers

All transports implement the `Transport` interface and can be mixed and matched as needed.

---

## ConsoleTransport

The default transport that outputs colorized logs to the console using appropriate console methods (`console.info`, `console.error`, etc.).

### Basic Usage

```typescript
import { logger, ConsoleTransport } from "jellylogger";

logger.addTransport(new ConsoleTransport());
```

### Features

- **Automatic Color Mapping**: Uses different colors for each log level
- **Smart Console Methods**: Routes to appropriate console methods (error, warn, info, debug)
- **Bun Color Support**: Leverages `Bun.color()` for advanced color parsing
- **Circular Reference Handling**: Safely handles complex objects

### Custom Colors

```typescript
import { logger, LogLevel } from "jellylogger";

logger.setOptions({
  customConsoleColors: {
    [LogLevel.ERROR]: "#FF0000",      // Hex colors
    [LogLevel.WARN]: "rgb(255,165,0)", // RGB colors
    [LogLevel.INFO]: "hsl(120,100%,50%)", // HSL colors
    [LogLevel.DEBUG]: "\x1b[34m",     // ANSI escape codes
    bold: "#FFFFFF",
    reset: "\x1b[0m"
  }
});
```

### Console Output Examples

```typescript
// String format (default)
logger.info("User logged in", { userId: 123 });
// Output: [2024-01-15T10:30:45.123Z] INFO : User logged in {"userId":123}

// JSON format
logger.setOptions({ format: "json" });
logger.info("User logged in", { userId: 123 });
// Output: {"timestamp":"2024-01-15T10:30:45.123Z","level":4,"levelName":"INFO","message":"User logged in","data":{"userId":123},"args":[]}
```

---

## FileTransport

Writes logs to files with support for rotation, compression, and directory creation.

### Basic Usage

```typescript
import { logger, FileTransport } from "jellylogger";

logger.addTransport(new FileTransport("./logs/app.log"));
```

### Configuration Options

```typescript
import { logger, FileTransport } from "jellylogger";

const transport = new FileTransport("./logs/app.log", {
  maxFileSize: 50 * 1024 * 1024,  // 50MB
  maxFiles: 10,                   // Keep 10 rotated files
  compress: true,                 // Gzip old files
  dateRotation: true              // Rotate daily
});

logger.addTransport(transport);
```

### Rotation Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxFileSize` | number | 10MB | Maximum file size before rotation |
| `maxFiles` | number | 5 | Number of rotated files to keep |
| `compress` | boolean | true | Whether to gzip rotated files |
| `dateRotation` | boolean | false | Whether to rotate daily |

### File Rotation Examples

```typescript
// Size-based rotation
const sizeRotation = new FileTransport("./logs/app.log", {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 5,
  compress: true
});

// Date-based rotation
const dateRotation = new FileTransport("./logs/app.log", {
  dateRotation: true,
  maxFiles: 30, // Keep 30 days
  compress: true
});

// Both size and date rotation
const hybridRotation = new FileTransport("./logs/app.log", {
  maxFileSize: 50 * 1024 * 1024,
  maxFiles: 7,
  dateRotation: true,
  compress: true
});
```

### File Structure

```
logs/
├── app.log              # Current log file
├── app.1.log.gz         # Yesterday's compressed logs
├── app.2.log.gz         # Day before yesterday
├── app.3.log.gz
├── app.4.log.gz
└── app.5.log.gz         # Oldest kept file
```

### Bun-Specific Optimizations

- Uses `Bun.write()` for optimal file I/O performance
- Leverages Bun's built-in gzip compression
- Synchronous writes ensure proper log ordering

### Error Handling

```typescript
// FileTransport handles common errors gracefully:
// - Missing directories (creates them automatically)
// - Permission issues (logs warnings, continues operation)
// - Disk space issues (fails gracefully)
// - Rotation failures (continues with current file)

const transport = new FileTransport("./logs/app.log");
// Will create ./logs/ directory if it doesn't exist
```

---

## DiscordWebhookTransport

Sends logs to Discord channels via webhooks with intelligent batching and rate limiting.

### Basic Usage

```typescript
import { logger, DiscordWebhookTransport } from "jellylogger";

const webhookUrl = "https://discord.com/api/webhooks/1234567890/abcdef...";
logger.addTransport(new DiscordWebhookTransport(webhookUrl));
```

### Configuration Options

```typescript
import { logger, DiscordWebhookTransport } from "jellylogger";

const transport = new DiscordWebhookTransport(webhookUrl, {
  batchIntervalMs: 5000,        // Send batches every 5 seconds
  maxBatchSize: 5,              // Max 5 logs per batch
  username: "MyApp Logger",     // Bot username in Discord
  maxRetries: 3,                // Retry failed sends 3 times
  suppressConsoleErrors: false  // Show webhook errors in console
});

logger.addTransport(transport);
```

### Rate Limiting & Batching

Discord webhooks have rate limits (5 requests per 2 seconds). The transport handles this automatically:

- **Batching**: Combines multiple log entries into single messages
- **Rate Limiting**: Respects Discord's rate limits with exponential backoff
- **Retry Logic**: Automatically retries failed requests
- **Message Splitting**: Splits large messages to stay under Discord's 2000 character limit

### Message Formatting

```typescript
// String format (default) - formatted for Discord
logger.error("Payment failed", { orderId: "12345", amount: 99.99 });
// Discord: **[2024-01-15T10:30:45.123Z] ERROR:** Payment failed
//          ```json
//          {"orderId": "12345", "amount": 99.99}
//          ```

// JSON format - code blocks
logger.setOptions({ format: "json" });
logger.error("Payment failed", { orderId: "12345" });
// Discord: ```json
//          {"timestamp":"2024-01-15T10:30:45.123Z","level":2,"levelName":"ERROR",...}
//          ```
```

### Discord Integration with Logger

Use the special `discord: true` flag to send specific logs:

```typescript
logger.setOptions({
  discordWebhookUrl: "https://discord.com/api/webhooks/..."
});

// Regular log - goes to configured transports only
logger.info("User logged in", { userId: 123 });

// Alert log - goes to transports AND Discord
logger.error("Payment processor down", { 
  service: "stripe",
  discord: true  // Triggers Discord webhook
});
```

### Best Practices

```typescript
// Use for important alerts only
logger.fatal("Database connection lost", { discord: true });
logger.error("Payment failed", { orderId: "123", discord: true });

// Don't spam Discord with debug logs
logger.debug("Cache hit", { key: "user:123" }); // No discord flag

// Use appropriate usernames for different environments
const transport = new DiscordWebhookTransport(webhookUrl, {
  username: process.env.NODE_ENV === 'production' ? 'Prod Alerts' : 'Dev Logs'
});
```

---

## WebSocketTransport

Streams logs in real-time to WebSocket servers with automatic reconnection.

### Basic Usage

```typescript
import { logger, WebSocketTransport } from "jellylogger";

logger.addTransport(new WebSocketTransport("ws://localhost:8080/logs"));
```

### Configuration Options

```typescript
import { logger, WebSocketTransport } from "jellylogger";

const transport = new WebSocketTransport("ws://localhost:8080/logs", {
  reconnectIntervalMs: 1000,      // Initial reconnect delay
  maxReconnectIntervalMs: 30000,  // Max reconnect delay
  redact: true,                   // Apply redaction
  serializer: JSON.stringify      // Custom serialization
});

logger.addTransport(transport);
```

### Reconnection Logic

The transport implements intelligent reconnection:

- **Exponential Backoff**: Increases delay between reconnection attempts
- **Queue Management**: Queues logs during disconnection
- **Automatic Retry**: Continuously attempts to reconnect
- **Graceful Degradation**: Continues operation even if WebSocket fails

### Custom Serialization

```typescript
// Custom serializer for specific log format
const transport = new WebSocketTransport("ws://localhost:8080/logs", {
  serializer: (entry) => {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.levelName.toLowerCase(),
      message: entry.message,
      metadata: entry.data
    });
  }
});
```

### Server Example

Here's a simple WebSocket server that can receive logs:

```typescript
// server.ts - Simple log receiver
const server = Bun.serve({
  port: 8080,
  websocket: {
    message(ws, message) {
      try {
        const logEntry = JSON.parse(message);
        console.log('Received log:', logEntry);
        
        // Store to database, forward to other systems, etc.
      } catch (error) {
        console.error('Invalid log message:', message);
      }
    },
    open(ws) {
      console.log('Log client connected');
    },
    close(ws) {
      console.log('Log client disconnected');
    }
  }
});

console.log(`WebSocket log server running on ws://localhost:${server.port}`);
```

### Real-time Monitoring

```typescript
// Use WebSocket transport for real-time log monitoring
const wsTransport = new WebSocketTransport("ws://monitoring.example.com/logs");
logger.addTransport(wsTransport);

// Logs are streamed in real-time to monitoring dashboard
logger.info("User action", { userId: 123, action: "purchase" });
logger.warn("High memory usage", { usage: "85%" });
logger.error("API timeout", { endpoint: "/api/users", timeout: "30s" });
```

---

## Transport Management

### Adding and Removing Transports

```typescript
import { logger, FileTransport, DiscordWebhookTransport } from "jellylogger";

// Add individual transports
const fileTransport = new FileTransport("./logs/app.log");
const discordTransport = new DiscordWebhookTransport(webhookUrl);

logger.addTransport(fileTransport);
logger.addTransport(discordTransport);

// Remove specific transport
logger.removeTransport(fileTransport);

// Replace all transports
logger.setTransports([
  new ConsoleTransport(),
  new FileTransport("./logs/new.log")
]);

// Clear all transports
logger.clearTransports();
```

### Transport-Specific Options

Each transport can have different formatting and redaction:

```typescript
import { logger, LogLevel } from "jellylogger";

// Global options apply to all transports
logger.setOptions({
  level: LogLevel.INFO,
  format: "json",
  redaction: {
    keys: ["password", "token"]
  }
});

// Individual transports inherit global options
// but can override with transport-specific options during log calls
```

---

## Multiple Transport Strategies

### Environment-Based Configuration

```typescript
// config/transports.ts
import { 
  logger, 
  ConsoleTransport, 
  FileTransport, 
  DiscordWebhookTransport,
  LogLevel
} from "jellylogger";

function configureTransports() {
  const env = process.env.NODE_ENV;
  
  if (env === 'development') {
    // Development: Console only with debug level
    logger.setOptions({
      level: LogLevel.DEBUG,
      transports: [new ConsoleTransport()],
      format: "string",
      useHumanReadableTime: true
    });
  } else if (env === 'test') {
    // Testing: File only to avoid console noise
    logger.setOptions({
      level: LogLevel.WARN,
      transports: [new FileTransport("./logs/test.log")],
      format: "json"
    });
  } else {
    // Production: Console + File + Discord for alerts
    logger.setOptions({
      level: LogLevel.INFO,
      format: "json",
      transports: [
        new ConsoleTransport(),
        new FileTransport("./logs/app.log", {
          maxFileSize: 100 * 1024 * 1024,
          maxFiles: 7,
          compress: true
        }),
        new DiscordWebhookTransport(process.env.DISCORD_WEBHOOK_URL!, {
          username: "Production Alerts"
        })
      ],
      redaction: {
        keys: ["password", "token", "secret", "apiKey"],
        stringPatterns: [/Bearer\s+[\w-]+/gi]
      }
    });
  }
}

configureTransports();
```

### Log Level Routing

```typescript
// Route different log levels to different transports
import { logger, LogLevel } from "jellylogger";

// Create level-specific child loggers
const errorLogger = logger.child({ messagePrefix: "[ERROR]" });
const debugLogger = logger.child({ messagePrefix: "[DEBUG]" });

// Configure error logger with Discord alerts
const errorFileTransport = new FileTransport("./logs/errors.log");
const errorDiscordTransport = new DiscordWebhookTransport(webhookUrl);

// Configure debug logger with detailed file logging
const debugFileTransport = new FileTransport("./logs/debug.log", {
  maxFileSize: 200 * 1024 * 1024,
  maxFiles: 3
});

// Use different loggers for different purposes
errorLogger.error("Critical system error", { discord: true });
debugLogger.debug("Detailed trace information", { traceId: "abc123" });
```

### Failover Strategies

```typescript
// Implement transport failover
class FailoverTransport implements Transport {
  private primaryTransport: Transport;
  private fallbackTransport: Transport;
  private useFallback = false;

  constructor(primary: Transport, fallback: Transport) {
    this.primaryTransport = primary;
    this.fallbackTransport = fallback;
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      if (!this.useFallback) {
        await this.primaryTransport.log(entry, options);
        return;
      }
    } catch (error) {
      console.warn('Primary transport failed, switching to fallback');
      this.useFallback = true;
    }

    try {
      await this.fallbackTransport.log(entry, options);
    } catch (error) {
      console.error('Both transports failed:', error);
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    if (this.primaryTransport.flush) {
      await this.primaryTransport.flush(options);
    }
    if (this.fallbackTransport.flush) {
      await this.fallbackTransport.flush(options);
    }
  }
}

// Use with network and local file failover
const failoverTransport = new FailoverTransport(
  new WebSocketTransport("ws://remote-logging.example.com/logs"),
  new FileTransport("./logs/fallback.log")
);

logger.addTransport(failoverTransport);
```

---

## Custom Transport Development

### Creating Custom Transports

```typescript
import type { Transport, LogEntry, TransportOptions } from "jellylogger";

class DatabaseTransport implements Transport {
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      // Insert log into database
      await this.insertLog({
        timestamp: new Date(entry.timestamp),
        level: entry.level,
        message: entry.message,
        data: JSON.stringify(entry.data),
        args: JSON.stringify(entry.args)
      });
    } catch (error) {
      console.error('Database transport error:', error);
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    // Flush any pending database operations
  }

  private async insertLog(logData: any): Promise<void> {
    // Database insertion logic
  }
}

// Use custom transport
logger.addTransport(new DatabaseTransport("postgresql://..."));
```

### Transport Interface

```typescript
interface Transport {
  /**
   * Log an entry to the transport destination
   */
  log(entry: LogEntry, options?: TransportOptions): Promise<void>;
  
  /**
   * Flush any pending operations (optional)
   */
  flush?(options?: TransportOptions): Promise<void>;
}
```

---

## Performance Considerations

### Async vs Sync Operations

- **ConsoleTransport**: Synchronous operations (fastest)
- **FileTransport**: Synchronous writes with async rotation
- **DiscordWebhookTransport**: Async with batching and queuing
- **WebSocketTransport**: Async with queuing and reconnection

### Batching and Queuing

```typescript
// Transports handle batching automatically
logger.info("Log 1");
logger.info("Log 2");
logger.info("Log 3");
// DiscordWebhookTransport will batch these into a single request

// Force immediate flush if needed
await logger.flushAll();
```

### Memory Usage

```typescript
// Monitor transport queue sizes
class MonitoredTransport implements Transport {
  private queueSize = 0;
  private maxQueueSize = 1000;

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    if (this.queueSize > this.maxQueueSize) {
      console.warn(`Transport queue size exceeded: ${this.queueSize}`);
    }
    
    this.queueSize++;
    try {
      await this.actualLog(entry, options);
    } finally {
      this.queueSize--;
    }
  }

  private async actualLog(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Actual logging implementation
  }

  async flush(options?: TransportOptions): Promise<void> {
    // Flush implementation
  }
}
```

---

## Best Practices

### Transport Selection

1. **Development**: ConsoleTransport for immediate feedback
2. **Testing**: FileTransport to avoid console noise
3. **Staging**: Console + File for debugging
4. **Production**: Console + File + Discord for monitoring

### Configuration Tips

```typescript
// Use environment variables for sensitive data
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
const logLevel = process.env.LOG_LEVEL as keyof typeof LogLevel || 'INFO';

// Configure based on environment
logger.setOptions({
  level: LogLevel[logLevel],
  transports: [
    new ConsoleTransport(),
    ...(process.env.NODE_ENV === 'production' ? [
      new FileTransport("./logs/app.log", { compress: true }),
      ...(discordWebhookUrl ? [new DiscordWebhookTransport(discordWebhookUrl)] : [])
    ] : [])
  ]
});
```

### Error Handling

```typescript
// Always handle transport errors gracefully
logger.addTransport(new FileTransport("./logs/app.log"));

// Transports handle their own errors, but you can monitor them
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (possibly from transport):', reason);
});
```

### Graceful Shutdown

```typescript
// Always flush transports before shutdown
async function gracefulShutdown() {
  logger.info("Application shutting down...");
  await logger.flushAll();
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
```

---

## Troubleshooting

### Common Issues

**File Transport Issues:**
```typescript
// Issue: Permission denied
// Solution: Ensure directory exists and is writable
const transport = new FileTransport("./logs/app.log"); // Creates ./logs/ if needed

// Issue: Disk space
// Solution: Monitor disk space and configure rotation
const transport = new FileTransport("./logs/app.log", {
  maxFileSize: 50 * 1024 * 1024, // Smaller files
  maxFiles: 3 // Keep fewer files
});
```

**Discord Transport Issues:**
```typescript
// Issue: Rate limiting
// Solution: Increase batch interval
const transport = new DiscordWebhookTransport(webhookUrl, {
  batchIntervalMs: 5000, // Longer intervals
  maxBatchSize: 3 // Smaller batches
});

// Issue: Webhook failures
// Solution: Enable error logging
const transport = new DiscordWebhookTransport(webhookUrl, {
  suppressConsoleErrors: false // See webhook errors
});
```

**WebSocket Transport Issues:**
```typescript
// Issue: Connection failures
// Solution: Implement longer reconnection intervals
const transport = new WebSocketTransport("ws://localhost:8080/logs", {
  reconnectIntervalMs: 5000,
  maxReconnectIntervalMs: 60000
});
```

### Debug Mode

```typescript
// Enable transport debugging
logger.setOptions({
  level: LogLevel.DEBUG,
  format: "json"
});

// Monitor transport performance
const startTime = Date.now();
logger.info("Test message");
await logger.flushAll();
console.log(`Logging took ${Date.now() - startTime}ms`);
```

---

## More Resources

- [Usage Guide](./usage.md) - Complete usage documentation
- [API Reference](./api.md) - API documentation
- [Redaction Guide](./redaction.md) - Advanced redaction patterns
- [Examples](./examples.md) - Real-world usage examples

---
