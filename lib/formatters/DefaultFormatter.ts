import type { CustomConsoleColors, LogEntry } from '../core/types';
import type { LogFormatter } from './LogFormatter';
import { LogLevel } from '../core/constants';
import { safeProcessArgs, safeProcessData } from '../utils/serialization';
import { colorizeLevelText, dimText, getConsistentFormatterColors } from '../utils/formatterColors';

/**
 * Default formatter that provides the standard JellyLogger formatting.
 * This was previously implemented directly in the transports.
 */
export class DefaultFormatter implements LogFormatter {
  format(
    entry: LogEntry,
    options?: { consoleColors?: CustomConsoleColors; useColors?: boolean },
  ): string {
    const colors = getConsistentFormatterColors(options);

    const levelString = (LogLevel[entry.level] || 'UNKNOWN').padEnd(5);

    // Handle structured data display using unified approach
    const dataDisplay = safeProcessData(entry.data);
    const dataString = dataDisplay ? ` ${dataDisplay}` : '';

    // Safely process args for display with unified approach
    const processedArgs = safeProcessArgs(entry.args);
    const argsString = processedArgs.length > 0 ? ` ${processedArgs.join(' ')}` : '';

    if (colors) {
      // Colorized output for console
      const timestampPart = dimText(`[${entry.timestamp}]`, colors);
      const levelPart = colorizeLevelText(`${levelString}:`, entry.level, colors);
      const messagePart = entry.message;

      return `${timestampPart} ${levelPart} ${messagePart}${dataString}${argsString}`;
    } else {
      // Plain text output for files
      return `[${entry.timestamp}] ${levelString}: ${entry.message}${dataString}${argsString}`;
    }
  }
}
