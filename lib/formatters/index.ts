// Core formatter interface
export type { LogFormatter } from './LogFormatter';
import type { LogFormatter } from './LogFormatter';

// Built-in formatters
export { DefaultFormatter } from './DefaultFormatter';
export { LogfmtFormatter } from './LogfmtFormatter';
export { NdjsonFormatter } from './NdjsonFormatter';
import { DefaultFormatter } from './DefaultFormatter';
import { LogfmtFormatter } from './LogfmtFormatter';
import { NdjsonFormatter } from './NdjsonFormatter';

// Formatter registry for easy access
export const BUILT_IN_FORMATTERS = {
  default: DefaultFormatter,
  logfmt: LogfmtFormatter,
  ndjson: NdjsonFormatter,
} as const;

// Utility type for built-in formatter names
export type BuiltInFormatterName = keyof typeof BUILT_IN_FORMATTERS;

// Factory function for creating formatters by name
export function createFormatter(name: BuiltInFormatterName): LogFormatter {
  const FormatterClass = BUILT_IN_FORMATTERS[name];
  return new FormatterClass();
}

// Default formatter (now uses the dedicated DefaultFormatter class)
export const DEFAULT_FORMATTER = new DefaultFormatter();

// Re-export types from core for convenience
export type { LogEntry, CustomConsoleColors } from '../core/types';
export { LogLevel } from '../core/constants';
