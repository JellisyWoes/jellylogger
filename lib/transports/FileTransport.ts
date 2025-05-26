import type { BunFile } from 'bun';
import { EOL as osEOL } from 'os';
import { gzipSync } from 'bun';
import { join, dirname, basename, extname } from 'path';
import { getRedactedEntry, type LogEntry } from '../features/redaction';
import { LogLevel, type LoggerOptions, type Transport } from './ConsoleTransport';

/**
 * Configuration for log rotation.
 */
export interface LogRotationConfig {
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
 * Interface for Bun file operations used by FileTransport.
 * This allows for dependency injection for testing.
 */
export interface InjectedBunFileOperations {
  file: typeof Bun.file;
  write: typeof Bun.write;
}

/**
 * FileTransport writes log entries to a file with optional rotation and proper locking.
 */
export class FileTransport implements Transport {
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
        logString = this.getDefaultLogString(redactedEntry);
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
      logString = this.getDefaultLogString(redactedEntry);
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

  private getDefaultLogString(redactedEntry: LogEntry): string {
    const levelString = (LogLevel[redactedEntry.level] || 'UNKNOWN').padEnd(5);
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
