/**
 * Type guard to check if a value is a record (plain object).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value) && 
         !(value instanceof Date) &&
         !(value instanceof RegExp) &&
         !(value instanceof Error) &&
         // Check for other built-in objects that shouldn't be treated as records
         Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * Type guard to check if a value looks like an Error object.
 */
export function isErrorLike(value: unknown): value is { name: string; message: string; stack?: string; cause?: unknown } {
  return isRecord(value) && 
         typeof value.name === 'string' && 
         typeof value.message === 'string';
}

/**
 * Type guard to check if a value is serializable (can be safely JSON.stringify'd).
 */
export function isSerializable(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return typeof value !== 'number' || (Number.isFinite(value) && !Number.isNaN(value));
  }
  
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    return false;
  }
  
  // For objects, we need to check more carefully
  return true; // Let processLogArgs handle the detailed checking
}

/**
 * Type guard to check if a value is a primitive type.
 */
export function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value === null || 
         value === undefined || 
         typeof value === 'string' || 
         typeof value === 'number' || 
         typeof value === 'boolean';
}

/**
 * Type guard to check if a value might cause circular reference issues.
 */
export function mightHaveCircularRefs(value: unknown): value is object {
  return typeof value === 'object' && 
         value !== null && 
         !isPrimitive(value);
}
