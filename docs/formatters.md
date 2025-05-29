# JellyLogger Formatters Guide

Formatters in JellyLogger control how log entries are structured and displayed. They transform log entries into human-readable or machine-parseable formats for different transports and use cases.

---

## Overview

JellyLogger supports multiple formatter types:

- **Built-in Formatters**: String and JSON formats with intelligent fallbacks
- **Pluggable Formatters**: LogfmtFormatter and NdjsonFormatter classes
- **Custom Function Formatters**: User-defined functions for specific needs
- **Transport-Specific Formatting**: Different formats per transport

All formatters receive a `LogEntry` object and return a formatted string.

---

## Built-in Formatting

### String Format (Default)

The default string format provides human-readable output optimized for console viewing:

```typescript
import { logger } from "jellylogger";

// Default string format
logger.info("User logged in", { userId: 123, sessionId: "abc" });
// Output: [2024-01-15T10:30:45.123Z] INFO : User logged in {"userId":123,"sessionId":"abc"}

// With human-readable time
logger.setOptions({ useHumanReadableTime: true });
logger.info("User logged in", { userId: 123 });
// Output: [2024-01-15 10:30:45 AM] INFO : User logged in {"userId":123}
```

### JSON Format

JSON format provides structured output ideal for log aggregation and parsing:

```typescript
logger.setOptions({ format: "json" });
logger.info("User logged in", { userId: 123 });
// Output: {"timestamp":"2024-01-15T10:30:45.123Z","level":4,"levelName":"INFO","message":"User logged in","data":{"userId":123},"args":[]}

// With additional arguments
logger.warn("API timeout", { endpoint: "/users" }, "Retrying...", { attempt: 2 });
// Output: {"timestamp":"2024-01-15T10:30:45.123Z","level":3,"levelName":"WARN","message":"API timeout","data":{"endpoint":"/users"},"args":["Retrying...",{"attempt":2}]}
```

---

## Pluggable Formatters

### LogfmtFormatter

Logfmt is a structured format that's both human and machine readable:

```typescript
import { logger, LogfmtFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

logger.info("Request completed", { 
  method: "GET", 
  path: "/api/users", 
  status: 200, 
  duration: "45ms" 
});
// Output: ts=2024-01-15T10:30:45.123Z level=info msg="Request completed" method=GET path="/api/users" status=200 duration=45ms

// With arguments
logger.error("Database error", { table: "users", operation: "SELECT" }, "Connection timeout");
// Output: ts=2024-01-15T10:30:45.123Z level=error msg="Database error" table=users operation=SELECT arg0="Connection timeout"
```

### NdjsonFormatter

NDJSON (Newline Delimited JSON) is ideal for streaming and log processing:

```typescript
import { logger, NdjsonFormatter } from "jellylogger";

logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});

logger.info("User action", { userId: 123, action: "login" });
// Output: {"timestamp":"2024-01-15T10:30:45.123Z","level":"info","message":"User action","userId":123,"action":"login"}

logger.debug("Cache operation", { key: "user:123", hit: true }, "Retrieved from Redis");
// Output: {"timestamp":"2024-01-15T10:30:45.123Z","level":"debug","message":"Cache operation","key":"user:123","hit":true,"args":["Retrieved from Redis"]}
```

---

## Custom Function Formatters

### Basic Custom Formatter

Create custom formatters for specific output requirements:

```typescript
import { logger, LogLevel } from "jellylogger";

// Simple custom formatter
logger.setOptions({
  formatter: (entry) => {
    const level = LogLevel[entry.level].padEnd(5);
    return `${entry.timestamp} [${level}] ${entry.message}`;
  }
});

logger.info("Custom format test");
// Output: 2024-01-15T10:30:45.123Z [INFO ] Custom format test
```

### Advanced Custom Formatter

```typescript
// Advanced formatter with data and args handling
logger.setOptions({
  formatter: (entry) => {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.levelName}]`,
      entry.message
    ];

    // Add structured data
    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.push(`data=${JSON.stringify(entry.data)}`);
    }

    // Add arguments
    if (entry.args.length > 0) {
      const argsStr = entry.args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      parts.push(`args=[${argsStr}]`);
    }

    return parts.join(' ');
  }
});

logger.warn("Payment warning", { orderId: "12345", amount: 99.99 }, "Low balance");
// Output: [2024-01-15T10:30:45.123Z] [WARN] Payment warning data={"orderId":"12345","amount":99.99} args=[Low balance]
```

### Environment-Specific Formatting

```typescript
// Different formats for different environments
const isDevelopment = process.env.NODE_ENV === 'development';

logger.setOptions({
  formatter: (entry) => {
    if (isDevelopment) {
      // Colorful, detailed format for development
      const colors = {
        ERROR: '\x1b[31m',
        WARN: '\x1b[33m',
        INFO: '\x1b[32m',
        DEBUG: '\x1b[34m',
        RESET: '\x1b[0m'
      };
      
      const color = colors[entry.levelName as keyof typeof colors] || colors.RESET;
      return `${color}[${entry.levelName}]${colors.RESET} ${entry.message} ${JSON.stringify(entry.data || {})}`;
    } else {
      // Compact JSON for production
      return JSON.stringify({
        time: entry.timestamp,
        level: entry.level,
        msg: entry.message,
        ...entry.data
      });
    }
  }
});
```

---

## Creating Custom Formatter Classes

### Implementing LogFormatter Interface

```typescript
import type { LogEntry, LogFormatter } from "jellylogger";

class CustomFormatter implements LogFormatter {
  private includeLevel: boolean;
  private includeTimestamp: boolean;

  constructor(options?: { includeLevel?: boolean; includeTimestamp?: boolean }) {
    this.includeLevel = options?.includeLevel ?? true;
    this.includeTimestamp = options?.includeTimestamp ?? true;
  }

  format(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.includeTimestamp) {
      parts.push(`[${entry.timestamp}]`);
    }

    if (this.includeLevel) {
      parts.push(`[${entry.levelName}]`);
    }

    parts.push(entry.message);

    // Merge data and args into a single object
    const combined = {
      ...(entry.data || {}),
      ...(entry.args.length > 0 ? { _args: entry.args } : {})
    };

    if (Object.keys(combined).length > 0) {
      parts.push(JSON.stringify(combined));
    }

    return parts.join(' ');
  }
}

// Usage
logger.setOptions({
  pluggableFormatter: new CustomFormatter({
    includeLevel: true,
    includeTimestamp: false
  })
});
```

### Specialized Formatters

```typescript
// Formatter for specific log analysis tools
class SplunkFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const splunkEntry = {
      timestamp: new Date(entry.timestamp).getTime() / 1000, // Unix timestamp
      level: entry.levelName.toLowerCase(),
      message: entry.message,
      source: 'jellylogger',
      sourcetype: 'json',
      ...entry.data
    };

    return JSON.stringify(splunkEntry);
  }
}

// Formatter for structured logging with correlation IDs
class CorrelationFormatter implements LogFormatter {
  private correlationId: string;

  constructor(correlationId: string = crypto.randomUUID()) {
    this.correlationId = correlationId;
  }

  format(entry: LogEntry): string {
    return JSON.stringify({
      '@timestamp': entry.timestamp,
      '@level': entry.levelName.toLowerCase(),
      '@message': entry.message,
      '@correlation_id': this.correlationId,
      '@service': 'my-app',
      ...entry.data,
      ...(entry.args.length > 0 ? { '@args': entry.args } : {})
    });
  }
}
```

---

## Transport-Specific Formatting

### Different Formats Per Transport

```typescript
import { logger, FileTransport, ConsoleTransport } from "jellylogger";

// Console: Human-readable format
const consoleTransport = new ConsoleTransport();

// File: JSON format for processing
const fileTransport = new FileTransport("./logs/app.log");

logger.setTransports([consoleTransport, fileTransport]);

// Use different formatters per transport by configuring globally
// Console will use default string format, file will use JSON when configured
logger.setOptions({ format: "json" }); // Affects all transports

// For more granular control, use custom logic in formatter
logger.setOptions({
  formatter: (entry) => {
    // This formatter is called by all transports
    // Transport-specific logic can be implemented here
    return JSON.stringify(entry); // All transports get JSON
  }
});
```

### Conditional Formatting

```typescript
// Format based on log level
logger.setOptions({
  formatter: (entry) => {
    if (entry.level <= LogLevel.ERROR) {
      // Detailed format for errors
      return JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.levelName,
        message: entry.message,
        data: entry.data,
        args: entry.args,
        stack: entry.args.find(arg => arg instanceof Error)?.stack
      });
    } else {
      // Simple format for other levels
      return `[${entry.levelName}] ${entry.message} ${JSON.stringify(entry.data || {})}`;
    }
  }
});
```

---

## Formatting Best Practices

### Performance Considerations

```typescript
// Efficient formatter with minimal string operations
logger.setOptions({
  formatter: (entry) => {
    // Pre-allocate array size if possible
    const parts = new Array(4);
    let index = 0;
    
    parts[index++] = entry.timestamp;
    parts[index++] = entry.levelName;
    parts[index++] = entry.message;
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      parts[index++] = JSON.stringify(entry.data);
    }
    
    // Trim unused slots and join
    return parts.slice(0, index).join(' ');
  }
});
```

### Error Handling

```typescript
// Robust formatter with error handling
logger.setOptions({
  formatter: (entry) => {
    try {
      // Primary formatting logic
      return JSON.stringify({
        timestamp: entry.timestamp,
        level: entry.levelName,
        message: entry.message,
        ...entry.data
      });
    } catch (error) {
      // Fallback formatting if JSON.stringify fails
      console.warn('Formatter error:', error);
      return `[${entry.timestamp}] [${entry.levelName}] ${entry.message} [FORMATTER_ERROR]`;
    }
  }
});
```

### Circular Reference Handling

```typescript
// Safe formatter that handles circular references
function createSafeFormatter() {
  return (entry: LogEntry) => {
    const safeEntry = {
      timestamp: entry.timestamp,
      level: entry.levelName,
      message: entry.message,
      data: entry.data,
      args: entry.args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          try {
            JSON.stringify(arg);
            return arg;
          } catch {
            return '[Circular Reference]';
          }
        }
        return arg;
      })
    };

    try {
      return JSON.stringify(safeEntry);
    } catch {
      return `[${entry.timestamp}] [${entry.levelName}] ${entry.message} [SERIALIZATION_ERROR]`;
    }
  };
}

logger.setOptions({
  formatter: createSafeFormatter()
});
```

---

## Real-World Examples

### API Request Logging

```typescript
// Formatter optimized for API request logging
class APIRequestFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const isRequestLog = entry.data?.requestId || entry.data?.method;
    
    if (isRequestLog) {
      return [
        entry.timestamp,
        entry.levelName.padEnd(5),
        `[${entry.data.method || '???'}]`,
        `[${entry.data.statusCode || '---'}]`,
        entry.data.path || entry.message,
        `${entry.data.duration || '?'}ms`,
        entry.data.userAgent ? `"${entry.data.userAgent}"` : '',
      ].filter(Boolean).join(' ');
    }

    // Fallback to standard format
    return `[${entry.timestamp}] [${entry.levelName}] ${entry.message}`;
  }
}

// Usage with request middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    logger.info('Request completed', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - start,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
});
```

### Error Tracking

```typescript
// Formatter for error tracking services
class ErrorTrackingFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const errorArg = entry.args.find(arg => arg instanceof Error);
    
    if (errorArg && entry.level <= LogLevel.ERROR) {
      return JSON.stringify({
        '@timestamp': entry.timestamp,
        '@level': 'error',
        '@message': entry.message,
        '@error': {
          name: errorArg.name,
          message: errorArg.message,
          stack: errorArg.stack
        },
        '@context': entry.data || {},
        '@fingerprint': this.generateFingerprint(errorArg)
      });
    }

    return JSON.stringify({
      '@timestamp': entry.timestamp,
      '@level': entry.levelName.toLowerCase(),
      '@message': entry.message,
      '@context': entry.data || {}
    });
  }

  private generateFingerprint(error: Error): string {
    const stackLine = error.stack?.split('\n')[1] || '';
    return btoa(`${error.name}:${stackLine}`).slice(0, 16);
  }
}
```

### Development vs Production

```typescript
// Environment-aware formatter factory
function createEnvironmentFormatter() {
  const isDev = process.env.NODE_ENV === 'development';
  const isProd = process.env.NODE_ENV === 'production';

  if (isDev) {
    // Development: Colorful, detailed
    return (entry: LogEntry) => {
      const colors = {
        FATAL: '\x1b[95m',
        ERROR: '\x1b[91m',
        WARN: '\x1b[93m',
        INFO: '\x1b[92m',
        DEBUG: '\x1b[94m',
        TRACE: '\x1b[90m',
        RESET: '\x1b[0m'
      };

      const color = colors[entry.levelName as keyof typeof colors] || '';
      const reset = colors.RESET;
      
      return `${color}● ${entry.levelName}${reset} ${entry.message} ${JSON.stringify(entry.data || {}, null, 2)}`;
    };
  } else if (isProd) {
    // Production: Compact JSON
    return (entry: LogEntry) => JSON.stringify({
      t: entry.timestamp,
      l: entry.level,
      m: entry.message,
      ...entry.data
    });
  } else {
    // Default: Standard JSON
    return (entry: LogEntry) => JSON.stringify(entry);
  }
}

logger.setOptions({
  formatter: createEnvironmentFormatter()
});
```

---

## Integration Examples

### With Log Aggregation Services

```typescript
// Elasticsearch-compatible formatter
class ElasticsearchFormatter implements LogFormatter {
  private indexPrefix: string;

  constructor(indexPrefix: string = 'app-logs') {
    this.indexPrefix = indexPrefix;
  }

  format(entry: LogEntry): string {
    const date = new Date(entry.timestamp);
    const index = `${this.indexPrefix}-${date.toISOString().slice(0, 10)}`;
    
    const doc = {
      '@timestamp': entry.timestamp,
      level: entry.levelName.toLowerCase(),
      message: entry.message,
      service: 'my-app',
      environment: process.env.NODE_ENV || 'unknown',
      ...entry.data
    };

    // Return index action followed by document
    return JSON.stringify({ index: { _index: index } }) + '\n' + JSON.stringify(doc);
  }
}

// With file transport for bulk upload
logger.addTransport(new FileTransport('./logs/elasticsearch.ndjson'));
logger.setOptions({
  pluggableFormatter: new ElasticsearchFormatter('myapp-logs')
});
```

### With Monitoring Systems

```typescript
// Prometheus-compatible metrics formatter
class MetricsFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    if (entry.data?.metric) {
      // Format as Prometheus metric
      const labels = Object.entries(entry.data)
        .filter(([key]) => key !== 'metric' && key !== 'value')
        .map(([key, value]) => `${key}="${value}"`)
        .join(',');
      
      return `${entry.data.metric}{${labels}} ${entry.data.value || 1} ${Date.now()}`;
    }

    // Regular log format
    return `[${entry.timestamp}] ${entry.message}`;
  }
}

// Usage for metrics
logger.info('HTTP request', {
  metric: 'http_requests_total',
  method: 'GET',
  status: '200',
  value: 1
});
// Output: http_requests_total{method="GET",status="200"} 1 1705320645123
```

---

## Testing Formatters

### Unit Testing Custom Formatters

```typescript
// formatter.test.ts
import { describe, test, expect } from 'bun:test';
import type { LogEntry } from 'jellylogger';

class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return `${entry.levelName}: ${entry.message}`;
  }
}

describe('CustomFormatter', () => {
  test('formats entry correctly', () => {
    const formatter = new CustomFormatter();
    const entry: LogEntry = {
      timestamp: '2024-01-15T10:30:45.123Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Test message',
      args: [],
      data: { test: true }
    };

    const result = formatter.format(entry);
    expect(result).toBe('INFO: Test message');
  });

  test('handles missing data gracefully', () => {
    const formatter = new CustomFormatter();
    const entry: LogEntry = {
      timestamp: '2024-01-15T10:30:45.123Z',
      level: LogLevel.ERROR,
      levelName: 'ERROR',
      message: 'Error occurred',
      args: []
    };

    const result = formatter.format(entry);
    expect(result).toBe('ERROR: Error occurred');
  });
});
```

### Testing with Transports

```typescript
// integration.test.ts
import { describe, test, expect } from 'bun:test';
import { logger, FileTransport } from 'jellylogger';
import { readFileSync, unlinkSync } from 'fs';

describe('Formatter Integration', () => {
  test('custom formatter works with file transport', async () => {
    const testFile = './test-output.log';
    
    logger.setOptions({
      formatter: (entry) => `CUSTOM: ${entry.message}`,
      transports: [new FileTransport(testFile)]
    });

    logger.info('Test message');
    await logger.flushAll();

    const content = readFileSync(testFile, 'utf8');
    expect(content.trim()).toBe('CUSTOM: Test message');

    // Cleanup
    unlinkSync(testFile);
  });
});
```

---

## Migration Guide

### From Winston Formatters

```typescript
// Winston
const winston = require('winston');
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level}]: ${message} ${JSON.stringify(meta)}`;
    })
  )
});

// JellyLogger equivalent
import { logger } from "jellylogger";
logger.setOptions({
  formatter: (entry) => {
    return `${entry.timestamp} [${entry.levelName}]: ${entry.message} ${JSON.stringify(entry.data || {})}`;
  }
});
```

### From Pino Formatters

```typescript
// Pino
const pino = require('pino')({
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({ service: 'my-app' })
  }
});

// JellyLogger equivalent
import { logger } from "jellylogger";
logger.setOptions({
  formatter: (entry) => JSON.stringify({
    level: entry.levelName.toLowerCase(),
    service: 'my-app',
    time: entry.timestamp,
    msg: entry.message,
    ...entry.data
  })
});
```

---

## Troubleshooting

### Common Formatter Issues

```typescript
// Issue: Circular references in data
logger.setOptions({
  formatter: (entry) => {
    try {
      return JSON.stringify(entry);
    } catch (error) {
      console.warn('Formatter serialization error:', error);
      return `[${entry.timestamp}] [${entry.levelName}] ${entry.message} [CIRCULAR_REF]`;
    }
  }
});

// Issue: Large objects causing performance problems
logger.setOptions({
  formatter: (entry) => {
    const dataStr = entry.data 
      ? JSON.stringify(entry.data).slice(0, 1000) // Truncate large data
      : '';
    return `[${entry.levelName}] ${entry.message} ${dataStr}`;
  }
});

// Issue: Formatter throwing errors
const safeFormatter = (entry: LogEntry) => {
  try {
    // Your formatter logic here
    return customFormat(entry);
  } catch (error) {
    // Fallback to basic format
    return `[${entry.timestamp}] [${entry.levelName}] ${entry.message}`;
  }
};
```

---

## Best Practices Summary

1. **Keep formatters simple and fast** - They run on every log entry
2. **Handle errors gracefully** - Always provide fallback formatting
3. **Test formatter performance** - Profile with high log volumes
4. **Use appropriate format for destination** - JSON for files, human-readable for console
5. **Consider log aggregation requirements** - Format for your logging infrastructure
6. **Implement proper circular reference handling** - Prevent serialization errors
7. **Use TypeScript** - Get type safety for LogEntry properties

---

## More Resources

- [Usage Guide](./usage.md) - Complete usage documentation
- [Transports](./transports.md) - Transport configuration details
- [API Reference](./api.md) - API documentation
- [Examples](./examples.md) - Real-world usage examples

---
