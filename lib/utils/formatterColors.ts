import type { CustomConsoleColors } from '../core/types';
import { LogLevel } from '../core/constants';
import { getFormatterColors } from './colors';

/**
 * Unified color handling for formatters.
 */
export interface FormatterColorOptions {
  consoleColors?: CustomConsoleColors;
  useColors?: boolean;
}

export interface FormatterColors {
  reset: string;
  bold: string;
  dim: string;
  levels: Record<LogLevel, string>;
}

/**
 * Get formatter colors with consistent fallback behavior.
 */
export function getConsistentFormatterColors(options?: FormatterColorOptions): FormatterColors | null {
  const useColors = options?.useColors ?? false;
  
  if (!useColors || !options?.consoleColors) {
    return null;
  }
  
  return getFormatterColors(options.consoleColors);
}

/**
 * Apply color to text if colors are available.
 */
export function colorize(text: string, color: string, colors: FormatterColors | null): string {
  if (!colors || !color) return text;
  return `${color}${text}${colors.reset}`;
}

/**
 * Apply level-specific color to text.
 */
export function colorizeLevelText(text: string, level: LogLevel, colors: FormatterColors | null): string {
  if (!colors) return text;
  const levelColor = colors.levels[level] || '';
  return colorize(text, `${colors.bold}${levelColor}`, colors);
}

/**
 * Apply dim styling to text.
 */
export function dimText(text: string, colors: FormatterColors | null): string {
  if (!colors) return text;
  return colorize(text, colors.dim, colors);
}

/**
 * Apply bold styling to text.
 */
export function boldText(text: string, colors: FormatterColors | null): string {
  if (!colors) return text;
  return colorize(text, colors.bold, colors);
}

/**
 * Escape quotes in strings for safe formatting.
 */
export function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"');
}
