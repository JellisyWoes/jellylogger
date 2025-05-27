import type { LogEntry } from '../core/types';
import type { LogFormatter } from './LogFormatter';

/**
 * Built-in logfmt formatter.
 */
export class LogfmtFormatter implements LogFormatter {
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
