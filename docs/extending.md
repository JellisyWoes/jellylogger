# Extending JellyLogger

JellyLogger is designed to be extensible through custom transports and formatters. This guide shows you how to create your own implementations to extend the logger's functionality.

## Table of Contents

- [Extending JellyLogger](#extending-jellylogger)
  - [Table of Contents](#table-of-contents)
  - [Custom Transports](#custom-transports)
    - [Transport Interface](#transport-interface)
    - [Basic Custom Transport](#basic-custom-transport)
  - [Transport Examples](#transport-examples)
    - [Database Transport](#database-transport)
    - [HTTP Transport](#http-transport)
    - [Email Transport](#email-transport)
  - [Custom Formatters](#custom-formatters)
    - [Advanced Formatter Example](#advanced-formatter-example)
  - [Advanced Transport Features](#advanced-transport-features)
    - [Rate Limiting](#rate-limiting)
    - [Circuit Breaker](#circuit-breaker)
  - [Testing Custom Extensions](#testing-custom-extensions)
    - [Testing Transports](#testing-transports)
    - [Testing Formatters](#testing-formatters)
  - [Best Practices](#best-practices)
    - [Error Handling](#error-handling)
    - [Resource Management](#resource-management)
    - [Configuration Validation](#configuration-validation)

## Custom Transports

Transports are responsible for writing log entries to their destination (console, file, database, external service, etc.). All transports must implement the `Transport` interface.

### Transport Interface

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

### Basic Custom Transport

```typescript
import { Transport, LogEntry, LoggerOptions } from 'jellylogger';

class CustomTransport implements Transport {
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Your custom logging logic here
    console.log(`CUSTOM: ${entry.message}`);
  }

  async flush(options?: LoggerOptions): Promise<void> {
    // Optional: flush any pending operations
  }
}

// Use the custom transport
import { logger } from 'jellylogger';

logger.setOptions({
  transports: [new CustomTransport()]
});
```

## Transport Examples

### Database Transport

```typescript
import { Transport, LogEntry, LoggerOptions } from 'jellylogger';

interface DatabaseConfig {
  connectionString: string;
  tableName?: string;
  batchSize?: number;
  flushInterval?: number;
}

class DatabaseTransport implements Transport {
  private config: DatabaseConfig;
  private queue: LogEntry[] = [];
  private timer: Timer | null = null;

  constructor(config: DatabaseConfig) {
    this.config = {
      tableName: 'logs',
      batchSize: 100,
      flushInterval: 5000,
      ...config
    };
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    this.queue.push(entry);
    
    // Auto-flush when batch size is reached
    if (this.queue.length >= this.config.batchSize!) {
      await this.flush();
    }
    
    // Set up timer for periodic flush
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.flushInterval);
    }
  }

  async flush(options?: LoggerOptions): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0); // Take all queued entries
    
    try {
      await this.insertLogs(batch);
    } catch (error) {
      console.error('Failed to write logs to database:', error);
      // Re-queue failed logs (implement retry logic as needed)
      this.queue.unshift(...batch);
    }
  }

  private async insertLogs(entries: LogEntry[]): Promise<void> {
    // Example database insertion (adapt to your database)
    const values = entries.map(entry => ({
      timestamp: entry.timestamp,
      level: entry.levelName,
      message: entry.message,
      data: JSON.stringify(entry.data || {}),
      args: JSON.stringify(entry.args)
    }));

    // Your database insertion logic here
    console.log(`Would insert ${values.length} log entries to database`);
  }
}
```

### HTTP Transport

```typescript
import { Transport, LogEntry, LoggerOptions } from 'jellylogger';

interface HttpTransportConfig {
  url: string;
  headers?: Record<string, string>;
  batchSize?: number;
  timeout?: number;
  retries?: number;
}

class HttpTransport implements Transport {
  private config: HttpTransportConfig;
  private queue: LogEntry[] = [];
  private isProcessing = false;

  constructor(config: HttpTransportConfig) {
    this.config = {
      batchSize: 10,
      timeout: 5000,
      retries: 3,
      ...config
    };
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    this.queue.push(entry);
    
    if (this.queue.length >= this.config.batchSize! && !this.isProcessing) {
      await this.processBatch();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length > 0) {
      await this.processBatch();
    }
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    const batch = this.queue.splice(0, this.config.batchSize);
    
    try {
      await this.sendBatch(batch);
    } catch (error) {
      console.error('Failed to send log batch via HTTP:', error);
      // Re-queue failed logs
      this.queue.unshift(...batch);
    } finally {
      this.isProcessing = false;
    }
  }

  private async sendBatch(entries: LogEntry[]): Promise<void> {
    const payload = {
      logs: entries,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }
}
```

### Email Transport

```typescript
import { Transport, LogEntry, LoggerOptions, LogLevel } from 'jellylogger';

interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure?: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };
  from: string;
  to: string[];
  subject?: string;
  minLevel?: LogLevel;
}

class EmailTransport implements Transport {
  private config: EmailConfig;
  private queue: LogEntry[] = [];
  private timer: Timer | null = null;

  constructor(config: EmailConfig) {
    this.config = {
      subject: 'Application Log Alert',
      minLevel: LogLevel.ERROR,
      ...config
    };
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Only email for severe log levels
    if (entry.level > (this.config.minLevel ?? LogLevel.ERROR)) {
      return;
    }

    this.queue.push(entry);
    
    // Debounce emails to avoid spam
    if (this.timer) {
      clearTimeout(this.timer);
    }
    
    this.timer = setTimeout(() => this.sendEmail(), 5000);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.queue.length > 0) {
      await this.sendEmail();
    }
  }

  private async sendEmail(): Promise<void> {
    if (this.queue.length === 0) return;
    
    const entries = this.queue.splice(0);
    const subject = `${this.config.subject} - ${entries.length} log entries`;
    
    const body = entries.map(entry => 
      `[${entry.timestamp}] ${entry.levelName}: ${entry.message}`
    ).join('\n');

    try {
      // Email sending logic (using nodemailer, etc.)
      await this.sendMail(subject, body);
    } catch (error) {
      console.error('Failed to send log email:', error);
    }
  }

  private async sendMail(subject: string, body: string): Promise<void> {
    // Implementation would use email service
    console.log(`EMAIL: ${subject}\n${body}`);
  }
}
```

## Custom Formatters

### Advanced Formatter Example

```typescript
import { LogFormatter, LogEntry, LogLevel } from 'jellylogger';

interface FormatterOptions {
  includeTimestamp?: boolean;
  timestampFormat?: 'iso' | 'local' | 'unix';
  colorize?: boolean;
  maxDataDepth?: number;
  truncateMessages?: number;
}

class AdvancedFormatter implements LogFormatter {
  private options: FormatterOptions;

  constructor(options: FormatterOptions = {}) {
    this.options = {
      includeTimestamp: true,
      timestampFormat: 'iso',
      colorize: false,
      maxDataDepth: 3,
      truncateMessages: 1000,
      ...options
    };
  }

  format(entry: LogEntry): string {
    let parts: string[] = [];

    // Timestamp
    if (this.options.includeTimestamp) {
      parts.push(this.formatTimestamp(entry.timestamp));
    }

    // Level with optional colors
    const levelStr = this.options.colorize 
      ? this.colorizeLevel(entry.levelName, entry.level)
      : `[${entry.levelName}]`;
    parts.push(levelStr);

    // Message with optional truncation
    let message = entry.message;
    if (this.options.truncateMessages && message.length > this.options.truncateMessages) {
      message = message.slice(0, this.options.truncateMessages) + '...';
    }
    parts.push(message);

    // Structured data
    if (entry.data && Object.keys(entry.data).length > 0) {
      const dataStr = this.formatData(entry.data);
      parts.push(dataStr);
    }

    // Arguments
    if (entry.args.length > 0) {
      const argsStr = entry.args.map(arg => this.formatValue(arg)).join(' ');
      parts.push(`[${argsStr}]`);
    }

    return parts.join(' ');
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    
    switch (this.options.timestampFormat) {
      case 'local':
        return date.toLocaleString();
      case 'unix':
        return Math.floor(date.getTime() / 1000).toString();
      case 'iso':
      default:
        return date.toISOString();
    }
  }

  private colorizeLevel(levelName: string, level: LogLevel): string {
    const colors = {
      [LogLevel.FATAL]: '\x1b[41m\x1b[37m', // Red background, white text
      [LogLevel.ERROR]: '\x1b[31m',          // Red
      [LogLevel.WARN]: '\x1b[33m',           // Yellow  
      [LogLevel.INFO]: '\x1b[32m',           // Green
      [LogLevel.DEBUG]: '\x1b[36m',          // Cyan
      [LogLevel.TRACE]: '\x1b[35m',          // Magenta
    };
    
    const color = colors[level] || '';
    const reset = '\x1b[0m';
    
    return `${color}[${levelName}]${reset}`;
  }

  private formatData(data: Record<string, unknown>, depth = 0): string {
    if (depth >= (this.options.maxDataDepth ?? 3)) {
      return '[Object]';
    }

    try {
      return JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null && depth >= (this.options.maxDataDepth ?? 3) - 1) {
          return '[Object]';
        }
        return value;
      });
    } catch {
      return '[Unserializable Object]';
    }
  }

  private formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  }
}
```

## Advanced Transport Features

### Rate Limiting

```typescript
class RateLimitedTransport implements Transport {
  private lastFlush = 0;
  private minInterval: number;
  private delegate: Transport;

  constructor(delegate: Transport, minIntervalMs = 1000) {
    this.delegate = delegate;
    this.minInterval = minIntervalMs;
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    const now = Date.now();
    if (now - this.lastFlush < this.minInterval) {
      return; // Skip this log to enforce rate limit
    }
    
    this.lastFlush = now;
    return this.delegate.log(entry, options);
  }

  async flush(options?: LoggerOptions): Promise<void> {
    return this.delegate.flush?.(options);
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreakerTransport implements Transport {
  private delegate: Transport;
  private failures = 0;
  private maxFailures: number;
  private resetTimeout: number;
  private lastFailure = 0;
  private isOpen = false;

  constructor(delegate: Transport, maxFailures = 5, resetTimeoutMs = 30000) {
    this.delegate = delegate;
    this.maxFailures = maxFailures;
    this.resetTimeout = resetTimeoutMs;
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    if (this.isOpen) {
      const now = Date.now();
      if (now - this.lastFailure > this.resetTimeout) {
        this.isOpen = false;
        this.failures = 0;
      } else {
        return; // Circuit is open, skip logging
      }
    }

    try {
      await this.delegate.log(entry, options);
      this.failures = 0; // Reset on success
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      
      if (this.failures >= this.maxFailures) {
        this.isOpen = true;
      }
      
      throw error;
    }
  }

  async flush(options?: LoggerOptions): Promise<void> {
    if (!this.isOpen) {
      return this.delegate.flush?.(options);
    }
  }
}
```

## Testing Custom Extensions

### Testing Transports

```typescript
import { describe, test, expect, mock } from 'bun:test';

describe('CustomTransport', () => {
  test('should log entry correctly', async () => {
    const mockLog = mock();
    const transport = new CustomTransport();
    transport.log = mockLog;

    const entry = {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Test message',
      args: [],
      data: { key: 'value' }
    };

    const options = { level: LogLevel.INFO };
    
    await transport.log(entry, options);
    
    expect(mockLog).toHaveBeenCalledWith(entry, options);
  });

  test('should handle flush correctly', async () => {
    const transport = new CustomTransport();
    // Test that flush completes without errors
    await expect(transport.flush()).resolves.toBeUndefined();
  });
});
```

### Testing Formatters

```typescript
describe('CustomFormatter', () => {
  test('should format entry correctly', () => {
    const formatter = new CustomFormatter();
    const entry = {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Test message',
      args: ['arg1', 'arg2'],
      data: { userId: 123 }
    };

    const result = formatter.format(entry);
    
    expect(result).toContain('Test message');
    expect(result).toContain('INFO');
    expect(result).toContain('2024-01-01T00:00:00.000Z');
  });
});
```

## Best Practices

### Error Handling

```typescript
class RobustTransport implements Transport {
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    try {
      await this.doLog(entry, options);
    } catch (error) {
      // Log the error without causing recursion
      console.error(`Transport error: ${error}`);
      
      // Optionally, fallback to another transport
      await this.fallbackLog(entry);
    }
  }

  private async doLog(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Your main logging logic
  }

  private async fallbackLog(entry: LogEntry): Promise<void> {
    // Simple fallback (e.g., write to stderr)
    process.stderr.write(`FALLBACK: ${entry.message}\n`);
  }
}
```

### Resource Management

```typescript
class ResourceManagedTransport implements Transport {
  private resources: any[] = [];

  constructor() {
    // Set up cleanup on process exit
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Your logging logic
  }

  async flush(): Promise<void> {
    // Flush and cleanup resources
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    // Clean up any open resources (files, connections, etc.)
    for (const resource of this.resources) {
      try {
        await resource.close?.();
      } catch (error) {
        console.error('Error closing resource:', error);
      }
    }
    this.resources = [];
  }
}
```

### Configuration Validation

```typescript
interface TransportConfig {
  url: string;
  timeout?: number;
  retries?: number;
}

class ValidatingTransport implements Transport {
  private config: Required<TransportConfig>;

  constructor(config: TransportConfig) {
    this.config = this.validateConfig(config);
  }

  private validateConfig(config: TransportConfig): Required<TransportConfig> {
    if (!config.url) {
      throw new Error('URL is required');
    }

    if (!config.url.startsWith('http')) {
      throw new Error('URL must start with http or https');
    }

    return {
      url: config.url,
      timeout: config.timeout ?? 5000,
      retries: config.retries ?? 3
    };
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Use validated config
  }
}
```

This extensibility system allows you to adapt JellyLogger to any logging destination or format while maintaining consistent behavior and error handling.
  private async cleanup(): Promise<void> {
    // Clean up any open resources (files, connections, etc.)
    for (const resource of this.resources) {
      try {
        await resource.close?.();
      } catch (error) {
        console.error('Error closing resource:', error);
      }
    }
    this.resources = [];
  }
}
```

### Configuration Validation

```typescript
interface TransportConfig {
  url: string;
  timeout?: number;
  retries?: number;
}

class ValidatingTransport implements Transport {
  private config: Required<TransportConfig>;

  constructor(config: TransportConfig) {
    this.config = this.validateConfig(config);
  }

  private validateConfig(config: TransportConfig): Required<TransportConfig> {
    if (!config.url) {
      throw new Error('URL is required');
    }

    if (!config.url.startsWith('http')) {
      throw new Error('URL must start with http or https');
    }

    return {
      url: config.url,
      timeout: config.timeout ?? 5000,
      retries: config.retries ?? 3
    };
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Use validated config
  }
}
```

This extensibility system allows you to adapt JellyLogger to any logging destination or format while maintaining consistent behavior and error handling.
