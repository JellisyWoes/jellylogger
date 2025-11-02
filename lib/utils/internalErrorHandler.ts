/**
 * Internal error handler for library-generated errors and warnings.
 * This allows users to capture and redirect internal errors through their own logging system.
 */

/**
 * Type for the internal error handler function.
 */
export type InternalErrorHandler = (message: string, error?: unknown) => void;

/**
 * Default internal error handler that uses console.error.
 */
const defaultErrorHandler: InternalErrorHandler = (message: string, error?: unknown) => {
  if (error !== undefined) {
    console.error(message, error);
  } else {
    console.error(message);
  }
};

/**
 * Type for the internal warning handler function.
 */
export type InternalWarningHandler = (message: string, error?: unknown) => void;

/**
 * Default internal warning handler that uses console.warn.
 */
const defaultWarningHandler: InternalWarningHandler = (message: string, error?: unknown) => {
  if (error !== undefined) {
    console.warn(message, error);
  } else {
    console.warn(message);
  }
};

/**
 * Type for the internal debug handler function.
 */
export type InternalDebugHandler = (message: string, data?: unknown) => void;

/**
 * Default internal debug handler that uses console.debug.
 */
const defaultDebugHandler: InternalDebugHandler = (message: string, data?: unknown) => {
  if (data !== undefined) {
    console.debug(message, data);
  } else {
    console.debug(message);
  }
};

/**
 * Global internal error handlers that can be configured.
 */
let internalErrorHandler: InternalErrorHandler = defaultErrorHandler;
let internalWarningHandler: InternalWarningHandler = defaultWarningHandler;
let internalDebugHandler: InternalDebugHandler = defaultDebugHandler;

/**
 * Set a custom internal error handler for the library.
 * @param handler - Custom error handler function or null to use default
 */
export function setInternalErrorHandler(handler: InternalErrorHandler | null): void {
  internalErrorHandler = handler ?? defaultErrorHandler;
}

/**
 * Set a custom internal warning handler for the library.
 * @param handler - Custom warning handler function or null to use default
 */
export function setInternalWarningHandler(handler: InternalWarningHandler | null): void {
  internalWarningHandler = handler ?? defaultWarningHandler;
}

/**
 * Set a custom internal debug handler for the library.
 * @param handler - Custom debug handler function or null to use default
 */
export function setInternalDebugHandler(handler: InternalDebugHandler | null): void {
  internalDebugHandler = handler ?? defaultDebugHandler;
}

/**
 * Log an internal error.
 * @param message - Error message
 * @param error - Optional error object or additional context
 */
export function logInternalError(message: string, error?: unknown): void {
  try {
    internalErrorHandler(message, error);
  } catch {
    // Fallback to console if custom handler fails
    defaultErrorHandler(`[INTERNAL ERROR HANDLER FAILED] ${message}`, error);
  }
}

/**
 * Log an internal warning.
 * @param message - Warning message
 * @param error - Optional error object or additional context
 */
export function logInternalWarning(message: string, error?: unknown): void {
  try {
    internalWarningHandler(message, error);
  } catch {
    // Fallback to console if custom handler fails
    defaultWarningHandler(`[INTERNAL WARNING HANDLER FAILED] ${message}`, error);
  }
}

/**
 * Log an internal debug message.
 * @param message - Debug message
 * @param data - Optional data to include
 */
export function logInternalDebug(message: string, data?: unknown): void {
  try {
    internalDebugHandler(message, data);
  } catch {
    // Fallback to console if custom handler fails
    defaultDebugHandler(`[INTERNAL DEBUG HANDLER FAILED] ${message}`, data);
  }
}
