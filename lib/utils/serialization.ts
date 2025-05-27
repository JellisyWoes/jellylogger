import { isRecord, isErrorLike, isPrimitive, mightHaveCircularRefs } from './typeGuards';

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
 * Safely converts unknown arguments to serializable format with circular reference detection.
 * @param args - Arguments to process
 * @returns Processed arguments safe for serialization
 */
export function processLogArgs(args: unknown[]): unknown[] {
  const seen = new WeakSet<object>();
  const maxDepth = 10; // Prevent infinite recursion on deeply nested objects
  
  function processValue(value: unknown, depth = 0): unknown {
    // Prevent stack overflow on deeply nested structures
    if (depth > maxDepth) {
      return '[Max Depth Exceeded]';
    }

    // Handle primitives first (most common case)
    if (isPrimitive(value)) {
      return value;
    }

    // Handle special primitive-like cases
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    if (typeof value === 'symbol') {
      return value.toString();
    }
    if (typeof value === 'function') {
      return `[Function: ${(value as Function).name || 'anonymous'}]`;
    }

    // Handle Error instances specifically
    if (value instanceof Error) {
      return serializeError(value);
    }

    // Handle null explicitly (typeof null === 'object')
    if (value === null) {
      return null;
    }

    // For non-null objects, check for circular references
    if (mightHaveCircularRefs(value)) {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
    }

    // Handle built-in object types
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof RegExp) {
      return value.toString();
    }
    if (value instanceof Set) {
      try {
        return `[Set: ${Array.from(value).map(v => processValue(v, depth + 1))}]`;
      } catch {
        return `[Set: ${value.size} items]`;
      }
    }
    if (value instanceof Map) {
      try {
        const entries = Array.from(value.entries()).map(([k, v]) => [
          processValue(k, depth + 1), 
          processValue(v, depth + 1)
        ]);
        return `[Map: ${entries}]`;
      } catch {
        return `[Map: ${value.size} entries]`;
      }
    }

    // Handle Arrays
    if (Array.isArray(value)) {
      try {
        return value.map((item, index) => {
          try {
            return processValue(item, depth + 1);
          } catch {
            return `[Array Item ${index}: Processing Error]`;
          }
        });
      } catch {
        return `[Array: ${value.length} items - Processing Error]`;
      }
    }
    
    // Handle Error-like objects
    if (isErrorLike(value)) {
      const v = value as { name?: unknown; message?: unknown; stack?: unknown; cause?: unknown };
      return {
        name: v.name !== undefined ? String(v.name) : undefined,
        message: v.message !== undefined ? String(v.message) : undefined,
        stack: typeof v.stack === 'string' ? v.stack : undefined,
        ...(v.cause !== undefined ? { cause: processValue(v.cause, depth + 1) } : {})
      };
    }
    
    // Handle plain objects and other object types
    if (typeof value === 'object') {
      try {
        // For non-plain objects, include type information
        const objectType = Object.prototype.toString.call(value);
        const isPlainObject = isRecord(value);
        
        const result: Record<string, unknown> = {};
        
        // Add type hint for non-plain objects
        if (!isPlainObject) {
          result['__type__'] = objectType;
        }
        
        // Process enumerable properties with error handling
        for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            try {
              const propValue = (value as Record<string, unknown>)[key];
              result[key] = processValue(propValue, depth + 1);
            } catch (error) {
              result[key] = `[Property Error: ${error instanceof Error ? error.message : 'Unknown'}]`;
            }
          }
        }
        
        return result;
      } catch (error) {
        return `[Object Processing Error: ${error instanceof Error ? error.message : 'Unknown'} - Type: ${Object.prototype.toString.call(value)}]`;
      }
    }
    
    // Fallback for truly unknown types
    try {
      return String(value);
    } catch {
      return '[Unstringifiable Value]';
    }
  }

  return args.map((arg, index) => {
    try {
      return processValue(arg);
    } catch (error) {
      console.warn(`Failed to process log argument at index ${index}:`, error);
      return `[Argument ${index}: Processing Failed]`;
    }
  });
}
