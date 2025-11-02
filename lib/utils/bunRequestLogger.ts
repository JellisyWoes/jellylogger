import type { BunRequestField, BunRequestInfo, BunRequestLoggerOptions, JellyLogger, RedactionConfig } from '../core/types';
import { logger as defaultLogger } from '../core/logger';
import { redactObject } from '../redaction';

/**
 * Fields that can be extracted from a Bun Request object.
 */

/**
 * Default options for the Bun request logger.
 */
const DEFAULT_OPTIONS = {
  includeHeaders: true,
  includeBody: false,
  includeMeta: false,
  includeRemoteAddress: true,
  redactHeaders: ['authorization', 'cookie'],
  logLevel: 'info',
  messagePrefix: 'HTTP Request',
  maxBodySize: 10000,
};

/**
 * Extract request information based on the provided options.
 */
async function extractRequestInfo(
  request: Request,
  server: { requestIP?: (request: Request) => { address: string } | null } | undefined,
  options: BunRequestLoggerOptions,
): Promise<BunRequestInfo> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const info: BunRequestInfo = {};

  // Determine which fields to include
  const fieldsToInclude: Set<BunRequestField> = new Set();

  if (opts.fields && opts.fields.length > 0) {
    // Use explicit fields list if provided
    opts.fields.forEach((f) => fieldsToInclude.add(f));
  } else {
    // Use boolean options
    fieldsToInclude.add('method');
    fieldsToInclude.add('url');

    if (opts.includeHeaders) {
      fieldsToInclude.add('headers');
    }

    if (opts.includeBody) {
      fieldsToInclude.add('body');
    }

    if (opts.includeRemoteAddress) {
      fieldsToInclude.add('remoteAddress');
    }

    if (opts.includeMeta) {
      fieldsToInclude.add('redirect');
      fieldsToInclude.add('referrer');
      fieldsToInclude.add('referrerPolicy');
      fieldsToInclude.add('credentials');
      fieldsToInclude.add('integrity');
      fieldsToInclude.add('mode');
      fieldsToInclude.add('cache');
      fieldsToInclude.add('destination');
      fieldsToInclude.add('bodyUsed');
    }
  }

  // Extract fields
  if (fieldsToInclude.has('method')) {
    info.method = request.method;
  }

  if (fieldsToInclude.has('url')) {
    info.url = request.url;
  }

  if (fieldsToInclude.has('headers')) {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    info.headers = headers;
  }

  if (fieldsToInclude.has('body') && !request.bodyUsed) {
    try {
      // Clone the request to avoid consuming the original body
      const clonedRequest = request.clone();
      let bodyText = await clonedRequest.text();

      // Truncate if needed
      if (bodyText.length > opts.maxBodySize) {
        bodyText =
          `${bodyText.substring(0, opts.maxBodySize) 
          }... [truncated, ${bodyText.length - opts.maxBodySize} bytes omitted]`;
      }

      info.body = bodyText;
    } catch (error) {
      info.body = `[Error reading body: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }

  if (fieldsToInclude.has('redirect')) {
    info.redirect = request.redirect;
  }

  if (fieldsToInclude.has('referrer')) {
    info.referrer = request.referrer;
  }

  if (fieldsToInclude.has('referrerPolicy')) {
    info.referrerPolicy = request.referrerPolicy;
  }

  if (fieldsToInclude.has('credentials')) {
    info.credentials = request.credentials;
  }

  if (fieldsToInclude.has('integrity')) {
    info.integrity = request.integrity;
  }

  if (fieldsToInclude.has('mode')) {
    info.mode = request.mode;
  }

  if (fieldsToInclude.has('cache')) {
    info.cache = request.cache;
  }

  if (fieldsToInclude.has('destination')) {
    info.destination = request.destination;
  }

  if (fieldsToInclude.has('bodyUsed')) {
    info.bodyUsed = request.bodyUsed;
  }

  if (fieldsToInclude.has('remoteAddress') && server?.requestIP) {
    try {
      const ipInfo = server.requestIP(request);
      if (ipInfo) {
        info.remoteAddress = ipInfo.address;
      }
    } catch {
      // Silently ignore if requestIP fails
    }
  }

  return info;
}

/**
 * Apply redaction to the request info based on options.
 */
function applyRedaction(
  info: BunRequestInfo,
  options: BunRequestLoggerOptions,
): BunRequestInfo {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Build redaction config
  let redactionConfig: RedactionConfig | undefined;

  if (options.redaction) {
    redactionConfig = options.redaction;
  } else if (opts.redactHeaders && opts.redactHeaders.length > 0 && info.headers) {
    // Create a simple redaction config for headers
    redactionConfig = {
      keys: opts.redactHeaders,
      caseInsensitive: true,
      fields: ['headers'],
    };
  }

  if (!redactionConfig) {
    return info;
  }

  // Apply redaction
  const redacted = redactObject(info, redactionConfig, {
    path: 'requestInfo',
    field: 'data',
  });

  return redacted as BunRequestInfo;
}

/**
 * Wraps a Bun HTTP request handler to log request information.
 *
 * @param handler - The original Bun request handler
 * @param options - Configuration options for request logging
 * @returns A wrapped handler that logs requests before passing them to the original handler
 *
 * @example
 * ```ts
 * import { bunRequestLogger } from 'jellylogger';
 *
 * const handler = bunRequestLogger(
 *   async (req) => new Response('Hello'),
 *   {
 *     includeHeaders: true,
 *     includeBody: false,
 *     includeMeta: true,
 *     redactHeaders: ['authorization'],
 *   }
 * );
 *
 * Bun.serve({ fetch: handler, port: 3000 });
 * ```
 */
export function bunRequestLogger<TServer = unknown>(
  handler: (
    request: Request,
    server: TServer
  ) => Response | Promise<Response> | undefined | Promise<undefined>,
  options: BunRequestLoggerOptions = {},
): (
  request: Request,
  server: TServer
) => Response | Promise<Response> | undefined | Promise<undefined> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  // If a pluggableFormatter is provided, use a child logger with that formatter
  let loggerInstance: JellyLogger = options.logger ?? (defaultLogger as unknown as JellyLogger);
  if (options.pluggableFormatter) {
    // Prefer using a child logger if available, but fall back to the provided logger
    const maybeChild = (loggerInstance as unknown as { child?: (opts?: unknown) => unknown }).child
      ? (loggerInstance as unknown as { child: (opts?: unknown) => unknown }).child({})
      : loggerInstance;

    // If the chosen logger exposes an `options` object (JellyLogger), set the pluggableFormatter on it.
    if ((maybeChild as JellyLogger).options !== undefined) {
      (maybeChild as JellyLogger).options = { ...((maybeChild as JellyLogger).options ?? {}), pluggableFormatter: options.pluggableFormatter };
      loggerInstance = maybeChild as JellyLogger;
    } else {
      // Fallback: set on the original instance if possible
      (loggerInstance).options = { ...((loggerInstance).options ?? {}), pluggableFormatter: options.pluggableFormatter };
    }
  }

  return (request: Request, server: TServer) => {
    const logRequest = async () => {
      try {
        // Extract request info
        const serverWithIP = server as
          | { requestIP?: (request: Request) => { address: string } | null }
          | undefined;
        const info = await extractRequestInfo(request, serverWithIP, options);

        // Apply redaction
        const redactedInfo = applyRedaction(info, options);

        // Log the request
        const message = `${opts.messagePrefix} ${redactedInfo.method ?? 'UNKNOWN'} ${redactedInfo.url ?? 'unknown'}`;

        switch (opts.logLevel) {
          case 'fatal':
            loggerInstance.fatal(message, redactedInfo);
            break;
          case 'error':
            loggerInstance.error(message, redactedInfo);
            break;
          case 'warn':
            loggerInstance.warn(message, redactedInfo);
            break;
          case 'info':
            loggerInstance.info(message, redactedInfo);
            break;
          case 'debug':
            loggerInstance.debug(message, redactedInfo);
            break;
          case 'trace':
            loggerInstance.trace(message, redactedInfo);
            break;
        }
      } catch (error) {
        // Silently fail - don't break the request handling
        // Users can provide a custom logger with error handlers if needed
        try {
          loggerInstance.error('Failed to log request', { error });
        } catch {
          // If even error logging fails, give up silently
        }
      }
    };

    // Start logging asynchronously (don't wait for it)
    void logRequest();

    // Pass through to the original handler
    return handler(request, server);
  };
}
