import { LogLevel } from './constants';
import { ConsoleTransport } from '../transports/ConsoleTransport';
import { getTimestamp, processLogArgs } from '../utils/serialization';
import type { 
  BaseLogger, 
  ChildLoggerOptions, 
  LoggerOptions, 
  LogEntry, 
  TransportOptions 
} from './types';

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

  private createPrefixedMessage(message: string): string {
    const prefix = this.options.messagePrefix;
    if (!prefix) return message;
    return `${prefix} ${message}`;
  }

  private log(level: LogLevel, message: string, ...optionalParams: unknown[]): void {
    const prefixedMessage = this.createPrefixedMessage(message);
    (this.parent as any).log(level, prefixedMessage, ...optionalParams);
  }

  fatal(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.FATAL, message, ...optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.WARN, message, ...optionalParams);
  }

  info(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.INFO, message, ...optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...optionalParams);
  }

  trace(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.TRACE, message, ...optionalParams);
  }

  child(options: ChildLoggerOptions = {}): BaseLogger {
    const combinedPrefix = this.options.messagePrefix 
      ? (options.messagePrefix ? `${this.options.messagePrefix} ${options.messagePrefix}` : this.options.messagePrefix)
      : options.messagePrefix;
    
    return new ChildLogger(this.parent, {
      ...options,
      messagePrefix: combinedPrefix
    });
  }

  flushAll(): Promise<void> {
    return this.parent.flushAll();
  }
}

// Define defaultOptions for logger
export const defaultOptions: LoggerOptions = {
  level: LogLevel.INFO,
  useHumanReadableTime: true,
  transports: [new ConsoleTransport()],
  format: 'string',
  customConsoleColors: {},
};

interface JellyLoggerImpl extends BaseLogger {
  options: LoggerOptions;
  setOptions(options: Partial<LoggerOptions>): void;
  resetOptions(): void;
}

class JellyLoggerImpl implements JellyLoggerImpl {
  options: LoggerOptions = { ...defaultOptions };

  setOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  resetOptions(): void {
    this.options = { ...defaultOptions };
  }

  private shouldLog(level: LogLevel): boolean {
    const minLevel: LogLevel = this.options.level ?? LogLevel.INFO;
    return level <= minLevel;
  }

  private createLogEntry(level: LogLevel, message: string, optionalParams: unknown[]): LogEntry {
    const { processedArgs, hasComplexArgs } = processLogArgs(optionalParams);
    
    // Separate data objects from other args
    const dataObjects: Record<string, unknown>[] = [];
    const otherArgs: unknown[] = [];
    
    for (const arg of processedArgs) {
      if (arg && typeof arg === 'object' && !Array.isArray(arg) && !(arg instanceof Error)) {
        dataObjects.push(arg as Record<string, unknown>);
      } else {
        otherArgs.push(arg);
      }
    }
    
    // Merge all data objects into one
    const data = dataObjects.length > 0 ? Object.assign({}, ...dataObjects) : undefined;

    return {
      timestamp: getTimestamp(this.options.useHumanReadableTime),
      level,
      levelName: LogLevel[level],
      message,
      data,
      args: {
        processedArgs: otherArgs,
        hasComplexArgs
      }
    };
  }

  private log(level: LogLevel, message: string, ...optionalParams: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createLogEntry(level, message, optionalParams);
    const transportOptions: TransportOptions = {
      ...this.options
    };

    // Send to all transports with null safety
    const transports = this.options.transports ?? [];
    for (const transport of transports) {
      try {
        const result = transport.log(entry, transportOptions);
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            console.error(`Async error in transport '${transport.constructor.name}':`, error);
          });
        }
      } catch (error) {
        console.error(`Synchronous error in transport '${transport.constructor.name}':`, error);
      }
    }
  }

  fatal(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.FATAL, message, ...optionalParams);
  }

  error(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...optionalParams);
  }

  warn(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.WARN, message, ...optionalParams);
  }

  info(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.INFO, message, ...optionalParams);
  }

  debug(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...optionalParams);
  }

  trace(message: string, ...optionalParams: unknown[]): void {
    this.log(LogLevel.TRACE, message, ...optionalParams);
  }

  child(options: ChildLoggerOptions = {}): BaseLogger {
    return new ChildLogger(this, options);
  }

  async flushAll(): Promise<void> {
    const transports = this.options.transports ?? [];
    const flushPromises = transports
      .map(transport => {
        if (transport.flush) {
          try {
            return transport.flush(this.options);
          } catch (error) {
            console.error(`Error flushing transport '${transport.constructor.name}':`, error);
            return Promise.resolve();
          }
        }
        return Promise.resolve();
      });

    await Promise.allSettled(flushPromises);
  }
}

export const logger: JellyLoggerImpl = new JellyLoggerImpl();

// Export types for external use
export type { BaseLogger, ChildLoggerOptions } from './types';