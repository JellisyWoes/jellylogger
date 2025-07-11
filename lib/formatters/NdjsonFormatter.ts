import type { LogEntry, CustomConsoleColors } from '../core/types';
import type { LogFormatter } from './LogFormatter';
import { LogLevel } from '../core/constants';
import { safeJsonStringify } from '../utils/serialization';
import { getConsistentFormatterColors, colorizeLevelText, boldText, dimText } from '../utils/formatterColors';

/**
 * Built-in NDJSON (newline-delimited JSON) formatter with color support.
 */
export class NdjsonFormatter implements LogFormatter {
  format(entry: LogEntry, options?: { consoleColors?: CustomConsoleColors; useColors?: boolean }): string {
    const data = {
      timestamp: entry.timestamp,
      level: entry.levelName.toLowerCase(),
      message: entry.message,
      ...entry.data,
      ...(entry.args.processedArgs.length > 0 ? { args: entry.args } : {}),
    };

    // Use unified serialization for consistent circular reference handling
    const jsonString = safeJsonStringify(data);
    
    // Apply colors if enabled using unified color handling
    const colors = getConsistentFormatterColors(options);
    if (colors) {
      return this.colorizeJson(jsonString, entry.level, colors);
    }
    
    return jsonString;
  }

  private colorizeJson(jsonString: string, level: LogLevel, colors: import('../utils/formatterColors').FormatterColors): string {
    // Simple JSON colorization - highlight key fields with appropriate colors
    return jsonString
      .replace(/"level":"([^"]*)"/, (_match, levelValue) => 
        colorizeLevelText(`"level":"${levelValue}"`, level, colors))
      .replace(/"message":"([^"]*)"/, (_match, messageValue) => 
        boldText(`"message":"${messageValue}"`, colors))
      .replace(/"timestamp":"([^"]*)"/, (_match, timestampValue) => 
        dimText(`"timestamp":"${timestampValue}"`, colors));
  }
}