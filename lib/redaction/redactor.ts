import type { LogEntry } from '../core/types';
import { isPrimitive, isRecord, mightHaveCircularRefs } from '../utils/typeGuards';
import type {
  FieldRedactionConfig,
  RedactionAuditEvent,
  RedactionConfig,
  RedactionContext,
} from './config';
import { isWhitelisted, redactString, shouldRedactKey, shouldRedactValue } from './patterns';

/**
 * Default log entry fields that support redaction.
 */
const DEFAULT_REDACTION_FIELDS = ['args', 'data', 'message'] as const;

/**
 * Creates audit event and triggers audit hooks.
 */
function triggerAudit(
  type: RedactionAuditEvent['type'],
  context: RedactionContext,
  before: unknown,
  after: unknown,
  config: RedactionConfig,
  rule?: string,
): void {
  if (!config.auditRedaction && !config.auditHook) {
    return;
  }

  const event: RedactionAuditEvent = {
    type,
    context,
    before,
    after,
    timestamp: new Date(),
    rule,
  };

  if (config.auditRedaction) {
    console.debug(`[REDACTION AUDIT] ${type.toUpperCase()}: ${context.path}`, event);
  }

  if (config.auditHook) {
    try {
      config.auditHook(event);
    } catch (error) {
      console.warn('[REDACTION AUDIT] Error in audit hook:', error);
    }
  }
}

/**
 * Gets field-specific redaction configuration.
 */
function getFieldConfig(path: string, config: RedactionConfig): FieldRedactionConfig | undefined {
  if (!config.fieldConfigs) {
    return undefined;
  }

  // Check exact path match first
  if (config.fieldConfigs[path]) {
    return config.fieldConfigs[path];
  }

  // Check for wildcard matches
  for (const [pattern, fieldConfig] of Object.entries(config.fieldConfigs)) {
    if (pattern.includes('*')) {
      const globRegex = new RegExp(
        `^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
        config.caseInsensitive ? 'i' : '',
      );
      if (globRegex.test(path)) {
        return fieldConfig;
      }
    }
  }

  return undefined;
}

/**
 * Applies replacement based on configuration and context.
 */
function applyReplacement(
  value: unknown,
  context: RedactionContext,
  config: RedactionConfig,
  fieldConfig?: FieldRedactionConfig,
): unknown {
  // Use field-specific replacement if available
  if (fieldConfig?.replacement) {
    return typeof fieldConfig.replacement === 'function'
      ? fieldConfig.replacement(value, context)
      : fieldConfig.replacement;
  }

  // Use global replacement
  if (typeof config.replacement === 'function') {
    return config.replacement(value, context);
  }

  return config.replacement ?? '[REDACTED]';
}

/**
 * Checks if an object needs redaction to avoid unnecessary cloning.
 */
export function needsRedaction(
  obj: unknown,
  config: RedactionConfig,
  path: string = '',
  seen: WeakSet<object> = new WeakSet(),
): boolean {
  // Check if there are any redaction rules configured
  if (
    (!config.keys || config.keys.length === 0) &&
    (!config.keyPatterns || config.keyPatterns.length === 0) &&
    (!config.valuePatterns || config.valuePatterns.length === 0)
  ) {
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
 * Enhanced redaction function with comprehensive configuration support.
 */
export function redactObject(
  obj: unknown,
  config: RedactionConfig,
  context: Partial<RedactionContext> = {},
  seen: WeakSet<object> = new WeakSet(),
  depth: number = 0,
): unknown {
  const maxDepth = config.maxDepth ?? 10;
  if (depth >= maxDepth) {
    return '[Max Depth Exceeded]';
  }

  const fullContext: RedactionContext = {
    key: context.key ?? '',
    path: context.path ?? '',
    field: context.field ?? '',
    originalValue: obj,
    target: context.target,
  };

  // Check if field-specific redaction is disabled
  const fieldConfig = getFieldConfig(fullContext.path, config);
  if (fieldConfig?.disabled) {
    return obj;
  }

  // Apply field-specific custom redactor first
  if (fieldConfig?.customRedactor) {
    try {
      const result = fieldConfig.customRedactor(obj, fullContext);
      triggerAudit('custom', fullContext, obj, result, config, 'field-specific custom redactor');
      return result;
    } catch (error) {
      console.warn('[REDACTION] Error in field-specific custom redactor:', error);
    }
  }

  // Handle primitives and null
  if (isPrimitive(obj)) {
    // Apply global custom redactor to primitives if available
    if (config.customRedactor) {
      try {
        const result = config.customRedactor(obj, fullContext);
        if (result !== obj) {
          triggerAudit(
            'custom',
            fullContext,
            obj,
            result,
            config,
            'global custom redactor on primitive',
          );
          return result;
        }
      } catch (error) {
        console.warn('[REDACTION] Error in global custom redactor:', error);
      }
    }

    if (shouldRedactValue(obj, config)) {
      const result = applyReplacement(obj, fullContext, config, fieldConfig);
      triggerAudit('value', fullContext, obj, result, config, 'value pattern match');
      return result;
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
          const itemContext = {
            ...fullContext,
            key: `[${index}]`,
            path: fullContext.path ? `${fullContext.path}[${index}]` : `[${index}]`,
          };
          return redactObject(item, config, itemContext, seen, depth + 1);
        } catch {
          return item;
        }
      });
    } catch {
      return obj;
    }
  }

  // Handle objects
  try {
    if (isRecord(obj)) {
      const newObj: Record<string, unknown> = {};

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const currentPath = fullContext.path ? `${fullContext.path}.${key}` : key;

          try {
            const propValue = obj[key];
            const propContext: RedactionContext = {
              ...fullContext,
              key,
              path: currentPath,
              originalValue: propValue,
            };

            const propFieldConfig = getFieldConfig(currentPath, config);

            // 1. Check for field-specific disable
            if (propFieldConfig?.disabled) {
              newObj[key] = propValue;
              continue;
            }

            // 2. Apply field-specific custom redactor for this property
            if (propFieldConfig?.customRedactor) {
              try {
                const result = propFieldConfig.customRedactor(propValue, propContext);
                triggerAudit(
                  'custom',
                  propContext,
                  propValue,
                  result,
                  config,
                  'property field-specific custom redactor',
                );
                newObj[key] = result;
                continue;
              } catch (error) {
                console.warn(
                  `[REDACTION] Error in property field-specific custom redactor for path '${currentPath}':`,
                  error,
                );
                // Fall-through: if custom redactor fails, other rules might still apply or original value kept.
              }
            }

            // 3. Apply global custom redactor for this property
            if (config.customRedactor) {
              try {
                const result = config.customRedactor(propValue, propContext);
                if (result !== propValue) {
                  // Only use if it actually changed the value
                  triggerAudit(
                    'custom',
                    propContext,
                    propValue,
                    result,
                    config,
                    'global custom redactor',
                  );
                  newObj[key] = result;
                  continue;
                }
              } catch (error) {
                console.warn(
                  `[REDACTION] Error in global custom redactor for path '${currentPath}':`,
                  error,
                );
              }
            }

            // 4. Standard redaction based on fieldConfig.replacement or global patterns
            const redactDueToFieldConfigReplacement = !!propFieldConfig?.replacement;
            const redactDueToGlobalKeyPattern = shouldRedactKey(currentPath, key, config); // This already checks whitelist
            const redactDueToGlobalValuePattern = shouldRedactValue(propValue, config);

            if (
              redactDueToFieldConfigReplacement ||
              redactDueToGlobalKeyPattern ||
              redactDueToGlobalValuePattern
            ) {
              const result = applyReplacement(propValue, propContext, config, propFieldConfig);

              let auditRule = 'unknown redaction rule';
              if (redactDueToFieldConfigReplacement) {
                auditRule = 'field-specific replacement';
              } else if (redactDueToGlobalKeyPattern) {
                auditRule = 'global key pattern match';
              } else if (redactDueToGlobalValuePattern) {
                auditRule = 'global value pattern match';
              }
              triggerAudit('key', propContext, propValue, result, config, auditRule);
              newObj[key] = result;
            } else {
              // 5. Recursively process nested objects if no redaction rule applied
              newObj[key] = redactObject(propValue, config, propContext, seen, depth + 1);
            }
          } catch (e) {
            console.warn(
              `[REDACTION] Error processing property '${key}' at path '${currentPath}':`,
              e,
            );
            newObj[key] = obj[key];
          }
        }
      }

      return newObj;
    }

    return obj;
  } catch {
    return obj;
  }
}

/**
 * Unified API for redacting any log entry with comprehensive configuration.
 */
export function redactLogEntry(
  entry: LogEntry,
  config: RedactionConfig,
  target?: 'console' | 'file',
): LogEntry {
  // Check if redaction is needed
  if (!config) {
    return entry;
  }

  // Check if redaction applies to this target
  const redactIn = config.redactIn ?? 'both';
  if (target && redactIn !== 'both' && redactIn !== target) {
    return entry;
  }

  // Get target fields for redaction
  const targetFields = config.fields ?? DEFAULT_REDACTION_FIELDS;

  // Deep clone if configured to avoid mutating original
  const shouldClone = config.deepClone ?? true;
  const newEntry: LogEntry = shouldClone ? structuredClone(entry) : { ...entry };

  // Process each target field
  for (const field of targetFields) {
    if (!(field in entry) || !Object.prototype.hasOwnProperty.call(entry, field)) {
      continue;
    }

    const fieldValue = (entry as unknown as Record<string, unknown>)[field]; // Original field value

    // Base context for operations related to this top-level field
    const baseFieldContext: Pick<RedactionContext, 'field' | 'target'> = {
      field,
      target,
    };

    try {
      if (field === 'message' && typeof fieldValue === 'string') {
        const messageContext: RedactionContext = {
          ...baseFieldContext,
          key: '',
          path: field, // Path for the message is its field name
          originalValue: fieldValue,
        };

        const redactedMessage = redactString(fieldValue, config, messageContext);
        if (redactedMessage !== fieldValue) {
          triggerAudit(
            'string',
            messageContext,
            fieldValue,
            redactedMessage,
            config,
            'string pattern match',
          );
          (newEntry as unknown as Record<string, unknown>)[field] = redactedMessage;
        }
      } else if (
        field === 'args' &&
        fieldValue &&
        typeof fieldValue === 'object' &&
        'processedArgs' in fieldValue
      ) {
        // Handle new args structure: { processedArgs: unknown[]; hasComplexArgs: boolean }
        const argsObj = fieldValue as { processedArgs: unknown[]; hasComplexArgs: boolean };
        const processedArgs = Array.isArray(argsObj.processedArgs) ? argsObj.processedArgs : [];

        const redactedProcessedArgs = processedArgs.map((arg, index) => {
          if (typeof arg === 'string' && config.redactStrings) {
            const stringRedactionContext: RedactionContext = {
              field: 'args',
              key: `processedArgs[${index}]`,
              path: `args.processedArgs[${index}]`, // Full path for audit/context
              originalValue: arg,
              target: baseFieldContext.target,
            };
            return redactString(arg, config, stringRedactionContext);
          }

          // For redactObject, the 'path' it operates on starts relative to 'arg'.
          // The 'key' it receives in its context is its identifier in the parent (processedArgs array).
          const contextForRedactObject: Partial<RedactionContext> = {
            field: 'args', // Top-level field name
            path: '', // Path is relative to 'arg' itself for internal matching
            key: `processedArgs[${index}]`, // Key of this item in the processedArgs array
            target: baseFieldContext.target,
          };
          return redactObject(arg, config, contextForRedactObject, new WeakSet(), 0);
        });

        (newEntry as unknown as Record<string, unknown>)[field] = {
          ...argsObj,
          processedArgs: redactedProcessedArgs,
        };
      } else if (field === 'args' && Array.isArray(fieldValue)) {
        // Legacy support for old args structure (array)
        (newEntry as unknown as Record<string, unknown>)[field] = (fieldValue as unknown[]).map(
          (arg, index) => {
            if (typeof arg === 'string' && config.redactStrings) {
              const stringRedactionContext: RedactionContext = {
                field: 'args',
                key: `[${index}]`,
                path: `args[${index}]`, // Full path for audit/context
                originalValue: arg,
                target: baseFieldContext.target,
              };
              return redactString(arg, config, stringRedactionContext);
            }

            // For redactObject, the 'path' it operates on starts relative to 'arg'.
            // The 'key' it receives in its context is its identifier in the parent (args array).
            const contextForRedactObject: Partial<RedactionContext> = {
              field: 'args', // Top-level field name
              path: '', // Path is relative to 'arg' itself for internal matching
              key: `[${index}]`, // Key of this item in the args array
              target: baseFieldContext.target,
            };
            return redactObject(arg, config, contextForRedactObject, new WeakSet(), 0);
          },
        );
      } else {
        // Handle other fields (e.g., 'data', custom structured fields, or even primitives if targeted)
        // The path for redactObject will be relative to 'fieldValue'.
        // The key is the name of the field itself in the log entry.
        const objectFieldContext: Partial<RedactionContext> = {
          ...baseFieldContext, // field, target
          path: '', // Path for redactObject starts empty, relative to 'fieldValue'
          key: field, // Key of this field in the log entry (e.g., "data")
        };
        (newEntry as unknown as Record<string, unknown>)[field] = redactObject(
          fieldValue,
          config,
          objectFieldContext,
          new WeakSet(),
          0,
        );
      }
    } catch (error) {
      console.warn(`[REDACTION] Error processing field '${field}':`, error);
      (newEntry as unknown as Record<string, unknown>)[field] = fieldValue; // Keep original on error for this field
    }
  }

  return newEntry;
}

/**
 * Legacy function for backward compatibility.
 */
export function getRedactedEntry(
  entry: LogEntry,
  redactionConfig?: RedactionConfig,
  target?: 'console' | 'file',
): LogEntry {
  if (!redactionConfig) {
    return entry;
  }
  return redactLogEntry(entry, redactionConfig, target);
}

// Re-export pattern functions
export { isWhitelisted, redactString, shouldRedactKey, shouldRedactValue };
