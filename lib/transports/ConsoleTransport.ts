import { LogLevel } from '../core/constants';
import type {
  CustomConsoleColors,
  LogEntry,
  RedactionConfig,
  Transport,
  TransportOptions,
} from '../core/types';
import { DEFAULT_FORMATTER } from '../formatters';
import { getRedactedEntry } from '../redaction';
import { logInternalError } from '../utils/internalErrorHandler';
import { safeJsonStringify } from '../utils/serialization';

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
      (opts as { redaction?: unknown }).redaction as RedactionConfig | undefined,
      'console',
    );

    const consoleMethod =
      redactedEntry.level === LogLevel.ERROR || redactedEntry.level === LogLevel.FATAL
        ? console.error
        : redactedEntry.level === LogLevel.WARN
          ? console.warn
          : redactedEntry.level === LogLevel.DEBUG || redactedEntry.level === LogLevel.TRACE
            ? console.debug
            : console.info;

    // Use pluggable formatter if available
    if (opts.pluggableFormatter) {
      try {
        const formatted = opts.pluggableFormatter.format(redactedEntry, {
          consoleColors: opts.customConsoleColors as CustomConsoleColors,
          useColors: opts.format !== 'json',
        });
        consoleMethod(formatted);
        return Promise.resolve();
      } catch (error) {
        logInternalError(
          'Pluggable formatter failed, falling back to default:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Use legacy custom formatter if available
    if (opts.formatter) {
      try {
        const formatted = opts.formatter(redactedEntry);
        const output = typeof formatted === 'string' ? formatted : JSON.stringify(formatted);
        consoleMethod(output);
        return Promise.resolve();
      } catch (error) {
        logInternalError(
          'Custom formatter failed, falling back to default:',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Handle JSON format with unified serialization
    if (opts.format === 'json') {
      const jsonOutput = safeJsonStringify(redactedEntry);
      consoleMethod(jsonOutput);
      return Promise.resolve();
    }

    // Use default formatter for standard output
    const formatted = DEFAULT_FORMATTER.format(redactedEntry, {
      consoleColors: opts.customConsoleColors as CustomConsoleColors,
      useColors: true,
    });

    consoleMethod(formatted);
    return Promise.resolve();
  }

  /**
   * Console transport doesn't need to flush anything.
   */
  flush(_options?: TransportOptions): Promise<void> {
    return Promise.resolve();
  }
}
