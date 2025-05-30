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

## Table of Contents

- [JellyLogger](#jellylogger)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Key Features](#key-features)
    - [🚀 **Bun-Optimized Performance**](#-bun-optimized-performance)
    - [📝 **Multiple Transports**](#-multiple-transports)
    - [🔒 **Smart Redaction**](#-smart-redaction)
    - [🎨 **Flexible Formatting**](#-flexible-formatting)
    - [👶 **Child Loggers**](#-child-loggers)
  - [Core Concepts](#core-concepts)
    - [Transports](#transports)
      - [File Logging with Rotation](#file-logging-with-rotation)
      - [Discord Alerts](#discord-alerts)
      - [Real-time Streaming](#real-time-streaming)
    - [Child Loggers](#child-loggers)
    - [Data Protection](#data-protection)
  - [Configuration Examples](#configuration-examples)
    - [Development Setup](#development-setup)
    - [Production Setup](#production-setup)
    - [TypeScript Support](#typescript-support)
  - [Real-World Usage](#real-world-usage)
  - [Documentation](#documentation)
  - [Development](#development)
    - [Local Development with `bun link`](#local-development-with-bun-link)
    - [Why JellyLogger?](#why-jellylogger)
  - [Contributing](#contributing)
  - [License](#license)

## Installation

```bash
# Install with Bun (recommended)
bun add jellylogger

# Also works with npm/yarn in Bun projects
npm install jellylogger
```

**Requirements:**
- Bun runtime (v1.0.0+)
- TypeScript/JavaScript project

## Quick Start

```typescript
import { logger } from "jellylogger";

logger.info("Hello from JellyLogger!");

// Structured log with extra data
logger.warn("API timeout", { endpoint: "/users", duration: "5.2s" });

// Error logging
try {
  throw new Error("Something went wrong");
} catch (error) {
  logger.error("Database connection failed", error);
}
```

## Key Features

### 🚀 **Bun-Optimized Performance**
- Built specifically for Bun runtime with native APIs
- Fast file I/O with `Bun.write()` and `Bun.file()`
- Efficient color parsing with `Bun.color()`

### 📝 **Multiple Transports**
- **Console** - Colorized console output
- **File** - Log rotation with compression
- **Discord** - Webhook alerts with batching
- **WebSocket** - Real-time log streaming

### 🔒 **Smart Redaction**
- Automatic sensitive data protection
- Pattern-based string redaction
- Field-specific configurations
- Custom redaction logic

### 🎨 **Flexible Formatting**
- Built-in JSON and string formats
- Logfmt and NDJSON formatters
- Custom formatter functions
- Transport-specific formatting

### 👶 **Child Loggers**
- Inherit parent configuration
- Add contextual prefixes
- Merge structured data automatically

## Core Concepts

### Transports

#### File Logging with Rotation
```typescript
import { FileTransport } from "jellylogger";

logger.addTransport(new FileTransport("./logs/app.log", {
  maxFileSize: 10 * 1024 * 1024,  // 10MB
  maxFiles: 5,
  compress: true,
  dateRotation: true
}));
```

#### Discord Alerts
```typescript
import { DiscordWebhookTransport } from "jellylogger";

logger.addTransport(new DiscordWebhookTransport(
  "https://discord.com/api/webhooks/...",
  { username: "MyApp Alerts" }
));

// Send critical alerts to Discord
logger.error("Payment processor down", { 
  service: "stripe",
  discord: true  // Special flag for Discord
});
```

#### Real-time Streaming
```typescript
import { WebSocketTransport } from "jellylogger";

logger.addTransport(new WebSocketTransport(
  "ws://monitoring.example.com/logs"
));
```

### Child Loggers

Create context-aware loggers that inherit parent configuration:

```typescript
// Create request-scoped logger
const requestLogger = logger.child({
  messagePrefix: "[REQ-123]",
  context: { requestId: "abc123", userId: 456 }
});

requestLogger.info("Processing payment");
// Output: "[REQ-123] Processing payment" + context data

// Chain child loggers
const dbLogger = requestLogger.child({
  messagePrefix: "[DB]",
  context: { operation: "SELECT" }
});

dbLogger.debug("Query executed");
// Output: "[REQ-123] [DB] Query executed" + merged context
```

### Data Protection

JellyLogger automatically redacts sensitive information:

```typescript
logger.setOptions({
  redaction: {
    keys: ["password", "*.token", "user.credentials.*"],
    stringPatterns: [
      /Bearer\s+[\w-]+/gi,           // Bearer tokens
      /\b\d{4}-\d{4}-\d{4}-\d{4}\b/, // Credit cards
    ]
  }
});

logger.info("User login", { 
  username: "alice",
  password: "secret123",        // → [REDACTED]
  token: "Bearer abc123"        // → [REDACTED]
});
```

## Configuration Examples

### Development Setup
```typescript
import { logger, LogLevel } from "jellylogger";

logger.setOptions({
  level: LogLevel.DEBUG,
  useHumanReadableTime: true,
  format: "string"
});
```

### Production Setup
```typescript
import { useConsoleFileAndDiscord } from "jellylogger";

useConsoleFileAndDiscord(
  "./logs/app.log",
  process.env.DISCORD_WEBHOOK_URL!
);

logger.setOptions({
  level: LogLevel.INFO,
  redaction: {
    keys: ["password", "token", "apiKey"],
    stringPatterns: [/Bearer\s+[\w-]+/gi]
  }
});
```

### TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type { 
  LogLevel, 
  Transport, 
  LogEntry, 
  RedactionConfig 
} from "jellylogger";

// Create custom transports with full type safety
class CustomTransport implements Transport {
  async log(entry: LogEntry): Promise<void> {
    // Your implementation
  }
}
```

## Real-World Usage

Express.js application with comprehensive logging:

```typescript
import { logger, FileTransport, LogLevel } from "jellylogger";

// Configure for production
logger.setOptions({
  level: LogLevel.INFO,
  format: "json",
  redaction: {
    keys: ["password", "token", "authorization"]
  }
});

logger.addTransport(new FileTransport("./logs/api.log", {
  maxFileSize: 50 * 1024 * 1024,
  maxFiles: 7,
  compress: true
}));

// Express middleware example
app.use((req, res, next) => {
  const requestLogger = logger.child({
    context: { 
      requestId: crypto.randomUUID(),
      method: req.method,
      url: req.url 
    }
  });
  
  req.logger = requestLogger;
  requestLogger.info("Request started");
  
  res.on('finish', () => {
    requestLogger.info("Request completed", { 
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime 
    });
  });
  
  next();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info("Shutting down gracefully...");
  await logger.flushAll();
  process.exit(0);
});
```

## Documentation

For comprehensive guides and examples:

- **[📖 Usage Guide](./docs/usage.md)** - Complete feature walkthrough
- **[🚂 Transports Guide](./docs/transports.md)** - Transport configuration and examples  
- **[🎨 Formatters Guide](./docs/formatters.md)** - Custom formatting and output styles
- **[🔧 Extending JellyLogger](./docs/extending.md)** - Create custom transports and formatters
- **[📚 API Reference](./docs/api.md)** - Complete API documentation

## Development

### Local Development with `bun link`

For local development and testing:

1. In the `jellylogger` directory:
    ```bash
    bun run build
    bun link
    ```

2. In your test project:
    ```bash
    bun link jellylogger
    ```

3. After making changes to `jellylogger`, rebuild and your linked projects will use the updated version:
    ```bash
    bun run build
    ```

4. To unlink when done:
    ```bash
    # In your test project
    bun unlink jellylogger
    
    # In the jellylogger directory  
    bun unlink
    ```

5. Remember to run tests before publishing:
    ```bash
    bun test
    bun run build
    ```

### Why JellyLogger?

- **🎯 Purpose-Built**: Designed specifically for Bun's performance characteristics
- **🛡️ Production-Ready**: Comprehensive error handling and graceful degradation
- **📈 Scalable**: Efficient batching, rotation, and memory management
- **🔧 Extensible**: Plugin system for custom transports and formatters
- **🔒 Secure**: Built-in redaction with audit trails
- **📱 Modern**: TypeScript-first with excellent developer experience

## Contributing

We welcome contributions! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure TypeScript compilation passes
5. Update documentation as needed
6. Submit a pull request

Please see our [Contributing Guide](./CONTRIBUTING.md) for more details.

## License

MIT License - see [LICENSE](./LICENSE) file for details.
