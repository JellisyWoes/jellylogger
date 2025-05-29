# JellyLogger Usage Guide

JellyLogger is a flexible, Bun-optimized logging library for TypeScript and JavaScript. It supports multiple transports (console, file, Discord, WebSocket), redaction, custom formatting, and more.

---

## Installation

```sh
bun add jellylogger
```

---

## Architecture Overview

JellyLogger follows a **transport-based architecture** where log entries flow through configurable destinations:

- **Logger Core**: Processes log levels, formats timestamps, and manages structured data
- **Transports**: Handle where logs are sent (console, files, webhooks, etc.)
- **Redaction**: Automatically removes sensitive data before logging
- **Formatters**: Control how log entries are structured and displayed

---

## Quick Start

```typescript
import { logger } from "jellylogger";

// Basic usage
logger.info("Hello from JellyLogger!");

// Log with structured data
logger.warn("User login failed", { userId: 123, reason: "bad password" });

// Log with error objects
try {
  throw new Error("Something broke");
} catch (err) {
  logger.error("Caught error", err);
}

// Log with multiple arguments
logger.debug("Processing request", { requestId: "abc123" }, "Additional context", { timing: "50ms" });
```

---

## Log Levels

JellyLogger supports 6 log levels in order of severity:

```typescript
import { logger, LogLevel } from "jellylogger";

logger.fatal("Application crashed");  // LogLevel.FATAL (1) - Critical errors
logger.error("Database error");       // LogLevel.ERROR (2) - Errors
logger.warn("Deprecated API used");   // LogLevel.WARN (3) - Warnings  
logger.info("User logged in");        // LogLevel.INFO (4) - General info
logger.debug("Cache hit");            // LogLevel.DEBUG (5) - Debug info
logger.trace("Function entry");       // LogLevel.TRACE (6) - Detailed tracing

// Set minimum log level (only logs at or below this level will be output)
logger.setOptions({ level: LogLevel.DEBUG }); // Shows FATAL through DEBUG
```

---

## Structured Logging

JellyLogger automatically separates structured data from other arguments:

```typescript
// Structured data gets merged into the 'data' field
logger.info("User action", 
  { userId: 123, action: "login" },        // Becomes entry.data
  { timestamp: Date.now() },               // Merged with data
  "Additional context",                    // Stays in args
  new Error("Validation failed")           // Stays in args
);

// Results in LogEntry:
// {
//   message: "User action",
//   data: { userId: 123, action: "login", timestamp: 1234567890 },
//   args: ["Additional context", Error],
//   // ... other fields
// }
```

---

## Customizing Logger Options

```typescript
import { logger, LogLevel } from "jellylogger";

logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,    // "2024-01-15 10:30:45 AM" vs ISO string
  format: "json",                // or "string"
  customConsoleColors: {
    [LogLevel.ERROR]: "#FF0000",
    [LogLevel.WARN]: "#FFA500",
    bold: "#FFFFFF",
  }
});

// Reset to defaults
logger.resetOptions();
```

---

## Transport System

### Adding Individual Transports

```typescript
import { 
  logger, 
  FileTransport, 
  DiscordWebhookTransport, 
  WebSocketTransport 
} from "jellylogger";

// File logging with rotation
logger.addTransport(new FileTransport("./logs/app.log", {
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5,                    // Keep 5 rotated files
  compress: true,                 // Gzip old files
  dateRotation: true              // Rotate daily
}));

// Discord webhook (with batching to avoid rate limits)
logger.addTransport(new DiscordWebhookTransport("https://discord.com/api/webhooks/...", {
  batchIntervalMs: 2000,
  maxBatchSize: 10,
  username: "MyApp Logger"
}));

// WebSocket streaming
logger.addTransport(new WebSocketTransport("ws://localhost:8080/logs", {
  reconnectIntervalMs: 1000,
  maxReconnectIntervalMs: 30000
}));
```

### Transport Management

```typescript
// Replace all transports
logger.setTransports([
  new ConsoleTransport(),
  new FileTransport("./logs/app.log")
]);

// Remove specific transport
const fileTransport = new FileTransport("./logs/temp.log");
logger.addTransport(fileTransport);
logger.removeTransport(fileTransport);

// Clear all transports
logger.clearTransports();
```

---

## Redacting Sensitive Data

### Basic Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ["password", "token", "secret", "apiKey"],
    redactStrings: true,
    stringPatterns: [
      /Bearer\s+[\w-]+/gi,           // Bearer tokens
      /\b\d{4}-\d{4}-\d{4}-\d{4}\b/, // Credit card numbers
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g // Email addresses
    ],
  }
});

logger.info("User data", { 
  username: "alice", 
  password: "hunter2",        // Will be [REDACTED]
  email: "alice@example.com"  // Will be [REDACTED] if stringPatterns enabled
});
```

### Advanced Redaction

```typescript
logger.setOptions({
  redaction: {
    keys: ["*.password", "user.credentials.*", "auth.*"],
    keyPatterns: [/secret/i, /token/i],
    whitelist: ["user.id", "auth.method"],
    replacement: (value, context) => `[REDACTED:${context.path}]`,
    fieldConfigs: {
      "user.email": {
        replacement: "[EMAIL_REDACTED]",
        disabled: false
      },
      "debug.*": {
        disabled: true  // Never redact debug fields
      }
    },
    auditRedaction: true,  // Log when redaction occurs
    redactIn: "file"       // Only redact in file logs, not console
  }
});
```

---

## Custom Formatting

### Using Built-in Formatters

```typescript
import { logger, LogfmtFormatter, NdjsonFormatter } from "jellylogger";

// Logfmt format: ts=2024-01-15T10:30:45.123Z level=info msg="User login" userId=123
logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

// NDJSON format: {"timestamp":"2024-01-15T10:30:45.123Z","level":"info",...}
logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});
```

### Custom Formatter Function

```typescript
logger.setOptions({
  formatter: (entry) => {
    return `[${entry.timestamp}] ${entry.levelName.toUpperCase()}: ${entry.message}`;
  }
});
```

### Transport-Specific Formatting

```typescript
const fileTransport = new FileTransport("./logs/app.log");
const consoleTransport = new ConsoleTransport();

// Different format for file vs console
logger.info("User login", { userId: 123 });
// Console: colored, human-readable
// File: JSON structured
```

---

## Child Loggers

Child loggers inherit parent configuration but can add context:

```typescript
import { logger } from "jellylogger";

// Create child with prefix and context
const requestLogger = logger.child({ 
  messagePrefix: "[REQ-123]",
  context: { requestId: "abc123", userId: 456 }
});

requestLogger.info("Processing request");
// Output: "[REQ-123] Processing request" with context: { requestId: "abc123", userId: 456 }

// Chain child loggers
const dbLogger = requestLogger.child({
  messagePrefix: "[DB]",
  context: { operation: "SELECT" }
});

dbLogger.debug("Query executed");
// Output: "[REQ-123] [DB] Query executed" 
// Context: { requestId: "abc123", userId: 456, operation: "SELECT" }
```

---

## Preset Helpers

Quick setup for common configurations:

```typescript
import { 
  useConsoleAndFile, 
  useConsoleFileAndDiscord,
  useAllTransports,
  addFileLogging,
  logger 
} from "jellylogger";

// Console + File
useConsoleAndFile("./logs/app.log");

// Console + File + Discord
useConsoleFileAndDiscord(
  "./logs/app.log", 
  "https://discord.com/api/webhooks/..."
);

// All transports
useAllTransports(
  "./logs/app.log",
  "https://discord.com/api/webhooks/...",
  "ws://localhost:8080/logs"
);

// Add to existing setup
addFileLogging("./logs/errors.log", {
  maxFileSize: 5 * 1024 * 1024,
  maxFiles: 3
});
```

---

## Real-World Examples

### Web API Server

```typescript
import { logger, FileTransport, LogLevel } from "jellylogger";

// Configure for production
logger.setOptions({
  level: LogLevel.INFO,
  useHumanReadableTime: false,
  format: "json",
  redaction: {
    keys: ["password", "token", "authorization"],
    stringPatterns: [/Bearer\s+[\w-]+/gi]
  }
});

// Add file logging with rotation
logger.addTransport(new FileTransport("./logs/api.log", {
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 10,
  compress: true
}));

// Request middleware
app.use((req, res, next) => {
  const requestLogger = logger.child({
    context: { 
      requestId: crypto.randomUUID(),
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent']
    }
  });
  
  req.logger = requestLogger;
  requestLogger.info("Request started");
  next();
});

// Route handlers
app.post('/api/login', (req, res) => {
  req.logger.info("Login attempt", { 
    username: req.body.username,
    password: req.body.password  // Will be redacted
  });
  
  try {
    // ... authentication logic
    req.logger.info("Login successful", { userId: user.id });
  } catch (error) {
    req.logger.error("Login failed", error);
  }
});
```

### Background Worker

```typescript
import { logger, useConsoleAndFile } from "jellylogger";

useConsoleAndFile("./logs/worker.log");

const workerLogger = logger.child({
  messagePrefix: "[WORKER]",
  context: { workerId: process.pid }
});

async function processJob(job) {
  const jobLogger = workerLogger.child({
    context: { jobId: job.id, jobType: job.type }
  });
  
  jobLogger.info("Job started", { data: job.data });
  
  try {
    await job.execute();
    jobLogger.info("Job completed", { duration: Date.now() - job.startTime });
  } catch (error) {
    jobLogger.error("Job failed", error, { 
      retryCount: job.retryCount,
      willRetry: job.retryCount < 3
    });
  }
}
```

### Development vs Production

```typescript
// config/logger.ts
import { logger, LogLevel, ConsoleTransport, FileTransport } from "jellylogger";

if (process.env.NODE_ENV === 'development') {
  logger.setOptions({
    level: LogLevel.DEBUG,
    useHumanReadableTime: true,
    format: "string",
    transports: [new ConsoleTransport()]
  });
} else {
  logger.setOptions({
    level: LogLevel.INFO,
    useHumanReadableTime: false,
    format: "json",
    transports: [
      new ConsoleTransport(),
      new FileTransport("./logs/app.log", {
        maxFileSize: 50 * 1024 * 1024,
        maxFiles: 7,
        compress: true
      })
    ],
    redaction: {
      keys: ["password", "token", "secret", "apiKey"],
      redactStrings: true,
      stringPatterns: [/Bearer\s+[\w-]+/gi]
    }
  });
}
```

---

## Discord Integration

Use the special `discord: true` flag to send specific logs to Discord:

```typescript
logger.setOptions({
  discordWebhookUrl: "https://discord.com/api/webhooks/..."
});

// Regular log (goes to configured transports only)
logger.info("User logged in", { userId: 123 });

// Discord alert (goes to transports AND Discord)
logger.error("Payment failed", { 
  orderId: "abc123",
  error: "Card declined",
  discord: true  // Special flag triggers Discord webhook
});
```

---

## Bun-Specific Features

JellyLogger is optimized for Bun runtime:

- **Fast File I/O**: Uses `Bun.write()` and `Bun.file()` for optimal performance
- **Native Colors**: Leverages `Bun.color()` for efficient color parsing
- **Compression**: Uses Bun's built-in gzip for log rotation
- **Test Integration**: Works seamlessly with `bun test`
- **Bundle Compatibility**: Optimized for Bun's bundler

```typescript
// Bun-specific file operations happen automatically
const transport = new FileTransport("./logs/app.log");

// Bun's color parsing supports multiple formats
logger.setOptions({
  customConsoleColors: {
    [LogLevel.ERROR]: "#FF0000",      // Hex
    [LogLevel.WARN]: "rgb(255,165,0)", // RGB
    [LogLevel.INFO]: "hsl(120,100%,50%)" // HSL
  }
});
```

---

## Error Handling and Graceful Shutdown

```typescript
// Ensure all logs are written before exit
process.on('SIGINT', async () => {
  logger.info("Shutting down gracefully...");
  await logger.flushAll();
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  logger.fatal("Uncaught exception", error, { discord: true });
  await logger.flushAll();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  logger.error("Unhandled promise rejection", reason, { discord: true });
  await logger.flushAll();
});
```

---

## Performance Considerations

- **Circular References**: Automatically detected and handled
- **Large Objects**: Deep objects are safely serialized with depth limits
- **Async Transports**: Don't block main thread (Discord, WebSocket)
- **Batching**: Discord transport batches messages to avoid rate limits
- **Log Levels**: Set appropriate levels to reduce overhead in production

---

## Troubleshooting

### Common Issues

```typescript
// Issue: Logs not appearing
logger.setOptions({ level: LogLevel.DEBUG }); // Check log level

// Issue: Circular reference errors
// JellyLogger handles these automatically, no action needed

// Issue: Discord webhook failing
logger.addTransport(new DiscordWebhookTransport("webhook-url", {
  suppressConsoleErrors: false  // See error details
}));

// Issue: File permissions
// Ensure directory exists and is writable
const transport = new FileTransport("./logs/app.log");
```

### Debug Mode

```typescript
// Enable detailed redaction auditing
logger.setOptions({
  redaction: {
    auditRedaction: true,
    auditHook: (event) => {
      console.debug(`Redaction: ${event.type} at ${event.context.path}`);
    }
  }
});
```

---

## Migration from Other Loggers

### From Winston

```typescript
// Winston
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'app.log' })
  ]
});

// JellyLogger equivalent
import { logger, FileTransport, LogLevel } from "jellylogger";
logger.setOptions({
  level: LogLevel.INFO,
  format: "json",
  transports: [new FileTransport("app.log")]
});
```

### From Pino

```typescript
// Pino
const pino = require('pino');
const logger = pino({ level: 'info' });

// JellyLogger equivalent
import { logger, LogLevel } from "jellylogger";
logger.setOptions({ 
  level: LogLevel.INFO,
  format: "json" 
});
```

---

## Best Practices

1. **Set Appropriate Log Levels**: Use DEBUG/TRACE only in development
2. **Use Structured Data**: Prefer objects over string concatenation
3. **Leverage Child Loggers**: Add context without repetition  
4. **Configure Redaction**: Protect sensitive data from logs
5. **Handle Graceful Shutdown**: Always call `flushAll()` before exit
6. **Monitor Performance**: Check log volume and transport performance
7. **Use TypeScript**: Get full type safety and autocompletion

---

## More Resources

- [API Reference](./api.md) - Complete API documentation
- [Redaction Guide](./redaction.md) - Advanced redaction patterns
- [Transports](./transports.md) - Transport configuration details
- [Examples](./examples.md) - Real-world usage examples

---
