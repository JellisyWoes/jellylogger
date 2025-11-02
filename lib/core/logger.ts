import { ConsoleTransport } from '../transports/ConsoleTransport';
import { getTimestamp, processLogArgs } from '../utils/serialization';
import {
  logInternalError,
  setInternalDebugHandler,
  setInternalErrorHandler,
  setInternalWarningHandler,
} from '../utils/internalErrorHandler';
import { LogLevel } from './constants';
import type {
  BaseLogger,
  ChildLoggerOptions,
  LogEntry,
  LoggerOptions,
  Transport,
  TransportOptions,
} from './types';

/**
 * ChildLogger class to create loggers with inherited configuration and specific context.
 */
export class ChildLogger implements BaseLogger {
  private parent: BaseLogger;
  private options: ChildLoggerOptions;
  private persistentData: Record<string, unknown>;

  constructor(parent: BaseLogger, options: ChildLoggerOptions = {}) {
    this.parent = parent;
    this.options = options;
    
    // Merge context and defaultData (context is an alias for defaultData)
    this.persistentData = {
      ...(options.defaultData ?? {}),
      ...(options.context ?? {}),
    };
  }

  private createPrefixedMessage(message: string): string {
    const prefix = this.options.messagePrefix;
    if (!prefix) return message;
    return `${prefix} ${message}`;
  }

  private log(level: LogLevel, message: string, ...optionalParams: unknown[]): void {
    const prefixedMessage = this.createPrefixedMessage(message);
    
    // If we have persistent data, inject it as the first parameter
    // This ensures it gets merged with any other data objects passed
    const paramsWithContext = Object.keys(this.persistentData).length > 0
      ? [this.persistentData, ...optionalParams]
      : optionalParams;
    
    // Cast to BaseLogger with log method for type safety
    (
      this.parent as BaseLogger & {
        log: (level: LogLevel, message: string, ...args: unknown[]) => void;
      }
    ).log(level, prefixedMessage, ...paramsWithContext);
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
      ? options.messagePrefix
        ? `${this.options.messagePrefix} ${options.messagePrefix}`
        : this.options.messagePrefix
      : options.messagePrefix;

    // Merge parent's persistent data with new child's data
    // Child's data takes precedence over parent's
    const mergedDefaultData = {
      ...this.persistentData,
      ...(options.defaultData ?? {}),
    };
    
    const mergedContext = {
      ...mergedDefaultData,
      ...(options.context ?? {}),
    };

    return new ChildLogger(this.parent, {
      messagePrefix: combinedPrefix,
      defaultData: mergedContext,
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

interface IJellyLogger extends BaseLogger {
  options: LoggerOptions;
  setOptions(options: Partial<LoggerOptions>): void;
  resetOptions(): void;
  _log(level: LogLevel, message: string, ...args: unknown[]): void;
  _logWithData(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    ...args: unknown[]
  ): void;
  addTransport(transport: Transport): void;
  removeTransport(transport: Transport): void;
  clearTransports(): void;
  setTransports(transports: Transport[]): void;
}

class JellyLoggerImpl implements IJellyLogger {
  options: LoggerOptions = { ...defaultOptions };

  setOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Configure internal error handlers if provided
    if (options.internalErrorHandler !== undefined) {
      setInternalErrorHandler(options.internalErrorHandler);
    }
    if (options.internalWarningHandler !== undefined) {
      setInternalWarningHandler(options.internalWarningHandler);
    }
    if (options.internalDebugHandler !== undefined) {
      setInternalDebugHandler(options.internalDebugHandler);
    }
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
        hasComplexArgs,
      },
    };
  }

  private log(level: LogLevel, message: string, ...optionalParams: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry = this.createLogEntry(level, message, optionalParams);
    const transportOptions: TransportOptions = {
      ...this.options,
    };

    // Send to all transports with null safety
    const transports = this.options.transports ?? [];
    for (const transport of transports) {
      try {
        const result = transport.log(entry, transportOptions);
        if (result instanceof Promise) {
          result.catch((error: unknown) => {
            logInternalError(`Async error in transport '${transport.constructor.name}':`, error);
          });
        }
      } catch (error) {
        logInternalError(`Synchronous error in transport '${transport.constructor.name}':`, error);
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
    const flushPromises = transports.map(transport => {
      if (transport.flush) {
        try {
          return transport.flush(this.options);
        } catch (error) {
          logInternalError(`Error flushing transport '${transport.constructor.name}':`, error);
          return Promise.resolve();
        }
      }
      return Promise.resolve();
    });

    await Promise.allSettled(flushPromises);
  }

  // Transport management methods
  addTransport(transport: Transport): void {
    this.options.transports ??= [];
    this.options.transports.push(transport);
  }

  removeTransport(transport: Transport): void {
    if (!this.options.transports) {
      return;
    }
    const index = this.options.transports.indexOf(transport);
    if (index !== -1) {
      this.options.transports.splice(index, 1);
    }
  }

  clearTransports(): void {
    this.options.transports = [];
  }

  setTransports(transports: Transport[]): void {
    this.options.transports = [...transports];
  }

  // Public logging methods for compatibility
  _log(level: LogLevel, message: string, ...args: unknown[]): void {
    this.log(level, message, ...args);
  }

  _logWithData(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    ...args: unknown[]
  ): void {
    if (data) {
      this.log(level, message, data, ...args);
    } else {
      this.log(level, message, ...args);
    }
  }
}

export const logger: JellyLoggerImpl = new JellyLoggerImpl();

// Export types for external use
export type { BaseLogger, ChildLoggerOptions } from './types';
