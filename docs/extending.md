# Extending JellyLogger

JellyLogger is designed to be highly extensible. This guide covers how to create custom transports, formatters, redaction logic, and integrate with external systems.

---

## Overview

JellyLogger's extensibility comes from well-defined interfaces:

- **Custom Transports**: Send logs to any destination
- **Custom Formatters**: Control log structure and appearance
- **Custom Redaction**: Implement domain-specific data protection
- **Plugins**: Combine multiple extensions for complex scenarios
- **Integration Hooks**: Connect with monitoring and alerting systems

---

## Creating Custom Transports

### Basic Transport Implementation

```typescript
import type { Transport, LogEntry, TransportOptions } from "jellylogger";

class DatabaseTransport implements Transport {
  private connectionString: string;
  private db: Database;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
    this.db = new Database(connectionString);
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO logs (timestamp, level, level_name, message, data, args)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        new Date(entry.timestamp),
        entry.level,
        entry.levelName,
        entry.message,
        JSON.stringify(entry.data || {}),
        JSON.stringify(entry.args)
      ]);
    } catch (error) {
      console.error('DatabaseTransport error:', error);
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    // Ensure all database operations are complete
    await this.db.flush();
  }
}

// Usage
import { logger } from "jellylogger";
logger.addTransport(new DatabaseTransport("postgresql://localhost/logs"));
```

### Advanced Transport with Buffering

```typescript
import type { Transport, LogEntry, TransportOptions } from "jellylogger";

interface ElasticsearchTransportOptions {
  bufferSize?: number;
  flushInterval?: number;
  indexPrefix?: string;
  retryAttempts?: number;
}

class ElasticsearchTransport implements Transport {
  private buffer: LogEntry[] = [];
  private options: Required<ElasticsearchTransportOptions>;
  private timer: NodeJS.Timeout | null = null;
  private client: ElasticsearchClient;

  constructor(
    elasticsearchUrl: string, 
    options: ElasticsearchTransportOptions = {}
  ) {
    this.options = {
      bufferSize: options.bufferSize ?? 100,
      flushInterval: options.flushInterval ?? 5000,
      indexPrefix: options.indexPrefix ?? 'jellylogger',
      retryAttempts: options.retryAttempts ?? 3
    };
    
    this.client = new ElasticsearchClient({ node: elasticsearchUrl });
    this.scheduleFlush();
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.options.bufferSize) {
      await this.flushBuffer();
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flushBuffer();
  }

  private scheduleFlush(): void {
    this.timer = setTimeout(async () => {
      await this.flushBuffer();
      this.scheduleFlush();
    }, this.options.flushInterval);
  }

  private async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    const entries = this.buffer.splice(0, this.buffer.length);
    const indexName = `${this.options.indexPrefix}-${new Date().toISOString().slice(0, 10)}`;

    const body = entries.flatMap(entry => [
      { index: { _index: indexName } },
      {
        '@timestamp': entry.timestamp,
        level: entry.levelName.toLowerCase(),
        message: entry.message,
        ...entry.data,
        args: entry.args
      }
    ]);

    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        await this.client.bulk({ body });
        break;
      } catch (error) {
        console.error(`Elasticsearch bulk insert failed (attempt ${attempt}):`, error);
        if (attempt === this.options.retryAttempts) {
          console.error('All retry attempts failed, dropping logs');
        } else {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
  }
}

// Usage with configuration
logger.addTransport(new ElasticsearchTransport("http://localhost:9200", {
  bufferSize: 50,
  flushInterval: 10000,
  indexPrefix: 'myapp-logs',
  retryAttempts: 5
}));
```

### Transport with Conditional Logic

```typescript
class ConditionalTransport implements Transport {
  private primaryTransport: Transport;
  private fallbackTransport: Transport;
  private condition: (entry: LogEntry) => boolean;

  constructor(
    primaryTransport: Transport,
    fallbackTransport: Transport,
    condition: (entry: LogEntry) => boolean
  ) {
    this.primaryTransport = primaryTransport;
    this.fallbackTransport = fallbackTransport;
    this.condition = condition;
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    const transport = this.condition(entry) 
      ? this.primaryTransport 
      : this.fallbackTransport;
    
    await transport.log(entry, options);
  }

  async flush(options?: TransportOptions): Promise<void> {
    await Promise.all([
      this.primaryTransport.flush?.(options),
      this.fallbackTransport.flush?.(options)
    ]);
  }
}

// Usage: Send errors to Discord, everything else to file
const conditionalTransport = new ConditionalTransport(
  new DiscordWebhookTransport("webhook-url"),
  new FileTransport("./logs/app.log"),
  (entry) => entry.level <= LogLevel.ERROR
);

logger.addTransport(conditionalTransport);
```

---

## Creating Custom Formatters

### Pluggable Formatter Implementation

```typescript
import type { LogFormatter, LogEntry } from "jellylogger";

class CustomFormatter implements LogFormatter {
  private includeTimestamp: boolean;
  private includeLevel: boolean;
  private timestampFormat: 'iso' | 'unix' | 'human';

  constructor(options: {
    includeTimestamp?: boolean;
    includeLevel?: boolean;
    timestampFormat?: 'iso' | 'unix' | 'human';
  } = {}) {
    this.includeTimestamp = options.includeTimestamp ?? true;
    this.includeLevel = options.includeLevel ?? true;
    this.timestampFormat = options.timestampFormat ?? 'iso';
  }

  format(entry: LogEntry): string {
    const parts: string[] = [];

    if (this.includeTimestamp) {
      const timestamp = this.formatTimestamp(entry.timestamp);
      parts.push(`[${timestamp}]`);
    }

    if (this.includeLevel) {
      parts.push(`[${entry.levelName.toUpperCase()}]`);
    }

    parts.push(entry.message);

    // Add structured data
    if (entry.data && Object.keys(entry.data).length > 0) {
      parts.push(this.formatData(entry.data));
    }

    // Add arguments
    if (entry.args.length > 0) {
      parts.push(this.formatArgs(entry.args));
    }

    return parts.join(' ');
  }

  private formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    switch (this.timestampFormat) {
      case 'unix':
        return (date.getTime() / 1000).toString();
      case 'human':
        return date.toLocaleString();
      case 'iso':
      default:
        return timestamp;
    }
  }

  private formatData(data: Record<string, unknown>): string {
    const pairs = Object.entries(data)
      .map(([key, value]) => `${key}=${this.formatValue(value)}`)
      .join(' ');
    return `{${pairs}}`;
  }

  private formatArgs(args: unknown[]): string {
    return args.map(arg => this.formatValue(arg)).join(' ');
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.includes(' ') ? `"${value}"` : value;
    }
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

// Usage
import { logger } from "jellylogger";
logger.setOptions({
  pluggableFormatter: new CustomFormatter({
    timestampFormat: 'human',
    includeLevel: true
  })
});
```

### Metric-Aware Formatter

```typescript
class MetricsFormatter implements LogFormatter {
  private metricsCollector: MetricsCollector;

  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector;
  }

  format(entry: LogEntry): string {
    // Collect metrics while formatting
    this.metricsCollector.increment('logs_total', {
      level: entry.levelName.toLowerCase(),
      hasData: entry.data ? 'true' : 'false'
    });

    if (entry.level <= LogLevel.ERROR) {
      this.metricsCollector.increment('errors_total');
    }

    // Check for performance metrics in data
    if (entry.data?.duration) {
      this.metricsCollector.histogram('request_duration_ms', 
        Number(entry.data.duration));
    }

    // Standard formatting
    return JSON.stringify({
      '@timestamp': entry.timestamp,
      '@level': entry.levelName.toLowerCase(),
      '@message': entry.message,
      ...entry.data,
      '@args': entry.args
    });
  }
}

// Usage with metrics collection
const metricsCollector = new PrometheusMetrics();
logger.setOptions({
  pluggableFormatter: new MetricsFormatter(metricsCollector)
});
```

---

## Custom Redaction Logic

### Domain-Specific Redactor

```typescript
import type { RedactionConfig, RedactionContext } from "jellylogger";

class HealthcareRedactor {
  static createConfig(): RedactionConfig {
    return {
      customRedactor: this.redactHealthcareData,
      keys: ['ssn', 'dob', 'medicalRecord*', 'patient.*'],
      stringPatterns: [
        /\b\d{3}-\d{2}-\d{4}\b/g,           // SSN
        /\b\d{4}\/\d{2}\/\d{2}\b/g,         // DOB
        /\bMRN\d{6,}\b/gi,                  // Medical Record Numbers
      ],
      fieldConfigs: {
        'patient.name': {
          replacement: (value, context) => {
            // Keep first name, redact last name
            const name = String(value);
            const parts = name.split(' ');
            return parts.length > 1 
              ? `${parts[0]} [REDACTED]`
              : '[REDACTED]';
          }
        },
        'vitals.*': {
          // Medical vitals are sensitive but may be needed for debugging
          replacement: (value, context) => {
            if (context.target === 'console') {
              return value; // Show in console for medical staff
            }
            return '[MEDICAL_DATA]'; // Redact in files/external systems
          }
        }
      },
      auditHook: (event) => {
        // Log redaction events for compliance
        console.log(`HIPAA Redaction: ${event.type} at ${event.context.path}`);
      }
    };
  }

  private static redactHealthcareData(
    value: unknown, 
    context: RedactionContext
  ): unknown {
    if (typeof value === 'string') {
      // Redact phone numbers
      value = value.replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE_REDACTED]');
      
      // Redact insurance numbers
      value = value.replace(/\b[A-Z]{2}\d{9}\b/g, '[INSURANCE_REDACTED]');
    }
    
    return value;
  }
}

// Usage
logger.setOptions({
  redaction: HealthcareRedactor.createConfig()
});
```

### Context-Aware Redaction

```typescript
class DynamicRedactor {
  private userRoles: Map<string, string[]> = new Map();
  private sensitivityLevels: Map<string, number> = new Map();

  constructor() {
    // Initialize sensitivity levels
    this.sensitivityLevels.set('public', 0);
    this.sensitivityLevels.set('internal', 1);
    this.sensitivityLevels.set('confidential', 2);
    this.sensitivityLevels.set('secret', 3);
  }

  createConfig(userId?: string, userRoles?: string[]): RedactionConfig {
    const userLevel = this.getUserClearanceLevel(userId, userRoles);
    
    return {
      customRedactor: (value, context) => {
        return this.redactBasedOnClearance(value, context, userLevel);
      },
      fieldConfigs: {
        'financial.*': {
          customRedactor: (value, context) => {
            return userLevel >= 2 ? value : '[FINANCIAL_DATA]';
          }
        },
        'security.*': {
          customRedactor: (value, context) => {
            return userLevel >= 3 ? value : '[CLASSIFIED]';
          }
        }
      }
    };
  }

  private getUserClearanceLevel(userId?: string, roles?: string[]): number {
    if (!userId || !roles) return 0;
    
    if (roles.includes('admin')) return 3;
    if (roles.includes('finance')) return 2;
    if (roles.includes('internal')) return 1;
    return 0;
  }

  private redactBasedOnClearance(
    value: unknown, 
    context: RedactionContext, 
    userLevel: number
  ): unknown {
    // Extract data classification from field names or metadata
    const classification = this.getDataClassification(context.path);
    const requiredLevel = this.sensitivityLevels.get(classification) ?? 0;
    
    if (userLevel < requiredLevel) {
      return `[REDACTED:${classification.toUpperCase()}]`;
    }
    
    return value;
  }

  private getDataClassification(path: string): string {
    if (path.includes('secret') || path.includes('api_key')) return 'secret';
    if (path.includes('financial') || path.includes('salary')) return 'confidential';
    if (path.includes('internal') || path.includes('employee')) return 'internal';
    return 'public';
  }
}

// Usage with user context
const redactor = new DynamicRedactor();
const userLogger = logger.child({
  context: { userId: 'user123' }
});

userLogger.setOptions({
  redaction: redactor.createConfig('user123', ['finance', 'internal'])
});
```

---

## Plugin System

### Creating Reusable Plugins

```typescript
interface LoggerPlugin {
  name: string;
  install(logger: JellyLogger, options?: any): void;
  uninstall?(logger: JellyLogger): void;
}

class PerformancePlugin implements LoggerPlugin {
  name = 'performance';
  private startTimes = new Map<string, number>();

  install(logger: JellyLogger, options: { autoInstrument?: boolean } = {}): void {
    // Add performance timing methods
    (logger as any).startTimer = (name: string) => {
      this.startTimes.set(name, performance.now());
    };

    (logger as any).endTimer = (name: string, message?: string) => {
      const start = this.startTimes.get(name);
      if (start) {
        const duration = performance.now() - start;
        this.startTimes.delete(name);
        logger.info(message || `Timer ${name} completed`, { 
          timer: name, 
          duration: `${duration.toFixed(2)}ms` 
        });
      }
    };

    // Auto-instrument async functions if enabled
    if (options.autoInstrument) {
      this.autoInstrument(logger);
    }
  }

  private autoInstrument(logger: JellyLogger): void {
    const originalMethods = ['info', 'warn', 'error', 'debug'];
    
    originalMethods.forEach(method => {
      const original = (logger as any)[method];
      (logger as any)[method] = (...args: any[]) => {
        const start = performance.now();
        const result = original.apply(logger, args);
        const duration = performance.now() - start;
        
        if (duration > 10) { // Log slow operations
          logger.debug(`Slow log operation: ${method}`, { duration: `${duration.toFixed(2)}ms` });
        }
        
        return result;
      };
    });
  }
}

class RequestTrackingPlugin implements LoggerPlugin {
  name = 'requestTracking';
  private activeRequests = new Map<string, any>();

  install(logger: JellyLogger): void {
    (logger as any).startRequest = (requestId: string, data: any) => {
      this.activeRequests.set(requestId, { ...data, startTime: Date.now() });
      logger.info('Request started', { requestId, ...data });
    };

    (logger as any).endRequest = (requestId: string, data?: any) => {
      const request = this.activeRequests.get(requestId);
      if (request) {
        const duration = Date.now() - request.startTime;
        this.activeRequests.delete(requestId);
        logger.info('Request completed', { 
          requestId, 
          duration: `${duration}ms`,
          ...data 
        });
      }
    };

    (logger as any).getActiveRequests = () => {
      return Array.from(this.activeRequests.keys());
    };
  }
}

// Plugin manager
class PluginManager {
  private plugins = new Map<string, LoggerPlugin>();

  use(plugin: LoggerPlugin, logger: JellyLogger, options?: any): this {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already installed`);
    }
    
    plugin.install(logger, options);
    this.plugins.set(plugin.name, plugin);
    return this;
  }

  remove(pluginName: string, logger: JellyLogger): boolean {
    const plugin = this.plugins.get(pluginName);
    if (plugin) {
      plugin.uninstall?.(logger);
      this.plugins.delete(pluginName);
      return true;
    }
    return false;
  }

  list(): string[] {
    return Array.from(this.plugins.keys());
  }
}

// Usage
const pluginManager = new PluginManager();
pluginManager
  .use(new PerformancePlugin(), logger, { autoInstrument: true })
  .use(new RequestTrackingPlugin(), logger);

// Now logger has additional methods
(logger as any).startTimer('database-query');
// ... database operation
(logger as any).endTimer('database-query', 'User lookup completed');

(logger as any).startRequest('req-123', { method: 'GET', path: '/users' });
// ... request processing
(logger as any).endRequest('req-123', { statusCode: 200 });
```

---

## Integration Patterns

### Monitoring Integration

```typescript
class MonitoringIntegration {
  private metricsClient: MetricsClient;
  private alertManager: AlertManager;

  constructor(metricsClient: MetricsClient, alertManager: AlertManager) {
    this.metricsClient = metricsClient;
    this.alertManager = alertManager;
  }

  createEnhancedLogger(): JellyLogger {
    const enhancedLogger = logger.child({});
    
    // Override logging methods to collect metrics
    const originalMethods = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
    
    originalMethods.forEach(level => {
      const original = (enhancedLogger as any)[level];
      (enhancedLogger as any)[level] = (...args: any[]) => {
        // Collect metrics
        this.metricsClient.increment('logs.total', { level });
        
        // Check for alerts
        if (level === 'fatal' || level === 'error') {
          this.handleErrorAlert(level, args);
        }
        
        // Call original method
        return original.apply(enhancedLogger, args);
      };
    });

    return enhancedLogger;
  }

  private handleErrorAlert(level: string, args: any[]): void {
    const [message, ...otherArgs] = args;
    
    // Extract error context
    const errorData = otherArgs.find(arg => 
      typeof arg === 'object' && arg !== null && !Array.isArray(arg)
    );

    // Send alert based on severity and frequency
    if (level === 'fatal') {
      this.alertManager.sendImmediate({
        severity: 'critical',
        title: 'Fatal Error Occurred',
        message: String(message),
        context: errorData
      });
    } else {
      // Rate-limited error alerts
      this.alertManager.sendThrottled({
        severity: 'warning',
        title: 'Error Rate Increase',
        message: String(message),
        context: errorData
      }, { window: '5m', threshold: 10 });
    }
  }
}

// Usage
const monitoring = new MonitoringIntegration(
  new PrometheusClient(),
  new SlackAlertManager()
);

const monitoredLogger = monitoring.createEnhancedLogger();
```

### Microservice Correlation

```typescript
class CorrelationTracker {
  private static instance: CorrelationTracker;
  private correlationStore = new Map<string, any>();

  static getInstance(): CorrelationTracker {
    if (!this.instance) {
      this.instance = new CorrelationTracker();
    }
    return this.instance;
  }

  createCorrelatedLogger(correlationId?: string): JellyLogger {
    const id = correlationId || crypto.randomUUID();
    
    const correlatedLogger = logger.child({
      context: { correlationId: id }
    });

    // Store correlation context
    this.correlationStore.set(id, {
      startTime: Date.now(),
      service: process.env.SERVICE_NAME || 'unknown',
      version: process.env.SERVICE_VERSION || '1.0.0'
    });

    // Add correlation methods
    (correlatedLogger as any).addCorrelationContext = (data: Record<string, any>) => {
      const existing = this.correlationStore.get(id) || {};
      this.correlationStore.set(id, { ...existing, ...data });
    };

    (correlatedLogger as any).getCorrelationContext = () => {
      return this.correlationStore.get(id);
    };

    (correlatedLogger as any).endCorrelation = () => {
      const context = this.correlationStore.get(id);
      if (context) {
        const duration = Date.now() - context.startTime;
        correlatedLogger.info('Correlation ended', { 
          duration: `${duration}ms`,
          ...context 
        });
        this.correlationStore.delete(id);
      }
    };

    return correlatedLogger;
  }
}

// Express middleware
function correlationMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string || crypto.randomUUID();
  
  const tracker = CorrelationTracker.getInstance();
  const correlatedLogger = tracker.createCorrelatedLogger(correlationId);
  
  // Add to request
  req.correlationId = correlationId;
  req.logger = correlatedLogger;
  
  // Set response header
  res.setHeader('x-correlation-id', correlationId);
  
  // Add request context
  (correlatedLogger as any).addCorrelationContext({
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  
  // End correlation on response
  res.on('finish', () => {
    (correlatedLogger as any).addCorrelationContext({
      statusCode: res.statusCode,
      responseTime: Date.now() - req.startTime
    });
    (correlatedLogger as any).endCorrelation();
  });
  
  next();
}
```

### Testing Integration

```typescript
// Test utilities for custom extensions
class TestingUtilities {
  static createMockTransport(): { transport: Transport; logs: LogEntry[] } {
    const logs: LogEntry[] = [];
    
    const transport: Transport = {
      async log(entry: LogEntry): Promise<void> {
        logs.push(structuredClone(entry));
      },
      async flush(): Promise<void> {
        // No-op for testing
      }
    };

    return { transport, logs };
  }

  static createTimedLogger(): { logger: JellyLogger; getElapsed: () => number } {
    const startTime = Date.now();
    const timedLogger = logger.child({});
    
    return {
      logger: timedLogger,
      getElapsed: () => Date.now() - startTime
    };
  }

  static assertLogContains(logs: LogEntry[], message: string, level?: LogLevel): boolean {
    return logs.some(log => 
      log.message.includes(message) && 
      (level === undefined || log.level === level)
    );
  }

  static assertRedactionApplied(logs: LogEntry[], path: string): boolean {
    return logs.some(log => {
      const str = JSON.stringify(log);
      return str.includes('[REDACTED]') || str.includes('[SENSITIVE]');
    });
  }
}

// Example test with Bun test runner
import { describe, test, expect } from 'bun:test';

describe('Custom Transport', () => {
  test('should log to custom transport', async () => {
    const { transport, logs } = TestingUtilities.createMockTransport();
    
    const testLogger = logger.child({});
    testLogger.addTransport(transport);
    
    testLogger.info('Test message', { userId: 123 });
    
    await testLogger.flushAll();
    
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Test message');
    expect(logs[0].data?.userId).toBe(123);
  });

  test('should apply custom redaction', () => {
    const { transport, logs } = TestingUtilities.createMockTransport();
    
    const testLogger = logger.child({});
    testLogger.addTransport(transport);
    testLogger.setOptions({
      redaction: {
        keys: ['password'],
        replacement: '[HIDDEN]'
      }
    });
    
    testLogger.info('Login attempt', { username: 'user', password: 'secret' });
    
    expect(TestingUtilities.assertRedactionApplied(logs, 'password')).toBe(true);
  });
});
```

---

## Best Practices for Extensions

### Performance Considerations

```typescript
// Efficient transport with connection pooling
class HighPerformanceTransport implements Transport {
  private connectionPool: ConnectionPool;
  private writeQueue: LogEntry[] = [];
  private batchProcessor: BatchProcessor;

  constructor(options: {
    maxConnections?: number;
    batchSize?: number;
    batchTimeout?: number;
  } = {}) {
    this.connectionPool = new ConnectionPool({
      max: options.maxConnections ?? 10,
      acquireTimeoutMillis: 5000
    });
    
    this.batchProcessor = new BatchProcessor({
      batchSize: options.batchSize ?? 100,
      batchTimeout: options.batchTimeout ?? 1000,
      processor: this.processBatch.bind(this)
    });
  }

  async log(entry: LogEntry): Promise<void> {
    // Non-blocking add to batch
    this.batchProcessor.add(entry);
  }

  private async processBatch(entries: LogEntry[]): Promise<void> {
    const connection = await this.connectionPool.acquire();
    try {
      await connection.batchInsert(entries);
    } finally {
      this.connectionPool.release(connection);
    }
  }

  async flush(): Promise<void> {
    await this.batchProcessor.flush();
  }
}
```

### Error Handling

```typescript
class ResilientTransport implements Transport {
  private primaryTransport: Transport;
  private fallbackTransport: Transport;
  private errorCount = 0;
  private lastError?: Error;

  constructor(primary: Transport, fallback: Transport) {
    this.primaryTransport = primary;
    this.fallbackTransport = fallback;
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      await this.primaryTransport.log(entry, options);
      this.errorCount = 0; // Reset on success
    } catch (error) {
      this.errorCount++;
      this.lastError = error instanceof Error ? error : new Error(String(error));
      
      console.warn(`Primary transport failed (${this.errorCount} errors):`, error);
      
      try {
        await this.fallbackTransport.log(entry, options);
      } catch (fallbackError) {
        console.error('Both primary and fallback transports failed:', {
          primary: error,
          fallback: fallbackError
        });
        // Don't throw - logging should never crash the application
      }
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    const promises = [
      this.primaryTransport.flush?.(options),
      this.fallbackTransport.flush?.(options)
    ].filter(Boolean);
    
    await Promise.allSettled(promises);
  }

  getHealthStatus(): { healthy: boolean; errorCount: number; lastError?: string } {
    return {
      healthy: this.errorCount < 5,
      errorCount: this.errorCount,
      lastError: this.lastError?.message
    };
  }
}
```

### Configuration Management

```typescript
interface ExtensionConfig {
  transports?: {
    [name: string]: {
      type: string;
      enabled: boolean;
      options: Record<string, any>;
    };
  };
  formatters?: {
    [name: string]: {
      type: string;
      options: Record<string, any>;
    };
  };
  redaction?: RedactionConfig;
}

class ConfigurableLogger {
  private transportRegistry = new Map<string, new (...args: any[]) => Transport>();
  private formatterRegistry = new Map<string, new (...args: any[]) => LogFormatter>();

  constructor() {
    // Register built-in types
    this.registerTransport('file', FileTransport);
    this.registerTransport('console', ConsoleTransport);
    this.registerTransport('discord', DiscordWebhookTransport);
    this.registerTransport('websocket', WebSocketTransport);
    
    this.registerFormatter('logfmt', LogfmtFormatter);
    this.registerFormatter('ndjson', NdjsonFormatter);
  }

  registerTransport(name: string, transportClass: new (...args: any[]) => Transport): void {
    this.transportRegistry.set(name, transportClass);
  }

  registerFormatter(name: string, formatterClass: new (...args: any[]) => LogFormatter): void {
    this.formatterRegistry.set(name, formatterClass);
  }

  configure(config: ExtensionConfig): JellyLogger {
    const configuredLogger = logger.child({});
    
    // Clear existing transports
    configuredLogger.clearTransports();
    
    // Configure transports
    if (config.transports) {
      for (const [name, transportConfig] of Object.entries(config.transports)) {
        if (!transportConfig.enabled) continue;
        
        const TransportClass = this.transportRegistry.get(transportConfig.type);
        if (!TransportClass) {
          console.warn(`Unknown transport type: ${transportConfig.type}`);
          continue;
        }
        
        try {
          const transport = new TransportClass(transportConfig.options);
          configuredLogger.addTransport(transport);
        } catch (error) {
          console.error(`Failed to create transport ${name}:`, error);
        }
      }
    }
    
    // Configure formatters and redaction
    const options: any = {};
    
    if (config.formatters) {
      // Apply first formatter found (could be enhanced to support multiple)
      const [formatterName, formatterConfig] = Object.entries(config.formatters)[0] || [];
      if (formatterName && formatterConfig) {
        const FormatterClass = this.formatterRegistry.get(formatterConfig.type);
        if (FormatterClass) {
          options.pluggableFormatter = new FormatterClass(formatterConfig.options);
        }
      }
    }
    
    if (config.redaction) {
      options.redaction = config.redaction;
    }
    
    configuredLogger.setOptions(options);
    return configuredLogger;
  }
}

// Usage with configuration file
const configurableLogger = new ConfigurableLogger();

// Register custom extensions
configurableLogger.registerTransport('elasticsearch', ElasticsearchTransport);
configurableLogger.registerFormatter('custom', CustomFormatter);

// Load from config file
const config: ExtensionConfig = JSON.parse(
  await Bun.file('./logger-config.json').text()
);

const appLogger = configurableLogger.configure(config);
```

---

## Real-World Extension Examples

### Distributed Tracing Integration

```typescript
class TracingLogger {
  private tracer: Tracer;

  constructor(tracer: Tracer) {
    this.tracer = tracer;
  }

  createSpanLogger(operationName: string, parentSpan?: Span): JellyLogger & { span: Span } {
    const span = this.tracer.startSpan(operationName, {
      childOf: parentSpan
    });

    const spanLogger = logger.child({
      context: {
        traceId: span.context().toTraceId(),
        spanId: span.context().toSpanId()
      }
    }) as JellyLogger & { span: Span };

    spanLogger.span = span;

    // Override logging methods to add to span
    const originalMethods = ['error', 'warn', 'info', 'debug'];
    originalMethods.forEach(method => {
      const original = (spanLogger as any)[method];
      (spanLogger as any)[method] = (...args: any[]) => {
        // Add log to span
        span.log({
          level: method,
          message: args[0],
          data: args.slice(1)
        });

        // Call original method
        return original.apply(spanLogger, args);
      };
    });

    return spanLogger;
  }
}

// Usage
const tracingLogger = new TracingLogger(jaegerTracer);
const spanLogger = tracingLogger.createSpanLogger('user-login');

spanLogger.info('Login attempt started', { userId: 123 });
// ... login logic
spanLogger.span.finish();
```

---

## Migration and Compatibility

### Wrapping Existing Loggers

```typescript
class LegacyLoggerAdapter implements Transport {
  private legacyLogger: any;
  private levelMapping: Record<LogLevel, string>;

  constructor(legacyLogger: any) {
    this.legacyLogger = legacyLogger;
    this.levelMapping = {
      [LogLevel.FATAL]: 'fatal',
      [LogLevel.ERROR]: 'error',
      [LogLevel.WARN]: 'warn',
      [LogLevel.INFO]: 'info',
      [LogLevel.DEBUG]: 'debug',
      [LogLevel.TRACE]: 'trace'
    };
  }

  async log(entry: LogEntry): Promise<void> {
    const legacyLevel = this.levelMapping[entry.level];
    const legacyMethod = this.legacyLogger[legacyLevel];
    
    if (typeof legacyMethod === 'function') {
      legacyMethod.call(this.legacyLogger, entry.message, entry.data);
    }
  }

  async flush(): Promise<void> {
    if (typeof this.legacyLogger.flush === 'function') {
      await this.legacyLogger.flush();
    }
  }
}

// Usage with Winston
const winston = require('winston');
const winstonLogger = winston.createLogger({
  // ... winston config
});

logger.addTransport(new LegacyLoggerAdapter(winstonLogger));
```

---

## Documentation and Testing

### Self-Documenting Extensions

```typescript
interface ExtensionMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  options?: Record<string, {
    type: string;
    description: string;
    default?: any;
    required?: boolean;
  }>;
}

abstract class DocumentedTransport implements Transport {
  abstract readonly metadata: ExtensionMetadata;
  
  abstract log(entry: LogEntry, options?: TransportOptions): Promise<void>;
  
  flush?(options?: TransportOptions): Promise<void>;
  
  getDocumentation(): string {
    const { name, version, description, author, options } = this.metadata;
    
    let doc = `# ${name} v${version}\n\n${description}\n\nAuthor: ${author}\n\n`;
    
    if (options) {
      doc += '## Options\n\n';
      for (const [key, opt] of Object.entries(options)) {
        doc += `- **${key}** (${opt.type})${opt.required ? ' *required*' : ''}: ${opt.description}`;
        if (opt.default !== undefined) {
          doc += ` (default: ${JSON.stringify(opt.default)})`;
        }
        doc += '\n';
      }
    }
    
    return doc;
  }
}

// Example implementation
class MyCustomTransport extends DocumentedTransport {
  readonly metadata: ExtensionMetadata = {
    name: 'MyCustomTransport',
    version: '1.0.0',
    description: 'A custom transport for demonstration purposes',
    author: 'Your Name <your.email@example.com>',
    options: {
      url: {
        type: 'string',
        description: 'The endpoint URL to send logs to',
        required: true
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 5000
      }
    }
  };

  async log(entry: LogEntry): Promise<void> {
    // Implementation here
  }
}
```

---

## More Resources

- [Usage Guide](./usage.md) - Complete usage documentation
- [Transports](./transports.md) - Built-in transport details
- [Formatters](./formatters.md) - Formatting system guide
- [API Reference](./api.md) - Complete API documentation
- [Examples](./examples.md) - Real-world usage examples

---
