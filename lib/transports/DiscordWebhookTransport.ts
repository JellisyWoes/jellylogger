import { LogLevel } from '../core/constants';
import type { LogEntry, LoggerOptions, Transport, TransportOptions } from '../core/types';
import { DEFAULT_FORMATTER } from '../formatters';
import { getRedactedEntry } from '../redaction';
import { safeJsonStringify, safeStringify } from '../utils/serialization';

/**
 * Options for DiscordWebhookTransport batching.
 */
export interface DiscordWebhookTransportOptions {
  /** How often to send batches (ms). Default: 2000 */
  batchIntervalMs?: number;
  /** Max number of log entries per batch. Default: 10 */
  maxBatchSize?: number;
  /** Username for Discord webhook. Default: 'JellyLogger' */
  username?: string;
  /** Maximum retry attempts for failed batches. Default: 3 */
  maxRetries?: number;
  /** Suppress console.error output on webhook failure. Default: false */
  suppressConsoleErrors?: boolean;
}

/**
 * Interface for the expected Discord rate limit response.
 */
export interface DiscordRateLimitResponse {
  retry_after: number;
  // message?: string; // Optional, as not directly used for logic
  // global?: boolean; // Optional
}

/**
 * DiscordWebhookTransport sends log entries to a Discord webhook URL, batching them to avoid rate limits.
 */
export class DiscordWebhookTransport implements Transport {
  private webhookUrl: string;
  private queue: LogEntry[] = [];
  private timer: NodeJS.Timeout | null = null; // Changed Timer to NodeJS.Timeout
  private batchIntervalMs: number;
  private maxBatchSize: number;
  private username: string;
  private maxRetries: number;
  private suppressConsoleErrors: boolean;
  private isFlushing: boolean = false;
  private retryQueue: { batch: LogEntry[]; retries: number; nextAttempt: number }[] = [];
  private flushPromise: Promise<void> | null = null;

  constructor(webhookUrl: string, opts?: DiscordWebhookTransportOptions) {
    this.webhookUrl = webhookUrl;
    this.batchIntervalMs = opts?.batchIntervalMs ?? 2000;
    this.maxBatchSize = opts?.maxBatchSize ?? 10;
    this.username = opts?.username ?? 'JellyLogger';
    this.maxRetries = opts?.maxRetries ?? 3;
    this.suppressConsoleErrors = opts?.suppressConsoleErrors ?? false;
  }

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    // Fallback to empty object if options is undefined
    const redactedEntry = getRedactedEntry(entry, (options as any)?.redaction, 'console');
    this.queue.push(redactedEntry);
    this.timer ??= setTimeout(() => void this.flush(options), this.batchIntervalMs);
    if (this.queue.length >= this.maxBatchSize) {
      await this.flush(options);
    }
  }

  async flush(options?: TransportOptions): Promise<void> {
    // If already flushing, wait for current flush to complete
    if (this.flushPromise) {
      return this.flushPromise;
    }

    this.flushPromise = this._doFlush(options);
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  private async _doFlush(options?: TransportOptions): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    // Provide fallback LoggerOptions if not present
    const loggerOptions: LoggerOptions = {
      level: LogLevel.INFO,
      useHumanReadableTime: false,
      transports: [],
      format: 'string',
      ...((options as any) ?? {}),
    };

    try {
      // Flush main queue
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.maxBatchSize);
        await this.sendBatchWithRetry(batch, loggerOptions);
      }

      // Flush retryQueue (respecting nextAttempt)
      const now = Date.now();
      const readyRetries = this.retryQueue.filter(item => item.nextAttempt <= now);
      this.retryQueue = this.retryQueue.filter(item => item.nextAttempt > now);

      for (const item of readyRetries) {
        await this.sendBatchWithRetry(item.batch, loggerOptions, item.retries + 1);
      }

      this.clearTimer();
      // If more logs are queued, schedule next flush
      if (this.queue.length > 0 || this.retryQueue.length > 0) {
        this.timer = setTimeout(() => void this.flush(loggerOptions), this.batchIntervalMs);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async sendBatchWithRetry(
    batch: LogEntry[],
    options: LoggerOptions,
    retries = 0,
  ): Promise<void> {
    try {
      await this.sendBatch(batch, options);
    } catch (e: unknown) {
      if (retries < this.maxRetries) {
        // For non-rate-limit errors, add exponential backoff
        if (!(e instanceof Error && e.message.includes('Discord rate limited'))) {
          const delayMs = Math.pow(2, retries) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        // Retry the batch
        await this.sendBatchWithRetry(batch, options, retries + 1);
      } else {
        // Only log if suppressConsoleErrors is false
        if (!this.suppressConsoleErrors) {
          console.error(
            'Failed to send log batch to Discord webhook after retries:',
            e instanceof Error ? e.message : String(e),
          );
        }
        // Don't throw - we want to continue even if Discord fails
      }
    }
  }

  private async sendBatch(batch: LogEntry[], options: LoggerOptions): Promise<void> {
    // Discord message max length is 2000 chars. Split messages if needed.
    const messages: string[] = [];
    let current = '';

    for (const entry of batch) {
      let formatted: string;

      if (options.pluggableFormatter) {
        try {
          formatted = options.pluggableFormatter.format(entry, { useColors: false });
        } catch (error) {
          console.error(
            'Pluggable formatter failed in DiscordWebhookTransport, using default:',
            error instanceof Error ? error.message : String(error),
          );
          formatted = DEFAULT_FORMATTER.format(entry, { useColors: false });
        }
      } else if (options.formatter) {
        formatted = options.formatter(entry);
      } else if (options.format === 'json') {
        // Use unified JSON serialization for consistent handling
        const jsonString = safeJsonStringify(entry);
        formatted = `\`\`\`json\n${jsonString}\n\`\`\``;
      } else {
        // Use default formatter but format for Discord with markdown
        const levelString = LogLevel[entry.level];
        const argsString =
          entry.args?.processedArgs?.length && entry.args.processedArgs.length > 0
            ? `\n${entry.args.processedArgs
                .map((arg: unknown) => {
                  if (typeof arg === 'object') {
                    const stringified = safeStringify(arg);
                    return `\`\`\`json\n${stringified}\n\`\`\``;
                  }
                  return safeStringify(arg);
                })
                .join('\n')}`
            : '';
        formatted = `**[${entry.timestamp}] ${levelString}:** ${entry.message}${argsString}`;
      }

      // Truncate individual formatted message if it exceeds Discord's limit
      if (formatted.length > 2000) {
        formatted = `${formatted.slice(0, 1997)}…`;
      }

      // Check if adding this message would exceed the limit
      const separator = current ? '\n\n' : '';
      const newLength = current.length + separator.length + formatted.length;

      if (newLength > 2000) {
        if (current) {
          // Truncate current if needed before pushing
          if (current.length > 2000) {
            current = `${current.slice(0, 1997)}…`;
          }
          messages.push(current);
        }
        current = formatted;
      } else {
        current = current + separator + formatted;
      }
    }

    if (current) {
      // Final truncation check
      if (current.length > 2000) {
        current = `${current.slice(0, 1997)}…`;
      }
      messages.push(current);
    }

    for (const content of messages) {
      await this.sendDiscordMessage(content);
    }
  }
  private async sendDiscordMessage(content: string): Promise<void> {
    // Ensure content doesn't exceed Discord's 2000 character limit
    const truncatedContent = content.length > 2000 ? `${content.slice(0, 1997)}…` : content;

    const body = JSON.stringify({
      content: truncatedContent,
      username: this.username,
      allowed_mentions: { parse: [] },
    });

    let response: Response | undefined;
    try {
      response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Handle rate limiting
          let retryAfterSeconds = 1; // Default retry after 1 second

          // Try to get retry_after from headers first (more reliable)
          const retryAfterHeader = response.headers.get('Retry-After');
          if (retryAfterHeader) {
            retryAfterSeconds = Number(retryAfterHeader);
          } else if (response.headers.get('Content-Type')?.includes('application/json')) {
            // Fallback to response body
            const responseData = await response.json();
            retryAfterSeconds = Number((responseData as DiscordRateLimitResponse).retry_after);
          }

          // Ensure retryAfterSeconds is a valid positive number, default to 1 if not
          if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
            retryAfterSeconds = 1;
          }

          const delayMilliseconds = Math.max(1000, retryAfterSeconds * 1000);

          // Wait for the rate limit to pass, then throw to trigger retry logic
          await new Promise(res => setTimeout(res, delayMilliseconds));
          throw new Error(
            `Discord rate limited, waited ${retryAfterSeconds}s. Status: ${response.status} ${response.statusText}`,
          );
        }

        // For other HTTP errors, throw immediately
        throw new Error(
          `Discord webhook request failed: ${response.status} ${response.statusText}`,
        );
      }
    } catch (e: unknown) {
      // Handle rate limit errors specifically
      if (e instanceof Error && e.message.includes('Discord rate limited')) {
        throw e;
      }

      // Handle other Discord webhook errors
      if (e instanceof Error && e.message.startsWith('Discord webhook error')) {
        throw e;
      }

      // Handle network errors and invalid URLs - don't throw, just log if not suppressed
      if (
        e instanceof TypeError ||
        (e instanceof Error &&
          (e.message.includes('Failed to fetch') ||
            e.message.includes('Invalid URL') ||
            e.message.includes('fetch failed') ||
            e.message.includes('Network request failed')))
      ) {
        if (!this.suppressConsoleErrors) {
          console.error(
            `Failed to send Discord message: Network error or invalid URL - ${e.message}`,
          );
        }
        return; // Don't throw, just return
      }

      const errorMessage =
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : typeof e === 'object' && e !== null
              ? JSON.stringify(e)
              : String(e);
      throw new Error(`Failed to send Discord message: ${errorMessage}`);
    }
  }
  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
