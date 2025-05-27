import type { LogEntry } from '../core/types';
import type { LogFormatter } from './LogFormatter';

/**
 * Built-in NDJSON (newline-delimited JSON) formatter.
 */
export class NdjsonFormatter implements LogFormatter {
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
