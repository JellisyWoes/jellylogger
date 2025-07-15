import type { LogEntry, LoggerOptions, Transport } from '../core/types';
import { getRedactedEntry } from '../redaction';
import { safeJsonStringify } from '../utils/serialization';

export interface WebSocketTransportOptions {
  /** Reconnect interval in ms (initial). Default: 1000 */
  reconnectIntervalMs?: number;
  /** Maximum reconnect interval in ms. Default: 30000 */
  maxReconnectIntervalMs?: number;
  /** Whether to redact logs for this transport. Default: true */
  redact?: boolean;
  /** Custom function to serialize log entries. Default: safeJsonStringify */
  serializer?: (entry: LogEntry) => string;
}

/**
 * WebSocketTransport streams logs to a WebSocket server in real-time.
 */
export class WebSocketTransport implements Transport {
  private url: string;
  private options: WebSocketTransportOptions;
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private reconnecting = false;
  private reconnectInterval: number;
  private maxReconnectInterval: number;
  private serializer: (entry: LogEntry) => string;
  private connectionPromise: Promise<void> | null = null;
  private queueFlushPromise: Promise<void> | null = null;

  constructor(url: string, options?: WebSocketTransportOptions) {
    this.url = url;
    this.options = options ?? {};
    this.reconnectInterval = options?.reconnectIntervalMs ?? 1000;
    this.maxReconnectInterval = options?.maxReconnectIntervalMs ?? 30000;
    this.serializer = options?.serializer ?? safeJsonStringify;

    // Start initial connection
    this.connectionPromise = this.connect();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnecting = false;
          this.reconnectInterval = this.options.reconnectIntervalMs ?? 1000;

          // Ensure queue is flushed once connection is established
          this.queueFlushPromise = this.flushQueue()
            .then(() => {
              this.queueFlushPromise = null;
              resolve(); // Resolve after flush
            })
            .catch(err => {
              this.queueFlushPromise = null;
              reject(err);
            });
        };

        this.ws.onclose = () => {
          this.scheduleReconnect();
        };

        this.ws.onerror = (error: Event) => {
          this.scheduleReconnect();
          if (!this.reconnecting) {
            reject(error);
          }
        };
      } catch (e) {
        this.scheduleReconnect();
        reject(e);
      }
    });
  }

  private async flushQueue(): Promise<void> {
    await Promise.resolve(); // Satisfy require-await rule
    let _sentCount = 0;
    while (this.queue.length > 0) {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        break;
      }

      const msg = this.queue.shift();
      if (!msg) continue;

      try {
        this.ws.send(msg);
        _sentCount++;
      } catch (_err) {
        this.queue.unshift(msg);
        break;
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    setTimeout(() => {
      this.reconnectInterval = Math.min(this.reconnectInterval * 2, this.maxReconnectInterval);
      this.connectionPromise = this.connect().catch(() => {
        // Continue retrying on failure
      });
    }, this.reconnectInterval);
  }

  async log(entry: LogEntry, options?: LoggerOptions): Promise<void> {
    const redact = this.options.redact ?? true;
    // Safely access redaction config if options is LoggerOptions
    const redactionConfig = options && 'redaction' in options ? options.redaction : undefined;
    const redactedEntry = redact ? getRedactedEntry(entry, redactionConfig, 'file') : entry;
    const msg = this.serializer(redactedEntry);

    // Add to queue
    this.queue.push(msg);

    // If we're connected or connecting, try to send immediately
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
      } catch (_err) {
        return; // Message is already in queue for retry
      }
    }

    // If we're connected and no flush is in progress, flush now
    if (this.ws?.readyState === WebSocket.OPEN && !this.queueFlushPromise) {
      try {
        await this.flushQueue();
      } catch (_err) {
        // Silent failure, message remains queued
      }
    }
  }

  async flush(_options?: LoggerOptions): Promise<void> {
    // Wait for any connection attempt to complete
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
      } catch (_err) {
        // Connection failed, nothing to flush
      }
    }

    // Wait for any ongoing flush to complete
    if (this.queueFlushPromise) {
      try {
        await this.queueFlushPromise;
      } catch (_err) {
        // Ongoing flush failed
      }
    }

    // Attempt final flush if connected
    if (this.ws?.readyState === WebSocket.OPEN && this.queue.length > 0) {
      this.queueFlushPromise = this.flushQueue().finally(() => {
        this.queueFlushPromise = null;
      });
      await this.queueFlushPromise;
    }

    // If we still have messages and we're connected, make one more attempt
    if (this.ws?.readyState === WebSocket.OPEN && this.queue.length > 0) {
      await this.flushQueue();
    }
  }
}
