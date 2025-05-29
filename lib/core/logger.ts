import { LogLevel } from './constants';
import type { LoggerOptions, LogEntry, BaseLogger, ChildLoggerOptions, Transport, JellyLogger } from './types'; // Added JellyLogger
import { ConsoleTransport } from '../transports/ConsoleTransport';
import { DiscordWebhookTransport } from '../transports/DiscordWebhookTransport';
import { getTimestamp } from '../utils/time';
import { processLogArgs as processArgsUtil } from '../utils/serialization';
import { isRecord, isErrorLike } from '../utils/typeGuards';

/**
 * ChildLogger class to create loggers with inherited configuration and specific context.
 */
export class ChildLogger implements BaseLogger {
  private parent: BaseLogger;
  private options: ChildLoggerOptions;

  constructor(parent: BaseLogger, options: ChildLoggerOptions = {}) {
    this.parent = parent;
    this.options = options;
    // If context is provided, merge into defaultData for backward compatibility
    if (options.context) {
      this.options.defaultData = {
        ...(options.defaultData || {}),
        ...options.context
      };
    }
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
    if (this.options.defaultData && Object.keys(this.options.defaultData).length > 0) {
      // Find if there's already a data object in the args that we can merge with
      let hasDataObject = false;
      const transformedArgs = args.map(arg => {
        if (isRecord(arg) && !isErrorLike(arg) && !hasDataObject) {
          hasDataObject = true;
          // Merge defaultData with existing data object (existing data takes precedence)
          return { ...this.options.defaultData!, ...arg };
        }
        return arg;
      });

      // If no data object was found, add defaultData as a new argument
      if (!hasDataObject) {
        transformedArgs.unshift(this.options.defaultData);
      }

      return [transformedMessage, ...transformedArgs] as [string, ...unknown[]];
    }

    return [transformedMessage, ...args];
  }

  // ...existing logging methods...
  fatal(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.fatal(transformedMessage, ...transformedArgs);
  }

  error(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.error(transformedMessage, ...transformedArgs);
  }

  warn(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.warn(transformedMessage, ...transformedArgs);
  }

  info(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.info(transformedMessage, ...transformedArgs);
  }

  debug(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.debug(transformedMessage, ...transformedArgs);
  }

  trace(message: string, ...args: unknown[]): void {
    const [transformedMessage, ...transformedArgs] = this.transformLogCall(message, ...args);
    this.parent.trace(transformedMessage, ...transformedArgs);
  }

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

    // Merge defaultData/context (child overrides parent for same keys)
    const parentData = {
      ...(this.options.defaultData || {}),
      ...(this.options.context || {})
    };
    const childData = {
      ...(childOptions.defaultData || {}),
      ...(childOptions.context || {})
    };
    if (Object.keys(parentData).length > 0 || Object.keys(childData).length > 0) {
      mergedOptions.defaultData = { ...parentData, ...childData };
    }
    // Also propagate context property for compatibility
    if (childOptions.context) {
      mergedOptions.context = childOptions.context;
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

export const logger: JellyLogger = {
  options: { ...defaultOptions },

  setOptions(newOptions: LoggerOptions): void {
    this.options = { ...this.options, ...newOptions };
    if (newOptions.customConsoleColors) {
      this.options.customConsoleColors = {
        ...(this.options.customConsoleColors || {}),
        ...newOptions.customConsoleColors,
      };
    }
    if (newOptions.redaction) {
      this.options.redaction = {
        ...(this.options.redaction || {}),
        ...newOptions.redaction,
      };
    }
  },

  resetOptions(): void {
    this.options = { ...defaultOptions };
  },

  _log(level: LogLevel, message: string, ...args: unknown[]): void {
    this._logWithData(level, message, undefined, ...args);
  },

  _logWithData(level: LogLevel, message: string, data?: Record<string, unknown>, ...args: unknown[]): void {
    const effectiveLevel = this.options.level ?? LogLevel.INFO;
    if (level > effectiveLevel || effectiveLevel === LogLevel.SILENT) {
      return;
    }

    const nonNullArgs = args.filter(arg => arg !== undefined && arg !== null);
    
    let extractedData: Record<string, unknown> | undefined = data;
    const filteredArgs: unknown[] = [];
    
    for (const arg of nonNullArgs) {
      if (isRecord(arg) && !isErrorLike(arg)) {
        if (extractedData) {
          extractedData = { ...extractedData, ...arg };
        } else {
          extractedData = arg as Record<string, unknown>;
        }
      } else {
        filteredArgs.push(arg);
      }
    }

    const processedArgs = processArgsUtil(filteredArgs);

    let shouldSendToDiscord = false;
    let cleanData = extractedData;
    if (extractedData && isRecord(extractedData) && 'discord' in extractedData) {
      shouldSendToDiscord = Boolean(extractedData.discord);
      const { discord, ...restData } = extractedData;
      cleanData = Object.keys(restData).length > 0 ? restData as Record<string, unknown> : undefined;
    }

    let entry: LogEntry = {
      timestamp: getTimestamp(this.options.useHumanReadableTime),
      level,
      levelName: LogLevel[level],
      message,
      args: processedArgs,
      data: cleanData,
    };

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
      if (!globalDiscordTransport || (globalDiscordTransport as any)['webhookUrl'] !== webhookUrl) { // Type assertion for clarity
        globalDiscordTransport = new DiscordWebhookTransport(webhookUrl);
      }
      return globalDiscordTransport;
    }
  },

  fatal(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.FATAL, message, undefined, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.ERROR, message, undefined, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.WARN, message, undefined, ...args);
  },

  info(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.INFO, message, undefined, ...args);
  },

  debug(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.DEBUG, message, undefined, ...args);
  },

  trace(message: string, ...args: unknown[]): void {
    this._logWithData(LogLevel.TRACE, message, undefined, ...args);
  },

  child(childOptions: ChildLoggerOptions = {}): ChildLogger {
    return new ChildLogger(this, childOptions);
  },

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

    if (globalDiscordTransport) {
      flushPromises.push(
        globalDiscordTransport.flush(this.options).catch(error => {
          console.error(`Error flushing Discord transport:`, error);
        })
      );
    }

    await Promise.all(flushPromises);
  },

  addTransport(transport: Transport): void {
    if (!this.options.transports) {
      this.options.transports = [];
    }
    this.options.transports.push(transport);
  },

  removeTransport(transport: Transport): void {
    if (!this.options.transports) return;
    this.options.transports = this.options.transports.filter(t => t !== transport);
  },

  clearTransports(): void {
    this.options.transports = [];
  },

  setTransports(transports: Transport[]): void {
    this.options.transports = transports;
  },
};