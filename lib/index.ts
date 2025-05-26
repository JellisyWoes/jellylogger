import type { BunFile } from 'bun';
import { EOL as osEOL } from 'os';
import { gzipSync } from 'bun';
import { join, dirname, basename, extname } from 'path';

/**
 * Defines the available log levels.
 */
enum LogLevel {
  SILENT = 0, // No logs
  FATAL = 1,  // Critical errors causing application termination
  ERROR = 2,  // Errors that don't necessarily stop the application
  WARN = 3,   // Warnings about potential issues
  INFO = 4,   // General informational messages
  DEBUG = 5,  // Detailed information for debugging
  TRACE = 6,  // Most granular information, for tracing code execution
}

/**
 * Represents a single log entry.
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  args: unknown[];
  /** Structured data for the log entry */
  data?: Record<string, unknown>;
}

/**
 * Type for custom console color definitions.
 * Allows overriding specific log levels or properties like reset, bold, dim.
 * Accepts color values as hex, rgb, hsl, hsv, cmyk, or ANSI escape codes.
 */
type CustomConsoleColors = Partial<{
  reset: string;
  bold: string;
  dim: string;
  [LogLevel.FATAL]: string;
  [LogLevel.ERROR]: string;
  [LogLevel.WARN]: string;
  [LogLevel.INFO]: string;
  [LogLevel.DEBUG]: string;
  [LogLevel.TRACE]: string;
}>;

/**
 * Interface for log transports.
 * Transports are responsible for writing log entries to a destination.
 */
interface Transport {
  /**
   * Logs an entry to the transport destination.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting and configuration
   */
  log(
    entry: LogEntry,
    options: LoggerOptions
  ): Promise<void>;

  /**
   * Flushes any pending log entries.
   * Should be called before application shutdown.
   */
  flush?(options?: LoggerOptions): Promise<void>;
}

// Helper to convert user color input to ANSI escape code using Bun.color with fallback
function toAnsiColor(color?: string, fallback: string = ""): string {
  if (!color) return fallback;
  // If already an ANSI escape code, just return
  if (color.startsWith("\x1b[")) return color;
  // Try to use Bun.color for hex, rgb, hsl, hsv, cmyk, etc.
  try {
    const result = Bun.color(color, "ansi");
    if (result) return result;
    console.warn(`Invalid color "${color}", using fallback`);
    return fallback;
  } catch (e) {
    console.warn(`Failed to parse color "${color}": ${e instanceof Error ? e.message : String(e)}, using fallback`);
    return fallback;
  }
}

/**
 * Generates a timestamp string.
 * @param humanReadable - If true, returns a human-readable format (YYYY-MM-DD HH:MM:SS AM/PM).
 *                        Otherwise, returns an ISO string.
 * @returns The formatted timestamp string.
 */
const getTimestamp = (humanReadable: boolean = false): string => {
  const now = new Date();
  if (humanReadable) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, "0");

    return `${year}-${month}-${day} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }
  return now.toISOString();
};

/**
 * Type guard to check if a value is a record (plain object).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

/**
 * Type guard to check if a value looks like an Error object.
 */
function isErrorLike(value: unknown): value is { name: string; message: string; stack?: string; cause?: unknown } {
  return isRecord(value) && 
         typeof value.name === 'string' && 
         typeof value.message === 'string';
}

/**
 * Serializes an error object with optional depth limiting for causes.
 * @param error - The error to serialize
 * @param maxDepth - Maximum depth to serialize nested causes
 * @returns Serialized error object
 */
function serializeError(error: Error, maxDepth: number = 3): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error.cause && maxDepth > 0) {
    if (error.cause instanceof Error) {
      serialized.cause = serializeError(error.cause, maxDepth - 1);
    } else {
      try {
        serialized.cause = JSON.parse(JSON.stringify(error.cause));
      } catch {
        serialized.cause = String(error.cause);
      }
    }
  }

  return serialized;
}

/**
 * Safely converts unknown arguments to serializable format with circular reference detection.
 * @param args - Arguments to process
 * @returns Processed arguments safe for serialization
 */
function processLogArgs(args: unknown[]): unknown[] {
  const seen = new WeakSet();
  
  function processValue(value: unknown): unknown {
    if (value instanceof Error) {
      return serializeError(value);
    }
    if (typeof value === 'function') {
      return `[Function: ${value.name || 'anonymous'}]`;
    }
    if (typeof value === 'symbol') {
      return value.toString();
    }
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    if (typeof value === 'undefined') {
      return 'undefined';
    }
    
    // Handle objects with circular reference detection
    if (value !== null && typeof value === 'object') {
      // Check for circular references
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
      
      // Check if it looks like an error but isn't an Error instance
      if (isErrorLike(value)) {
        return {
          name: String(value.name),
          message: String(value.message),
          stack: value.stack ? String(value.stack) : undefined,
        };
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        try {
          return value.map(item => processValue(item));
        } catch {
          return `[Array: ${value.length} items]`;
        }
      }
      
      // Handle plain objects
      try {
        const result: Record<string, unknown> = {};
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            result[key] = processValue((value as any)[key]);
          }
        }
        return result;
      } catch {
        return `[Object: ${Object.prototype.toString.call(value)}]`;
      }
    }
    return value;
  }

  return args.map(processValue);
}

/**
 * Interface for pluggable formatters.
 */
interface LogFormatter {
  /**
   * Format a log entry into a string.
   * @param entry - The log entry to format
   * @returns Formatted log string
   */
  format(entry: LogEntry): string;
}

/**
 * Built-in logfmt formatter.
 */
class LogfmtFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    const pairs: string[] = [
      `ts=${entry.timestamp}`,
      `level=${entry.levelName.toLowerCase()}`,
      `msg="${entry.message.replace(/"/g, '\\"')}"`,
    ];

    if (entry.data) {
      for (const [key, value] of Object.entries(entry.data)) {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        pairs.push(`${key}="${stringValue.replace(/"/g, '\\"')}"`);
      }
    }

    if (entry.args.length > 0) {
      entry.args.forEach((arg, index) => {
        const stringValue = typeof arg === 'string' ? arg : JSON.stringify(arg);
        pairs.push(`arg${index}="${stringValue.replace(/"/g, '\\"')}"`);
      });
    }

    return pairs.join(' ');
  }
}

/**
 * Built-in NDJSON (newline-delimited JSON) formatter.
 */
class NdjsonFormatter implements LogFormatter {
  format(entry: LogEntry): string {
    return JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.levelName.toLowerCase(),
      message: entry.message,
      ...entry.data,
      ...(entry.args.length > 0 ? { args: entry.args } : {}),
    });
  }
}

/**
 * Configuration for sensitive data redaction.
 */
interface RedactionConfig {
  /** Keys to redact in structured data and objects. Supports dot notation for nested keys (e.g., 'user.password') and wildcards (e.g., '*.token', 'user.*') */
  keys?: string[];
  /** Regular expressions for key matching. More flexible than string keys. */
  keyPatterns?: RegExp[];
  /** Regular expressions to match and redact values regardless of their keys */
  valuePatterns?: RegExp[];
  /** Whether to redact sensitive patterns in log messages and string arguments. Default: false */
  redactStrings?: boolean;
  /** String patterns to redact in messages and string args (e.g., credit card numbers, SSNs) */
  stringPatterns?: RegExp[];
  /** Replacement text for redacted values or a function for custom replacement. Default: '[REDACTED]' */
  replacement?: string | ((value: any, key: string, path: string) => string);
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
  /** Whether to log when redaction occurs for debugging/auditing. Default: false */
  auditRedaction?: boolean;
}

/**
 * Configuration for log rotation.
 */
interface LogRotationConfig {
  /** Maximum file size in bytes before rotation. Default: 10MB */
  maxFileSize?: number;
  /** Maximum number of rotated files to keep. Default: 5 */
  maxFiles?: number;
  /** Whether to compress rotated files with gzip. Default: true */
  compress?: boolean;
  /** Whether to rotate based on date (daily). Default: false */
  dateRotation?: boolean;
}

/**
 * Options for DiscordWebhookTransport batching.
 */
interface DiscordWebhookTransportOptions {
  /** How often to send batches (ms). Default: 2000 */
  batchIntervalMs?: number;
  /** Max number of log entries per batch. Default: 10 */
  maxBatchSize?: number;
  /** Username for Discord webhook. Default: 'JellyLogger' */
  username?: string;
  /** Maximum retry attempts for failed batches. Default: 3 */
  maxRetries?: number;
  /** Suppress console.error output on webhook failure. Default: false */
  suppressConsoleErrors?: boolean;
}

/**
 * Interface for logger configuration options.
 */
interface LoggerOptions {
  /** Minimum log level to process. Defaults to LogLevel.INFO. */
  level?: LogLevel;
  /** If true, timestamps will be human-readable. Defaults to false. */
  useHumanReadableTime?: boolean;
  /** Array of transports to use. Defaults to [new ConsoleTransport()]. */
  transports?: Transport[];
  /** Output format. Defaults to 'string'. If a custom `formatter` is provided, this may be ignored by the formatter. */
  format?: 'string' | 'json';
  /** Custom function to format a log entry into a string. If provided, this typically overrides the default string/JSON formatting of transports. */
  formatter?: (entry: LogEntry) => string;
  /** Custom console colors to override defaults. */
  customConsoleColors?: CustomConsoleColors;
  /** Configuration for sensitive data redaction */
  redaction?: RedactionConfig;
  /** Pluggable formatter instance */
  pluggableFormatter?: LogFormatter;
  /** Discord webhook URL for sending logs with discord: true flag */
  discordWebhookUrl?: string;
  /** Context for this logger */
  context?: Record<string, unknown>;
}

/**
 * Options for creating a child logger.
 */
interface ChildLoggerOptions {
  /** Prefix to add to all log messages from this child logger */
  messagePrefix?: string;
  /** Contextual data to include with every log entry from this child logger */
  defaultData?: Record<string, unknown>;
}

/**
 * Base interface for logger methods.
 */
interface BaseLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
}


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
class ConsoleTransport implements Transport {
  /**
   * Logs an entry to the console.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Apply redaction specifically for console output
    const redactedEntry = getRedactedEntry(entry, options.redaction, 'console');
    
    const consoleMethod =
      redactedEntry.level === LogLevel.ERROR || redactedEntry.level === LogLevel.FATAL ? console.error :
      redactedEntry.level === LogLevel.WARN ? console.warn :
      redactedEntry.level === LogLevel.DEBUG || redactedEntry.level === LogLevel.TRACE ? console.debug :
      console.info;

    if (options.formatter) {
      try {
        const formatted = options.formatter(redactedEntry);
        const output = typeof formatted === 'string' ? formatted : JSON.stringify(formatted);
        consoleMethod(output);
        return;
      } catch (error) {
        // Fallback to default formatting if custom formatter fails
        console.error('Custom formatter failed, falling back to default:', error instanceof Error ? error.message : String(error));
        // Continue with default formatting below
      }
    }

    if (options.format === 'json') {
      // Safe JSON stringification with circular reference handling
      try {
        consoleMethod(JSON.stringify(redactedEntry));
      } catch (e) {
        consoleMethod(JSON.stringify({
          ...redactedEntry,
          args: redactedEntry.args.map((arg: unknown) => 
            typeof arg === 'object' && arg !== null ? '[Object - Circular]' : arg
          )
        }));
      }
      return;
    }

    // Merge and resolve colors with fallbacks
    const mergedColorsInput = { ...consoleColors, ...(options.customConsoleColors || {}) };
    
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
    const levelString = LogLevel[redactedEntry.level].padEnd(5);
    const logString = `${currentColors.dim}[${redactedEntry.timestamp}]${currentColors.reset} ${currentColors.bold}${color}${levelString}:${currentColors.reset} ${redactedEntry.message}`;

    // Safely process args for console output
    const safeArgs = redactedEntry.args.map((arg: unknown) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          JSON.stringify(arg);
          return arg;
        } catch {
          return String(arg);
        }
      }
      return arg;
    });

    if (safeArgs.length > 0) {
        consoleMethod(logString, ...safeArgs);
    } else {
        consoleMethod(logString);
    }
  }

  /**
   * Console transport doesn't need to flush anything.
   */
  async flush(_options?: LoggerOptions): Promise<void> {
    // No-op for console
  }
}

/**
 * Interface for the expected Discord rate limit response.
 */
interface DiscordRateLimitResponse {
  retry_after: number;
  // message?: string; // Optional, as not directly used for logic
  // global?: boolean; // Optional
}

/**
 * Interface for Bun file operations used by FileTransport.
 * This allows for dependency injection for testing.
 */
interface InjectedBunFileOperations {
  file: typeof Bun.file;
  write: typeof Bun.write;
}

/**
 * FileTransport writes log entries to a file with optional rotation and proper locking.
 */
class FileTransport implements Transport {
  private filePath: string;
  private bunFileOps: InjectedBunFileOperations;
  private fileInstance: BunFile;
  private rotationConfig?: LogRotationConfig;
  private currentDate?: string;
  private isRotating: boolean = false;
  private pendingWrites: Promise<void>[] = [];

  /**
   * Creates a new FileTransport instance.
   * @param filePath - Path to the log file
   * @param rotationConfig - Optional log rotation configuration
   * @param bunOps - Optional Bun operations for dependency injection
   */
  constructor(
    filePath: string, 
    rotationConfig?: LogRotationConfig,
    bunOps?: Partial<InjectedBunFileOperations>
  ) {
    this.filePath = filePath;
    this.rotationConfig = rotationConfig;
    this.bunFileOps = {
      file: bunOps?.file || Bun.file,
      write: bunOps?.write || Bun.write,
    };
    this.fileInstance = this.bunFileOps.file(this.filePath);
    
    if (rotationConfig?.dateRotation) {
      this.currentDate = new Date().toISOString().split('T')[0];
    }
  }

  /**
   * Logs an entry to the file with proper write locking.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Apply redaction specifically for file output
    const redactedEntry = getRedactedEntry(entry, options.redaction, 'file');
    
    // Wait for any ongoing rotation to complete
    while (this.isRotating) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Check for date-based rotation
    if (this.rotationConfig?.dateRotation) {
      const currentDate = new Date().toISOString().split('T')[0];
      if (this.currentDate !== currentDate) {
        try {
          await this.rotateLogs();
          this.currentDate = currentDate;
        } catch (error) {
          console.error('FileTransport date rotation error:', error);
          // Continue with logging even if rotation fails
        }
      }
    }

    let logString: string;
    if (options.pluggableFormatter) {
      const formatted = options.pluggableFormatter.format(redactedEntry);
      logString = (typeof formatted === 'string' ? formatted : JSON.stringify(formatted)) + osEOL;
    } else if (options.formatter) {
      try {
        const formatted = options.formatter(redactedEntry);
        logString = (typeof formatted === 'string' ? formatted : JSON.stringify(formatted)) + osEOL;
      } catch (error) {
        // Fallback to default formatting if custom formatter fails
        console.error('Custom formatter failed in FileTransport, using default:', error instanceof Error ? error.message : String(error));
        logString = this.getDefaultLogString(redactedEntry, options);
      }
    } else if (options.format === 'json') {
      try {
        logString = JSON.stringify(redactedEntry) + osEOL;
      } catch (e) {
        // Handle circular references in JSON
        logString = JSON.stringify({
          ...redactedEntry,
          args: redactedEntry.args.map((arg: unknown) => 
            typeof arg === 'object' && arg !== null ? '[Object - Circular]' : arg
          )
        }) + osEOL;
      }
    } else {
      logString = this.getDefaultLogString(redactedEntry, options);
    }

    const writePromise = this.writeToFile(logString);
    this.pendingWrites.push(writePromise);
    
    try {
      await writePromise;
      
      // Check for size-based rotation after successful write
      if (this.rotationConfig?.maxFileSize) {
        try {
          // Get current file size - in tests this will be the mocked size
          const fileSize = this.fileInstance.size;
          if (typeof fileSize === 'number' && fileSize > this.rotationConfig.maxFileSize) {
            await this.rotateLogs();
          }
        } catch (error) {
          console.error('FileTransport size check error:', error);
          // Continue with logging even if size check fails
        }
      }
    } finally {
      // Remove completed write from pending list
      this.pendingWrites = this.pendingWrites.filter(p => p !== writePromise);
    }
  }

  private getDefaultLogString(redactedEntry: LogEntry, options: LoggerOptions): string {
    const levelString = LogLevel[redactedEntry.level].padEnd(5);
    // Safely process args for file output with circular reference protection
    const argsString = redactedEntry.args.length > 0 ? ' ' + redactedEntry.args.map((arg: unknown) => {
      if (arg === null) {
        return 'null';
      }
      if (arg === undefined) {
        return 'undefined';
      }
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return `[Object: ${Object.prototype.toString.call(arg)}]`;
        }
      }
      return String(arg);
    }).join(' ') : '';
    return `[${redactedEntry.timestamp}] ${levelString}: ${redactedEntry.message}${argsString}${osEOL}`;
  }

  private async writeToFile(logString: string): Promise<void> {
    try {
      await this.bunFileOps.write(this.fileInstance, logString);
    } catch (e) {
      console.error(`FileTransport write error:`, e);
      throw e;
    }
  }

  /**
   * Rotate log files with proper locking and error handling.
   */
  private async rotateLogs(): Promise<void> {
    if (!this.rotationConfig || this.isRotating) return;
    
    this.isRotating = true;
    
    try {
      // Wait for all pending writes to complete
      await Promise.all(this.pendingWrites);
      
      const maxFiles = this.rotationConfig.maxFiles ?? 5;
      const compress = this.rotationConfig.compress ?? true;
      
      // Check if current file exists
      const currentFileExists = await this.fileInstance.exists().catch(() => false);
      if (!currentFileExists) {
        return;
      }

      const dir = dirname(this.filePath);
      const name = basename(this.filePath, extname(this.filePath));
      const ext = extname(this.filePath);

      try {
        // First, delete files that exceed maxFiles limit
        for (let i = maxFiles; i >= 1; i--) {
          const oldFile = compress 
            ? join(dir, `${name}.${i}${ext}.gz`)
            : join(dir, `${name}.${i}${ext}`);
          
          const oldFileInstance = this.bunFileOps.file(oldFile);
          const exists = await oldFileInstance.exists().catch(() => false);
          
          if (exists) {
            try {
              await Bun.$`rm -f ${oldFile}`.quiet();
            } catch (e) {
              console.warn(`Failed to delete old log file ${oldFile}:`, e);
            }
          }
        }

        // Then shift existing rotated files (from highest to lowest)
        for (let i = maxFiles - 1; i >= 1; i--) {
          const currentFile = compress 
            ? join(dir, `${name}.${i}${ext}.gz`)
            : join(dir, `${name}.${i}${ext}`);
          
          const currentFileInstance = this.bunFileOps.file(currentFile);
          const exists = await currentFileInstance.exists().catch(() => false);
          
          if (exists) {
            const nextFile = compress
              ? join(dir, `${name}.${i + 1}${ext}.gz`)
              : join(dir, `${name}.${i + 1}${ext}`);
            try {
              await Bun.$`mv ${currentFile} ${nextFile}`.quiet();
            } catch (e) {
              console.warn(`Failed to move log file ${currentFile} to ${nextFile}:`, e);
            }
          }
        }

        // Move current file to .1 position
        const rotatedFile = compress
          ? join(dir, `${name}.1${ext}.gz`)
          : join(dir, `${name}.1${ext}`);

        if (compress) {
          // Read, compress, and write
          try {
            const content = await this.fileInstance.text();
            const compressed = gzipSync(Buffer.from(content));
            await this.bunFileOps.write(rotatedFile, compressed);
            // Remove original file after successful compression
            await Bun.$`rm -f ${this.filePath}`.quiet();
          } catch (e) {
            console.error(`Failed to compress and rotate log file:`, e);
            // Continue with normal rotation if compression fails
            try {
              await Bun.$`mv ${this.filePath} ${rotatedFile}`.quiet();
            } catch (moveError) {
              console.error(`Failed to move log file during rotation fallback:`, moveError);
            }
          }
        } else {
          try {
            await Bun.$`mv ${this.filePath} ${rotatedFile}`.quiet();
          } catch (e) {
            console.error(`Failed to move log file during rotation:`, e);
          }
        }

        // Create new file instance
        this.fileInstance = this.bunFileOps.file(this.filePath);
      } catch (error) {
        console.error('Critical error during log rotation:', error);
        // Try to continue with a new file instance even if rotation failed
        this.fileInstance = this.bunFileOps.file(this.filePath);
        // Don't rethrow - we want to continue logging even if rotation fails
      }
    } finally {
      this.isRotating = false;
    }
  }

  /**
   * Wait for all pending writes to complete.
   */
  async flush(_options?: LoggerOptions): Promise<void> {
    await Promise.all(this.pendingWrites);
  }
}

// Singleton Discord transport instance
let globalDiscordTransport: DiscordWebhookTransport | null = null;

/**
 * DiscordWebhookTransport sends log entries to a Discord webhook URL, batching them to avoid rate limits.
 */
class DiscordWebhookTransport implements Transport {
  private webhookUrl: string;
  private queue: LogEntry[] = [];
  private timer: NodeJS.Timeout | null = null; // Changed Timer to NodeJS.Timeout
  private batchIntervalMs: number;
  private maxBatchSize: number;
  private username: string;
  private maxRetries: number;
  private suppressConsoleErrors: boolean;
  private isFlushing: boolean = false;
  private retryQueue: { batch: LogEntry[]; retries: number; nextAttempt: number }[] = [];
  private flushPromise: Promise<void> | null = null;

  constructor(webhookUrl: string, opts?: DiscordWebhookTransportOptions) {
    this.webhookUrl = webhookUrl;
    this.batchIntervalMs = opts?.batchIntervalMs ?? 2000;
    this.maxBatchSize = opts?.maxBatchSize ?? 10;
    this.username = opts?.username ?? 'JellyLogger';
    this.maxRetries = opts?.maxRetries ?? 3;
    this.suppressConsoleErrors = opts?.suppressConsoleErrors ?? false;
  }

  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Apply redaction for Discord (treat as console output)
    const redactedEntry = getRedactedEntry(entry, options.redaction, 'console');
    this.queue.push(redactedEntry);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(options), this.batchIntervalMs);
    }
    if (this.queue.length >= this.maxBatchSize) {
      await this.flush(options);
    }
  }

  async flush(options?: LoggerOptions): Promise<void> {
    // If already flushing, wait for current flush to complete
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this._doFlush(options);
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async _doFlush(options?: LoggerOptions): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    const loggerOptions: LoggerOptions = options || {
      level: LogLevel.INFO,
      useHumanReadableTime: false,
      transports: [],
      format: 'string' as const,
    };

    try {
      // Flush main queue
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.maxBatchSize);
        await this.sendBatchWithRetry(batch, loggerOptions);
      }

      // Flush retryQueue (respecting nextAttempt)
      const now = Date.now();
      const readyRetries = this.retryQueue.filter(item => item.nextAttempt <= now);
      this.retryQueue = this.retryQueue.filter(item => item.nextAttempt > now);

      for (const item of readyRetries) {
        await this.sendBatchWithRetry(item.batch, loggerOptions, item.retries + 1);
      }

      this.clearTimer();
      // If more logs are queued, schedule next flush
      if (this.queue.length > 0 || this.retryQueue.length > 0) {
        this.timer = setTimeout(() => this.flush(loggerOptions), this.batchIntervalMs);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async sendBatchWithRetry(batch: LogEntry[], options: LoggerOptions, retries = 0): Promise<void> {
    try {
      await this.sendBatch(batch, options);
    } catch (e: unknown) {
      if (retries < this.maxRetries) {
        // For non-rate-limit errors, add exponential backoff
        if (!(e instanceof Error && e.message.includes("Discord rate limited"))) {
          const delayMs = Math.pow(2, retries) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        // Retry the batch
        await this.sendBatchWithRetry(batch, options, retries + 1);
      } else {
        // Only log if suppressConsoleErrors is false
        if (!this.suppressConsoleErrors) {
          console.error("Failed to send log batch to Discord webhook after retries:", e instanceof Error ? e.message : String(e));
        }
        // Don't throw - we want to continue even if Discord fails
      }
    }
  }

  private async sendBatch(batch: LogEntry[], options: LoggerOptions): Promise<void> {
    // Discord message max length is 2000 chars. Split messages if needed.
    const messages: string[] = [];
    let current = "";

    for (const entry of batch) {
      let formatted: string;
      if (options.formatter) {
        formatted = options.formatter(entry);
      } else if (options.format === 'json') {
        try {
          formatted = '```json\n' + JSON.stringify(entry, null, 2) + '\n```';
        } catch {
          formatted = '```json\n' + JSON.stringify({
            ...entry,
            args: entry.args.map((arg: unknown) => typeof arg === 'object' && arg !== null ? '[Object - Circular]' : arg)
          }, null, 2) + '\n```';
        }
      } else {
        const levelString = LogLevel[entry.level];
        const argsString = entry.args && entry.args.length > 0
          ? '\n' + entry.args.map(arg => {
              if (typeof arg === 'object') {
                try {
                  return '```json\n' + JSON.stringify(arg, null, 2) + '\n```';
                } catch {
                  return String(arg);
                }
              }
              return String(arg);
            }).join('\n')
          : '';
        formatted = `**[${entry.timestamp}] ${levelString}:** ${entry.message}${argsString}`;
      }

      // Truncate individual formatted message if it exceeds Discord's limit
      if (formatted.length > 2000) {
        formatted = formatted.slice(0, 1997) + '…';
      }

      // Check if adding this message would exceed the limit
      const separator = current ? "\n\n" : "";
      const newLength = current.length + separator.length + formatted.length;
      
      if (newLength > 2000) {
        if (current) {
          // Truncate current if needed before pushing
          if (current.length > 2000) {
            current = current.slice(0, 1997) + '…';
          }
          messages.push(current);
        }
        current = formatted;
      } else {
        current = current + separator + formatted;
      }
    }
    
    if (current) {
      // Final truncation check
      if (current.length > 2000) {
        current = current.slice(0, 1997) + '…';
      }
      messages.push(current);
    }

    for (const content of messages) {
      await this.sendDiscordMessage(content);
    }
  }
  private async sendDiscordMessage(content: string): Promise<void> {
    // Ensure content doesn't exceed Discord's 2000 character limit
    const truncatedContent = content.length > 2000 ? content.slice(0, 1997) + '…' : content;

    const body = JSON.stringify({
      content: truncatedContent,
      username: this.username,
      allowed_mentions: { parse: [] }
    });

    let response: Response | undefined;
    try {
      response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body,
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Handle rate limiting
          let retryAfterSeconds = 1; // Default retry after 1 second
          
          // Try to get retry_after from headers first (more reliable)
          const retryAfterHeader = response.headers.get('Retry-After');
          if (retryAfterHeader) {
            retryAfterSeconds = Number(retryAfterHeader);
          } else if (response.headers.get('Content-Type')?.includes('application/json')) {
            // Fallback to response body
            const responseData = await response.json();
            retryAfterSeconds = Number((responseData as DiscordRateLimitResponse).retry_after);
          }

          // Ensure retryAfterSeconds is a valid positive number, default to 1 if not
          if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
            retryAfterSeconds = 1;
          }

          const delayMilliseconds = Math.max(1000, retryAfterSeconds * 1000);
          
          // Wait for the rate limit to pass, then throw to trigger retry logic
          await new Promise(res => setTimeout(res, delayMilliseconds));
          throw new Error(`Discord rate limited, waited ${retryAfterSeconds}s. Status: ${response.status} ${response.statusText}`);
        }
        
        // For other HTTP errors, throw immediately
        throw new Error(`Discord webhook request failed: ${response.status} ${response.statusText}`);
      }
    } catch (e: unknown) {
      // Handle rate limit errors specifically
      if (e instanceof Error && e.message.includes("Discord rate limited")) {
        throw e;
      }
      
      // Handle other Discord webhook errors
      if (e instanceof Error && e.message.startsWith("Discord webhook error")) {
        throw e;
      }
      
      // Handle network errors and invalid URLs - don't throw, just log if not suppressed
      if (e instanceof TypeError || (e instanceof Error && (
        e.message.includes("Failed to fetch") ||
        e.message.includes("Invalid URL") ||
        e.message.includes("fetch failed") ||
        e.message.includes("Network request failed")
      ))) {
        if (!this.suppressConsoleErrors) {
          console.error(`Failed to send Discord message: Network error or invalid URL - ${e.message}`);
        }
        return; // Don't throw, just return
      }
      
      const errorMessage = e instanceof Error ? e.message :
        typeof e === 'string' ? e :
          typeof e === 'object' && e !== null ? JSON.stringify(e) :
            String(e);
      throw new Error(`Failed to send Discord message: ${errorMessage}`);
    }
  }
  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * ChildLogger class to create loggers with inherited configuration and specific context.
 */
class ChildLogger implements BaseLogger {
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

/**
 * Converts a glob-like pattern to a regular expression.
 * Supports * (any characters) and ** (any path segments).
 * @param pattern - The glob pattern
 * @param caseInsensitive - Whether to make the regex case-insensitive
 * @returns A RegExp that matches the pattern
 */
function globToRegex(pattern: string, caseInsensitive: boolean = true): RegExp {
  // Escape special regex characters except * and **
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^.]*')
    .replace(/___DOUBLESTAR___/g, '.*');

  const flags = caseInsensitive ? 'i' : '';
  return new RegExp(`^${regexPattern}$`, flags);
}

/**
 * Checks if a key path matches any of the redaction patterns.
 * @param keyPath - The full path to the key (e.g., 'user.profile.email')
 * @param key - The current key being checked
 * @param config - Redaction configuration
 * @returns True if the key should be redacted
 */
function shouldRedactKey(keyPath: string, key: string, config: RedactionConfig): boolean {
  const caseInsensitive = config.caseInsensitive ?? true;

  // Check string keys with glob support
  if (config.keys) {
    for (const redactKey of config.keys) {
      // Direct key match
      const keyMatches = caseInsensitive 
        ? key.toLowerCase() === redactKey.toLowerCase()
        : key === redactKey;
      
      // Path match
      const pathMatches = caseInsensitive
        ? keyPath.toLowerCase() === redactKey.toLowerCase()
        : keyPath === redactKey;

      // Glob pattern match
      const globRegex = globToRegex(redactKey, caseInsensitive);
      const globKeyMatches = globRegex.test(key);
      const globPathMatches = globRegex.test(keyPath);

      if (keyMatches || pathMatches || globKeyMatches || globPathMatches) {
        return true;
      }
    }
  }

  // Check regex patterns
  if (config.keyPatterns) {
    for (const pattern of config.keyPatterns) {
      if (pattern.test(key) || pattern.test(keyPath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a value matches any of the value patterns for redaction.
 * @param value - The value to check
 * @param config - Redaction configuration
 * @returns True if the value should be redacted
 */
function shouldRedactValue(value: any, config: RedactionConfig): boolean {
  if (!config.valuePatterns || config.valuePatterns.length === 0) {
    return false;
  }

  // Only check string values for value patterns
  if (typeof value !== 'string') {
    return false;
  }

  return config.valuePatterns.some(pattern => pattern.test(value));
}

/**
 * Redacts sensitive patterns in a string (messages, string arguments).
 * @param str - The string to redact
 * @param config - Redaction configuration
 * @returns The string with sensitive patterns redacted
 */
function redactString(str: string, config: RedactionConfig): string {
  if (!config.redactStrings || !config.stringPatterns || config.stringPatterns.length === 0) {
    return str;
  }

  let result = str;

  for (const pattern of config.stringPatterns) {
    if (typeof config.replacement === 'function') {
      // For function replacements, we need to call the function for each match
      result = result.replace(pattern, (match) =>
        (config.replacement as (value: any, key: string, path: string) => string)(match, '', '')
      );
    } else {
      const replacement = config.replacement ?? '[REDACTED]';
      result = result.replace(pattern, replacement);
    }
  }

  return result;
}

/**
 * Checks if an object needs redaction to avoid unnecessary cloning.
 * @param obj - The object to check
 * @param config - Redaction configuration
 * @param path - Current path in the object
 * @param seen - Set to detect circular references
 * @returns True if the object contains data that needs redaction
 */
function needsRedaction(obj: any, config: RedactionConfig, path: string = '', seen: WeakSet<object> = new WeakSet()): boolean {
  // Check if there are any redaction rules configured
  if ((!config.keys || config.keys.length === 0) && 
      (!config.keyPatterns || config.keyPatterns.length === 0) &&
      (!config.valuePatterns || config.valuePatterns.length === 0)) {
    return false;
  }

  // Handle primitives
  if (obj === null || typeof obj !== 'object') {
    return shouldRedactValue(obj, config);
  }

  // Handle circular references
  if (seen.has(obj)) {
    return false;
  }
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.some((item, index) => 
      needsRedaction(item, config, `${path}[${index}]`, seen));
  }

  // Handle objects
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if key should be redacted
      if (shouldRedactKey(currentPath, key, config)) {
        return true;
      }
      
      // Check if value should be redacted
      if (shouldRedactValue(obj[key], config)) {
        return true;
      }
      
      // Recursively check nested objects
      if (needsRedaction(obj[key], config, currentPath, seen)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Applies redaction to a log entry.
 * @param entry - The log entry to redact
 * @param redactionConfig - Optional redaction configuration
 * @param target - Where the redaction should apply ('console', 'file', or 'both')
 * @returns A new log entry with redacted data, or the original entry if no redaction is needed.
 */
function getRedactedEntry(
  entry: LogEntry,
  redactionConfig?: RedactionConfig,
  target?: 'console' | 'file'
): LogEntry {
  // Check if redaction is needed
  if (!redactionConfig) {
    return entry;
  }

  // Check if redaction applies to this target
  const redactIn = redactionConfig.redactIn ?? 'both';
  if (target && redactIn !== 'both' && redactIn !== target) {
    return entry;
  }

  // Performance optimization: check if anything needs redaction
  const messageNeedsRedaction = redactionConfig.redactStrings && 
    redactionConfig.stringPatterns && 
    redactionConfig.stringPatterns.length > 0;
  
  const argsNeedRedaction = Array.isArray(entry.args) && 
    entry.args.length > 0 && 
    entry.args.some(arg => needsRedaction(arg, redactionConfig));
  
  const dataNeedsRedaction = entry.data && 
    needsRedaction(entry.data, redactionConfig);

  // If nothing needs redaction, return original entry
  if (!messageNeedsRedaction && !argsNeedRedaction && !dataNeedsRedaction) {
    return entry;
  }

  // Create a new entry with redacted data
  const newEntry: LogEntry = {
    ...entry,
    message: messageNeedsRedaction ? redactString(entry.message, redactionConfig) : entry.message,
    args: [],
    data: undefined
  };

  // Process args if they need redaction
  if (entry.args && entry.args.length > 0) {
    newEntry.args = entry.args.map(arg => {
      // Redact strings in args if configured
      if (typeof arg === 'string' && redactionConfig.redactStrings) {
        return redactString(arg, redactionConfig);
      }
      return redactObject(arg, redactionConfig, '', new WeakSet());
    });
  }

  // Process data if it needs redaction
  if (entry.data) {
    newEntry.data = redactObject(entry.data, redactionConfig, '', new WeakSet());
  }
  
  return newEntry;
}

/**
 * Deeply clones and redacts an object based on the redaction configuration.
 * @param obj - The object to redact
 * @param config - Redaction configuration
 * @param path - Current path in the object (used for recursion)
 * @param seen - Set to detect circular references
 * @returns A new object with redacted values
 */
function redactObject(obj: any, config: RedactionConfig, path: string = '', seen: WeakSet<object> = new WeakSet()): any {
  // Handle primitives (non-objects)
  if (obj === null || typeof obj !== 'object') {
    // Check if this value should be redacted based on patterns
    if (shouldRedactValue(obj, config)) {
      const replacement = typeof config.replacement === 'function' 
        ? config.replacement(obj, '', path)
        : (config.replacement ?? '[REDACTED]');
      
      if (config.auditRedaction) {
        console.debug(`[REDACTION AUDIT] Redacted value at path: ${path || 'root'}`);
      }
      
      return replacement;
    }
    return obj;
  }

  // Handle circular references
  if (seen.has(obj)) {
    return '[Circular Reference]';
  }
  
  // Add to seen set before processing
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      redactObject(item, config, `${path}[${index}]`, seen));
  }

  // Handle objects
  const newObj: Record<string, any> = {};
  
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check the key and value should be redacted
      if (shouldRedactKey(currentPath, key, config) || shouldRedactValue(obj[key], config)) {
        const replacement = typeof config.replacement === 'function' 
          ? config.replacement(obj[key], key, currentPath)
          : (config.replacement ?? '[REDACTED]');
        
        if (config.auditRedaction) {
          console.debug(`[REDACTION AUDIT] Redacted key: ${key}`);
        }
        
        newObj[key] = replacement;
      } 
      else {
        newObj[key] = redactObject(obj[key], config, currentPath, seen);
      }
    }
  }
  
  return newObj;
}

/**
 * Logger utility for consistent output.
 */
// Define defaultOptions for logger
const defaultOptions: LoggerOptions = {
  level: LogLevel.INFO,
  useHumanReadableTime: false,
  transports: [new ConsoleTransport()],
  format: 'string',
  customConsoleColors: {},
};

const logger: BaseLogger & {
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
          console.error('Error sending log to Discord webhook:', error);
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

export {
  ConsoleTransport,
  LogLevel,
  FileTransport,
  DiscordWebhookTransport,
  ChildLogger,
  LogfmtFormatter,
  NdjsonFormatter,
  logger,
  // Add the missing utility function exports
  isRecord,
  isErrorLike,
  serializeError,
  processLogArgs,
  getRedactedEntry,
  redactObject,
  shouldRedactKey,
  shouldRedactValue,
  redactString,
  needsRedaction,
  defaultOptions,
};

export type {
  LogEntry,
  Transport,
  LoggerOptions,
  ChildLoggerOptions,
  CustomConsoleColors,
  DiscordWebhookTransportOptions,
  DiscordRateLimitResponse,
  BaseLogger,
  LogFormatter,
  RedactionConfig,
  LogRotationConfig,
};