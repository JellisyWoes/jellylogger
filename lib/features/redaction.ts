import { isRecord, isPrimitive, mightHaveCircularRefs } from './typeGuards';

/**
 * Configuration for sensitive data redaction.
 */
export interface RedactionConfig {
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
  /** Replacement text for redacted values or a function for custom replacement. Default: '[REDACTED]' */
  replacement?: string | ((value: any, key: string, path: string) => string);
  /** Whether to perform case-insensitive key matching. Default: true */
  caseInsensitive?: boolean;
  /** Where to apply redaction: 'console', 'file', or 'both'. Default: 'both' */
  redactIn?: 'console' | 'file' | 'both';
  /** Whether to log when redaction occurs for debugging/auditing. Default: false */
  auditRedaction?: boolean;
}

/**
 * Represents a single log entry.
 */
export interface LogEntry {
  timestamp: string;
  level: number;
  levelName: string;
  message: string;
  args: unknown[];
  /** Structured data for the log entry */
  data?: Record<string, unknown>;
}

/**
 * Converts a glob-like pattern to a regular expression.
 * Supports * (any characters) and ** (any path segments).
 * @param pattern - The glob pattern
 * @param caseInsensitive - Whether to make the regex case-insensitive
 * @returns A RegExp that matches the pattern
 */
function globToRegex(pattern: string, caseInsensitive: boolean = true): RegExp {
  // Escape special regex characters except * and **
  let regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^.]*')
    .replace(/___DOUBLESTAR___/g, '.*');

  const flags = caseInsensitive ? 'i' : '';
  return new RegExp(`^${regexPattern}$`, flags);
}

/**
 * Checks if a key path matches any of the redaction patterns.
 * @param keyPath - The full path to the key (e.g., 'user.profile.email')
 * @param key - The current key being checked
 * @param config - Redaction configuration
 * @returns True if the key should be redacted
 */
export function shouldRedactKey(keyPath: string, key: string, config: RedactionConfig): boolean {
  const caseInsensitive = config.caseInsensitive ?? true;

  // Check string keys with glob support
  if (config.keys) {
    for (const redactKey of config.keys) {
      // Direct key match
      const keyMatches = caseInsensitive 
        ? key.toLowerCase() === redactKey.toLowerCase()
        : key === redactKey;
      
      // Path match
      const pathMatches = caseInsensitive
        ? keyPath.toLowerCase() === redactKey.toLowerCase()
        : keyPath === redactKey;

      // Glob pattern match
      const globRegex = globToRegex(redactKey, caseInsensitive);
      const globKeyMatches = globRegex.test(key);
      const globPathMatches = globRegex.test(keyPath);

      if (keyMatches || pathMatches || globKeyMatches || globPathMatches) {
        return true;
      }
    }
  }

  // Check regex patterns
  if (config.keyPatterns) {
    for (const pattern of config.keyPatterns) {
      if (pattern.test(key) || pattern.test(keyPath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a value matches any of the value patterns for redaction.
 * @param value - The value to check
 * @param config - Redaction configuration
 * @returns True if the value should be redacted
 */
export function shouldRedactValue(value: any, config: RedactionConfig): boolean {
  if (!config.valuePatterns || config.valuePatterns.length === 0) {
    return false;
  }

  // Only check string values for value patterns
  if (typeof value !== 'string') {
    return false;
  }

  return config.valuePatterns.some(pattern => pattern.test(value));
}

/**
 * Redacts sensitive patterns in a string (messages, string arguments).
 * @param str - The string to redact
 * @param config - Redaction configuration
 * @returns The string with sensitive patterns redacted
 */
export function redactString(str: string, config: RedactionConfig): string {
  if (!config.redactStrings || !config.stringPatterns || config.stringPatterns.length === 0) {
    return str;
  }

  let result = str;

  for (const pattern of config.stringPatterns) {
    if (typeof config.replacement === 'function') {
      // For function replacements, we need to call the function for each match
      result = result.replace(pattern, (match) =>
        (config.replacement as (value: any, key: string, path: string) => string)(match, '', '')
      );
    } else {
      const replacement = config.replacement ?? '[REDACTED]';
      result = result.replace(pattern, replacement);
    }
  }

  return result;
}

/**
 * Checks if an object needs redaction to avoid unnecessary cloning.
 * @param obj - The object to check
 * @param config - Redaction configuration
 * @param path - Current path in the object
 * @param seen - Set to detect circular references
 * @returns True if the object contains data that needs redaction
 */
export function needsRedaction(obj: unknown, config: RedactionConfig, path: string = '', seen: WeakSet<object> = new WeakSet()): boolean {
  // Check if there are any redaction rules configured
  if ((!config.keys || config.keys.length === 0) && 
      (!config.keyPatterns || config.keyPatterns.length === 0) &&
      (!config.valuePatterns || config.valuePatterns.length === 0)) {
    return false;
  }

  // Handle primitives and null
  if (isPrimitive(obj)) {
    return shouldRedactValue(obj, config);
  }

  // Handle non-object types that can't contain nested data
  if (typeof obj !== 'object' || obj === null) {
    return shouldRedactValue(obj, config);
  }

  // Handle circular references
  if (mightHaveCircularRefs(obj) && seen.has(obj)) {
    return false;
  }
  if (mightHaveCircularRefs(obj)) {
    seen.add(obj);
  }

  // Handle arrays safely
  if (Array.isArray(obj)) {
    try {
      return obj.some((item, index) => {
        try {
          return needsRedaction(item, config, `${path}[${index}]`, seen);
        } catch {
          return false; // If we can't check an item, assume it doesn't need redaction
        }
      });
    } catch {
      return false;
    }
  }

  // Handle objects safely
  try {
    // Use isRecord for better type safety
    if (isRecord(obj)) {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          try {
            // Check if key should be redacted
            if (shouldRedactKey(currentPath, key, config)) {
              return true;
            }
            
            // Get property value safely
            const propValue = obj[key];
            
            // Check if value should be redacted
            if (shouldRedactValue(propValue, config)) {
              return true;
            }
            
            // Recursively check nested objects
            if (needsRedaction(propValue, config, currentPath, seen)) {
              return true;
            }
          } catch {
            // If we can't process a property, continue to the next one
            continue;
          }
        }
      }
    }
  } catch {
    // If we can't iterate over the object, assume no redaction needed
    return false;
  }

  return false;
}

/**
 * Deeply clones and redacts an object based on the redaction configuration.
 * @param obj - The object to redact
 * @param config - Redaction configuration
 * @param path - Current path in the object (used for recursion)
 * @param seen - Set to detect circular references
 * @returns A new object with redacted values
 */
export function redactObject(obj: unknown, config: RedactionConfig, path: string = '', seen: WeakSet<object> = new WeakSet()): unknown {
  // Handle primitives and null
  if (isPrimitive(obj)) {
    if (shouldRedactValue(obj, config)) {
      const replacement = typeof config.replacement === 'function' 
        ? config.replacement(obj, '', path)
        : (config.replacement ?? '[REDACTED]');
      
      if (config.auditRedaction === true) {
        console.debug(`[REDACTION AUDIT] Redacted primitive value at path: ${path}`);
      }
      
      return replacement;
    }
    return obj;
  }

  // Handle non-object types that can't contain nested data
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // Handle circular references
  if (mightHaveCircularRefs(obj) && seen.has(obj)) {
    return '[Circular Reference]';
  }
  if (mightHaveCircularRefs(obj)) {
    seen.add(obj);
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    try {
      return obj.map((item, index) => {
        try {
          return redactObject(item, config, `${path}[${index}]`, seen);
        } catch {
          return item; // If we can't process an item, return it as-is
        }
      });
    } catch {
      return obj;
    }
  }

  // Handle objects
  try {
    // Use isRecord for better type safety
    if (isRecord(obj)) {
      const newObj: Record<string, unknown> = {};
      
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          try {
            // Get property value safely
            const propValue = obj[key];
            
            // Check if key or value should be redacted
            if (shouldRedactKey(currentPath, key, config) || shouldRedactValue(propValue, config)) {
              const replacement = typeof config.replacement === 'function' 
                ? config.replacement(propValue, key, currentPath)
                : (config.replacement ?? '[REDACTED]');
              
              if (config.auditRedaction === true) {
                console.debug(`[REDACTION AUDIT] Redacted key: ${key} at path: ${currentPath}`);
              }
              
              newObj[key] = replacement;
            } 
            else {
              newObj[key] = redactObject(propValue, config, currentPath, seen);
            }
          } catch {
            // If we can't process a property, copy it as-is
            newObj[key] = obj[key];
          }
        }
      }
      
      return newObj;
    }
    
    // If not a record, return as-is
    return obj;
  } catch {
    // If we can't iterate over the object, return it as-is
    return obj;
  }
}

/**
 * Applies redaction to a log entry.
 * @param entry - The log entry to redact
 * @param redactionConfig - Optional redaction configuration
 * @param target - Where the redaction should apply ('console', 'file', or 'both')
 * @returns A new log entry with redacted data, or the original entry if no redaction is needed.
 */
export function getRedactedEntry(
  entry: LogEntry,
  redactionConfig?: RedactionConfig,
  target?: 'console' | 'file'
): LogEntry {
  // Check if redaction is needed
  if (!redactionConfig) {
    return entry;
  }

  // Check if redaction applies to this target
  const redactIn = redactionConfig.redactIn ?? 'both';
  if (target && redactIn !== 'both' && redactIn !== target) {
    return entry;
  }

  // Performance optimization: check if anything needs redaction
  const messageNeedsRedaction = redactionConfig.redactStrings && 
    redactionConfig.stringPatterns && 
    redactionConfig.stringPatterns.length > 0;
  
  const argsNeedRedaction = Array.isArray(entry.args) && 
    entry.args.length > 0 && 
    entry.args.some(arg => needsRedaction(arg, redactionConfig));
  
  const dataNeedsRedaction = entry.data && 
    needsRedaction(entry.data, redactionConfig);

  // If nothing needs redaction, return original entry
  if (!messageNeedsRedaction && !argsNeedRedaction && !dataNeedsRedaction) {
    return entry;
  }

  // Create a new entry with redacted data
  const newEntry: LogEntry = {
    ...entry,
    message: messageNeedsRedaction ? redactString(entry.message, redactionConfig) : entry.message,
    args: [],
    data: undefined
  };

  // Process args if they need redaction
  if (entry.args && entry.args.length > 0) {
    newEntry.args = entry.args.map(arg => {
      // Redact strings in args if configured
      if (typeof arg === 'string' && redactionConfig.redactStrings) {
        return redactString(arg, redactionConfig);
      }
      return redactObject(arg, redactionConfig, '', new WeakSet());
    });
  }

  // Process data if it needs redaction
  if (entry.data) {
    newEntry.data = redactObject(entry.data, redactionConfig, '', new WeakSet()) as Record<string, unknown>;
  }
  
  return newEntry;
}
