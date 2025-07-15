import { LogLevel } from '../core/constants';
import type { CustomConsoleColors, LogEntry } from '../core/types';
import {
  colorizeLevelText,
  dimText,
  type FormatterColors,
  getConsistentFormatterColors,
} from '../utils/formatterColors';
import { safeStringify } from '../utils/serialization';
import type { LogFormatter } from './LogFormatter';

/**
 * Pretty Console Formatter that formats log entries across multiple lines
 * for enhanced readability in console environments.
 *
 * Features:
 * - Multi-line layout with clear visual separation
 * - Hierarchical indentation for nested data
 * - Color-coded log levels and sections
 * - Smart data formatting with type indicators
 * - Box-drawing characters for visual structure
 */
export class PrettyConsoleFormatter implements LogFormatter {
  private readonly indentSize: number = 2;
  private readonly maxLineLength: number = 80;

  constructor(options?: { indentSize?: number; maxLineLength?: number }) {
    this.indentSize = options?.indentSize ?? 2;
    this.maxLineLength = options?.maxLineLength ?? 80;
  }

  format(
    entry: LogEntry,
    options?: { consoleColors?: CustomConsoleColors; useColors?: boolean },
  ): string {
    const colors = getConsistentFormatterColors(options);
    const useColors = colors !== null;

    const lines: string[] = [];
    const indent = (level: number = 1) => ' '.repeat(level * this.indentSize);

    // Header line with timestamp, level, and message
    const levelString = (LogLevel[entry.level] || 'UNKNOWN').toUpperCase();
    const timestampPart = useColors
      ? dimText(`[${entry.timestamp}]`, colors)
      : `[${entry.timestamp}]`;
    const levelPart = useColors
      ? colorizeLevelText(`${levelString}`, entry.level, colors)
      : levelString;

    // Create a visual separator line
    const separatorChar = '─';
    const separator = useColors
      ? dimText(separatorChar.repeat(this.maxLineLength), colors)
      : separatorChar.repeat(this.maxLineLength);

    // Main header
    lines.push(`${timestampPart} ${levelPart}`);
    lines.push(separator);

    // Message section
    if (entry.message) {
      const messageLabel = useColors ? dimText('Message:', colors) : 'Message:';
      lines.push(`${messageLabel}`);

      // Wrap long messages
      const wrappedMessage = this.wrapText(entry.message, this.maxLineLength - this.indentSize);
      wrappedMessage.forEach(line => {
        lines.push(`${indent()}${line}`);
      });
    }

    // Data section
    if (entry.data && typeof entry.data === 'object' && Object.keys(entry.data).length > 0) {
      const dataLabel = useColors ? dimText('Data:', colors) : 'Data:';
      lines.push(`${dataLabel}`);

      const formattedData = this.formatObject(entry.data, 1, useColors, colors);
      lines.push(formattedData);
    }

    // Arguments section
    if (entry.args.processedArgs.length > 0) {
      const argsLabel = useColors ? dimText('Arguments:', colors) : 'Arguments:';
      lines.push(`${argsLabel}`);

      entry.args.processedArgs.forEach((arg, index) => {
        const argType = this.getValueType(arg);
        const typeIndicator = useColors ? dimText(`[${argType}]`, colors) : `[${argType}]`;

        lines.push(`${indent()}${index + 1}. ${typeIndicator}`);

        if (typeof arg === 'object' && arg !== null) {
          const formattedArg = this.formatObject(arg, 2, useColors, colors);
          lines.push(formattedArg);
        } else {
          const value = safeStringify(arg);
          const wrappedValue = this.wrapText(value, this.maxLineLength - this.indentSize * 2);
          wrappedValue.forEach(line => {
            lines.push(`${indent(2)}${line}`);
          });
        }
      });
    }

    // Footer separator
    lines.push(separator);

    return lines.join('\n');
  }

  /**
   * Format an object with proper indentation and type indicators
   */
  private formatObject(
    obj: unknown,
    indentLevel: number,
    useColors: boolean,
    colors: FormatterColors | null,
  ): string {
    if (obj === null) return `${' '.repeat(indentLevel * this.indentSize)}null`;
    if (obj === undefined) return `${' '.repeat(indentLevel * this.indentSize)}undefined`;

    if (typeof obj !== 'object') {
      return `${' '.repeat(indentLevel * this.indentSize)}${safeStringify(obj)}`;
    }

    const lines: string[] = [];
    const indent = ' '.repeat(indentLevel * this.indentSize);
    const childIndent = ' '.repeat((indentLevel + 1) * this.indentSize);

    if (Array.isArray(obj)) {
      lines.push(`${indent}[`);
      obj.forEach((item, index) => {
        const itemType = this.getValueType(item);
        const typeIndicator = useColors ? dimText(`[${itemType}]`, colors) : `[${itemType}]`;

        if (typeof item === 'object' && item !== null) {
          lines.push(`${childIndent}${index}: ${typeIndicator}`);
          lines.push(this.formatObject(item, indentLevel + 2, useColors, colors));
        } else {
          const value = safeStringify(item);
          lines.push(`${childIndent}${index}: ${typeIndicator} ${value}`);
        }
      });
      lines.push(`${indent}]`);
    } else {
      lines.push(`${indent}{`);
      const entries = Object.entries(obj);
      entries.forEach(([key, value]) => {
        const valueType = this.getValueType(value);
        const typeIndicator = useColors ? dimText(`[${valueType}]`, colors) : `[${valueType}]`;

        if (typeof value === 'object' && value !== null) {
          const keyLabel = useColors && colors ? this.colorizeKey(key, colors) : key;
          lines.push(`${childIndent}${keyLabel}: ${typeIndicator}`);
          lines.push(this.formatObject(value, indentLevel + 2, useColors, colors));
        } else {
          const keyLabel = useColors && colors ? this.colorizeKey(key, colors) : key;
          const stringValue = safeStringify(value);

          // Handle long values by wrapping them
          if (stringValue.length > this.maxLineLength - childIndent.length - key.length - 10) {
            lines.push(`${childIndent}${keyLabel}: ${typeIndicator}`);
            const wrappedValue = this.wrapText(
              stringValue,
              this.maxLineLength - (indentLevel + 2) * this.indentSize,
            );
            wrappedValue.forEach(line => {
              lines.push(`${' '.repeat((indentLevel + 2) * this.indentSize)}${line}`);
            });
          } else {
            lines.push(`${childIndent}${keyLabel}: ${typeIndicator} ${stringValue}`);
          }
        }
      });
      lines.push(`${indent}}`);
    }

    return lines.join('\n');
  }

  /**
   * Get a human-readable type indicator for a value
   */
  private getValueType(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (value instanceof Date) return 'date';

    // Check for serialized errors (they come from processLogArgs)
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if (
        obj.name &&
        obj.message &&
        obj.stack &&
        typeof obj.name === 'string' &&
        typeof obj.message === 'string'
      ) {
        return 'error';
      }

      const constructor = (value as { constructor?: { name?: string } }).constructor?.name;
      if (constructor && constructor !== 'Object') {
        return constructor.toLowerCase();
      }
      return `object[${Object.keys(value).length}]`;
    }

    return typeof value;
  }

  /**
   * Colorize object keys for better visibility
   */
  private colorizeKey(key: string, colors: FormatterColors): string {
    // Use info color for keys to make them stand out
    const infoColor = colors.levels[LogLevel.INFO] || '';
    const reset = colors.reset || '\x1b[0m';
    return `${infoColor}${key}${reset}`;
  }

  /**
   * Wrap text to fit within specified line length
   */
  private wrapText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const lines: string[] = [];
    let currentLine = '';
    const words = text.split(' ');

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxLength) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is longer than max length, break it
          let remainingWord = word;
          while (remainingWord.length > maxLength) {
            lines.push(remainingWord.substring(0, maxLength));
            remainingWord = remainingWord.substring(maxLength);
          }
          currentLine = remainingWord;
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [text];
  }
}
