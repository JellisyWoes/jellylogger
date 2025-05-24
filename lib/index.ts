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
    options: Required<Omit<LoggerOptions, 'formatter' | 'customConsoleColors'>> & { 
      formatter?: LoggerOptions['formatter'], 
      customConsoleColors?: LoggerOptions['customConsoleColors'] 
    }
  ): Promise<void>;

  /**
   * Flushes any pending log entries.
   * Should be called before application shutdown.
   */
  flush?(): Promise<void>;
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
 * Safely converts unknown arguments to serializable format.
 * @param args - Arguments to process
 * @returns Processed arguments safe for serialization
 */
function processLogArgs(args: unknown[]): unknown[] {
  return args.map(arg => {
    if (arg instanceof Error) {
      return serializeError(arg);
    }
    if (typeof arg === 'function') {
      return `[Function: ${arg.name || 'anonymous'}]`;
    }
    if (typeof arg === 'symbol') {
      return arg.toString();
    }
    if (typeof arg === 'bigint') {
      return arg.toString() + 'n';
    }
    if (typeof arg === 'undefined') {
      return 'undefined';
    }
    // Handle thrown non-Error values that might be unknown
    if (arg !== null && typeof arg === 'object') {
      // Check if it looks like an error but isn't an Error instance
      if (isErrorLike(arg)) {
        return {
          name: String(arg.name),
          message: String(arg.message),
          stack: arg.stack ? String(arg.stack) : undefined,
        };
      }
      // Try to serialize object, fallback to string representation
      try {
        JSON.stringify(arg);
        return arg;
      } catch {
        return `[Object: ${Object.prototype.toString.call(arg)}]`;
      }
    }
    return arg;
  });
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
  /** Keys to redact in structured data and objects */
  keys: string[];
  /** Replacement text for redacted values. Default: '[REDACTED]' */
  replacement?: string;
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
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

// Helper to convert user color input to ANSI escape code using Bun.color
function toAnsiColor(color?: string): string {
  if (!color) return "";
  // If already an ANSI escape code, just return
  if (color.startsWith("\x1b[")) return color;
  // Try to use Bun.color for hex, rgb, hsl, hsv, cmyk, etc.
  try {
    // Bun.color returns undefined if invalid, so fallback to empty string
    return Bun.color(color, "ansi") ?? "";
  } catch {
    return "";
  }
}

/**
 * ANSI color codes for console output.
 */
const consoleColors: { [key in LogLevel]?: string } & { reset: string; bold: string; dim: string } = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  [LogLevel.FATAL]: Bun.color("#FF0000", "ansi") ?? "", // Bright Red
  [LogLevel.ERROR]: Bun.color("#FF4500", "ansi") ?? "", // OrangeRed
  [LogLevel.WARN]: Bun.color("#FFD700", "ansi") ?? "",  // Gold
  [LogLevel.INFO]: Bun.color("#32CD32", "ansi") ?? "",   // LimeGreen
  [LogLevel.DEBUG]: Bun.color("#1E90FF", "ansi") ?? "", // DodgerBlue
  [LogLevel.TRACE]: Bun.color("#9370DB", "ansi") ?? "", // MediumPurple
};

/**
 * Interface for the expected Discord rate limit response.
 */
interface DiscordRateLimitResponse {
  retry_after: number;
  // message?: string; // Optional, as not directly used for logic
  // global?: boolean; // Optional
}

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
    // Apply redaction if configured and enabled for console
    const redactedEntry = getRedactedEntry(entry, options.redaction, 'console');

    const consoleMethod =
      redactedEntry.level === LogLevel.ERROR || redactedEntry.level === LogLevel.FATAL ? console.error :
      redactedEntry.level === LogLevel.WARN ? console.warn :
      redactedEntry.level === LogLevel.DEBUG || redactedEntry.level === LogLevel.TRACE ? console.debug :
      console.info;

    if (options.formatter) {
      consoleMethod(options.formatter(redactedEntry));
      return;
    }

    if (options.format === 'json') {
      consoleMethod(JSON.stringify(redactedEntry));
      return;
    }

    // Merge and resolve colors
    const mergedColorsInput = { ...consoleColors, ...(options.customConsoleColors || {}) };
    
    const currentColors: {
      reset: string;
      bold: string;
      dim: string;
      [key: number]: string | undefined; // For LogLevel keys
    } = {
      reset: toAnsiColor(mergedColorsInput.reset),
      bold: toAnsiColor(mergedColorsInput.bold),
      dim: toAnsiColor(mergedColorsInput.dim),
    };

    // Populate log level colors
    for (const keyStr in mergedColorsInput) {
      if (keyStr === "reset" || keyStr === "bold" || keyStr === "dim") {
        continue; // Already handled
      }

      const numericKey = Number(keyStr);
      if (!isNaN(numericKey) && LogLevel[numericKey] !== undefined) {
        const colorValue = (mergedColorsInput as Record<string, string | undefined>)[keyStr];
        currentColors[numericKey] = toAnsiColor(colorValue);
      }
    }

    const color = currentColors[redactedEntry.level] || "";
    const levelString = LogLevel[redactedEntry.level].padEnd(5);
    const logString = `${currentColors.dim}[${redactedEntry.timestamp}]${currentColors.reset} ${currentColors.bold}${color}${levelString}:${currentColors.reset} ${redactedEntry.message}`;

    // Ensure args are safely processed before passing to console
    const safeArgs = redactedEntry.args.map(arg => {
      // Args should already be processed, but ensure they're safe for console output
      if (typeof arg === 'object' && arg !== null) {
        try {
          // Test if it's serializable
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
  async flush(): Promise<void> {
    // No-op for console
  }
}

/**
 * Interface for Bun file operations used by FileTransport.
 * This allows for dependency injection for testing.
 */
interface BunFileOperations {
  file: typeof Bun.file;
  write: typeof Bun.write;
  stat: typeof Bun.file.prototype.size;
  exists: typeof Bun.file.prototype.exists;
}

/**
 * Recursively redacts sensitive keys from objects, arrays, and nested structures.
 * @param value - The value to redact
 * @param config - Redaction configuration
 * @returns The redacted value
 */
function redactSensitiveData(value: unknown, config: RedactionConfig): unknown {
  const { keys, replacement = '[REDACTED]', caseInsensitive = true } = config;

  // Helper to check if a key should be redacted
  const shouldRedact = (key: string) =>
    caseInsensitive
      ? keys.some(k => k.toLowerCase() === key.toLowerCase())
      : keys.includes(key);

  // Handle non-serializable types
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

  if (Array.isArray(value)) {
    return value.map(item => redactSensitiveData(item, config));
  }
  if (isRecord(value)) {
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      redacted[k] = shouldRedact(k) ? replacement : redactSensitiveData(v, config);
    }
    return redacted;
  }
  return value;
}

/**
 * Returns a redacted copy of a log entry if redaction config is present and enabled for the given target.
 */
function getRedactedEntry(
  entry: LogEntry,
  redactionConfig: RedactionConfig | undefined,
  target: 'console' | 'file'
): LogEntry {
  if (
    !redactionConfig ||
    (redactionConfig.redactIn && redactionConfig.redactIn !== target && redactionConfig.redactIn !== 'both')
  ) {
    return entry;
  }
  return {
    ...entry,
    data: entry.data ? redactSensitiveData(entry.data, redactionConfig) as Record<string, unknown> : entry.data,
    args: entry.args.map(arg => redactSensitiveData(arg, redactionConfig)),
  };
}

/**
 * FileTransport writes log entries to a file with optional batching for performance.
 */
class FileTransport implements Transport {
  private filePath: string;
  private bunFileOps: BunFileOperations;
  private fileInstance: BunFile;
  private rotationConfig?: LogRotationConfig;
  private currentDate?: string;

  /**
   * Creates a new FileTransport instance.
   * @param filePath - Path to the log file
   * @param rotationConfig - Optional log rotation configuration
   * @param bunOps - Optional Bun operations for dependency injection
   */
  constructor(
    filePath: string, 
    rotationConfig?: LogRotationConfig,
    bunOps?: Partial<BunFileOperations>
  ) {
    this.filePath = filePath;
    this.rotationConfig = rotationConfig;
    this.bunFileOps = {
      file: bunOps?.file || Bun.file,
      write: bunOps?.write || Bun.write,
      stat: bunOps?.stat || (async (file: BunFile) => file.size),
      exists: bunOps?.exists || (async (file: BunFile) => file.exists()),
    };
    this.fileInstance = this.bunFileOps.file(this.filePath);
    
    if (rotationConfig?.dateRotation) {
      this.currentDate = new Date().toISOString().split('T')[0];
    }
  }

  /**
   * Logs an entry to the file.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    // Check for date-based rotation
    if (this.rotationConfig?.dateRotation) {
      const currentDate = new Date().toISOString().split('T')[0];
      if (this.currentDate !== currentDate) {
        await this.rotateLogs();
        this.currentDate = currentDate;
      }
    }

    // Apply redaction if configured and enabled for file
    const redactedEntry = getRedactedEntry(entry, options.redaction, 'file');

    let logString: string;
    if (options.pluggableFormatter) {
      logString = options.pluggableFormatter.format(redactedEntry) + osEOL;
    } else if (options.formatter) {
      logString = options.formatter(redactedEntry) + osEOL;
    } else if (options.format === 'json') {
      logString = JSON.stringify(redactedEntry) + osEOL;
    } else {
      const levelString = LogLevel[redactedEntry.level].padEnd(5);
      // Safely process args for file output
      const argsString = redactedEntry.args.length > 0 ? ' ' + redactedEntry.args.map(arg => {
        if (arg === null) {
          return 'null';
        }
        if (arg === undefined) {
          return 'undefined';
        }
        if (isRecord(arg)) {
          if (isErrorLike(arg)) {
            return JSON.stringify(arg);
          }
          try {
            return JSON.stringify(arg);
          } catch {
            return `[Object: ${Object.prototype.toString.call(arg)}]`;
          }
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ') : '';
      logString = `[${redactedEntry.timestamp}] ${levelString}: ${redactedEntry.message}${argsString}${osEOL}`;
    }

    try {
      await this.bunFileOps.write(this.fileInstance, logString);
      
      // Check for size-based rotation
      if (this.rotationConfig?.maxFileSize) {
        const fileSize = await this.bunFileOps.stat(this.fileInstance);
        if (fileSize > this.rotationConfig.maxFileSize) {
          await this.rotateLogs();
        }
      }
    } catch (e) {
      console.error(`Failed to write to log file ${this.filePath}:`, e);
    }
  }

  /**
   * Rotate log files.
   */
  private async rotateLogs(): Promise<void> {
    if (!this.rotationConfig) return;

    const maxFiles = this.rotationConfig.maxFiles ?? 5;
    const compress = this.rotationConfig.compress ?? true;
    
    try {
      // Check if current file exists
      if (!(await this.bunFileOps.exists(this.fileInstance))) {
        return;
      }

      const dir = dirname(this.filePath);
      const name = basename(this.filePath, extname(this.filePath));
      const ext = extname(this.filePath);

      // Shift existing rotated files
      for (let i = maxFiles - 1; i >= 1; i--) {
        const currentFile = compress 
          ? join(dir, `${name}.${i}${ext}.gz`)
          : join(dir, `${name}.${i}${ext}`);
        const nextFile = compress
          ? join(dir, `${name}.${i + 1}${ext}.gz`)
          : join(dir, `${name}.${i + 1}${ext}`);

        const currentFileInstance = this.bunFileOps.file(currentFile);
        if (await this.bunFileOps.exists(currentFileInstance)) {
          if (i === maxFiles - 1) {
            // Delete the oldest file
            await Bun.$`rm -f ${currentFile}`.quiet();
          } else {
            // Move to next position
            await Bun.$`mv ${currentFile} ${nextFile}`.quiet();
          }
        }
      }

      // Rotate current file to .1
      const rotatedFile = compress
        ? join(dir, `${name}.1${ext}.gz`)
        : join(dir, `${name}.1${ext}`);

      if (compress) {
        // Read, compress, and write
        const content = await this.fileInstance.text();
        const compressed = gzipSync(Buffer.from(content));
        await this.bunFileOps.write(rotatedFile, compressed);
      } else {
        await Bun.$`mv ${this.filePath} ${rotatedFile}`.quiet();
      }

      // Create new file instance
      this.fileInstance = this.bunFileOps.file(this.filePath);
    } catch (error) {
      console.error('Failed to rotate log files:', error);
    }
  }

  /**
   * File transport doesn't need explicit flushing as writes are immediate.
   */
  async flush(): Promise<void> {
    // No-op for file transport - writes are immediate
  }
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
 * DiscordWebhookTransport sends log entries to a Discord webhook URL, batching them to avoid rate limits.
 * Production notes:
 * - Handles Discord rate limits and retries with exponential backoff.
 * - Splits large messages into multiple requests if needed.
 * - Exposes a flush() method for graceful shutdown.
 */
class DiscordWebhookTransport implements Transport {
  private webhookUrl: string;
  private queue: LogEntry[] = [];
  private timer: Timer | null = null;
  private batchIntervalMs: number;
  private maxBatchSize: number;
  private username: string;
  private maxRetries: number;
  private suppressConsoleErrors: boolean;
  private isFlushing: boolean = false;
  private retryQueue: { batch: LogEntry[]; retries: number; nextAttempt: number }[] = [];

  /**
   * Creates a new DiscordWebhookTransport instance.
   * @param webhookUrl - Discord webhook URL
   * @param opts - Transport options
   */
  constructor(webhookUrl: string, opts?: DiscordWebhookTransportOptions) {
    this.webhookUrl = webhookUrl;
    this.batchIntervalMs = opts?.batchIntervalMs ?? 2000;
    this.maxBatchSize = opts?.maxBatchSize ?? 10;
    this.username = opts?.username ?? 'JellyLogger';
    this.maxRetries = opts?.maxRetries ?? 3;
    this.suppressConsoleErrors = opts?.suppressConsoleErrors ?? false;
  }

  /**
   * Queues a log entry for batched sending to Discord.
   * @param entry - The log entry to send
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    this.queue.push(entry);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(options), this.batchIntervalMs);
    }
    if (this.queue.length >= this.maxBatchSize) {
      await this.flush(options);
    }
  }

  /**
   * Flushes the queue and any retryQueue batches.
   * Returns a Promise that resolves when all batches are sent or retried.
   */
  async flush(options?: LoggerOptions): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    // Use default options if not provided
    const loggerOptions = options || {
      level: LogLevel.INFO,
      useHumanReadableTime: false,
      transports: [],
      format: 'string' as const,
    };

    // Flush main queue
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxBatchSize);
      await this.sendBatchWithRetry(batch, loggerOptions);
    }

    // Flush retryQueue (respecting nextAttempt)
    let now = Date.now();
    this.retryQueue = this.retryQueue.filter(item => {
      if (item.nextAttempt > now) return true;
      this.sendBatchWithRetry(item.batch, loggerOptions, item.retries + 1);
      return false;
    });

    this.clearTimer();
    // If more logs are queued, schedule next flush
    if (this.queue.length > 0 || this.retryQueue.length > 0) {
      this.timer = setTimeout(() => this.flush(loggerOptions), this.batchIntervalMs);
    }
    this.isFlushing = false;
  }

  private async sendBatchWithRetry(batch: LogEntry[], options: LoggerOptions, retries = 0): Promise<void> {
    try {
      await this.sendBatch(batch, options);
    } catch (e: unknown) {
      if (retries < this.maxRetries) {
        // Exponential backoff: 2^retries * 1000ms
        const nextAttempt = Date.now() + Math.pow(2, retries) * 1000;
        this.retryQueue.push({ batch, retries, nextAttempt });
      } else if (!this.suppressConsoleErrors) {
        console.error("Failed to send log batch to Discord webhook after retries:", e);
      }
    }
  }

  private async sendBatch(batch: LogEntry[], options: LoggerOptions): Promise<void> {
    // Format batch for Discord, split if >2000 chars
    const messages: string[] = [];
    let current = "";

    for (const entry of batch) {
      let formatted: string;
      if (options.formatter) {
        formatted = options.formatter(entry);
      } else if (options.format === 'json') {
        formatted = '```json\n' + JSON.stringify(entry, null, 2) + '\n```';
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
      // Split into multiple messages if needed
      if ((current + "\n\n" + formatted).length > 2000) {
        if (current) messages.push(current);
        current = formatted;
      } else {
        current = current ? current + "\n\n" + formatted : formatted;
      }
    }
    if (current) messages.push(current);

    for (const content of messages) {
      await this.sendDiscordMessage(content);
    }
  }

  private async sendDiscordMessage(content: string): Promise<void> {
    const body = JSON.stringify({
      content: content.length > 2000 ? content.slice(0, 1990) + '…' : content,
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
        // Handle Discord rate limits
        if (response.status === 429) {
          const responseData = await response.json() as unknown;
          let retryAfterSeconds = 2; // Default retry_after in seconds

          // Type guard to check if responseData has a numeric retry_after property
          if (
            typeof responseData === "object" &&
            responseData !== null &&
            "retry_after" in responseData && 
            typeof (responseData as { retry_after: unknown }).retry_after === "number"
          ) {
            retryAfterSeconds = (responseData as DiscordRateLimitResponse).retry_after;
          }
          
          const delayMilliseconds = Math.max(1000, retryAfterSeconds * 1000);
          await new Promise(res => setTimeout(res, delayMilliseconds));
          throw new Error(`Discord rate limited. Retry after ${retryAfterSeconds}s. Original status: ${response.status} ${response.statusText}`);
        }
        throw new Error(`Discord webhook error: ${response.status} ${response.statusText}`);
      }
    } catch (e: unknown) {
      // Handle unknown error types more robustly
      if (e instanceof Error && (e.message.startsWith("Discord rate limited") || e.message.startsWith("Discord webhook error"))) {
          throw e;
      }
      // For other errors (e.g., network issues, JSON parsing failures), wrap them
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
}

/**
 * Interface for child logger options.
 */
interface ChildLoggerOptions {
  /** Default structured data to include in all log entries */
  defaultData?: Record<string, unknown>;
  /** Prefix to add to all log messages */
  messagePrefix?: string;
}

const defaultOptions: Omit<Required<LoggerOptions>, 'formatter' | 'customConsoleColors' | 'redaction' | 'pluggableFormatter'> & { 
  formatter?: LoggerOptions['formatter'], 
  customConsoleColors?: LoggerOptions['customConsoleColors'],
  redaction?: LoggerOptions['redaction'],
  pluggableFormatter?: LoggerOptions['pluggableFormatter'],
} = {
  level: LogLevel.INFO,
  useHumanReadableTime: false,
  transports: [new ConsoleTransport()],
  format: 'string',
  formatter: undefined,
  customConsoleColors: undefined,
  redaction: undefined,
  pluggableFormatter: undefined,
};

/**
 * Base logger interface defining core logging methods.
 */
interface BaseLogger {
  /**
   * Log a fatal error message.
   * @param message - The log message
   * @param data - Optional structured data or additional arguments
   */
  fatal(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void;
  
  /**
   * Log an error message.
   * @param message - The log message
   * @param data - Optional structured data or additional arguments
   */
  error(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void;
  
  /**
   * Log a warning message.
   * @param message - The log message
   * @param data - Optional structured data or additional arguments
   */
  warn(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void;
  
  /**
   * Log an info message.
   * @param message - The log message
   * @param data - Optional structured data or additional arguments
   */
  info(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void;
  
  /**
   * Log a debug message.
   * @param message - The log message
   * @param data - Optional structured data or additional arguments
   */
  debug(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void;
  
  /**
   * Log a trace message.
   * @param message - The log message
   * @param data - Optional structured data or additional arguments
   */
  trace(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void;
}

/**
 * Child logger that inherits configuration from parent but can have its own context.
 */
class ChildLogger implements BaseLogger {
  private parentLogger: typeof logger;
  private childOptions: ChildLoggerOptions;

  /**
   * Creates a new child logger instance.
   * @param parentLogger - The parent logger to inherit from
   * @param childOptions - Child-specific options
   */
  constructor(parentLogger: typeof logger, childOptions: ChildLoggerOptions = {}) {
    this.parentLogger = parentLogger;
    this.childOptions = childOptions;
  }

  /**
   * Internal method to log with child context.
   */
  private _logWithContext(level: LogLevel, message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    const prefixedMessage = this.childOptions.messagePrefix 
      ? `${this.childOptions.messagePrefix} ${message}`
      : message;

    let processedData: Record<string, unknown> | undefined;
    let processedArgs: unknown[] = args;

    // Handle structured data
    if (isRecord(data)) {
      processedData = { ...this.childOptions.defaultData, ...data };
    } else if (data !== undefined) {
      processedArgs = [data, ...args];
      processedData = this.childOptions.defaultData;
    } else {
      processedData = this.childOptions.defaultData;
    }

    this.parentLogger._logWithData(level, prefixedMessage, processedData, ...processedArgs);
  }

  fatal(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    this._logWithContext(LogLevel.FATAL, message, data, ...args);
  }

  error(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    this._logWithContext(LogLevel.ERROR, message, data, ...args);
  }

  warn(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    this._logWithContext(LogLevel.WARN, message, data, ...args);
  }

  info(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    this._logWithContext(LogLevel.INFO, message, data, ...args);
  }

  debug(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    this._logWithContext(LogLevel.DEBUG, message, data, ...args);
  }

  trace(message: string, data?: Record<string, unknown> | unknown, ...args: unknown[]): void {
    this._logWithContext(LogLevel.TRACE, message, data, ...args);
  }

  /**
   * Create a child of this child logger.
   * @param childOptions - Additional child options
   * @returns A new child logger
   */
  child(childOptions: ChildLoggerOptions = {}): ChildLogger {
    const mergedOptions: ChildLoggerOptions = {
      defaultData: { ...this.childOptions.defaultData, ...childOptions.defaultData },
      messagePrefix: this.childOptions.messagePrefix && childOptions.messagePrefix
        ? `${this.childOptions.messagePrefix} ${childOptions.messagePrefix}`
        : this.childOptions.messagePrefix || childOptions.messagePrefix,
    };
    return new ChildLogger(this.parentLogger, mergedOptions);
  }
}

/**
 * Logger utility for consistent output.
 */
const logger: {
  options: Omit<Required<LoggerOptions>, 'formatter' | 'customConsoleColors' | 'redaction' | 'pluggableFormatter'> & { 
    formatter?: LoggerOptions['formatter'], 
    customConsoleColors?: LoggerOptions['customConsoleColors'],
    redaction?: LoggerOptions['redaction'],
    pluggableFormatter?: LoggerOptions['pluggableFormatter']
  };
  setOptions(newOptions: LoggerOptions): void;
  resetOptions(): void;
  _log(level: LogLevel, message: string, ...args: unknown[]): void;
  _logWithData(level: LogLevel, message: string, data?: Record<string, unknown>, ...args: unknown[]): void;
  fatal(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void;
  error(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void;
  warn(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void;
  info(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void;
  debug(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void;
  trace(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void;
  child(childOptions?: ChildLoggerOptions): ChildLogger;
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
   * Internal logging method with structured data support.
   * @param level - Log level
   * @param message - Log message
   * @param data - Structured data
   * @param args - Additional arguments
   */
  _logWithData(level: LogLevel, message: string, data?: Record<string, unknown>, ...args: unknown[]): void {
    if (level > this.options.level || this.options.level === LogLevel.SILENT) {
      return;
    }

    const processedArgs = processLogArgs(args);

    const entry: LogEntry = {
      timestamp: getTimestamp(this.options.useHumanReadableTime),
      level,
      levelName: LogLevel[level],
      message,
      args: processedArgs,
      data,
    };

    for (const transport of this.options.transports) {
      try {
        Promise.resolve(
          transport.log(
            entry,
            this.options as Required<Omit<LoggerOptions, 'formatter' | 'customConsoleColors'>> & {
              formatter?: LoggerOptions['formatter'],
              customConsoleColors?: LoggerOptions['customConsoleColors']
            }
          )
        ).catch(error => {
          console.error(`Error in asynchronous transport '${transport.constructor.name}':`, error);
        });
      } catch (error) {
        console.error(`Error in synchronous transport '${transport.constructor.name}':`, error);
      }
    }
  },

  /**
   * Log a fatal error message.
   * @param message - The log message
   * @param dataOrArg - Optional structured data or the first additional argument
   * @param otherArgs - Additional arguments if dataOrArg is not structured data
   */
  fatal(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void {
    let structuredData: Record<string, unknown> | undefined = undefined;
    let logArgs: unknown[];

    if (dataOrArg instanceof Error) {
      logArgs = [dataOrArg, ...otherArgs];
    } else if (isRecord(dataOrArg)) {
      structuredData = dataOrArg;
      logArgs = otherArgs;
    } else {
      logArgs = dataOrArg !== undefined ? [dataOrArg, ...otherArgs] : otherArgs;
    }
    this._logWithData(LogLevel.FATAL, message, structuredData, ...logArgs);
  },

  /**
   * Log an error message.
   * @param message - The log message
   * @param dataOrArg - Optional structured data or the first additional argument
   * @param otherArgs - Additional arguments if dataOrArg is not structured data
   */
  error(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void {
    let structuredData: Record<string, unknown> | undefined = undefined;
    let logArgs: unknown[];

    if (dataOrArg instanceof Error) {
      logArgs = [dataOrArg, ...otherArgs];
    } else if (isRecord(dataOrArg)) {
      structuredData = dataOrArg;
      logArgs = otherArgs;
    } else {
      logArgs = dataOrArg !== undefined ? [dataOrArg, ...otherArgs] : otherArgs;
    }
    this._logWithData(LogLevel.ERROR, message, structuredData, ...logArgs);
  },

  /**
   * Log a warning message.
   * @param message - The log message
   * @param dataOrArg - Optional structured data or the first additional argument
   * @param otherArgs - Additional arguments if dataOrArg is not structured data
   */
  warn(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void {
    let structuredData: Record<string, unknown> | undefined = undefined;
    let logArgs: unknown[];

    if (dataOrArg instanceof Error) {
      logArgs = [dataOrArg, ...otherArgs];
    } else if (isRecord(dataOrArg)) {
      structuredData = dataOrArg;
      logArgs = otherArgs;
    } else {
      logArgs = dataOrArg !== undefined ? [dataOrArg, ...otherArgs] : otherArgs;
    }
    this._logWithData(LogLevel.WARN, message, structuredData, ...logArgs);
  },

  /**
   * Log an info message.
   * @param message - The log message
   * @param dataOrArg - Optional structured data or the first additional argument
   * @param otherArgs - Additional arguments if dataOrArg is not structured data
   */
  info(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void {
    let structuredData: Record<string, unknown> | undefined = undefined;
    let logArgs: unknown[];

    if (dataOrArg instanceof Error) {
      logArgs = [dataOrArg, ...otherArgs];
    } else if (isRecord(dataOrArg)) {
      structuredData = dataOrArg;
      logArgs = otherArgs;
    } else {
      logArgs = dataOrArg !== undefined ? [dataOrArg, ...otherArgs] : otherArgs;
    }
    this._logWithData(LogLevel.INFO, message, structuredData, ...logArgs);
  },

  /**
   * Log a debug message.
   * @param message - The log message
   * @param dataOrArg - Optional structured data or the first additional argument
   * @param otherArgs - Additional arguments if dataOrArg is not structured data
   */
  debug(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void {
    let structuredData: Record<string, unknown> | undefined = undefined;
    let logArgs: unknown[];

    if (dataOrArg instanceof Error) {
      logArgs = [dataOrArg, ...otherArgs];
    } else if (isRecord(dataOrArg)) {
      structuredData = dataOrArg;
      logArgs = otherArgs;
    } else {
      logArgs = dataOrArg !== undefined ? [dataOrArg, ...otherArgs] : otherArgs;
    }
    this._logWithData(LogLevel.DEBUG, message, structuredData, ...logArgs);
  },

  /**
   * Log a trace message.
   * @param message - The log message
   * @param dataOrArg - Optional structured data or the first additional argument
   * @param otherArgs - Additional arguments if dataOrArg is not structured data
   */
  trace(message: string, dataOrArg?: Record<string, unknown> | unknown, ...otherArgs: unknown[]): void {
    let structuredData: Record<string, unknown> | undefined = undefined;
    let logArgs: unknown[];

    if (dataOrArg instanceof Error) {
      logArgs = [dataOrArg, ...otherArgs];
    } else if (isRecord(dataOrArg)) {
      structuredData = dataOrArg;
      logArgs = otherArgs;
    } else {
      logArgs = dataOrArg !== undefined ? [dataOrArg, ...otherArgs] : otherArgs;
    }
    this._logWithData(LogLevel.TRACE, message, structuredData, ...logArgs);
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
   * Flushes all transports. Call this before application shutdown.
   * @returns Promise that resolves when all transports are flushed
   */
  async flushAll(): Promise<void> {
    const flushPromises = this.options.transports
      .map(transport => transport.flush?.())
      .filter(Boolean) as Promise<void>[];
    
    await Promise.all(flushPromises);
  },
};

// Export all main classes, enums, interfaces, and logger at the bottom for library consumers
export {
  LogLevel,
  ConsoleTransport,
  FileTransport,
  DiscordWebhookTransport,
  ChildLogger,
  LogfmtFormatter,
  NdjsonFormatter,
  logger,
};

export type {
  LogEntry,
  Transport,
  LoggerOptions,
  ChildLoggerOptions,
  DiscordWebhookTransportOptions,
  CustomConsoleColors,
  DiscordRateLimitResponse,
  BaseLogger,
  LogFormatter,
  RedactionConfig,
  LogRotationConfig,
};