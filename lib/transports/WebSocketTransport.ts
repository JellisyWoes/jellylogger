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
  /** Whether to automatically reconnect on close. Default: true */
  autoReconnect?: boolean;
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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string, options?: WebSocketTransportOptions) {
    this.url = url;
    this.options = options ?? {};
    this.reconnectInterval = options?.reconnectIntervalMs ?? 1000;
    this.maxReconnectInterval = options?.maxReconnectIntervalMs ?? 30000;
    this.serializer = options?.serializer ?? safeJsonStringify;

    // Start initial connection
    this.connectionPromise = this.connect();
  }

  /**
   * Wait for the WebSocket to be open. Resolves when open, rejects if closed.
   * Uses polling to avoid race conditions with event handler wrapping.
   */
  private waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not initialized'));
        return;
      }
      if (this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
        reject(new Error('WebSocket is closed'));
        return;
      }

      // Poll for connection status to avoid event handler race conditions
      const pollInterval = 5;
      const maxWaitTime = 5000;
      let elapsed = 0;

      const poll = () => {
        if (!this.ws) {
          reject(new Error('WebSocket lost'));
          return;
        }
        if (this.ws.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }
        if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
          reject(new Error('WebSocket closed before opening'));
          return;
        }
        elapsed += pollInterval;
        if (elapsed >= maxWaitTime) {
          reject(new Error('WebSocket connection timeout'));
          return;
        }
        setTimeout(poll, pollInterval);
      };

      setTimeout(poll, pollInterval);
    });
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnecting = false;
          this.reconnectInterval = this.options.reconnectIntervalMs ?? 1000;
          // Resolve connection; actual flushing is triggered by pending log hooks or explicit flush()
          resolve();
        };

        this.ws.onclose = () => {
          const autoReconnect = this.options.autoReconnect ?? true;
          if (autoReconnect) {
            this.scheduleReconnect();
          }
        };

        // Handle errors passively; rely on onclose to drive reconnection to avoid double scheduling
        this.ws.onerror = (_error: Event) => {
          // No-op; onclose will trigger reconnection if needed
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
    // Prevent multiple timers and excessive constructor calls
    if (this.reconnecting || this.reconnectTimer) return;
    this.reconnecting = true;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectInterval = Math.min(this.reconnectInterval * 2, this.maxReconnectInterval);
      this.connectionPromise = this.connect().catch(() => {
        // Continue retrying on failure; onclose will reschedule
      });
    }, this.reconnectInterval);
  }

  async log(entry: LogEntry, options?: LoggerOptions): Promise<void> {
    const redact = this.options.redact ?? true;
    // Safely access redaction config if options is LoggerOptions
    const redactionConfig = options && 'redaction' in options ? options.redaction : undefined;
    const redactedEntry = redact ? getRedactedEntry(entry, redactionConfig, 'file') : entry;
    const msg = this.serializer(redactedEntry);

    // Enqueue message
    this.queue.push(msg);

    // Wait for connection if not yet established
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
      } catch {
        // Connection failed, message remains queued for retry
        return;
      }
    }

    // Wait for any ongoing flush to complete
    while (this.queueFlushPromise) {
      try {
        await this.queueFlushPromise;
      } catch {
        // Flush failed, break out and try our own flush
        break;
      }
    }

    // If connection is open and we have messages, flush them
    if (this.ws?.readyState === WebSocket.OPEN && this.queue.length > 0 && !this.queueFlushPromise) {
      this.queueFlushPromise = this.flushQueue().finally(() => {
        this.queueFlushPromise = null;
      });
      try {
        await this.queueFlushPromise;
      } catch {
        // Flush failed, messages remain queued
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

    // If not open but we have a ws, wait for it to open (handles race)
    if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
      try {
        await this.waitForOpen();
      } catch {
        // If it fails to open, nothing to flush
        return;
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
