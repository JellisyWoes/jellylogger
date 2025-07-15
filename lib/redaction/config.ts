/**
 * Custom redaction function type for user-defined redaction logic.
 */
export type CustomRedactor = (value: unknown, context: RedactionContext) => unknown;

/**
 * Audit event handler for tracking redaction operations.
 */
export type AuditHook = (event: RedactionAuditEvent) => void;

/**
 * Context provided to custom redaction functions and audit hooks.
 */
export interface RedactionContext {
  /** The key being processed */
  key: string;
  /** Full path to the current location (e.g., 'user.credentials.password') */
  path: string;
  /** The field in the log entry being processed (e.g., 'args', 'data', 'message') */
  field: string;
  /** The original value before redaction */
  originalValue: unknown;
  /** Target where this redaction will be applied */
  target?: 'console' | 'file';
}

/**
 * Audit event information for redaction operations.
 */
export interface RedactionAuditEvent {
  /** Type of redaction operation */
  type: 'key' | 'value' | 'string' | 'custom' | 'field';
  /** Context of the redaction */
  context: RedactionContext;
  /** Value before redaction */
  before: unknown;
  /** Value after redaction */
  after: unknown;
  /** Timestamp of the redaction */
  timestamp: Date;
  /** Rule that triggered the redaction */
  rule?: string;
}

/**
 * Per-field or per-path specific redaction configuration.
 */
export interface FieldRedactionConfig {
  /** Specific replacement for this field/path */
  replacement?: string | ((value: unknown, context: RedactionContext) => string);
  /** Custom redaction function for this field/path */
  customRedactor?: CustomRedactor;
  /** Whether to disable redaction for this specific field/path */
  disabled?: boolean;
}

/**
 * Configuration for sensitive data redaction.
 */
export interface RedactionConfig {
  /** Target log entry fields to apply redaction to. Default: ['args', 'data', 'message'] */
  fields?: string[];

  /** Keys to redact in structured data and objects. Supports dot notation for nested keys (e.g., 'user.password') and wildcards (e.g., '*.token', 'user.*') */
  keys?: string[];

  /** Regular expressions for key matching. More flexible than string keys. */
  keyPatterns?: RegExp[];

  /** Regular expressions to match and redact values regardless of their keys */
  valuePatterns?: RegExp[];

  /** Whether to redact sensitive patterns in log messages and string arguments. Default: false */
  redactStrings?: boolean;

  /** String patterns to redact in messages and string args (e.g., credit card numbers, SSNs) */
  stringPatterns?: RegExp[];

  /** Paths/keys to whitelist from redaction (takes precedence over redaction rules) */
  whitelist?: string[];

  /** Regular expressions for whitelisting paths/keys */
  whitelistPatterns?: RegExp[];

  /** Per-field or per-path specific redaction configurations */
  fieldConfigs?: Record<string, FieldRedactionConfig>;

  /** Custom redaction function that takes precedence over built-in redaction */
  customRedactor?: CustomRedactor;

  /** Replacement text for redacted values or a function for custom replacement. Default: '[REDACTED]' */
  replacement?: string | ((value: unknown, context: RedactionContext) => string);

  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;

  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';

  /** Whether to log when redaction occurs for debugging/auditing. Default: false */
  auditRedaction?: boolean;

  /** Custom audit hook function for handling redaction events */
  auditHook?: AuditHook;

  /** Whether to deep clone objects before redaction to avoid mutating originals. Default: true */
  deepClone?: boolean;

  /** Maximum depth for recursive redaction to prevent infinite loops. Default: 10 */
  maxDepth?: number;
}
