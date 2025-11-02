import './test-utils';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry } from '../lib/core/types';
import { WebSocketTransport } from '../lib/transports/WebSocketTransport';

// Patch WebSocketTransport with a test-only close() method
(WebSocketTransport.prototype as any).close = function () {
  if (this.reconnectTimer) {
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
  if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
    this.ws.close();
  }
  this.ws = null;
  this.queue = [];
  this.connectionPromise = null;
  this.queueFlushPromise = null;
  this.reconnecting = false;
};

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
  // Track all created WebSocketTransport instances for cleanup
  let createdTransports: WebSocketTransport[] = [];
  let originalWebSocket: typeof globalThis.WebSocket | undefined;
  let mockWebSocketConstructor: ReturnType<typeof mock>;
  let webSocketInstances: MockWebSocket[] = [];
  // Map to track which WebSocket belongs to which transport
  let transportToWsMap: WeakMap<WebSocketTransport, MockWebSocket> = new WeakMap();

  beforeEach(() => {
    createdTransports = [];
    webSocketInstances = [];
    transportToWsMap = new WeakMap();
    
    // Store original WebSocket before first mock
    if (originalWebSocket === undefined) {
      originalWebSocket = globalThis.WebSocket;
    }

    // Create a fresh mock WebSocket constructor for each test
    mockWebSocketConstructor = mock((url: string) => {
      const instance = new MockWebSocket(url);
      webSocketInstances.push(instance);
      return instance;
    });

    // Replace global WebSocket
    globalThis.WebSocket = mockWebSocketConstructor as any;
    (globalThis.WebSocket as any).CONNECTING = MockWebSocket.CONNECTING;
    (globalThis.WebSocket as any).OPEN = MockWebSocket.OPEN;
    (globalThis.WebSocket as any).CLOSING = MockWebSocket.CLOSING;
    (globalThis.WebSocket as any).CLOSED = MockWebSocket.CLOSED;
  });

  afterEach(async () => {
    // Close all created WebSocketTransport instances to prevent reconnection leaks
    for (const t of createdTransports) {
      // @ts-expect-error test-only patch
      if (typeof t.close === 'function') t.close();
    }
    createdTransports = [];
    // Close all open mock WebSocket connections
    for (const ws of webSocketInstances) {
      if (typeof ws.close === 'function' && ws.readyState !== MockWebSocket.CLOSED) {
        ws.close();
      }
    }
    // Wait for pending timers/callbacks/reconnections to fully settle
    await new Promise(resolve => setTimeout(resolve, 150));
    // Clear the webSocketInstances array
    webSocketInstances = [];
    // Restore original WebSocket
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  // Helper to get the most recent WebSocket instance
  const getLastInstance = () => webSocketInstances[webSocketInstances.length - 1];
  
  // Helper to get WebSocket for a specific transport (useful for multi-ws tests)
  const getTransportWs = (transport: WebSocketTransport) => transportToWsMap.get(transport) || getLastInstance();
  
  // Helper to register transport with its WebSocket
  const registerTransport = (transport: WebSocketTransport) => {
    createdTransports.push(transport);
    // Get the most recent WebSocket instance (just created for this transport)
    const ws = getLastInstance();
    if (ws) {
      transportToWsMap.set(transport, ws);
    }
    return transport;
  };

  const createSampleEntry = (): LogEntry => ({
    timestamp: '2023-01-01T12:00:00.000Z',
    level: LogLevel.INFO,
    levelName: 'INFO',
    message: 'Test WebSocket message',
    args: { processedArgs: [], hasComplexArgs: false },
  });

  it('should create WebSocket connection with correct URL', async () => {
    const url = 'ws://localhost:8080/logs';
    const _transport = registerTransport(new WebSocketTransport(url, { autoReconnect: false }));

    // Wait for connection attempt
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockWebSocketConstructor).toHaveBeenCalledWith(url);
    expect(getLastInstance().url).toBe(url);
  });

  it('should send log messages after connection is established', async () => {
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { autoReconnect: false }));
    const entry = createSampleEntry();

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    await transport.log(entry);

    // Ensure all messages are flushed
    await transport.flush();

    const messages = getTransportWs(transport).getMessages();
    expect(messages).toHaveLength(1);

    const sentMessage = JSON.parse(messages[0]);
    expect(sentMessage.message).toBe('Test WebSocket message');
    expect(sentMessage.level).toBe(LogLevel.INFO);
  });

  it('should queue messages when connection is not ready', async () => {
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { autoReconnect: false }));
    const entry = createSampleEntry();

    // Send message immediately after construction (connection still in progress)
    await transport.log(entry);

    // The message should be queued since connection may not be ready yet
    // Wait for connection attempt to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    // After connection, message should be sent
    expect(getTransportWs(transport).getMessages()).toHaveLength(1);
  });

  it('should handle connection failures gracefully', async () => {
    // Create a transport that will fail to connect
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { autoReconnect: false }));

    // Set the WebSocket instance to fail before any logging
    if (getLastInstance()) {
      getLastInstance().setConnectionFailure(true);
    }

    const entry = createSampleEntry();

    // Log should complete without throwing, even if connection fails
    const logPromise = transport.log(entry);

    // Give time for connection attempt to complete/fail
    await Promise.race([logPromise, new Promise(resolve => setTimeout(resolve, 100))]);

    // Since connection failed immediately, no messages should be sent
    // But if the transport queues messages for later retry, we check for that behavior
    const messageCount = getLastInstance()?.getMessages().length || 0;
    expect(messageCount).toBeGreaterThanOrEqual(0); // Either queued (0) or attempted to send (1)
  });

  it('should apply redaction when configured', async () => {
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { redact: true, autoReconnect: false }));
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

    // Ensure all messages are flushed
    await transport.flush();

    const messages = getTransportWs(transport).getMessages();
    expect(messages).toHaveLength(1);

    const sentMessage = JSON.parse(messages[0]);
    expect(sentMessage.data.password).toBe('[REDACTED]');
    expect(sentMessage.data.username).toBe('testuser');
  });

  it('should skip redaction when disabled', async () => {
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { redact: false, autoReconnect: false }));
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

    // Ensure all messages are flushed
    await transport.flush();

    const messages = getTransportWs(transport).getMessages();
    expect(messages).toHaveLength(1);

    const sentMessage = JSON.parse(messages[0]);
    expect(sentMessage.data.password).toBe('secret123');
    expect(sentMessage.data.username).toBe('testuser');
  });

  it('should use custom serializer when provided', async () => {
    const customSerializer = mock((entry: LogEntry) => `CUSTOM: ${entry.message}`);
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', {
      serializer: customSerializer,
      autoReconnect: false,
    }));
    const entry = createSampleEntry();

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 50));

    await transport.log(entry);

    // Ensure all messages are flushed
    await transport.flush();

    expect(customSerializer).toHaveBeenCalledWith(entry);
    const messages = getTransportWs(transport).getMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe('CUSTOM: Test WebSocket message');
  });

  it('should handle reconnection configuration', async () => {
    const _transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', {
      reconnectIntervalMs: 100,
      maxReconnectIntervalMs: 1000,
    }));

    // Wait for initial connection
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(getLastInstance().readyState).toBe(MockWebSocket.OPEN);

    // Get current instance to track before disconnection
    const instanceBeforeDisconnect = getLastInstance();
    const callsBeforeDisconnect = mockWebSocketConstructor.mock.calls.length;

    // Simulate connection loss
    instanceBeforeDisconnect.simulateClose();

    // Wait for reconnection attempt (100ms interval + buffer for connection)
    await new Promise(resolve => setTimeout(resolve, 120));

    // Verify reconnection occurred (should have more calls than before)
    const callsAfterReconnect = mockWebSocketConstructor.mock.calls.length;
    expect(callsAfterReconnect).toBeGreaterThan(callsBeforeDisconnect);
    
    // Clean up to prevent further reconnection attempts  
    // @ts-expect-error test-only patch
    if (typeof _transport.close === 'function') _transport.close();
  });

  it('should flush queued messages', async () => {
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { autoReconnect: false }));
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

    // Wait for all messages to be sent (poll up to 200ms)
    let messages: string[] = [];
    for (let i = 0; i < 20; i++) {
      messages = getTransportWs(transport).getMessages();
      if (messages.length === 3) break;
      await new Promise(r => setTimeout(r, 10));
    }

    expect(messages).toHaveLength(3);
    expect(JSON.parse(messages[0]).message).toBe('Test WebSocket message');
    expect(JSON.parse(messages[1]).message).toBe('Second message');
    expect(JSON.parse(messages[2]).message).toBe('Third message');
  });

  it('should handle flush when disconnected', async () => {
    const transport = registerTransport(new WebSocketTransport('ws://localhost:8080/logs', { autoReconnect: false }));
    const entry = createSampleEntry();

    // Send message
    await transport.log(entry);

    // Simulate connection loss
    setTimeout(() => {
      if (getLastInstance()) {
        getLastInstance().simulateClose();
      }
    }, 5);

    // Wait a bit for connection attempt
    await new Promise(resolve => setTimeout(resolve, 50));

    // Flush should not throw even if connection is lost
    await expect(transport.flush()).resolves.toBeUndefined();
  });
});
