import { isRecord, isErrorLike, isPrimitive, mightHaveCircularRefs } from './typeGuards';

/**
 * Generates a timestamp string.
 * @param humanReadable - If true, returns a human-readable format (YYYY-MM-DD HH:MM:SS AM/PM).
 *                        Otherwise, returns an ISO string.
 * @returns The formatted timestamp string.
 */
export const getTimestamp = (humanReadable: boolean = false): string => {
  const now = new Date();
  if (humanReadable) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, "0");

    return `${year}-${month}-${day} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }
  return now.toISOString();
};

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
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
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
      return {
        name: String(value.name),
        message: String(value.message),
        stack: typeof value.stack === 'string' ? value.stack : undefined,
        ...(value.cause !== undefined ? { cause: processValue(value.cause, depth + 1) } : {})
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

// Helper to convert user color input to ANSI escape code using Bun.color with fallback
export function toAnsiColor(color?: string, fallback: string = ""): string {
  if (!color) return fallback;
  // If already an ANSI escape code, just return
  if (color.startsWith("\x1b[")) return color;
  // Try to use Bun.color for hex, rgb, hsl, hsv, cmyk, etc.
  try {
    const result = Bun.color(color, "ansi");
    if (result) return result;
    console.warn(`Invalid color "${color}", using fallback`);
    return fallback;
  } catch (e) {
    console.warn(`Failed to parse color "${color}": ${e instanceof Error ? e.message : String(e)}, using fallback`);
    return fallback;
  }
}
