import { gzipSync } from 'bun';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { EOL as osEOL } from 'os';
import { basename, dirname, extname, join } from 'path';
import type { LogEntry, LoggerOptions, Transport, TransportOptions } from '../core/types';
import { DEFAULT_FORMATTER } from '../formatters';
import { getRedactedEntry } from '../redaction';
import { safeJsonStringify } from '../utils/serialization';

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
 * Interface for shell operations used by FileTransport.
 */
export interface ShellOperations {
  mkdir: (path: string) => Promise<{ exitCode: number }>;
  mv: (source: string, dest: string) => Promise<{ exitCode: number }>;
  rm: (path: string) => Promise<{ exitCode: number }>;
}

/**
 * Interface for file system operations used by FileTransport.
 */
export interface FileSystemOperations {
  existsSync: typeof existsSync;
  statSync: typeof statSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
}

/**
 * Interface for Bun file operations used by FileTransport.
 * This allows for dependency injection for testing.
 */
export interface InjectedBunFileOperations {
  file: typeof Bun.file;
  write: typeof Bun.write;
  appendFileSync: typeof appendFileSync;
  shell?: ShellOperations;
  fs?: FileSystemOperations;
}

/**
 * FileTransport writes log entries to a file using synchronous operations with optional rotation.
 */
export class FileTransport implements Transport {
  private filePath: string;
  private bunFileOps: InjectedBunFileOperations;
  private fs: FileSystemOperations;
  private rotationConfig?: LogRotationConfig;
  private currentDate?: string;
  private isRotating: boolean = false;
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
    bunOps?: Partial<InjectedBunFileOperations>,
  ) {
    this.filePath = filePath;
    this.rotationConfig = rotationConfig;
    this.bunFileOps = {
      file: bunOps?.file ?? Bun.file,
      write: bunOps?.write ?? Bun.write,
      appendFileSync: bunOps?.appendFileSync ?? appendFileSync,
      shell: bunOps?.shell,
      fs: bunOps?.fs,
    };

    // Set up file system operations - use injected fs or default to Node.js fs
    this.fs = this.bunFileOps.fs ?? {
      existsSync,
      statSync,
      readFileSync,
      writeFileSync,
      renameSync,
      unlinkSync,
    };

    // Removed this.shell assignment and use only local variable if needed
    if (rotationConfig?.dateRotation) {
      this.currentDate = new Date().toISOString().split('T')[0];
    }

    // Ensure the directory exists synchronously
    this.ensureDirectoryExistsSync();
  }

  /**
   * Ensure the log directory exists synchronously
   */
  private ensureDirectoryExistsSync(): void {
    try {
      const dir = dirname(this.filePath);
      if (!this.fs.existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      console.warn('Failed to create log directory:', error);
    }
  }

  /**
   * Logs an entry to the file using completely synchronous operations.
   * @param entry - The log entry to write
   * @param options - Transport options for formatting
   */
  log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    try {
      // Convert TransportOptions to LoggerOptions for internal use
      const loggerOptions: LoggerOptions = options ?? ({} as LoggerOptions);

      // Apply redaction specifically for file output
      const redactedEntry = getRedactedEntry(entry, loggerOptions.redaction, 'file');

      // Check for date-based rotation before writing (async in background)
      if (this.rotationConfig?.dateRotation) {
        const currentDate = new Date().toISOString().split('T')[0];
        if (this.currentDate !== currentDate) {
          // Schedule rotation in background without blocking
          if (!this.rotationPromise) {
            this.rotationPromise = this.rotateLogs();
            this.rotationPromise
              .finally(() => {
                this.currentDate = currentDate;
                this.rotationPromise = null;
              })
              .catch(error => {
                console.error('FileTransport date rotation error:', error);
              });
          }
        }
      }

      // Format the log string using formatters
      let logString: string;

      if (loggerOptions.pluggableFormatter) {
        try {
          const formatted = loggerOptions.pluggableFormatter.format(redactedEntry, {
            useColors: false, // No colors in file output
          });
          logString =
            (typeof formatted === 'string' ? formatted : JSON.stringify(formatted)) + osEOL;
        } catch (error) {
          console.error(
            'Pluggable formatter failed in FileTransport, using default:',
            error instanceof Error ? error.message : String(error),
          );
          logString = DEFAULT_FORMATTER.format(redactedEntry, { useColors: false }) + osEOL;
        }
      } else if (loggerOptions.formatter) {
        try {
          const formatted = loggerOptions.formatter(redactedEntry);
          logString =
            (typeof formatted === 'string' ? formatted : JSON.stringify(formatted)) + osEOL;
        } catch (error) {
          console.error(
            'Custom formatter failed in FileTransport, using default:',
            error instanceof Error ? error.message : String(error),
          );
          logString = DEFAULT_FORMATTER.format(redactedEntry, { useColors: false }) + osEOL;
        }
      } else if (loggerOptions.format === 'json') {
        // Use unified JSON serialization for consistent circular reference handling
        logString = safeJsonStringify(redactedEntry) + osEOL;
      } else {
        // Use default formatter for standard file output
        logString = DEFAULT_FORMATTER.format(redactedEntry, { useColors: false }) + osEOL;
      }

      // Write synchronously to ensure proper ordering
      try {
        this.bunFileOps.appendFileSync(this.filePath, logString);
      } catch (error) {
        console.error('FileTransport write error:', error);
        return Promise.resolve();
      }

      // Schedule size-based rotation check (don't block or await)
      // Removed setTimeout for better test determinism
      if (this.rotationConfig?.maxFileSize && !this.rotationPromise) {
        try {
          // Use fs.statSync for size checking to allow proper mocking in tests
          const stats = this.fs.statSync(this.filePath);
          if (stats.size > this.rotationConfig.maxFileSize) {
            this.rotationPromise = this.rotateLogs();
            this.rotationPromise
              .finally(() => {
                this.rotationPromise = null;
              })
              .catch(error => {
                console.error('FileTransport size rotation error:', error);
              });
          }
        } catch (error) {
          console.error('FileTransport size check error:', error);
        }
      }

      return Promise.resolve();
    } catch (error) {
      console.error('FileTransport log error:', error);
      return Promise.resolve();
    }
  }

  /**
   * Rotate log files with proper locking and error handling.
   */
  private async rotateLogs(): Promise<void> {
    await Promise.resolve(); // Satisfy require-await rule
    if (!this.rotationConfig || this.isRotating) return;

    this.isRotating = true;

    try {
      const maxFiles = this.rotationConfig.maxFiles ?? 5;
      const compress = this.rotationConfig.compress ?? true;

      // Check if current file exists
      const currentFileExists = this.fs.existsSync(this.filePath);
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

          const exists = this.fs.existsSync(oldFile);

          if (exists) {
            try {
              this.fs.unlinkSync(oldFile);
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

          const exists = this.fs.existsSync(currentFile);

          if (exists) {
            const nextFile = compress
              ? join(dir, `${name}.${i + 1}${ext}.gz`)
              : join(dir, `${name}.${i + 1}${ext}`);
            try {
              this.fs.renameSync(currentFile, nextFile);
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
            const content = this.fs.readFileSync(this.filePath, 'utf8');
            const compressed = gzipSync(Buffer.from(content));
            this.fs.writeFileSync(rotatedFile, compressed);
            // Remove original file after successful compression
            this.fs.unlinkSync(this.filePath);
          } catch (e) {
            console.error(`Failed to compress and rotate log file:`, e);
            // Continue with normal rotation if compression fails
            try {
              this.fs.renameSync(this.filePath, rotatedFile);
            } catch (moveError) {
              console.error(`Failed to move log file during rotation fallback:`, moveError);
            }
          }
        } else {
          try {
            this.fs.renameSync(this.filePath, rotatedFile);
          } catch (e) {
            console.error(`Failed to move log file during rotation:`, e);
          }
        }

        // Create new file instance
        // Removed: this.fileInstance = this.bunFileOps.file(this.filePath);
      } catch (error) {
        console.error('Critical error during log rotation:', error);
        // Try to continue with a new file instance even if rotation failed
        // Removed: this.fileInstance = this.bunFileOps.file(this.filePath);
      }
    } finally {
      this.isRotating = false;
    }
  }

  /**
   * Flush any pending writes.
   */
  flush(_options?: TransportOptions): Promise<void> {
    // Since we're using synchronous writes, there's nothing to flush
    // Just wait for any ongoing rotation to complete
    if (this.rotationPromise) {
      return this.rotationPromise.catch(() => {
        // Ignore rotation errors during flush
      });
    }
    return Promise.resolve();
  }
}
