import type { LogEntry, CustomConsoleColors } from '../core/types';
import type { LogFormatter } from './LogFormatter';
import { safeStringify } from '../utils/serialization';
import { 
  getConsistentFormatterColors, 
  colorizeLevelText, 
  dimText, 
  boldText,
  escapeQuotes 
} from '../utils/formatterColors';

/**
 * Built-in logfmt formatter with color support.
 */
export class LogfmtFormatter implements LogFormatter {
  format(entry: LogEntry, options?: { consoleColors?: CustomConsoleColors; useColors?: boolean }): string {
    const pairs: string[] = [];
    const colors = getConsistentFormatterColors(options);
    
    // Format timestamp
    const timestamp = dimText(`ts=${entry.timestamp}`, colors);
    pairs.push(timestamp);
    
    // Format level with color
    const levelName = entry.levelName.toLowerCase();
    const level = colorizeLevelText(`level=${levelName}`, entry.level, colors);
    pairs.push(level);
    
    // Format message
    const escapedMessage = escapeQuotes(entry.message);
    const message = boldText(`msg="${escapedMessage}"`, colors);
    pairs.push(message);

    // Format data fields using unified serialization
    if (entry.data) {
      for (const [key, value] of Object.entries(entry.data)) {
        const stringValue = safeStringify(value);
        const escapedValue = escapeQuotes(stringValue);
        const dataField = dimText(`${key}="${escapedValue}"`, colors);
        pairs.push(dataField);
      }
    }

    // Format args using unified serialization
    if (entry.args.processedArgs.length > 0) {
      entry.args.processedArgs.forEach((arg: unknown, index: number) => {
        const stringValue = safeStringify(arg);
        const escapedValue = escapeQuotes(stringValue);
        const argField = dimText(`arg${index}="${escapedValue}"`, colors);
        pairs.push(argField);
      });
    }

    return pairs.join(' ');
  }
}
