import { toAnsiColor } from '../utils/colors';
import { getRedactedEntry } from '../redaction';
import { LogLevel } from '../core/constants';
import type { LogEntry, TransportOptions, Transport } from '../core/types';

/**
 * ANSI color codes for console output with fallbacks.
 */
const consoleColors: { [key in LogLevel]?: string } & { reset: string; bold: string; dim: string } = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  [LogLevel.FATAL]: toAnsiColor("#FF0000", "\x1b[91m"), // Bright Red fallback
  [LogLevel.ERROR]: toAnsiColor("#FF4500", "\x1b[31m"), // Red fallback
  [LogLevel.WARN]: toAnsiColor("#FFD700", "\x1b[33m"),  // Yellow fallback
  [LogLevel.INFO]: toAnsiColor("#32CD32", "\x1b[32m"),   // Green fallback
  [LogLevel.DEBUG]: toAnsiColor("#1E90FF", "\x1b[34m"), // Blue fallback
  [LogLevel.TRACE]: toAnsiColor("#9370DB", "\x1b[35m"), // Magenta fallback
};

/**
 * ConsoleTransport writes log entries to the console with colorized output.
 */
export class ConsoleTransport implements Transport {
  /**
   * Logs an entry to the console.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Ensure options is always an object for safe property access
    const opts: TransportOptions = options ?? {};

    // Apply redaction specifically for console output
    const redactedEntry = getRedactedEntry(
      entry,
      (opts as { redaction?: unknown }).redaction as import('../core/types').RedactionConfig | undefined,
      'console'
    );

    const consoleMethod =
      redactedEntry.level === LogLevel.ERROR || redactedEntry.level === LogLevel.FATAL ? console.error :
      redactedEntry.level === LogLevel.WARN ? console.warn :
      redactedEntry.level === LogLevel.DEBUG || redactedEntry.level === LogLevel.TRACE ? console.debug :
      console.info;

    if (opts.pluggableFormatter) {
      try {
        const formatted = opts.pluggableFormatter.format(redactedEntry);
        consoleMethod(formatted);
        return Promise.resolve();
      } catch (error) {
        console.error('Pluggable formatter failed, falling back to default:', error instanceof Error ? error.message : String(error));
      }
    }

    if (opts.formatter) {
      try {
        const formatted = opts.formatter(redactedEntry);
        const output = typeof formatted === 'string' ? formatted : JSON.stringify(formatted);
        consoleMethod(output);
        return Promise.resolve();
      } catch (error) {
        // Fallback to default formatting if custom formatter fails
        console.error('Custom formatter failed, falling back to default:', error instanceof Error ? error.message : String(error));
        // Continue with default formatting below
      }
    }

    if (opts.format === 'json') {
      // Safe JSON stringification with circular reference handling
      try {
        consoleMethod(JSON.stringify(redactedEntry));
      } catch (e) {
        try {
          // More robust fallback for circular references
          consoleMethod(JSON.stringify({
            ...redactedEntry,
            args: redactedEntry.args.map((arg: unknown) => {
              if (typeof arg === 'object' && arg !== null) {
                try {
                  JSON.stringify(arg);
                  return arg;
                } catch {
                  return '[Object - Circular or Non-serializable]';
                }
              }
              return arg;
            })
          }));
        } catch {
          // Final fallback
          consoleMethod(JSON.stringify({
            timestamp: redactedEntry.timestamp,
            level: redactedEntry.level,
            levelName: redactedEntry.levelName,
            message: redactedEntry.message,
            args: '[Args - Processing Error]',
            data: '[Data - Processing Error]'
          }));
        }
      }
      return Promise.resolve();
    }

    // Merge and resolve colors with fallbacks
    const mergedColorsInput = { ...consoleColors, ...(opts.customConsoleColors || {}) };

    const currentColors: {
      reset: string;
      bold: string;
      dim: string;
      [key: number]: string | undefined;
    } = {
      reset: toAnsiColor(mergedColorsInput.reset, consoleColors.reset),
      bold: toAnsiColor(mergedColorsInput.bold, consoleColors.bold),
      dim: toAnsiColor(mergedColorsInput.dim, consoleColors.dim),
    };

    // Populate log level colors with fallbacks
    for (const keyStr in mergedColorsInput) {
      if (keyStr === "reset" || keyStr === "bold" || keyStr === "dim") {
        continue;
      }

      const numericKey = Number(keyStr);
      if (!isNaN(numericKey) && LogLevel[numericKey] !== undefined) {
        const colorValue = (mergedColorsInput as Record<string, string | undefined>)[keyStr];
        const fallback = consoleColors[numericKey as LogLevel] || "";
        currentColors[numericKey] = toAnsiColor(colorValue, fallback);
      }
    }

    const color = currentColors[redactedEntry.level] || "";
    const levelString = (LogLevel[redactedEntry.level] || 'UNKNOWN').padEnd(5);
    
    // Build the log string parts
    const timestampPart = `${currentColors.dim}[${redactedEntry.timestamp}]${currentColors.reset}`;
    const levelPart = `${currentColors.bold}${color}${levelString}:${currentColors.reset}`;
    const messagePart = redactedEntry.message;
    
    // Handle structured data display
    let dataDisplay = '';
    if (redactedEntry.data && Object.keys(redactedEntry.data).length > 0) {
      try {
        dataDisplay = ' ' + JSON.stringify(redactedEntry.data);
      } catch {
        dataDisplay = ' [Data - Circular or Non-serializable]';
      }
    }
    
    // Build args display
    let argsDisplay = '';
    if (redactedEntry.args.length > 0) {
      const safeArgs = redactedEntry.args.map((arg: unknown) => {
        if (arg === null || arg === undefined) {
          return arg;
        }
        
        if (typeof arg === 'object') {
          try {
            // Test if the object can be JSON.stringify'd
            JSON.stringify(arg);
            return arg;
          } catch {
            // If not, convert to string representation
            if (arg instanceof Error) {
              return `Error: ${arg.message}`;
            }
            if (Array.isArray(arg)) {
              return `[Array(${arg.length})]`;
            }
            return `[Object: ${Object.prototype.toString.call(arg)}]`;
          }
        }
        
        return arg;
      });

      // Format args for display
      if (safeArgs.length > 0) {
        argsDisplay = ' ' + safeArgs.map(arg => {
          if (typeof arg === 'string') {
            return arg;
          } else if (typeof arg === 'object' && arg !== null) {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          } else {
            return String(arg);
          }
        }).join(' ');
      }
    }

    const logString = `${timestampPart} ${levelPart} ${messagePart}${dataDisplay}${argsDisplay}`;
    consoleMethod(logString);
    return Promise.resolve();
  }

  /**
   * Console transport doesn't need to flush anything.
   */
  flush(_options?: TransportOptions): Promise<void> {
    // No-op for console
    return Promise.resolve();
  }
}