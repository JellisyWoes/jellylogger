# JellyLogger Formatters

JellyLogger provides a flexible formatting system that allows you to control how log entries are serialized for output. This document covers built-in formatters, how to use them, and how to create custom formatters.

## Table of Contents

- [Overview](#overview)
- [Built-in Formatters](#built-in-formatters)
- [Using Formatters](#using-formatters)
- [Custom Formatters](#custom-formatters)
- [Formatter vs Format Option](#formatter-vs-format-option)
- [Best Practices](#best-practices)

## Overview

Formatters in JellyLogger are responsible for converting `LogEntry` objects into string representations. The library provides three ways to format logs:

1. **Built-in string/JSON formatting** - Simple format controlled by the `format` option
2. **Custom formatter functions** - Inline functions for simple custom formatting  
3. **Pluggable formatters** - Classes implementing the `LogFormatter` interface

## Built-in Formatters

### LogfmtFormatter

The `LogfmtFormatter` outputs logs in the logfmt format, which uses key=value pairs separated by spaces. This format is popular with tools like Heroku and is easily parseable.

```typescript
import { logger, LogfmtFormatter } from 'jellylogger';

logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

logger.info({ userId: 123, action: 'login' }, 'User logged in');
// Output: ts=2024-01-15T10:30:00.000Z level=info msg="User logged in" userId="123" action="login"
```

**Logfmt Format Features:**
- Automatic quote escaping for string values
- Timestamp as `ts` field
- Log level as `level` field  
- Message as `msg` field
- Structured data as additional key=value pairs
- Arguments as `arg0`, `arg1`, etc.

### NdjsonFormatter

The `NdjsonFormatter` outputs logs as newline-delimited JSON (NDJSON), where each log entry is a complete JSON object on its own line.

```typescript
import { logger, NdjsonFormatter } from 'jellylogger';

logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});

logger.info({ userId: 123, action: 'login' }, 'User logged in');
// Output: {"timestamp":"2024-01-15T10:30:00.000Z","level":"info","message":"User logged in","userId":123,"action":"login"}
```

**NDJSON Format Features:**
- Each log entry is valid JSON
- Easy to parse programmatically
- Compatible with log aggregation tools
- Preserves data types (numbers, booleans, etc.)
- Arguments included as `args` array when present

## Using Formatters

### Pluggable Formatters

Use the `pluggableFormatter` option to set a formatter class:

```typescript
import { logger, LogfmtFormatter, NdjsonFormatter } from 'jellylogger';

// Use logfmt formatting
logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});

// Switch to NDJSON formatting
logger.setOptions({
  pluggableFormatter: new NdjsonFormatter()
});

// Remove formatter (back to default)
logger.setOptions({
  pluggableFormatter: undefined
});
```

### Custom Formatter Functions

For simple custom formatting, use the `formatter` option with a function:

```typescript
logger.setOptions({
  formatter: (entry) => {
    return `${entry.timestamp} [${entry.levelName.toUpperCase()}] ${entry.message}`;
  }
});

logger.info('Hello world');
// Output: 2024-01-15T10:30:00.000Z [INFO] Hello world
```

### Per-Transport Formatting

Different transports can use different formatting by checking the options in custom formatters:

```typescript
import { FileTransport, ConsoleTransport } from 'jellylogger';

logger.setOptions({
  transports: [
    new ConsoleTransport(),
    new FileTransport('./logs/app.log')
  ],
  pluggableFormatter: new class implements LogFormatter {
    format(entry: LogEntry): string {
      // Could check transport context if needed
      return `${entry.timestamp} ${entry.levelName}: ${entry.message}`;
    }
  }
});
```

## Custom Formatters

### LogFormatter Interface

Create custom formatters by implementing the `LogFormatter` interface:

```typescript
import { LogFormatter, LogEntry } from 'jellylogger';

class CustomFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    // Your custom formatting logic here
    return `CUSTOM: ${entry.message}`;
  }
}
```

### Complete Custom Formatter Example

```typescript
import { LogFormatter, LogEntry, LogLevel } from 'jellylogger';

class DetailedFormatter implements LogFormatter {
  private readonly colors = {
    [LogLevel.FATAL]: '\x1b[41m',   // Red background
    [LogLevel.ERROR]: '\x1b[31m',   // Red text
    [LogLevel.WARN]: '\x1b[33m',    // Yellow text
    [LogLevel.INFO]: '\x1b[32m',    // Green text
    [LogLevel.DEBUG]: '\x1b[36m',   // Cyan text
    [LogLevel.TRACE]: '\x1b[35m',   // Magenta text
  };

  format(entry: LogEntry): string {
    const color = this.colors[entry.level] || '';
    const reset = '\x1b[0m';
    const timestamp = new Date(entry.timestamp).toLocaleString();
    
    let output = `${color}[${timestamp}] ${entry.levelName}:${reset} ${entry.message}`;
    
    // Add structured data
    if (entry.data) {
      const dataStr = Object.entries(entry.data)
        .map(([key, value]) => `${key}=${this.formatValue(value)}`)
        .join(' ');
      output += ` | ${dataStr}`;
    }
    
    // Add arguments
    if (entry.args.length > 0) {
      const argsStr = entry.args
        .map(arg => this.formatValue(arg))
        .join(' ');
      output += ` | args: ${argsStr}`;
    }
    
    return output;
  }
  
  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    if (typeof value === 'object' && value !== null) {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }
    return String(value);
  }
}

// Use the custom formatter
logger.setOptions({
  pluggableFormatter: new DetailedFormatter()
});
```

### Conditional Formatting

Create formatters that adapt based on the log entry:

```typescript
class ConditionalFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    // Different format for errors
    if (entry.level <= LogLevel.ERROR) {
      return this.formatError(entry);
    }
    
    // Different format for structured data
    if (entry.data && Object.keys(entry.data).length > 0) {
      return this.formatStructured(entry);
    }
    
    // Simple format for basic logs
    return this.formatSimple(entry);
  }
  
  private formatError(entry: LogEntry): string {
    return `🚨 ERROR [${entry.timestamp}]: ${entry.message}\n` +
           `Details: ${JSON.stringify(entry.data || {}, null, 2)}`;
  }
  
  private formatStructured(entry: LogEntry): string {
    return `📊 [${entry.timestamp}] ${entry.levelName}: ${entry.message}\n` +
           `Data: ${JSON.stringify(entry.data, null, 2)}`;
  }
  
  private formatSimple(entry: LogEntry): string {
    return `[${entry.timestamp}] ${entry.message}`;
  }
}
```

### Template-Based Formatter

Create a formatter that uses templates:

```typescript
class TemplateFormatter implements LogFormatter {
  constructor(private template: string = '{{timestamp}} [{{level}}] {{message}}') {}
  
  format(entry: LogEntry): string {
    let output = this.template;
    
    // Replace template variables
    output = output.replace('{{timestamp}}', entry.timestamp);
    output = output.replace('{{level}}', entry.levelName);
    output = output.replace('{{message}}', entry.message);
    
    // Add data if present
    if (entry.data) {
      const dataStr = JSON.stringify(entry.data);
      output += ` ${dataStr}`;
    }
    
    return output;
  }
}

// Usage
logger.setOptions({
  pluggableFormatter: new TemplateFormatter('🕐 {{timestamp}} | {{level}} | {{message}}')
});
```

## Formatter vs Format Option

Understanding the difference between formatters:

```typescript
// 1. Built-in format option (simple)
logger.setOptions({
  format: 'json' // or 'string'
});

// 2. Custom formatter function (medium complexity)
logger.setOptions({
  formatter: (entry) => `${entry.timestamp}: ${entry.message}`
});

// 3. Pluggable formatter class (full control)
logger.setOptions({
  pluggableFormatter: new LogfmtFormatter()
});
```

**Priority order:**
1. `pluggableFormatter` (highest priority)
2. `formatter` function
3. `format` option (lowest priority)

## Best Practices

### Performance Considerations

```typescript
class EfficientFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    // Avoid expensive operations in hot paths
    // Pre-compute static strings
    // Use string concatenation for simple cases
    
    if (entry.level <= LogLevel.ERROR) {
      // Only do expensive formatting for errors
      return this.expensiveFormat(entry);
    }
    
    // Fast path for common cases
    return `${entry.timestamp} ${entry.message}`;
  }
}
```

### Consistent Formatting

```typescript
class ConsistentFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    // Always include these fields in the same order
    const base = `${entry.timestamp} [${entry.levelName.padEnd(5)}] ${entry.message}`;
    
    // Consistent handling of optional data
    if (entry.data) {
      return `${base} ${JSON.stringify(entry.data)}`;
    }
    
    return base;
  }
}
```

### Error Handling

```typescript
class SafeFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    try {
      return this.doFormat(entry);
    } catch (error) {
      // Fallback formatting if custom logic fails
      return `${entry.timestamp} [${entry.levelName}] ${entry.message} [FORMATTER_ERROR: ${error}]`;
    }
  }
  
  private doFormat(entry: LogEntry): string {
    // Your custom formatting logic
    return `${entry.timestamp}: ${entry.message}`;
  }
}
```

### Environment-Specific Formatters

```typescript
const isProduction = process.env.NODE_ENV === 'production';

logger.setOptions({
  pluggableFormatter: isProduction 
    ? new NdjsonFormatter()  // Machine-readable for production
    : new class implements LogFormatter {  // Human-readable for development
        format(entry: LogEntry): string {
          return `🐛 [${entry.levelName}] ${entry.message}`;
        }
      }
});
```
