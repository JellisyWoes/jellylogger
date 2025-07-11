export { getTimestamp } from './time';

/**
 * Serializes an error object with optional depth limiting for causes.
 * @param error - The error to serialize
 * @param maxDepth - Maximum depth to serialize nested causes
 * @returns Serialized error object
 */
export function serializeError(error: Error, maxDepth: number = 3): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error.cause && maxDepth > 0) {
    if (error.cause instanceof Error) {
      serialized.cause = serializeError(error.cause, maxDepth - 1);
    } else {
      try {
        serialized.cause = JSON.parse(JSON.stringify(error.cause));
      } catch {
        serialized.cause = String(error.cause);
      }
    }
  }

  return serialized;
}

/**
 * Process log arguments into a structured format for logging.
 */
export function processLogArgs(args: unknown[]): { processedArgs: unknown[]; hasComplexArgs: boolean } {
  const processedArgs: unknown[] = [];
  let hasComplexArgs = false;

  for (const arg of args) {
    if (arg instanceof Error) {
      processedArgs.push(serializeError(arg));
      hasComplexArgs = true;
    } else if (typeof arg === 'object' && arg !== null) {
      try {
        // Test if the object can be JSON serialized
        JSON.stringify(arg);
        processedArgs.push(arg);
        hasComplexArgs = true;
      } catch {
        // Handle circular references or non-serializable objects
        processedArgs.push(createSafeObject(arg));
        hasComplexArgs = true;
      }
    } else {
      processedArgs.push(arg);
      // Only mark as complex if it's actually complex (not primitive strings, numbers, booleans)
      if (typeof arg !== 'string' && typeof arg !== 'number' && typeof arg !== 'boolean' && arg !== null && arg !== undefined) {
        hasComplexArgs = true;
      }
    }
  }

  return { processedArgs, hasComplexArgs };
}

/**
 * Unified circular reference handling for log entries.
 */

/**
 * Safely serialize any value, handling circular references and non-serializable objects.
 */
export function safeStringify(value: unknown, fallback = '[Non-serializable]'): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, createCircularReplacer());
    } catch {
      // For objects that can't be stringified, return a descriptive fallback
      return `[Object: ${Object.prototype.toString.call(value)}]`;
    }
  }
  
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

/**
 * Safely serialize for JSON output, with enhanced circular reference handling.
 */
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, createCircularReplacer());
  } catch {
    // Create a safe version of the object
    return JSON.stringify(createSafeObject(value));
  }
}

/**
 * Create a JSON replacer function that handles circular references.
 */
function createCircularReplacer(): (_key: string, value: unknown) => unknown {
  const seen = new WeakSet();
  
  return function(_key: string, value: unknown) {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    
    if (seen.has(value)) {
      return '[Circular Reference]';
    }
    
    seen.add(value);
    return value;
  };
}

/**
 * Create a safe version of any object for JSON serialization.
 */
export function createSafeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => {
      try {
        JSON.stringify(item);
        return item;
      } catch {
        return '[Non-serializable Array Item]';
      }
    });
  }
  
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    try {
      JSON.stringify(value);
      safe[key] = value;
    } catch {
      safe[key] = '[Non-serializable Value]';
    }
  }
  
  return safe;
}

/**
 * Safely process log arguments for display.
 */
export function safeProcessArgs(args: unknown[] | { processedArgs: unknown[]; hasComplexArgs: boolean }): string[] {
  // Handle both old array format and new processLogArgs result format
  const argsArray = Array.isArray(args) ? args : args.processedArgs;
  return argsArray.map(arg => safeStringify(arg));
}

/**
 * Safely process log data for display.
 */
export function safeProcessData(data: unknown): string {
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return '';
  }
  
  try {
    return JSON.stringify(data, createCircularReplacer());
  } catch {
    return '[Data - Processing Error]';
  }
}