import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LogLevel, WebSocketTransport, type LogEntry } from "../lib/index";

// Create a simpler, more predictable mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  
  readyState: number;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  
  constructor(public url: string, startState?: number) {
    
    // Set initial state
    this.readyState = startState ?? MockWebSocket.OPEN;
    
    // If starting as OPEN, trigger onopen after handlers are attached
    if (this.readyState === MockWebSocket.OPEN) {
      // Use setTimeout to ensure onopen is called after the constructor returns
      // and the transport has had a chance to attach the handler
      setTimeout(() => {
        if (this.onopen) {
          this.onopen();
        }
      }, 0);
    }
  }
  
  // Synchronous send method - immediately records the message
  send(msg: string): void {
    if (this.readyState === MockWebSocket.OPEN) {
      this.sent.push(msg);
    } else {
      throw new Error('WebSocket is not open');
    }
  }
  
  // Simulate connection opening
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }
  
  // Simulate connection closing
  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose();
    }
  }
  
  // Simulate error
  simulateError(errorMsg: string = "Error"): void {
    if (this.onerror) {
      const errorEvent = { type: 'error', message: errorMsg } as unknown as Event;
      this.onerror(errorEvent);
    }
  }
}

describe("WebSocketTransport", () => {
  let transport: WebSocketTransport;
  let wsInstance: MockWebSocket;
  let originalWebSocket: any;

  beforeEach(() => {
    // Store original WebSocket if it exists
    originalWebSocket = (globalThis as any).WebSocket;
    
    // Clear any existing mock
    wsInstance = undefined as any;
    
    // Create a mock WebSocket constructor that properly exposes constants
    const MockWebSocketConstructor = function(url: string) {
      wsInstance = new MockWebSocket(url);
      return wsInstance;
    } as any;
    
    // Copy the static constants to the constructor function
    MockWebSocketConstructor.OPEN = MockWebSocket.OPEN;
    MockWebSocketConstructor.CLOSED = MockWebSocket.CLOSED;
    MockWebSocketConstructor.CONNECTING = MockWebSocket.CONNECTING;
    
    // Replace global WebSocket
    (globalThis as any).WebSocket = MockWebSocketConstructor;
  });

  afterEach(() => {
    // Restore original WebSocket if it existed
    if (originalWebSocket) {
      (globalThis as any).WebSocket = originalWebSocket;
    } else {
      delete (globalThis as any).WebSocket;
    }
    wsInstance = undefined as any;
  });

  it("should send logs directly when WebSocket is open", async () => {
    
    // Create transport
    transport = new WebSocketTransport("ws://localhost:1234");
    
    // Wait for the mock WebSocket to auto-trigger onopen
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Ensure WebSocket instance is created and ready
    expect(wsInstance).toBeDefined();
    expect(wsInstance.readyState).toBe(MockWebSocket.OPEN);
    
    // Create a log entry
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "WebSocket test",
      args: [],
      data: { foo: "bar" }
    };
    
    await transport.log(entry, { format: "json" });
    
    await transport.flush();
    
    expect(wsInstance.sent.length).toBe(1);
    
    if (wsInstance.sent.length > 0) {
      const sentData = JSON.parse(wsInstance.sent[0]);
      expect(sentData.message).toBe("WebSocket test");
    }
  });
  
  it("should queue messages when WebSocket is connecting and send when open", async () => {
    
    // Create a connecting WebSocket
    const MockWebSocketConstructor = function(url: string) {
      wsInstance = new MockWebSocket(url, MockWebSocket.CONNECTING); // Start as CONNECTING
      return wsInstance;
    } as any;
    
    // Copy the static constants
    MockWebSocketConstructor.OPEN = MockWebSocket.OPEN;
    MockWebSocketConstructor.CLOSED = MockWebSocket.CLOSED;
    MockWebSocketConstructor.CONNECTING = MockWebSocket.CONNECTING;
    
    (globalThis as any).WebSocket = MockWebSocketConstructor;
    
    // Create transport
    transport = new WebSocketTransport("ws://localhost:5678");
    
    // Wait a moment for transport initialization
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Ensure WebSocket is created and in connecting state
    expect(wsInstance).toBeDefined();
    expect(wsInstance.readyState).toBe(MockWebSocket.CONNECTING);
    
    // Create a log entry
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Queued message",
      args: [],
      data: {}
    };
    

    // Note: don't await this, as it will hang waiting for connection
    transport.log(entry, { format: "json" });
    
    // Wait a moment, then check that no messages were sent yet
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(wsInstance.sent.length).toBe(0);
    
    // Now simulate the WebSocket connection opening

    wsInstance.simulateOpen();
    
    // Wait a moment for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(wsInstance.sent.length).toBe(1);
    
    if (wsInstance.sent.length > 0) {
      const sentData = JSON.parse(wsInstance.sent[0]);
      expect(sentData.message).toBe("Queued message");
    }
  });
  
  it("should apply redaction to sensitive data", async () => {
    
    // Create transport with redaction enabled
    transport = new WebSocketTransport("ws://localhost:4321", { 
      redact: true
    });
    
    // Wait for the mock WebSocket to auto-trigger onopen
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Ensure WebSocket is created and ready
    expect(wsInstance).toBeDefined();
    expect(wsInstance.readyState).toBe(MockWebSocket.OPEN);
    
    // Create a log entry with sensitive data
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Sensitive data",
      args: [],
      data: { secret: "should-be-redacted", normal: "visible-data" }
    };
    
    await transport.log(entry, {
      redaction: {
        keys: ["secret"],
        replacement: "[REDACTED]",
        redactIn: "file"
      },
      format: "json"
    });
    
    // Flush to ensure all messages are sent
    await transport.flush();

    expect(wsInstance.sent.length).toBe(1);
    
    if (wsInstance.sent.length > 0) {
      const sentData = JSON.parse(wsInstance.sent[0]);
      expect(sentData.data.secret).toBe("[REDACTED]");
      expect(sentData.data.normal).toBe("visible-data");
    }
  });
  
  it("should reconnect when connection is closed", async () => {
    
    let connectCount = 0;
    
    // Create a WebSocket that tracks connection count
    const MockWebSocketConstructor = function(url: string) {
      connectCount++;
      wsInstance = new MockWebSocket(url);
      return wsInstance;
    } as any;
    
    // Copy the static constants
    MockWebSocketConstructor.OPEN = MockWebSocket.OPEN;
    MockWebSocketConstructor.CLOSED = MockWebSocket.CLOSED;
    MockWebSocketConstructor.CONNECTING = MockWebSocket.CONNECTING;
    
    (globalThis as any).WebSocket = MockWebSocketConstructor;
    
    // Create transport with fast reconnect
    // Create transport with fast reconnect
    transport = new WebSocketTransport("ws://localhost:9999", { 
      reconnectIntervalMs: 10
    });
    
    // Wait for initial connection
    await new Promise(resolve => setTimeout(resolve, 20));
    // Ensure WebSocket is created
    expect(wsInstance).toBeDefined();
    expect(connectCount).toBe(1);
    
    // Now simulate a connection close
    wsInstance.simulateClose();
    
    // Wait for reconnection
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(connectCount).toBeGreaterThan(1);
  });
});
