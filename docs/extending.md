# Extending JellyLogger

Learn how to extend JellyLogger with custom transports, formatters, and redaction logic.

---

## Table of Contents

1. [Custom Transports](#custom-transports)
2. [Custom Formatters](#custom-formatters)
3. [Custom Redaction Logic](#custom-redaction-logic)
4. [Plugin Architecture](#plugin-architecture)
5. [Integration Examples](#integration-examples)
6. [Testing Custom Extensions](#testing-custom-extensions)
7. [Best Practices](#best-practices)

---

## Custom Transports

### Basic Transport Implementation

```typescript
import type { Transport, LogEntry, TransportOptions } from 'jellylogger';
import { getRedactedEntry } from 'jellylogger';

class DatabaseTransport implements Transport {
  constructor(private connectionString: string) {}

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      // Apply redaction for database storage
      const redacted = getRedactedEntry(entry, options?.redaction, 'file');

      // Connect and store in database
      const connection = await this.getConnection();
      await connection.query(
        'INSERT INTO logs (timestamp, level, message, data) VALUES (?, ?, ?, ?)',
        [redacted.timestamp, redacted.level, redacted.message, JSON.stringify(redacted.data)]
      );
    } catch (error) {
      console.error('DatabaseTransport error:', error);
      // Never throw from log() - let other transports continue
    }
  }

  async flush(): Promise<void> {
    // Ensure all pending database writes are committed
    const connection = await this.getConnection();
    await connection.commit();
  }

  private async getConnection() {
    // Database connection logic
    throw new Error('Implement database connection');
  }
}

// Usage with persistent context
const dbTransport = new DatabaseTransport('postgresql://...');
const userLogger = logger.child({
  messagePrefix: 'DB',
  context: { userId: 'user-123', tenant: 'acme' },
});
userLogger.addTransport(dbTransport);
userLogger.info('Query executed', { query: 'SELECT * FROM users' });
```

### Advanced Transport with Buffering

```typescript
class BufferedTransport implements Transport {
  private buffer: LogEntry[] = [];
  private flushTimer: Timer | null = null;
  private readonly bufferSize: number;
  private readonly flushInterval: number;

  constructor(
    private destination: Transport,
    options: { bufferSize?: number; flushInterval?: number } = {}
  ) {
    this.bufferSize = options.bufferSize ?? 100;
    this.flushInterval = options.flushInterval ?? 5000; // 5 seconds
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.bufferSize) {
      await this.flushBuffer(options);
    }

    // Schedule flush if not already scheduled
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushBuffer(options).catch(console.error);
      }, this.flushInterval);
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    await this.flushBuffer(options);
  }

  private async flushBuffer(options?: TransportOptions): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const entries = this.buffer.splice(0); // Remove all entries

    for (const entry of entries) {
      try {
        await this.destination.log(entry, options);
      } catch (error) {
        console.error('BufferedTransport flush error:', error);
      }
    }
  }
}

// Usage with persistent context
const bufferedFileTransport = new BufferedTransport(new FileTransport('./logs/app.log'), {
  bufferSize: 50,
  flushInterval: 3000,
});
const serviceLogger = logger.child({
  messagePrefix: 'SERVICE',
  context: { service: 'payment', version: '1.2.3' },
});
serviceLogger.addTransport(bufferedFileTransport);
serviceLogger.info('Buffering started');
```

### HTTP API Transport

```typescript
class HttpApiTransport implements Transport {
  constructor(
    private endpoint: string,
    private options: {
      apiKey?: string;
      timeout?: number;
      retries?: number;
    } = {}
  ) {}

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    const redacted = getRedactedEntry(entry, options?.redaction, 'file');

    const payload = {
      timestamp: redacted.timestamp,
      level: redacted.levelName,
      message: redacted.message,
      data: redacted.data,
      service: process.env.SERVICE_NAME || 'unknown',
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }

    try {
      await this.sendWithRetry(payload, headers);
    } catch (error) {
      console.error('HttpApiTransport error:', error);
    }
  }

  private async sendWithRetry(
    payload: any,
    headers: Record<string, string>,
    attempt: number = 1
  ): Promise<void> {
    const maxRetries = this.options.retries ?? 3;

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.options.timeout ?? 5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWithRetry(payload, headers, attempt + 1);
      }
      throw error;
    }
  }

  async flush(): Promise<void> {
    // HTTP API transport doesn't need explicit flushing
  }
}

// Usage with persistent context
const apiTransport = new HttpApiTransport('https://logs.example.com/api/logs', {
  apiKey: process.env.LOG_API_KEY,
  timeout: 10000,
  retries: 3,
});
const apiLogger = logger.child({
  messagePrefix: 'API',
  context: { env: 'production' },
});
apiLogger.addTransport(apiTransport);
apiLogger.error('API failure', { endpoint: '/users' });
```

### Email Transport for Critical Alerts

```typescript
class EmailTransport implements Transport {
  private lastEmailTime = 0;
  private readonly throttleMs = 300000; // 5 minutes

  constructor(
    private smtpConfig: {
      host: string;
      port: number;
      user: string;
      password: string;
      to: string[];
    }
  ) {}

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Only send emails for ERROR and FATAL levels
    if (entry.level > LogLevel.ERROR) {
      return;
    }

    // Throttle emails to prevent spam
    const now = Date.now();
    if (now - this.lastEmailTime < this.throttleMs) {
      return;
    }
    this.lastEmailTime = now;

    try {
      const redacted = getRedactedEntry(entry, options?.redaction, 'file');
      await this.sendEmail(redacted);
    } catch (error) {
      console.error('EmailTransport error:', error);
    }
  }

  private async sendEmail(entry: LogEntry): Promise<void> {
    const subject = `[${entry.levelName}] Application Alert`;
    const body = `
      Timestamp: ${entry.timestamp}
      Level: ${entry.levelName}
      Message: ${entry.message}
      
      ${entry.data ? 'Data:\n' + JSON.stringify(entry.data, null, 2) : ''}
      
      ${entry.args.processedArgs.length > 0 ? 'Args:\n' + entry.args.processedArgs.join('\n') : ''}
    `;

    // Implementation would use your preferred email service
    // (nodemailer, SendGrid, etc.)
    await this.sendEmailWithService(subject, body);
  }

  private async sendEmailWithService(subject: string, body: string): Promise<void> {
    // Implement actual email sending
    throw new Error('Implement email service integration');
  }

  async flush(): Promise<void> {
    // Email transport doesn't need explicit flushing
  }
}

// Usage with persistent context
const emailTransport = new EmailTransport({
  host: 'smtp.example.com',
  port: 587,
  user: process.env.SMTP_USER!,
  password: process.env.SMTP_PASSWORD!,
  to: ['alerts@example.com', 'ops-team@example.com'],
});
const alertLogger = logger.child({
  messagePrefix: 'ALERT',
  context: { severity: 'critical' },
});
alertLogger.addTransport(emailTransport);
alertLogger.fatal('Critical system error');
```

---

## Custom Formatters

### JSON Pretty Formatter

```typescript
import type { LogFormatter, LogEntry, CustomConsoleColors } from 'jellylogger';

class JsonPrettyFormatter implements LogFormatter {
  format(
    entry: LogEntry,
    options?: { consoleColors?: CustomConsoleColors; useColors?: boolean }
  ): string {
    const formatted = {
      time: entry.timestamp,
      level: entry.levelName,
      msg: entry.message,
      ...(entry.data && Object.keys(entry.data).length > 0 && { data: entry.data }),
      ...(entry.args.processedArgs.length > 0 && { args: entry.args.processedArgs }),
    };

    return JSON.stringify(formatted, null, 2);
  }
}

// Usage
logger.setOptions({
  pluggableFormatter: new JsonPrettyFormatter(),
});
```

### Syslog-Style Formatter

```typescript
class SyslogFormatter implements LogFormatter {
  private facilityMap = {
    [LogLevel.FATAL]: 0, // Emergency
    [LogLevel.ERROR]: 3, // Error
    [LogLevel.WARN]: 4, // Warning
    [LogLevel.INFO]: 6, // Informational
    [LogLevel.DEBUG]: 7, // Debug
    [LogLevel.TRACE]: 7, // Debug
  };

  format(entry: LogEntry): string {
    const priority = this.facilityMap[entry.level] ?? 6;
    const hostname = process.env.HOSTNAME || 'localhost';
    const appName = process.env.SERVICE_NAME || 'app';
    const processId = process.pid;

    // Syslog format: <priority>timestamp hostname app-name[pid]: message
    let message = `<${priority}>${entry.timestamp} ${hostname} ${appName}[${processId}]: ${entry.message}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
      const dataStr = Object.entries(entry.data)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      message += ` ${dataStr}`;
    }

    return message;
  }
}

// Usage
logger.setOptions({
  pluggableFormatter: new SyslogFormatter(),
});
```

### Colorized Development Formatter

```typescript
import { LogLevel } from 'jellylogger';
import { getConsistentFormatterColors, colorizeLevelText, dimText } from 'jellylogger';

class DevFormatter implements LogFormatter {
  format(
    entry: LogEntry,
    options?: { consoleColors?: CustomConsoleColors; useColors?: boolean }
  ): string {
    const colors = getConsistentFormatterColors(options);
    const useColors = options?.useColors !== false && colors;

    // Extract relevant parts
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const level = entry.levelName.padEnd(5);
    const message = entry.message;

    if (useColors) {
      const coloredTime = dimText(time, colors);
      const coloredLevel = colorizeLevelText(level, entry.level, colors);
      const emoji = this.getLevelEmoji(entry.level);

      let output = `${coloredTime} ${emoji} ${coloredLevel} ${message}`;

      if (entry.data && Object.keys(entry.data).length > 0) {
        output += `\n${dimText('  └─', colors)} ${JSON.stringify(entry.data, null, 2)}`;
      }

      return output;
    } else {
      return `${time} [${level}] ${message}`;
    }
  }

  private getLevelEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.FATAL:
        return '💀';
      case LogLevel.ERROR:
        return '❌';
      case LogLevel.WARN:
        return '⚠️';
      case LogLevel.INFO:
        return 'ℹ️';
      case LogLevel.DEBUG:
        return '🐛';
      case LogLevel.TRACE:
        return '🔍';
      default:
        return '📝';
    }
  }
}

// Usage
logger.setOptions({
  pluggableFormatter: new DevFormatter(),
});
```

### Structured Data Formatter

```typescript
class StructuredFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const structured = {
      '@timestamp': entry.timestamp,
      '@level': entry.levelName,
      '@message': entry.message,
      '@version': '1',
      logger_name: 'jellylogger',
      thread_name: 'main',
      level_value: entry.level * 1000, // Convert to syslog-style numbers
    };

    // Flatten nested data with dot notation
    if (entry.data) {
      Object.assign(structured, this.flattenObject(entry.data, ''));
    }

    // Add args as separate fields
    if (entry.args.processedArgs.length > 0) {
      entry.args.processedArgs.forEach((arg, index) => {
        structured[`arg_${index}`] = arg;
      });
    }

    return JSON.stringify(structured);
  }

  private flattenObject(obj: any, prefix: string): Record<string, any> {
    const flattened: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }
}

// Usage
logger.setOptions({
  pluggableFormatter: new StructuredFormatter(),
});
```

---

## Custom Redaction Logic

### Domain-Specific Redactor

```typescript
import type { RedactionConfig, RedactionContext } from 'jellylogger';

class HealthcareRedactor {
  static createConfig(): RedactionConfig {
    return {
      customRedactor: this.redactHealthcareData,
      keys: ['ssn', 'dob', 'medicalRecord*', 'patient.*'],
      stringPatterns: [
        /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
        /\b\d{4}\/\d{2}\/\d{2}\b/g, // DOB
        /\bMRN\d{6,}\b/gi, // Medical Record Numbers
      ],
      fieldConfigs: {
        'patient.name': {
          replacement: (value, context) => {
            // Keep first name, redact last name
            const name = String(value);
            const parts = name.split(' ');
            return parts.length > 1 ? `${parts[0]} [REDACTED]` : '[REDACTED]';
          },
        },
        'vitals.*': {
          // Medical vitals are sensitive but may be needed for debugging
          replacement: (value, context) => {
            if (context.target === 'console') {
              return value; // Show in console for medical staff
            }
            return '[MEDICAL_DATA]'; // Redact in files/external systems
          },
        },
      },
      auditHook: event => {
        // Log redaction events for compliance
        console.log(`HIPAA Redaction: ${event.type} at ${event.context.path}`);
      },
    };
  }

  private static redactHealthcareData(value: unknown, context: RedactionContext): unknown {
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
  redaction: HealthcareRedactor.createConfig(),
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
          },
        },
        'security.*': {
          customRedactor: (value, context) => {
            return userLevel >= 3 ? value : '[CLASSIFIED]';
          },
        },
      },
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
  context: { userId: 'user123' },
});

userLogger.setOptions({
  redaction: redactor.createConfig('user123', ['finance', 'internal']),
});
```

### Compliance Redactor

```typescript
class ComplianceRedactor {
  static createGDPRConfig(): RedactionConfig {
    return {
      keys: [
        'email',
        'phone',
        'address',
        'name',
        'user.email',
        'user.phone',
        'user.address',
        'customer.*',
        'user.personal.*',
      ],
      stringPatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
        /\b\+?[\d\s\-\(\)]{10,}\b/g, // Phone
        /\b\d{1,5}\s[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|place|pl)\b/gi, // Address
      ],
      fieldConfigs: {
        'user.id': {
          replacement: value => {
            // Hash user IDs for analytics while maintaining referential integrity
            return this.hashValue(String(value));
          },
        },
        'consent.*': {
          disabled: true, // Never redact consent information
        },
      },
      auditHook: event => {
        // Log all redaction events for GDPR compliance auditing
        this.logComplianceEvent('GDPR', event);
      },
    };
  }

  static createPCIConfig(): RedactionConfig {
    return {
      keys: ['card', 'credit', 'payment', '*.card*', '*.payment*'],
      stringPatterns: [
        /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, // Credit card
        /\b\d{3,4}\b/g, // CVV (when in payment context)
      ],
      valuePatterns: [
        /\b\d{13,19}\b/g, // Any sequence that could be a card number
      ],
      replacement: '[PCI_REDACTED]',
      auditHook: event => {
        this.logComplianceEvent('PCI', event);
      },
    };
  }

  private static hashValue(value: string): string {
    // Simple hash function - use a proper cryptographic hash in production
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `hash_${Math.abs(hash).toString(36)}`;
  }

  private static logComplianceEvent(standard: string, event: any): void {
    // Log to compliance system
    console.log(`[${standard}_AUDIT]`, {
      timestamp: event.timestamp,
      type: event.type,
      path: event.context.path,
      standard,
    });
  }
}

// Usage
logger.setOptions({
  redaction: ComplianceRedactor.createGDPRConfig(),
});

// Or combine multiple compliance standards
const combinedConfig: RedactionConfig = {
  ...ComplianceRedactor.createGDPRConfig(),
  ...ComplianceRedactor.createPCIConfig(),
  keys: [
    ...ComplianceRedactor.createGDPRConfig().keys!,
    ...ComplianceRedactor.createPCIConfig().keys!,
  ],
};
```

---

## Plugin Architecture

### Plugin Interface

```typescript
interface JellyLoggerPlugin {
  name: string;
  version: string;
  install(logger: JellyLogger): void;
  uninstall?(logger: JellyLogger): void;
}

class PluginManager {
  private plugins: Map<string, JellyLoggerPlugin> = new Map();

  install(plugin: JellyLoggerPlugin, logger: JellyLogger): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already installed`);
    }

    plugin.install(logger);
    this.plugins.set(plugin.name, plugin);
    console.log(`Installed plugin: ${plugin.name} v${plugin.version}`);
  }

  uninstall(name: string, logger: JellyLogger): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not installed`);
    }

    if (plugin.uninstall) {
      plugin.uninstall(logger);
    }

    this.plugins.delete(name);
    console.log(`Uninstalled plugin: ${name}`);
  }

  list(): JellyLoggerPlugin[] {
    return Array.from(this.plugins.values());
  }
}

const pluginManager = new PluginManager();
```

### Performance Monitoring Plugin

```typescript
class PerformancePlugin implements JellyLoggerPlugin {
  name = 'performance-monitor';
  version = '1.0.0';

  private originalLog?: Function;
  private metrics = {
    totalLogs: 0,
    avgProcessingTime: 0,
    errorCount: 0,
  };

  install(logger: JellyLogger): void {
    // Wrap the log method to add performance monitoring
    this.originalLog = (logger as any).log;

    (logger as any).log = this.createWrapper((logger as any).log.bind(logger));

    // Add metrics endpoint
    (logger as any).getMetrics = () => this.metrics;

    // Start periodic reporting
    setInterval(() => this.reportMetrics(), 60000); // Every minute
  }

  uninstall(logger: JellyLogger): void {
    if (this.originalLog) {
      (logger as any).log = this.originalLog;
    }
    delete (logger as any).getMetrics;
  }

  private createWrapper(originalLog: Function) {
    return (...args: any[]) => {
      const start = performance.now();

      try {
        const result = originalLog(...args);

        // Update metrics
        const duration = performance.now() - start;
        this.updateMetrics(duration, false);

        return result;
      } catch (error) {
        this.updateMetrics(performance.now() - start, true);
        throw error;
      }
    };
  }

  private updateMetrics(duration: number, isError: boolean): void {
    this.metrics.totalLogs++;
    this.metrics.avgProcessingTime = (this.metrics.avgProcessingTime + duration) / 2;

    if (isError) {
      this.metrics.errorCount++;
    }
  }

  private reportMetrics(): void {
    console.log('[PERFORMANCE]', this.metrics);
  }
}

// Usage
pluginManager.install(new PerformancePlugin(), logger);
```

### Request Correlation Plugin

```typescript
class CorrelationPlugin implements JellyLoggerPlugin {
  name = 'request-correlation';
  version = '1.0.0';

  private storage = new AsyncLocalStorage<{ correlationId: string }>();

  install(logger: JellyLogger): void {
    // Override child logger creation to include correlation ID
    const originalChild = logger.child.bind(logger);

    logger.child = (options = {}) => {
      const context = this.storage.getStore();
      if (context) {
        options.context = {
          ...options.context,
          correlationId: context.correlationId,
        };
      }
      return originalChild(options);
    };

    // Add correlation methods
    (logger as any).withCorrelation = (correlationId: string, fn: Function) => {
      return this.storage.run({ correlationId }, fn);
    };

    (logger as any).setCorrelationId = (correlationId: string) => {
      // For manual correlation setting
      return this.storage.run({ correlationId }, () => {});
    };
  }

  uninstall(logger: JellyLogger): void {
    // Restore original child method
    delete (logger as any).withCorrelation;
    delete (logger as any).setCorrelationId;
  }
}

// Usage
pluginManager.install(new CorrelationPlugin(), logger);

// In your request handler
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || generateUUID();

  (logger as any).withCorrelation(correlationId, () => {
    // All logs within this scope will include the correlation ID
    logger.info('Request started', { method: req.method, url: req.url });
    next();
  });
});
```

---

## Integration Examples

### Express.js Middleware

```typescript
import express from 'express';
import { logger } from 'jellylogger';

function createLoggingMiddleware() {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || generateUUID();

    // Create request-specific logger
    const requestLogger = logger.child({
      context: {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
    });

    // Add logger to request object
    (req as any).logger = requestLogger;

    // Log request start
    requestLogger.info('Request started');

    // Capture response details
    const originalSend = res.send;
    res.send = function (body) {
      const duration = Date.now() - start;

      requestLogger.info('Request completed', {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: body ? body.length : 0,
      });

      return originalSend.call(this, body);
    };

    next();
  };
}

// Usage
const app = express();
app.use(createLoggingMiddleware());

app.get('/api/users', (req, res) => {
  const logger = (req as any).logger;
  logger.info('Fetching users');

  try {
    // Your logic here
    logger.info('Users fetched successfully', { count: users.length });
    res.json(users);
  } catch (error) {
    logger.error('Failed to fetch users', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
```

### Database Query Logger

```typescript
class DatabaseLogger {
  private queryLogger = logger.child({ messagePrefix: 'DB' });

  logQuery(sql: string, params?: any[], duration?: number) {
    this.queryLogger.debug('SQL Query', {
      sql: this.sanitizeSQL(sql),
      paramCount: params?.length || 0,
      duration: duration ? `${duration}ms` : undefined,
    });
  }

  logSlowQuery(sql: string, params?: any[], duration: number) {
    this.queryLogger.warn('Slow Query Detected', {
      sql: this.sanitizeSQL(sql),
      paramCount: params?.length || 0,
      duration: `${duration}ms`,
      threshold: '1000ms',
    });
  }

  logQueryError(sql: string, error: Error, params?: any[]) {
    this.queryLogger.error('Query Failed', {
      sql: this.sanitizeSQL(sql),
      error: error.message,
      paramCount: params?.length || 0,
    });
  }

  private sanitizeSQL(sql: string): string {
    // Remove sensitive data from SQL for logging
    return sql
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'");
  }
}

// Usage with an ORM
const dbLogger = new DatabaseLogger();

// Wrap database operations
function executeQuery(sql: string, params?: any[]) {
  const start = Date.now();

  dbLogger.logQuery(sql, params);

  try {
    const result = database.execute(sql, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      dbLogger.logSlowQuery(sql, params, duration);
    }

    return result;
  } catch (error) {
    dbLogger.logQueryError(sql, error, params);
    throw error;
  }
}
```

---

## Testing Custom Extensions

### Testing Custom Transports

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { MemoryTransport } from '../test/test-utils';

describe('CustomTransport', () => {
  let transport: CustomTransport;
  let memoryBackend: MemoryTransport;

  beforeEach(() => {
    memoryBackend = new MemoryTransport();
    transport = new CustomTransport(memoryBackend);
  });

  it('should log entries correctly', async () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Test message',
      args: { processedArgs: [], hasComplexArgs: false },
    };

    await transport.log(entry);

    expect(memoryBackend.logs).toHaveLength(1);
    expect(memoryBackend.logs[0].message).toBe('Test message');
  });

  it('should handle errors gracefully', async () => {
    const faultyTransport = new CustomTransport(null); // Invalid backend

    // Should not throw
    await expect(faultyTransport.log(entry)).resolves.toBeUndefined();
  });

  it('should apply redaction', async () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'User login',
      args: { processedArgs: [], hasComplexArgs: false },
      data: { password: 'secret123' },
    };

    const options: TransportOptions = {
      redaction: {
        keys: ['password'],
      },
    };

    await transport.log(entry, options);

    expect(memoryBackend.logs[0].data.password).toBe('[REDACTED]');
  });
});
```

### Testing Custom Formatters

```typescript
describe('CustomFormatter', () => {
  let formatter: CustomFormatter;

  beforeEach(() => {
    formatter = new CustomFormatter();
  });

  it('should format log entries correctly', () => {
    const entry: LogEntry = {
      timestamp: '2023-12-07T15:30:45.123Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Test message',
      args: { processedArgs: ['arg1', 'arg2'], hasComplexArgs: false },
      data: { userId: 123, action: 'login' },
    };

    const result = formatter.format(entry);

    expect(result).toContain('Test message');
    expect(result).toContain('INFO');
    expect(result).toContain('2023-12-07T15:30:45.123Z');
  });

  it('should handle empty data', () => {
    const entry: LogEntry = {
      timestamp: '2023-12-07T15:30:45.123Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Test message',
      args: { processedArgs: [], hasComplexArgs: false },
    };

    const result = formatter.format(entry);

    expect(result).not.toContain('undefined');
    expect(result).not.toContain('null');
  });

  it('should apply colors when requested', () => {
    const entry: LogEntry = {
      timestamp: '2023-12-07T15:30:45.123Z',
      level: LogLevel.ERROR,
      levelName: 'ERROR',
      message: 'Error message',
      args: { processedArgs: [], hasComplexArgs: false },
    };

    const result = formatter.format(entry, {
      useColors: true,
      consoleColors: { [LogLevel.ERROR]: '\x1b[31m' },
    });

    expect(result).toContain('\x1b[31m'); // ANSI red color
  });
});
```

### Integration Testing

```typescript
describe('Extension Integration', () => {
  let testLogger: JellyLogger;
  let memoryTransport: MemoryTransport;

  beforeEach(() => {
    memoryTransport = new MemoryTransport();
    testLogger = new JellyLoggerImpl();
    testLogger.addTransport(memoryTransport);
  });

  it('should work with custom transport and formatter', async () => {
    const customFormatter = new JsonPrettyFormatter();
    const customTransport = new BufferedTransport(memoryTransport, {
      bufferSize: 2,
      flushInterval: 100,
    });

    testLogger.setOptions({
      pluggableFormatter: customFormatter,
    });
    testLogger.addTransport(customTransport);

    testLogger.info('Test message 1', { id: 1 });
    testLogger.info('Test message 2', { id: 2 });

    // Wait for buffer to flush
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(memoryTransport.logs).toHaveLength(2);

    // Check that custom formatter was used
    const loggedEntry = memoryTransport.logs[0];
    expect(loggedEntry.message).toBe('Test message 1');
  });

  it('should work with custom redaction', async () => {
    const customRedactor = new HealthcareRedactor();

    testLogger.setOptions({
      redaction: customRedactor.createConfig(),
    });

    testLogger.info('Patient data', {
      patient: {
        name: 'John Doe',
        ssn: '123-45-6789',
      },
    });

    const loggedEntry = memoryTransport.logs[0];
    expect(loggedEntry.data.patient.name).toBe('John [REDACTED]');
    expect(loggedEntry.data.patient.ssn).toBe('[REDACTED]');
  });
});
```

---

## Best Practices

### 1. Error Handling

```typescript
// Always handle errors gracefully in transports
class RobustTransport implements Transport {
  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      await this.performLogging(entry, options);
    } catch (error) {
      // Log the error but don't re-throw
      console.error(`${this.constructor.name} error:`, error);

      // Optionally, report to error tracking service
      this.reportError(error, entry);
    }
  }

  private reportError(error: Error, entry: LogEntry): void {
    // Report to error tracking service without causing additional errors
    try {
      // Error reporting logic
    } catch {
      // Silently fail
    }
  }
}
```

### 2. Performance Optimization

```typescript
// Use batching for expensive operations
class BatchedTransport implements Transport {
  private batchSize = 100;
  private batch: LogEntry[] = [];
  private flushPromise: Promise<void> | null = null;

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    this.batch.push(entry);

    if (this.batch.length >= this.batchSize) {
      return this.flushBatch(options);
    }
  }

  private async flushBatch(options?: TransportOptions): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this.processBatch(options);
    await this.flushPromise;
    this.flushPromise = null;
  }

  private async processBatch(options?: TransportOptions): Promise<void> {
    const entries = this.batch.splice(0);
    if (entries.length === 0) return;

    try {
      await this.sendBatch(entries, options);
    } catch (error) {
      console.error('Batch processing failed:', error);
    }
  }
}
```

### 3. Configuration Validation

```typescript
// Validate configuration in constructors
class ConfiguredTransport implements Transport {
  constructor(private config: TransportConfig) {
    this.validateConfig(config);
  }

  private validateConfig(config: TransportConfig): void {
    if (!config.endpoint) {
      throw new Error('endpoint is required');
    }

    if (config.timeout && config.timeout < 0) {
      throw new Error('timeout must be positive');
    }

    if (config.retries && config.retries < 0) {
      throw new Error('retries must be non-negative');
    }
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Implementation
  }
}
```

### 4. Resource Cleanup

```typescript
// Implement proper cleanup in flush method
class ResourceTransport implements Transport {
  private connection: Connection | null = null;
  private timer: Timer | null = null;

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    await this.ensureConnection();
    await this.sendToConnection(entry, options);
  }

  async flush(): Promise<void> {
    // Clear any timers
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Flush and close connections
    if (this.connection) {
      await this.connection.flush();
      await this.connection.close();
      this.connection = null;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (!this.connection) {
      this.connection = await this.createConnection();
    }
  }
}
```

### 5. Documentation and Types

````typescript
/**
 * Custom transport for sending logs to external monitoring service.
 *
 * Features:
 * - Automatic retries with exponential backoff
 * - Rate limiting to respect service limits
 * - Batch processing for efficiency
 *
 * @example
 * ```typescript
 * const transport = new MonitoringTransport({
 *   apiKey: process.env.MONITORING_API_KEY,
 *   endpoint: 'https://api.monitoring.com/logs',
 *   batchSize: 50,
 *   retries: 3
 * });
 *
 * logger.addTransport(transport);
 * ```
 */
class MonitoringTransport implements Transport {
  constructor(private config: MonitoringConfig) {}

  /**
   * Sends log entry to monitoring service.
   * Automatically batches entries and applies rate limiting.
   */
  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Implementation
  }

  /**
   * Flushes all pending logs and closes connections.
   * Should be called before application shutdown.
   */
  async flush(): Promise<void> {
    // Implementation
  }
}

interface MonitoringConfig {
  /** API key for authentication */
  apiKey: string;
  /** Service endpoint URL */
  endpoint: string;
  /** Number of entries to batch together (default: 25) */
  batchSize?: number;
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Request timeout in milliseconds (default: 5000) */
  timeout?: number;
}
````

---

## Next Steps

- [Usage Guide](./usage.md) - Learn basic usage patterns
- [API Reference](./api.md) - Complete API documentation
- [Transports Guide](./transports.md) - Built-in transport documentation
- [Migration Guide](./migration.md) - Upgrading from other loggers
