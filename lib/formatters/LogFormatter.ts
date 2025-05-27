import type { LogEntry } from '../core/types';

/**
 * Interface for pluggable formatters.
 */
export interface LogFormatter {
  /**
   * Format a log entry into a string.
   * @param entry - The log entry to format
   * @returns Formatted log string
   */
  format(entry: LogEntry): string;
}
