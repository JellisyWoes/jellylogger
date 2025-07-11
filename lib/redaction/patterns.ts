import type { RedactionConfig, RedactionContext } from './config';

/**
 * Converts a glob-like pattern to a regular expression.
 * Supports * (any characters) and ** (any path segments).
 */
function globToRegex(pattern: string, caseInsensitive: boolean = true): RegExp {
  // Handle ** patterns (match any path segments including dots)
  if (pattern.includes('**')) {
    const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*');

    const flags = caseInsensitive ? 'i' : '';
    return new RegExp(`^${regexPattern}$`, flags);
  }

  // Handle single * patterns (match any characters except dots for path safety)
  const regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]*');

  const flags = caseInsensitive ? 'i' : '';
  return new RegExp(`^${regexPattern}$`, flags);
}

/**
 * Checks if a key path matches any of the redaction patterns.
 */
export function shouldRedactKey(keyPath: string, key: string, config: RedactionConfig): boolean {
  // Check whitelist first - whitelist takes precedence
  if (isWhitelisted(keyPath, key, config)) {
    return false;
  }

  const caseInsensitive = config.caseInsensitive ?? true;

  // Check string keys with enhanced pattern matching
  if (config.keys) {
    for (const redactKey of config.keys) {
      // Normalize for case-insensitive comparison if needed
      const normalizedRedactKey = caseInsensitive ? redactKey.toLowerCase() : redactKey;
      const normalizedKeyPath = caseInsensitive ? keyPath.toLowerCase() : keyPath;
      const normalizedKey = caseInsensitive ? key.toLowerCase() : key;

      // Handle wildcard patterns
      if (redactKey.includes('*')) {
        // Convert glob pattern to regex for comprehensive matching
        const globRegex = globToRegex(redactKey, caseInsensitive);

        // Test against full path (most important for dot notation like "user.profile.email")
        if (globRegex.test(keyPath)) {
          return true;
        }

        // Test against just the key name
        if (globRegex.test(key)) {
          return true;
        }

        // Additional specific wildcard handling
        if (redactKey.startsWith('**')) {
          // Double wildcard: match anywhere in the path
          const suffix = normalizedRedactKey.substring(2);
          if (suffix && (normalizedKeyPath.includes(suffix) || normalizedKey.endsWith(suffix))) {
            return true;
          }
        } else if (redactKey.startsWith('*.')) {
          // Pattern like "*.token" - match key ending with suffix
          const suffix = normalizedRedactKey.substring(2);
          if (normalizedKey.endsWith(suffix) || normalizedKeyPath.endsWith(suffix)) {
            return true;
          }
        } else if (redactKey.endsWith('*')) {
          // Pattern like "api*" - match key starting with prefix
          const prefix = normalizedRedactKey.slice(0, -1);
          if (normalizedKey.startsWith(prefix) || normalizedKeyPath.startsWith(prefix)) {
            return true;
          }
        }
      } else {
        // Exact matching - both key name and full path
        if (normalizedKey === normalizedRedactKey || normalizedKeyPath === normalizedRedactKey) {
          return true;
        }
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
 * Checks if a key/path is whitelisted from redaction.
 */
export function isWhitelisted(keyPath: string, key: string, config: RedactionConfig): boolean {
  const caseInsensitive = config.caseInsensitive ?? true;

  // Check string whitelist with glob support
  if (config.whitelist) {
    for (const whitelistKey of config.whitelist) {
      // Direct key match
      const keyMatches = caseInsensitive
        ? key.toLowerCase() === whitelistKey.toLowerCase()
        : key === whitelistKey;

      // Path match
      const pathMatches = caseInsensitive
        ? keyPath.toLowerCase() === whitelistKey.toLowerCase()
        : keyPath === whitelistKey;

      // Glob pattern match
      const globRegex = globToRegex(whitelistKey, caseInsensitive);
      const globKeyMatches = globRegex.test(key);
      const globPathMatches = globRegex.test(keyPath);

      if (keyMatches || pathMatches || globKeyMatches || globPathMatches) {
        return true;
      }
    }
  }

  // Check regex whitelist patterns
  if (config.whitelistPatterns) {
    for (const pattern of config.whitelistPatterns) {
      if (pattern.test(key) || pattern.test(keyPath)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a value matches any of the value patterns for redaction.
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
 * Redacts sensitive patterns in a string with enhanced context support.
 */
export function redactString(
  str: string,
  config: RedactionConfig,
  context?: RedactionContext,
): string {
  if (!config.redactStrings || !config.stringPatterns || config.stringPatterns.length === 0) {
    return str;
  }

  let result = str;

  for (const pattern of config.stringPatterns) {
    if (typeof config.replacement === 'function') {
      // For function replacements, we need to call the function for each match
      result = result.replace(pattern, match => {
        const ctx = context ?? { key: '', path: '', field: '', originalValue: match };
        return (config.replacement as (value: any, context: RedactionContext) => string)(
          match,
          ctx,
        );
      });
    } else {
      const replacement = config.replacement ?? '[REDACTED]';
      result = result.replace(pattern, replacement);
    }
  }

  return result;
}
