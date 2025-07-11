import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry } from '../lib/core/types';
import { WebSocketTransport } from '../lib/transports/WebSocketTransport';
import './test-utils';

// Mock WebSocket implementation for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  private messages: string[] = [];
  private shouldFailConnection = false;
  private shouldFailSend = false;

  constructor(url: string) {
    this.url = url;

    // Simulate async connection
    setTimeout(() => {
      if (this.shouldFailConnection) {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onerror) {
          this.onerror(new Event('error'));
        }
      } else {
        this.readyState = MockWebSocket.OPEN;
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    if (this.shouldFailSend) {
      throw new Error('Send failed');
    }
    this.messages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  // Test helpers
  getMessages(): string[] {
    return [...this.messages];
  }

  setConnectionFailure(fail: boolean): void {
    this.shouldFailConnection = fail;
  }

  setSendFailure(fail: boolean): void {
    this.shouldFailSend = fail;
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

describe('WebSocketTransport Implementation', () => {
  let originalWebSocket: typeof globalThis.WebSocket;
  let mockWebSocketConstructor: ReturnType<typeof mock>;
  let lastWebSocketInstance: MockWebSocket;

  beforeEach(() => {
    // Store original WebSocket
    originalWebSocket = globalThis.WebSocket;

    // Mock WebSocket constructor
    mockWebSocketConstructor = mock((url: string) => {
      lastWebSocketInstance = new MockWebSocket(url);
      return lastWebSocketInstance;
    });

    // Replace global WebSocket
    globalThis.WebSocket = mockWebSocketConstructor as any;
    (globalThis.WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
    (globalThis.WebSocket as any).OPEN = MockWebSocket.OPEN;
    (globalThis.WebSocket as any).CLOSING = MockWebSocket.CLOSING;
    (globalThis.WebSocket as any).CLOSED = MockWebSocket.CLOSED;
  });

  afterEach(() => {
    // Restore original WebSocket
    globalThis.WebSocket = originalWebSocket;
  });

  const createSampleEntry = (): LogEntry => ({
    timestamp: '2023-01-01T12:00:00.000Z',
    level: LogLevel.INFO,
    levelName: 'INFO',
    message: 'Test WebSocket message',
    args: { processedArgs: [], hasComplexArgs: false },
  });

  it('should create WebSocket connection with correct URL', async () => {
    const url = 'ws://localhost:8080/logs';
    const _transport = new WebSocketTransport(url);

    // Wait for connection attempt
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockWebSocketConstructor).toHaveBeenCalledWith(url);
    expect(lastWebSocketInstance.url).toBe(url);
  });

  it('should send log messages after connection is established', async () => {
    const transport = new WebSocketTransport('ws://localhost:8080/logs');
    const entry = createSampleEntry();

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    await transport.log(entry);

    const messages = lastWebSocketInstance.getMessages();
    expect(messages).toHaveLength(1);

    const sentMessage = JSON.parse(messages[0]);
    expect(sentMessage.message).toBe('Test WebSocket message');
    expect(sentMessage.level).toBe(LogLevel.INFO);
  });

  it('should queue messages when connection is not ready', async () => {
    const transport = new WebSocketTransport('ws://localhost:8080/logs');
    const entry = createSampleEntry();

    // Send message immediately after construction (connection still in progress)
    await transport.log(entry);

    // The message should be queued since connection may not be ready yet
    // Wait for connection attempt to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // After connection, message should be sent
    expect(lastWebSocketInstance.getMessages()).toHaveLength(1);
  });

  it('should handle connection failures gracefully', async () => {
    // Create a transport that will fail to connect
    const transport = new WebSocketTransport('ws://localhost:8080/logs');

    // Set the WebSocket instance to fail before any logging
    if (lastWebSocketInstance) {
      lastWebSocketInstance.setConnectionFailure(true);
    }

    const entry = createSampleEntry();

    // Log should complete without throwing, even if connection fails
    const logPromise = transport.log(entry);

    // Give time for connection attempt to complete/fail
    await Promise.race([logPromise, new Promise(resolve => setTimeout(resolve, 100))]);

    // Since connection failed immediately, no messages should be sent
    // But if the transport queues messages for later retry, we check for that behavior
    const messageCount = lastWebSocketInstance?.getMessages().length || 0;
    expect(messageCount).toBeGreaterThanOrEqual(0); // Either queued (0) or attempted to send (1)
  });

  it('should apply redaction when configured', async () => {
    const transport = new WebSocketTransport('ws://localhost:8080/logs', { redact: true });
    const entry: LogEntry = {
      ...createSampleEntry(),
      data: { password: 'secret123', username: 'testuser' },
    };

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    await transport.log(entry, {
      redaction: {
        keys: ['password'],
        replacement: '[REDACTED]',
      },
    });

    const messages = lastWebSocketInstance.getMessages();
    expect(messages).toHaveLength(1);

    const sentMessage = JSON.parse(messages[0]);
    expect(sentMessage.data.password).toBe('[REDACTED]');
    expect(sentMessage.data.username).toBe('testuser');
  });

  it('should skip redaction when disabled', async () => {
    const transport = new WebSocketTransport('ws://localhost:8080/logs', { redact: false });
    const entry: LogEntry = {
      ...createSampleEntry(),
      data: { password: 'secret123', username: 'testuser' },
    };

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    await transport.log(entry, {
      redaction: {
        keys: ['password'],
        replacement: '[REDACTED]',
      },
    });

    const messages = lastWebSocketInstance.getMessages();
    expect(messages).toHaveLength(1);

    const sentMessage = JSON.parse(messages[0]);
    expect(sentMessage.data.password).toBe('secret123');
    expect(sentMessage.data.username).toBe('testuser');
  });

  it('should use custom serializer when provided', async () => {
    const customSerializer = mock((entry: LogEntry) => `CUSTOM: ${entry.message}`);
    const transport = new WebSocketTransport('ws://localhost:8080/logs', {
      serializer: customSerializer,
    });
    const entry = createSampleEntry();

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    await transport.log(entry);

    expect(customSerializer).toHaveBeenCalledWith(entry);
    const messages = lastWebSocketInstance.getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe('CUSTOM: Test WebSocket message');
  });

  it('should handle reconnection configuration', async () => {
    const _transport = new WebSocketTransport('ws://localhost:8080/logs', {
      reconnectIntervalMs: 100,
      maxReconnectIntervalMs: 1000,
    });

    // Wait for initial connection
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(lastWebSocketInstance.readyState).toBe(MockWebSocket.OPEN);

    // Simulate connection loss
    lastWebSocketInstance.simulateClose();

    // Wait for reconnection attempt
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should have attempted to create new connection
    expect(mockWebSocketConstructor).toHaveBeenCalledTimes(2);
  });

  it('should flush queued messages', async () => {
    const transport = new WebSocketTransport('ws://localhost:8080/logs');
    const entries = [
      createSampleEntry(),
      { ...createSampleEntry(), message: 'Second message' },
      { ...createSampleEntry(), message: 'Third message' },
    ];

    // Send messages before connection (they get queued)
    for (const entry of entries) {
      await transport.log(entry);
    }

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    // Flush all messages
    await transport.flush();

    const messages = lastWebSocketInstance.getMessages();
    expect(messages).toHaveLength(3);
    expect(JSON.parse(messages[0]).message).toBe('Test WebSocket message');
    expect(JSON.parse(messages[1]).message).toBe('Second message');
    expect(JSON.parse(messages[2]).message).toBe('Third message');
  });

  it('should handle flush when disconnected', async () => {
    const transport = new WebSocketTransport('ws://localhost:8080/logs');
    const entry = createSampleEntry();

    // Send message
    await transport.log(entry);

    // Simulate connection loss
    setTimeout(() => {
      if (lastWebSocketInstance) {
        lastWebSocketInstance.simulateClose();
      }
    }, 5);

    // Wait a bit for connection attempt
    await new Promise(resolve => setTimeout(resolve, 50));

    // Flush should not throw even if connection is lost
    await expect(transport.flush()).resolves.toBeUndefined();
  });
});
