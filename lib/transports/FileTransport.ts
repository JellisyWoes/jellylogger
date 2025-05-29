import type { BunFile } from 'bun';
import { EOL as osEOL } from 'os';
import { gzipSync } from 'bun';
import { join, dirname, basename, extname } from 'path';
import { getRedactedEntry } from '../redaction';
import { LogLevel } from '../core/constants';
import type { LogEntry, LoggerOptions, Transport } from '../core/types';

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
  private writeQueue: Array<{ content: string; resolve: () => void; reject: (error: any) => void }> = [];
  private processingQueue: boolean = false;
  private rotationPromise: Promise<void> | null = null;

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

    // Ensure the directory exists
    this.ensureDirectoryExists();
  }

  /**
   * Ensure the log directory exists
   */
  private async ensureDirectoryExists(): Promise<void> {
    try {
      const dir = dirname(this.filePath);
      await Bun.$`mkdir -p ${dir}`.quiet();
    } catch (error) {
      console.warn('Failed to create log directory:', error);
    }
  }

  /**
   * Process the write queue sequentially to prevent race conditions
   */
  private async processWriteQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;

    try {
      while (this.writeQueue.length > 0) {
        // Wait for any ongoing rotation to complete first
        if (this.rotationPromise) {
          try {
            await this.rotationPromise;
          } catch (error) {
            console.error('Rotation failed, continuing with writes:', error);
          }
        }

        const writeItem = this.writeQueue.shift();
        if (!writeItem) continue;

        try {
          // Perform the actual write operation
          await this.bunFileOps.write(this.fileInstance, writeItem.content);
          writeItem.resolve();
        } catch (error) {
          console.error(`FileTransport write error:`, error);
          writeItem.reject(error);
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Add a write operation to the queue
   */
  private queueWrite(content: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.writeQueue.push({ content, resolve, reject });
      
      // Start processing the queue if not already processing
      if (!this.processingQueue) {
        this.processWriteQueue().catch(error => {
          console.error('Error processing write queue:', error);
        });
      }
    });
  }

  /**
   * Logs an entry to the file with proper write locking and error handling.
   * @param entry - The log entry to write
   * @param options - Logger options for formatting
   */
  async log(entry: LogEntry, options: LoggerOptions): Promise<void> {
    try {
      // Apply redaction specifically for file output
      const redactedEntry = getRedactedEntry(entry, options.redaction, 'file');
      
      // Check for date-based rotation before writing
      if (this.rotationConfig?.dateRotation) {
        const currentDate = new Date().toISOString().split('T')[0];
        if (this.currentDate !== currentDate) {
          try {
            this.rotationPromise = this.rotateLogs();
            await this.rotationPromise;
            this.currentDate = currentDate;
            this.rotationPromise = null;
          } catch (error) {
            console.error('FileTransport date rotation error:', error);
            this.rotationPromise = null;
            // Continue with logging even if rotation fails
          }
        }
      }

      // Format the log string
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
          // Handle circular references in JSON more robustly
          try {
            // Attempt a more robust stringification, sanitizing args and data
            const sanitizedArgs = redactedEntry.args.map((arg: unknown) => {
              if (typeof arg === 'object' && arg !== null) {
                try {
                  JSON.stringify(arg); // Test serializability
                  return arg;
                } catch {
                  return '[Object - Circular or Non-serializable]';
                }
              }
              return arg;
            });

            let sanitizedData: unknown = redactedEntry.data;
            if (typeof redactedEntry.data === 'object' && redactedEntry.data !== null) {
              try {
                JSON.stringify(redactedEntry.data); // Test serializability
                // If serializable, use it, otherwise it will be replaced by placeholder
              } catch {
                sanitizedData = '[Data - Circular or Non-serializable]';
              }
            }
            
            // Construct a new object with potentially problematic parts (like data) explicitly handled
            // This avoids issues if redactedEntry itself is a complex object (e.g., proxy)
            // that `...redactedEntry` might mishandle.
            logString = JSON.stringify({
              timestamp: redactedEntry.timestamp,
              level: redactedEntry.level,
              levelName: redactedEntry.levelName,
              message: redactedEntry.message,
              args: sanitizedArgs,
              data: sanitizedData,
            }) + osEOL;
          } catch (e2) { // Inner catch for the robust stringification failure
            // Final fallback: stringify only basic, known-safe properties
            logString = JSON.stringify({
              timestamp: redactedEntry.timestamp,
              level: redactedEntry.level,
              levelName: redactedEntry.levelName,
              message: redactedEntry.message,
              args: '[Args - Processing Error]',
              data: '[Data - Processing Error]'
            }) + osEOL;
          }
        }
      } else {
        logString = this.getDefaultLogString(redactedEntry);
      }

      // Queue the write operation
      const writePromise = this.queueWrite(logString);
      this.pendingWrites.push(writePromise);
      
      try {
        await writePromise;
        
        // Check for size-based rotation after successful write
        if (this.rotationConfig?.maxFileSize && !this.rotationPromise) {
          try {
            // Get current file size
            const fileSize = this.fileInstance.size;
            if (typeof fileSize === 'number' && fileSize > this.rotationConfig.maxFileSize) {
              this.rotationPromise = this.rotateLogs();
              // Don't await here to avoid blocking subsequent writes
              this.rotationPromise.finally(() => {
                this.rotationPromise = null;
              });
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
    } catch (error) {
      console.error('FileTransport log error:', error);
      // Don't throw - we want logging to continue even if file transport fails
    }
  }

  private getDefaultLogString(redactedEntry: LogEntry): string {
    const levelString = (LogLevel[redactedEntry.level] || 'UNKNOWN').padEnd(5);
    
    // Handle structured data display
    let dataDisplay = '';
    if (redactedEntry.data && Object.keys(redactedEntry.data).length > 0) {
      try {
        dataDisplay = ' ' + JSON.stringify(redactedEntry.data);
      } catch {
        dataDisplay = ' [Data - Circular or Non-serializable]';
      }
    }
    
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
    
    return `[${redactedEntry.timestamp}] ${levelString}: ${redactedEntry.message}${dataDisplay}${argsString}${osEOL}`;
  }

  /**
   * Rotate log files with proper locking and error handling.
   */
  private async rotateLogs(): Promise<void> {
    if (!this.rotationConfig || this.isRotating) return;
    
    this.isRotating = true;
    
    try {
      // Wait for all pending writes to complete before rotation
      await Promise.all([...this.pendingWrites]);
      
      // Ensure write queue is also processed
      while (this.writeQueue.length > 0 || this.processingQueue) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
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
      }
    } finally {
      this.isRotating = false;
    }
  }

  /**
   * Wait for all pending writes to complete and ensure all data is flushed.
   */
  async flush(_options?: LoggerOptions): Promise<void> {
    try {
      // Wait for all pending write promises
      if (this.pendingWrites.length > 0) {
        await Promise.allSettled(this.pendingWrites);
      }

      // Process any remaining items in the write queue
      if (this.writeQueue.length > 0) {
        await this.processWriteQueue();
      }

      // Wait for any ongoing rotation to complete
      if (this.rotationPromise) {
        try {
          await this.rotationPromise;
        } catch (error) {
          console.error('Error during rotation flush:', error);
        }
      }

      // Ensure write queue is empty
      while (this.writeQueue.length > 0 || this.processingQueue) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Try to sync file to disk if possible (Bun-specific optimization)
      try {
        // Note: Bun doesn't have a direct fsync equivalent, but write operations are typically synchronous
        // This is a placeholder for any future Bun-specific flush capabilities
      } catch (error) {
        // Ignore sync errors - not critical for basic functionality
      }
    } catch (error) {
      console.error('FileTransport flush error:', error);
      // Don't throw - we want the application to continue even if flush fails
    }
  }
}
