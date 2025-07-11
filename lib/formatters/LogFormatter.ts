import type { LogEntry, CustomConsoleColors } from '../core/types';

/**
 * Interface for pluggable formatters.
 */
export interface LogFormatter {
  /**
   * Format a log entry into a string.
   * @param entry - The log entry to format
   * @param colors - Optional console colors for colorized output
   * @returns Formatted log string
   */
  format(entry: LogEntry, colors?: {
    consoleColors?: CustomConsoleColors;
    useColors?: boolean;
  }): string;
}
