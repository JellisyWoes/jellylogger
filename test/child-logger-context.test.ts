import { describe, expect, test } from 'bun:test';
import { logger } from '../lib/core/logger';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry, Transport } from '../lib/core/types';

/**
 * Test transport that captures log entries for verification
 */
class CaptureTransport implements Transport {
  public entries: LogEntry[] = [];

  async log(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries = [];
  }

  getLastEntry(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
}

describe('ChildLogger context/defaultData', () => {
  test('should merge defaultData into log entries', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      messagePrefix: 'API',
      defaultData: { requestId: 'req-123', userId: 'user-456' },
    });

    child.info('User action');

    const entry = capture.getLastEntry();
    expect(entry).toBeDefined();
    expect(entry?.message).toBe('API User action');
    expect(entry?.data).toEqual({ requestId: 'req-123', userId: 'user-456' });
  });

  test('should merge context into log entries', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      messagePrefix: 'SERVICE',
      context: { service: 'auth', version: '1.0' },
    });

    child.warn('Authentication failed');

    const entry = capture.getLastEntry();
    expect(entry).toBeDefined();
    expect(entry?.message).toBe('SERVICE Authentication failed');
    expect(entry?.data).toEqual({ service: 'auth', version: '1.0' });
  });

  test('should prefer context over defaultData when both provided', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      defaultData: { env: 'test', level: 'low' },
      context: { env: 'prod', priority: 'high' }, // context overwrites env
    });

    child.info('Message');

    const entry = capture.getLastEntry();
    expect(entry?.data).toEqual({ env: 'prod', level: 'low', priority: 'high' });
  });

  test('should merge per-call data with persistent data', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      defaultData: { requestId: 'req-123' },
    });

    child.info('Action completed', { action: 'login', status: 'success' });

    const entry = capture.getLastEntry();
    expect(entry?.data).toEqual({
      requestId: 'req-123',
      action: 'login',
      status: 'success',
    });
  });

  test('should allow per-call data to override persistent data', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      defaultData: { status: 'pending', requestId: 'req-123' },
    });

    child.info('Status updated', { status: 'completed', timestamp: Date.now() });

    const entry = capture.getLastEntry();
    expect(entry?.data?.status).toBe('completed'); // overridden
    expect(entry?.data?.requestId).toBe('req-123'); // preserved
    expect(entry?.data).toHaveProperty('timestamp');
  });

  test('should work without any context/defaultData', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      messagePrefix: 'TEST',
    });

    child.info('Simple message');

    const entry = capture.getLastEntry();
    expect(entry?.message).toBe('TEST Simple message');
    expect(entry?.data).toBeUndefined();
  });

  test('should merge context through nested child loggers', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const parent = logger.child({
      messagePrefix: 'PARENT',
      context: { app: 'myapp', version: '1.0' },
    });

    const child = parent.child({
      messagePrefix: 'CHILD',
      context: { module: 'auth', version: '2.0' }, // version overrides parent
    });

    child.debug('Nested context test');

    const entry = capture.getLastEntry();
    expect(entry?.message).toBe('PARENT CHILD Nested context test');
    expect(entry?.data).toEqual({
      app: 'myapp',
      version: '2.0', // child overrides parent
      module: 'auth',
    });
  });

  test('should handle empty context/defaultData objects', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      messagePrefix: 'EMPTY',
      context: {},
      defaultData: {},
    });

    child.info('Message with empty context');

    const entry = capture.getLastEntry();
    expect(entry?.message).toBe('EMPTY Message with empty context');
    expect(entry?.data).toBeUndefined();
  });

  test('should work with all log levels', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: { testId: 'test-all-levels' },
    });

    child.fatal('Fatal message');
    child.error('Error message');
    child.warn('Warn message');
    child.info('Info message');
    child.debug('Debug message');
    child.trace('Trace message');

    expect(capture.entries).toHaveLength(6);
    capture.entries.forEach(entry => {
      expect(entry.data).toEqual({ testId: 'test-all-levels' });
    });
  });

  test('should handle complex nested data structures', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: {
        user: { id: 123, name: 'John' },
        metadata: { tags: ['api', 'auth'] },
      },
    });

    child.info('Complex data', { additional: { nested: { value: 'test' } } });

    const entry = capture.getLastEntry();
    expect(entry?.data?.user).toEqual({ id: 123, name: 'John' });
    expect(entry?.data?.metadata).toEqual({ tags: ['api', 'auth'] });
    expect(entry?.data?.additional).toEqual({ nested: { value: 'test' } });
  });

  test('should preserve non-object args alongside context data', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: { requestId: 'req-789' },
    });

    child.info('Message with mixed args', 'string arg', 42, true);

    const entry = capture.getLastEntry();
    expect(entry?.data).toEqual({ requestId: 'req-789' });
    expect(entry?.args.processedArgs).toContain('string arg');
    expect(entry?.args.processedArgs).toContain(42);
    expect(entry?.args.processedArgs).toContain(true);
  });

  test('should handle multiple object parameters with context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: { base: 'value' },
    });

    child.info('Multiple objects', { first: 1 }, { second: 2 });

    const entry = capture.getLastEntry();
    // All objects should be merged together
    expect(entry?.data).toEqual({
      base: 'value',
      first: 1,
      second: 2,
    });
  });

  test('should work correctly with flushAll', async () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: { sessionId: 'session-123' },
    });

    child.info('Before flush');
    await child.flushAll();
    child.info('After flush');

    expect(capture.entries).toHaveLength(2);
    capture.entries.forEach(entry => {
      expect(entry.data).toEqual({ sessionId: 'session-123' });
    });
  });
});
