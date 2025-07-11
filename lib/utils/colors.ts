import { LogLevel } from '../core/constants';
import type { CustomConsoleColors } from '../core/types';

// Default color definitions used across all formatters
export const DEFAULT_COLORS: Record<string | number, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  [LogLevel.SILENT]: '',
  [LogLevel.FATAL]: '\x1b[91m', // Bright red
  [LogLevel.ERROR]: '\x1b[31m', // Red
  [LogLevel.WARN]: '\x1b[33m', // Yellow
  [LogLevel.INFO]: '\x1b[32m', // Green
  [LogLevel.DEBUG]: '\x1b[34m', // Blue
  [LogLevel.TRACE]: '\x1b[35m', // Magenta
};

// Helper to convert user color input to ANSI escape code using Bun.color with fallback
export function toAnsiColor(color?: string, fallback: string = ''): string {
  if (!color) return fallback;

  // If it's already an ANSI escape sequence, return it
  if (color.startsWith('\x1b[')) return color;

  try {
    // Try to use Bun.color for parsing various color formats
    if (typeof Bun !== 'undefined' && Bun.color) {
      return Bun.color(color, 'ansi') ?? fallback;
    }
  } catch {
    // If Bun.color fails or isn't available, return fallback
  }

  return fallback;
}

/**
 * Enhanced default colors with Bun.color support for user-defined colors
 */
export const ENHANCED_DEFAULT_COLORS: Record<string | number, string> = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  [LogLevel.SILENT]: '',
  [LogLevel.FATAL]: toAnsiColor('#FF0000', '\x1b[91m'),
  [LogLevel.ERROR]: toAnsiColor('#FF4500', '\x1b[31m'),
  [LogLevel.WARN]: toAnsiColor('#FFD700', '\x1b[33m'),
  [LogLevel.INFO]: toAnsiColor('#32CD32', '\x1b[32m'),
  [LogLevel.DEBUG]: toAnsiColor('#1E90FF', '\x1b[34m'),
  [LogLevel.TRACE]: toAnsiColor('#9370DB', '\x1b[35m'),
};

/**
 * Shared utility to get colors for formatters
 */
export function getFormatterColors(customColors?: CustomConsoleColors) {
  const colors = { ...ENHANCED_DEFAULT_COLORS };

  if (customColors) {
    // Apply custom colors, converting them to ANSI if needed
    Object.entries(customColors).forEach(([key, value]) => {
      if (value !== undefined) {
        colors[key] = toAnsiColor(value, colors[key] ?? '');
      }
    });
  }

  return {
    reset: colors.reset ?? '\x1b[0m',
    bold: colors.bold ?? '\x1b[1m',
    dim: colors.dim ?? '\x1b[2m',
    levels: {
      [LogLevel.SILENT]: colors[LogLevel.SILENT] ?? '',
      [LogLevel.FATAL]: colors[LogLevel.FATAL] ?? '\x1b[91m',
      [LogLevel.ERROR]: colors[LogLevel.ERROR] ?? '\x1b[31m',
      [LogLevel.WARN]: colors[LogLevel.WARN] ?? '\x1b[33m',
      [LogLevel.INFO]: colors[LogLevel.INFO] ?? '\x1b[32m',
      [LogLevel.DEBUG]: colors[LogLevel.DEBUG] ?? '\x1b[34m',
      [LogLevel.TRACE]: colors[LogLevel.TRACE] ?? '\x1b[35m',
    },
  };
}
