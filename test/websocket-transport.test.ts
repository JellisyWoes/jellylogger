import './test-utils';
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { LogLevel, type LogEntry } from '../lib/index';
import { resetAllMocks } from './test-utils';

// Mock WebSocket transport for testing
class MockWebSocketTransport {
  private connected = false;
  private sentMessages: string[] = [];

  constructor(private url: string) {}

  async connect() {
    this.connected = true;
  }

  async log(entry: LogEntry, options: any) {
    if (!this.connected) {
      await this.connect();
    }

    const message =
      options?.format === 'json'
        ? JSON.stringify(entry)
        : `[${entry.timestamp}] ${entry.levelName}: ${entry.message}`;

    this.sentMessages.push(message);
  }

  async flush() {
    // Simulate flushing buffered messages
  }

  getSentMessages() {
    return [...this.sentMessages];
  }

  isConnected() {
    return this.connected;
  }
}

describe('WebSocket Transport', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let transport: MockWebSocketTransport;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    transport = new MockWebSocketTransport('ws://localhost:8080/logs');
    resetAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    resetAllMocks();
  });

  it('should connect and send log messages', async () => {
    const entry: LogEntry = {
      timestamp: '2023-01-01T12:00:00.000Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'WebSocket test message',
      args: { processedArgs: [], hasComplexArgs: false },
    };

    await transport.log(entry, { format: 'string' });

    expect(transport.isConnected()).toBe(true);
    expect(transport.getSentMessages()).toHaveLength(1);
    expect(transport.getSentMessages()[0]).toContain('INFO');
    expect(transport.getSentMessages()[0]).toContain('WebSocket test message');
  });

  it('should send JSON formatted messages', async () => {
    const entry: LogEntry = {
      timestamp: '2023-01-01T12:00:00.000Z',
      level: LogLevel.ERROR,
      levelName: 'ERROR',
      message: 'JSON test message',
      args: { processedArgs: [], hasComplexArgs: false },
      data: { errorCode: 'WS001' },
    };

    await transport.log(entry, { format: 'json' });

    const sentMessages = transport.getSentMessages();
    expect(sentMessages).toHaveLength(1);

    const parsedMessage = JSON.parse(sentMessages[0]);
    expect(parsedMessage.message).toBe('JSON test message');
    expect(parsedMessage.levelName).toBe('ERROR');
    expect(parsedMessage.data.errorCode).toBe('WS001');
  });

  it('should handle multiple log entries', async () => {
    const entries = [
      {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'First message',
        args: { processedArgs: [], hasComplexArgs: false },
      },
      {
        timestamp: '2023-01-01T12:01:00.000Z',
        level: LogLevel.WARN,
        levelName: 'WARN',
        message: 'Second message',
        args: { processedArgs: [], hasComplexArgs: false },
      },
      {
        timestamp: '2023-01-01T12:02:00.000Z',
        level: LogLevel.ERROR,
        levelName: 'ERROR',
        message: 'Third message',
        args: { processedArgs: [], hasComplexArgs: false },
      },
    ];

    for (const entry of entries) {
      await transport.log(entry, { format: 'string' });
    }

    const sentMessages = transport.getSentMessages();
    expect(sentMessages).toHaveLength(3);
    expect(sentMessages[0]).toContain('First message');
    expect(sentMessages[1]).toContain('Second message');
    expect(sentMessages[2]).toContain('Third message');
  });

  it('should handle flush operation', async () => {
    const entry: LogEntry = {
      timestamp: '2023-01-01T12:00:00.000Z',
      level: LogLevel.DEBUG,
      levelName: 'DEBUG',
      message: 'Flush test',
      args: { processedArgs: [], hasComplexArgs: false },
    };

    await transport.log(entry, { format: 'string' });

    // Should not throw
    await expect(transport.flush()).resolves.toBeUndefined();

    expect(transport.getSentMessages()).toHaveLength(1);
  });

  it('should handle connection state properly', async () => {
    expect(transport.isConnected()).toBe(false);

    const entry: LogEntry = {
      timestamp: '2023-01-01T12:00:00.000Z',
      level: LogLevel.INFO,
      levelName: 'INFO',
      message: 'Connection test',
      args: { processedArgs: [], hasComplexArgs: false },
    };

    // Should auto-connect when logging
    await transport.log(entry, { format: 'string' });
    expect(transport.isConnected()).toBe(true);
  });
});
