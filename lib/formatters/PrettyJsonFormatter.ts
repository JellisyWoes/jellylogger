import type { CustomConsoleColors, LogEntry } from '../core/types';
import {
  boldText,
  colorizeLevelText,
  dimText,
  getConsistentFormatterColors,
} from '../utils/formatterColors';
import type { LogFormatter } from './LogFormatter';

/**
 * PrettyJsonFormatter outputs pretty-printed JSON with optional colorization for key fields.
 */
export class PrettyJsonFormatter implements LogFormatter {
  format(
    entry: LogEntry,
    options?: { consoleColors?: CustomConsoleColors; useColors?: boolean }
  ): string {
    const colors = getConsistentFormatterColors(options);
    // Build a plain object for pretty-printing
    const data = {
      timestamp: entry.timestamp,
      level: entry.levelName.toLowerCase(),
      message: entry.message,
      ...entry.data,
      ...(entry.args.processedArgs.length > 0 ? { args: entry.args } : {}),
    };
    let json = JSON.stringify(data, null, 2);
    if (colors) {
      // Colorize key fields (timestamp, level, message) in the pretty JSON output
      json = json
        .replace(
          /("timestamp":\s*")([^"]+)(")/,
          (_m, p1, p2, p3) => `${p1}${dimText(p2, colors)}${p3}`
        )
        .replace(
          /("level":\s*")([^"]+)(")/,
          (_m, p1, p2, p3) => `${p1}${colorizeLevelText(p2, entry.level, colors)}${p3}`
        )
        .replace(
          /("message":\s*")([^"]+)(")/,
          (_m, p1, p2, p3) => `${p1}${boldText(p2, colors)}${p3}`
        );
    }
    return json;
  }
}
