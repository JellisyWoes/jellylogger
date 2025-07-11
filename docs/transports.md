# JellyLogger Transports Guide

Transports in JellyLogger determine where your logs are sent. Each transport handles a specific destination and can be configured independently with its own formatting, redaction, and behavior options.

---

## Table of Contents

1. [Overview](#overview)
2. [ConsoleTransport](#consoletransport)
3. [FileTransport](#filetransport)
4. [DiscordWebhookTransport](#discordwebhooktransport)
5. [WebSocketTransport](#websockettransport)
6. [Transport Management](#transport-management)
7. [Multiple Transport Strategies](#multiple-transport-strategies)
8. [Custom Transport Development](#custom-transport-development)
9. [Performance Considerations](#performance-considerations)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

JellyLogger uses a transport system where each transport is responsible for sending logs to a specific destination. Transports implement the `Transport` interface and handle:

- **Log Formatting**: Converting log entries to the appropriate format
- **Redaction**: Applying data protection rules per destination
- **Error Handling**: Graceful degradation when issues occur
- **Flushing**: Ensuring data is written before shutdown

### Transport Interface

```typescript
interface Transport {
  log(entry: LogEntry, options?: TransportOptions): Promise<void>;
  flush?(options?: TransportOptions): Promise<void>;
}
```

---

## ConsoleTransport

The default transport that outputs logs to the console with automatic color coding.

### Basic Usage

```typescript
import { logger, ConsoleTransport } from "jellylogger";

// ConsoleTransport is included by default
logger.info("Hello, console!");

// Or add explicitly
logger.addTransport(new ConsoleTransport());
```

### Features

- **Automatic Color Coding**: Different colors for each log level
- **Human-Readable Format**: Optimized for development readability
- **Error Handling**: Graceful fallback if console is unavailable
- **No Configuration Required**: Works out of the box

### Color Customization

```typescript
import { logger, LogLevel } from "jellylogger";

logger.setOptions({
  customConsoleColors: {
    [LogLevel.INFO]: "#00ff00",    // Green
    [LogLevel.WARN]: "#ffff00",    // Yellow  
    [LogLevel.ERROR]: "#ff0000",   // Red
    [LogLevel.DEBUG]: "#00ffff",   // Cyan
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m"
  }
});
```

### Console Output Examples

```typescript
// Different log levels with default colors
logger.trace("Detailed tracing info");    // Dim gray
logger.debug("Debug information");        // Cyan
logger.info("General information");       // Blue
logger.warn("Warning message");           // Yellow
logger.error("Error occurred");           // Red
logger.fatal("Critical system error");    // Bright red
```

---

## FileTransport

Writes logs to files with comprehensive rotation and compression support.

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

### File Structure Examples

With rotation enabled, your log directory will look like:
```
logs/
├── app.log              # Current log file
├── app.1.log.gz         # Yesterday's logs (compressed)
├── app.2.log.gz         # Day before yesterday
└── app.3.log.gz         # Older logs
```

### Advanced File Configuration

```typescript
// Production file logging with comprehensive rotation
const productionFileTransport = new FileTransport("./logs/production.log", {
  maxFileSize: 100 * 1024 * 1024,    // 100MB files
  maxFiles: 30,                      // Keep 30 files (30 days if daily rotation)
  compress: true,                    // Compress old files to save space
  dateRotation: true                 // Rotate daily regardless of size
});

// Error-only file logging
const errorFileTransport = new FileTransport("./logs/errors.log");

logger.addTransport(productionFileTransport);
logger.addTransport(errorFileTransport);
```

### File Format

FileTransport automatically uses appropriate formatting:

```typescript
// JSON format for structured logging
logger.setOptions({
  pluggableFormatter: createFormatter("ndjson")
});

// Human-readable format for development
logger.setOptions({
  pluggableFormatter: createFormatter("default")
});
```

---

## DiscordWebhookTransport

Sends logs to Discord channels via webhooks, perfect for real-time alerts and monitoring.

### Basic Usage

```typescript
import { logger, DiscordWebhookTransport } from "jellylogger";

const discordTransport = new DiscordWebhookTransport(
  "https://discord.com/api/webhooks/YOUR_WEBHOOK_URL"
);

logger.addTransport(discordTransport);
```

### Features

- **Rate Limiting**: Automatic batching to respect Discord's rate limits
- **Message Formatting**: Optimized for Discord's message format
- **Error Handling**: Graceful fallback when Discord is unavailable
- **Batch Processing**: Groups messages to reduce API calls

### Configuration

```typescript
const discordTransport = new DiscordWebhookTransport(webhookUrl, {
  username: "MyApp Logger",          // Bot username in Discord
  batchIntervalMs: 2000,            // Batch messages every 2 seconds
  maxBatchSize: 10,                 // Max 10 messages per batch
  retryAttempts: 3,                 // Retry failed sends 3 times
  retryDelayMs: 1000               // Wait 1 second between retries
});
```

### Message Format

Discord messages are automatically formatted:

```typescript
logger.error("Database connection failed", {
  database: "users",
  error: "Connection timeout",
  retryCount: 3
});
```

Appears in Discord as:
```
[2023-12-07 15:30:45] ERROR: Database connection failed
database: users
error: Connection timeout
retryCount: 3
```

### Level-Specific Discord Logging

```typescript
// Only send errors and fatals to Discord
const discordTransport = new DiscordWebhookTransport(webhookUrl);

// Create a child logger for Discord-worthy events
const alertLogger = logger.child({ messagePrefix: "ALERT" });

// Add Discord transport only to alert logger
alertLogger.addTransport(discordTransport);

// Regular logs go to console/file
logger.info("Regular application flow");

// Alerts go to Discord
alertLogger.error("Critical database error");
```

---

## WebSocketTransport

Streams logs in real-time over WebSocket connections for live monitoring dashboards.

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
  pluggableFormatter: createFormatter("ndjson"),
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
      pluggableFormatter: createFormatter("default"),
      useHumanReadableTime: true
    });
  } else if (env === 'test') {
    // Testing: File only to avoid console noise
    logger.setOptions({
      level: LogLevel.WARN,
      transports: [new FileTransport("./logs/test.log")],
      pluggableFormatter: createFormatter("ndjson")
    });
  } else {
    // Production: Console + File + Discord for alerts
    logger.setOptions({
      level: LogLevel.INFO,
      pluggableFormatter: createFormatter("ndjson"),
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
// Custom failover transport
class FailoverTransport implements Transport {
  constructor(
    private primaryTransport: Transport,
    private fallbackTransport: Transport
  ) {}

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      await this.primaryTransport.log(entry, options);
    } catch (error) {
      console.warn("Primary transport failed, using fallback:", error);
      await this.fallbackTransport.log(entry, options);
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    await Promise.allSettled([
      this.primaryTransport.flush?.(options),
      this.fallbackTransport.flush?.(options)
    ]);
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
import { getRedactedEntry } from "jellylogger";

class DatabaseTransport implements Transport {
  constructor(private database: Database) {}

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      // Apply redaction for database storage
      const redacted = getRedactedEntry(entry, options?.redaction, 'file');
      
      // Store in database
      await this.database.insert('logs', {
        timestamp: redacted.timestamp,
        level: redacted.level,
        message: redacted.message,
        data: JSON.stringify(redacted.data || {}),
        args: JSON.stringify(redacted.args)
      });
    } catch (error) {
      console.error('DatabaseTransport error:', error);
      // Don't throw - let other transports continue
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    // Ensure all pending writes are committed
    await this.database.flush();
  }
}

// Usage
const dbTransport = new DatabaseTransport(myDatabase);
logger.addTransport(dbTransport);
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

### Transport Best Practices

1. **Error Handling**: Never throw errors from `log()` method
2. **Async Safety**: Use Promise.resolve() for sync operations
3. **Redaction**: Apply appropriate redaction for your destination
4. **Formatting**: Use provided formatters or implement custom logic
5. **Flushing**: Implement `flush()` for graceful shutdown

```typescript
class ExampleTransport implements Transport {
  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      // Apply redaction
      const redacted = getRedactedEntry(entry, options?.redaction, 'file');
      
      // Format using provided formatter or default
      let formatted: string;
      if (options?.pluggableFormatter) {
        formatted = options.pluggableFormatter.format(redacted);
      } else if (options?.formatter) {
        formatted = options.formatter(redacted);
      } else {
        formatted = JSON.stringify(redacted);
      }
      
      // Send to destination
      await this.sendToDestination(formatted);
    } catch (error) {
      console.error('Transport error:', error);
      // Don't re-throw - allow other transports to continue
    }
  }

  async flush(): Promise<void> {
    // Implement any necessary cleanup
  }

  private async sendToDestination(message: string): Promise<void> {
    // Implementation specific to your destination
  }
}
```

---

## Performance Considerations

### Async Operations

```typescript
// All transport operations are async for better performance
class HighPerformanceTransport implements Transport {
  private queue: LogEntry[] = [];
  private flushTimer: Timer | null = null;

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Queue entries for batch processing
    this.queue.push(entry);
    
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.processBatch(), 100);
    }
  }

  private async processBatch(): Promise<void> {
    const batch = this.queue.splice(0);
    if (batch.length > 0) {
      await this.sendBatch(batch);
    }
    this.flushTimer = null;
  }
}
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

- **Development**: ConsoleTransport for immediate feedback
- **Testing**: FileTransport to avoid console noise
- **Production**: Multiple transports for redundancy
- **Monitoring**: WebSocketTransport for real-time dashboards
- **Alerting**: DiscordWebhookTransport for critical notifications

### Configuration Tips

```typescript
// Separate concerns with different transport configurations
function setupTransports() {
  // Application logs - detailed file logging
  const appTransport = new FileTransport("./logs/application.log", {
    maxFileSize: 100 * 1024 * 1024,
    maxFiles: 30,
    compress: true,
    dateRotation: true
  });

  // Error logs - separate file + Discord alerts
  const errorTransport = new FileTransport("./logs/errors.log", {
    maxFileSize: 50 * 1024 * 1024,
    maxFiles: 90,  // Keep errors longer
    compress: true
  });

  const discordAlerts = new DiscordWebhookTransport(process.env.DISCORD_WEBHOOK!);

  // Real-time monitoring
  const monitoringTransport = new WebSocketTransport("ws://monitoring.internal/logs");

  logger.setTransports([
    new ConsoleTransport(),
    appTransport,
    errorTransport,
    discordAlerts,
    monitoringTransport
  ]);
}
```

### Error Handling

```typescript
// Implement circuit breaker pattern for unreliable transports
class CircuitBreakerTransport implements Transport {
  private failures = 0;
  private maxFailures = 5;
  private isOpen = false;
  private lastFailureTime = 0;
  private retryTimeoutMs = 60000; // 1 minute

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    if (this.isOpen) {
      if (Date.now() - this.lastFailureTime > this.retryTimeoutMs) {
        this.isOpen = false;
        this.failures = 0;
      } else {
        return; // Circuit open, skip logging
      }
    }

    try {
      await this.actualTransport.log(entry, options);
      this.failures = 0; // Reset on success
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.maxFailures) {
        this.isOpen = true;
        console.warn('Circuit breaker opened for transport');
      }
      
      throw error;
    }
  }
}
```

### Graceful Shutdown

```typescript
// Ensure all transports are flushed before shutdown
async function gracefulShutdown() {
  console.log("Shutting down...");
  
  try {
    await logger.flushAll();
    console.log("All logs flushed successfully");
  } catch (error) {
    console.error("Error flushing logs:", error);
  }
  
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

---

## Troubleshooting

### Common Issues

1. **File Permission Errors**
   ```typescript
   // Ensure log directory exists and is writable
   const transport = new FileTransport("./logs/app.log");
   // Check directory permissions before adding transport
   ```

2. **Discord Rate Limiting**
   ```typescript
   // Use batching to avoid rate limits
   const transport = new DiscordWebhookTransport(url, {
     batchIntervalMs: 5000,  // Increase batch interval
     maxBatchSize: 5         // Reduce batch size
   });
   ```

3. **WebSocket Connection Issues**
   ```typescript
   // Monitor connection state
   const transport = new WebSocketTransport(url, {
     reconnectIntervalMs: 1000,
     maxReconnectIntervalMs: 60000
   });
   ```

### Debug Mode

```typescript
// Enable transport debugging
logger.setOptions({
  level: LogLevel.DEBUG,
  pluggableFormatter: createFormatter("ndjson")
});

// Monitor transport performance
const startTime = Date.now();
logger.info("Test message");
await logger.flushAll();
console.log(`Logging took ${Date.now() - startTime}ms`);
```

---

## More Resources

- [Usage Guide](./usage.md) - General usage patterns
- [API Reference](./api.md) - Complete API documentation
- [Extending JellyLogger](./extending.md) - Custom transport development
- [Migration Guide](./migration.md) - Upgrading from other loggers
