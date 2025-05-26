import { ConsoleTransport, LogLevel, type LoggerOptions } from './transports/ConsoleTransport';
import { DiscordWebhookTransport } from './transports/DiscordWebhookTransport';
import { getTimestamp, processLogArgs } from './features/helpers';
import { isRecord, isErrorLike } from './features/typeGuards';
import type { LogEntry } from './features/redaction';

/**
 * Options for creating a child logger.
 */
export interface ChildLoggerOptions {
  /** Prefix to add to all log messages from this child logger */
  messagePrefix?: string;
  /** Contextual data to include with every log entry from this child logger */
  defaultData?: Record<string, unknown>;
}

/**
 * Base interface for logger methods.
 */
export interface BaseLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
}

/**
 * ChildLogger class to create loggers with inherited configuration and specific context.
 */
export class ChildLogger implements BaseLogger {
  private parent: BaseLogger;
  private options: ChildLoggerOptions;

  constructor(parent: BaseLogger, options: ChildLoggerOptions = {}) {
    this.parent = parent;
    this.options = options;
  }

  /**
   * Applies child logger transformations to a message and arguments.
   */
  private transformLogCall(message: string, ...args: unknown[]): [string, ...unknown[]] {
    // Apply message prefix if configured
    let transformedMessage = message;
    if (this.options.messagePrefix) {
      transformedMessage = `${this.options.messagePrefix} ${message}`;
    }

    // If we have defaultData, we need to inject it into the arguments
    if (this.options.defaultData) {
      // Find if there's already a data object in the args that we can merge with
      let hasDataObject = false;
      const transformedArgs = args.map(arg => {
        if (isRecord(arg) && !isErrorLike(arg) && !hasDataObject) {
          hasDataObject = true;
          // Merge defaultData with existing data object (existing data takes precedence)
          return { ...this.options.defaultData, ...arg };
        }
        return arg;
      });

      // If no data object was found, add defaultData as a new argument
      if (!hasDataObject) {
        transformedArgs.unshift(this.options.defaultData);
      }

      return [transformedMessage, ...transformedArgs];
    }

    return [transformedMessage, ...args];
  }

  /**
   * Logs an entry at the FATAL level.
   * @param message - The log message
   * @param args - Additional arguments for the log entry
   */
  fatal(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.fatal(transformedMessage, ...transformedArgs);
  }

  /**
   * Logs an entry at the ERROR level.
   * @param message - The log message
   * @param args - Additional arguments for the log entry
   */
  error(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.error(transformedMessage, ...transformedArgs);
  }

  /**
   * Logs an entry at the WARN level.
   * @param message - The log message
   * @param args - Additional arguments for the log entry
   */
  warn(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.warn(transformedMessage, ...transformedArgs);
  }

  /**
   * Logs an entry at the INFO level.
   * @param message - The log message
   * @param args - Additional arguments for the log entry
   */
  info(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.info(transformedMessage, ...transformedArgs);
  }

  /**
   * Logs an entry at the DEBUG level.
   * @param message - The log message
   * @param args - Additional arguments for the log entry
   */
  debug(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.debug(transformedMessage, ...transformedArgs);
  }

  /**
   * Logs an entry at the TRACE level.
   * @param message - The log message
   * @param args - Additional arguments for the log entry
   */
  trace(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.trace(transformedMessage, ...transformedArgs);
  }

  /**
   * Creates a child logger with inherited configuration and optional context.
   * @param childOptions - Options for the child logger
   * @returns A new child logger instance
   */
  child(childOptions: ChildLoggerOptions = {}): ChildLogger {
    // Merge parent and child options
    const mergedOptions: ChildLoggerOptions = {};

    // Merge message prefixes
    if (this.options.messagePrefix || childOptions.messagePrefix) {
      const parentPrefix = this.options.messagePrefix || '';
      const childPrefix = childOptions.messagePrefix || '';
      mergedOptions.messagePrefix = parentPrefix && childPrefix 
        ? `${parentPrefix} ${childPrefix}`
        : parentPrefix || childPrefix;
    }

    // Merge defaultData (child overrides parent for same keys)
    if (this.options.defaultData || childOptions.defaultData) {
      mergedOptions.defaultData = {
        ...(this.options.defaultData || {}),
        ...(childOptions.defaultData || {})
      };
    }

    return new ChildLogger(this.parent, mergedOptions);
  }
}

// Define defaultOptions for logger
export const defaultOptions: LoggerOptions = {
  level: LogLevel.INFO,
  useHumanReadableTime: false,
  transports: [new ConsoleTransport()],
  format: 'string',
  customConsoleColors: {},
};

// Singleton Discord transport instance
let globalDiscordTransport: DiscordWebhookTransport | null = null;

export const logger: BaseLogger & {
  options: LoggerOptions;
  setOptions(newOptions: LoggerOptions): void;
  resetOptions(): void;
  _log(level: LogLevel, message: string, ...args: unknown[]): void;
  _logWithData(level: LogLevel, message: string, data?: Record<string, unknown>, ...args: unknown[]): void;
  flushAll(): Promise<void>;
} = {
  options: { ...defaultOptions },

  /**
   * Updates logger configuration by merging with existing options.
   * @param newOptions - New options to merge
   */
  setOptions(newOptions: LoggerOptions): void {
    this.options = { ...this.options, ...newOptions };
    // Ensure customConsoleColors is merged properly if provided partially
    if (newOptions.customConsoleColors) {
      this.options.customConsoleColors = {
        ...(this.options.customConsoleColors || {}),
        ...newOptions.customConsoleColors,
      };
    }
    // Merge redaction config
    if (newOptions.redaction) {
      this.options.redaction = {
        ...(this.options.redaction || {}),
        ...newOptions.redaction,
      };
    }
  },

  /**
   * Resets logger options to defaults.
   */
  resetOptions(): void {
    this.options = { ...defaultOptions };
  },

  /**
   * Internal logging method for backward compatibility.
   * @param level - Log level
   * @param message - Log message
   * @param args - Additional arguments
   */
  _log(level: LogLevel, message: string, ...args: unknown[]): void {
    this._logWithData(level, message, undefined, ...args);
  },

  /**
   * Internal logging method with structured data support and improved type safety.
   */
  _logWithData(level: LogLevel, message: string, data?: Record<string, unknown>, ...args: unknown[]): void {
    const effectiveLevel = this.options.level ?? LogLevel.INFO;
    if (level > effectiveLevel || effectiveLevel === LogLevel.SILENT) {
      return;
    }

    // Filter out undefined and null arguments before processing
    const nonNullArgs = args.filter(arg => arg !== undefined && arg !== null);
    
    // Extract structured data from arguments and filter out non-data args
    let extractedData: Record<string, unknown> | undefined = data;
    const filteredArgs: unknown[] = [];
    
    for (const arg of nonNullArgs) {
      if (isRecord(arg) && !isErrorLike(arg)) {
        // Merge with existing data if we have it
        if (extractedData) {
          extractedData = { ...extractedData, ...arg };
        } else {
          extractedData = arg;
        }
      } else {
        filteredArgs.push(arg);
      }
    }

    const processedArgs = processLogArgs(filteredArgs);

    // Check for discord flag and create clean data without it
    let shouldSendToDiscord = false;
    let cleanData = extractedData;
    if (extractedData && isRecord(extractedData) && 'discord' in extractedData) {
      shouldSendToDiscord = Boolean(extractedData.discord);
      const { discord, ...restData } = extractedData;
      cleanData = Object.keys(restData).length > 0 ? restData : undefined;
    }

    let entry: LogEntry = {
      timestamp: getTimestamp(this.options.useHumanReadableTime),
      level,
      levelName: LogLevel[level],
      message,
      args: processedArgs,
      data: cleanData,
    };

    // Send to regular transports (redaction is now handled per-transport)
    const transports = this.options.transports ?? [];
    for (const transport of transports) {
      try {
        const logPromise = Promise.resolve(transport.log(entry, this.options));
        logPromise.catch(error => {
          console.error(`Error in transport '${transport.constructor.name}':`, error);
        });
      } catch (error) {
        console.error(`Synchronous error in transport '${transport.constructor.name}':`, error);
      }
    }

    // Send to Discord using singleton transport if flag is set and webhook URL is configured
    if (shouldSendToDiscord && this.options.discordWebhookUrl) {
      try {
        const discordTransport = getDiscordTransport(this.options.discordWebhookUrl);
        const logPromise = Promise.resolve(discordTransport.log(entry, this.options));
        logPromise.catch(error => {
          console.error('Error in Discord transport:', error);
        });
      } catch (error) {
        console.error('Error creating Discord transport:', error);
      }
    }

    function getDiscordTransport(webhookUrl: string): DiscordWebhookTransport {
      if (!globalDiscordTransport || globalDiscordTransport['webhookUrl'] !== webhookUrl) {
        globalDiscordTransport = new DiscordWebhookTransport(webhookUrl);
      }
      return globalDiscordTransport;
    }
  },

  /**
   * Log a fatal error message.
   * @param message - The log message
   * @param args - Additional arguments, including optional structured data objects
   */
  fatal(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.FATAL, message, undefined, ...args);
  },

  /**
   * Log an error message.
   * @param message - The log message
   * @param args - Additional arguments, including optional structured data objects
   */
  error(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.ERROR, message, undefined, ...args);
  },

  /**
   * Log a warning message.
   * @param message - The log message
   * @param args - Additional arguments, including optional structured data objects
   */
  warn(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.WARN, message, undefined, ...args);
  },

  /**
   * Log an info message.
   * @param message - The log message
   * @param args - Additional arguments, including optional structured data objects
   */
  info(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.INFO, message, undefined, ...args);
  },

  /**
   * Log a debug message.
   * @param message - The log message
   * @param args - Additional arguments, including optional structured data objects
   */
  debug(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.DEBUG, message, undefined, ...args);
  },

  /**
   * Log a trace message.
   * @param message - The log message
   * @param args - Additional arguments, including optional structured data objects
   */
  trace(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.TRACE, message, undefined, ...args);
  },

  /**
   * Creates a child logger with inherited configuration and optional context.
   * @param childOptions - Options for the child logger
   * @returns A new child logger instance
   */
  child(childOptions: ChildLoggerOptions = {}): ChildLogger {
    return new ChildLogger(this, childOptions);
  },

  /**
   * Flushes all transports including singleton Discord transport.
   */
  async flushAll(): Promise<void> {
    const flushPromises = (this.options.transports ?? [])
      .map(async (transport) => {
        if (transport.flush) {
          try {
            await transport.flush(this.options);
          } catch (error) {
            console.error(`Error flushing transport '${transport.constructor.name}':`, error);
          }
        }
      });

    // Also flush singleton Discord transport if it exists
    if (globalDiscordTransport) {
      flushPromises.push(
        globalDiscordTransport.flush(this.options).catch(error => {
          console.error(`Error flushing Discord transport:`, error);
        })
      );
    }

    await Promise.all(flushPromises);
  },
};
