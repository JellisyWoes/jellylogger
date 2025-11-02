import { describe, expect, test } from 'bun:test';
import { logger } from '../lib/core/logger';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry, Transport } from '../lib/core/types';

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

describe('ChildLogger context/defaultData - Edge Cases', () => {
  test('should handle deeply nested child loggers with context inheritance', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const level1 = logger.child({
      messagePrefix: 'L1',
      context: { level: 1, app: 'test' },
    });

    const level2 = level1.child({
      messagePrefix: 'L2',
      context: { level: 2, module: 'auth' },
    });

    const level3 = level2.child({
      messagePrefix: 'L3',
      defaultData: { level: 3, feature: 'login' },
    });

    const level4 = level3.child({
      messagePrefix: 'L4',
      context: { level: 4, user: 'john' },
    });

    level4.info('Deeply nested message');

    const entry = capture.getLastEntry();
    expect(entry?.message).toBe('L1 L2 L3 L4 Deeply nested message');
    expect(entry?.data).toEqual({
      app: 'test', // from level1
      module: 'auth', // from level2
      feature: 'login', // from level3
      level: 4, // from level4 (overrides previous)
      user: 'john', // from level4
    });
  });

  test('should handle null and undefined values in context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'test',
      },
    });

    child.info('Message with null/undefined');

    const entry = capture.getLastEntry();
    expect(entry?.data?.nullValue).toBeNull();
    expect(entry?.data?.undefinedValue).toBeUndefined();
    expect(entry?.data?.normalValue).toBe('test');
  });

  test('should handle special characters and unicode in context keys and values', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: {
        'key with spaces': 'value with spaces',
        'key-with-dashes': 'value-with-dashes',
        'key.with.dots': 'value.with.dots',
        '🚀emoji': '🎉value',
        'unicode-中文': '日本語-value',
      },
    });

    child.info('Special chars test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.['key with spaces']).toBe('value with spaces');
    expect(entry?.data?.['key-with-dashes']).toBe('value-with-dashes');
    expect(entry?.data?.['key.with.dots']).toBe('value.with.dots');
    expect(entry?.data?.['🚀emoji']).toBe('🎉value');
    expect(entry?.data?.['unicode-中文']).toBe('日本語-value');
  });

  test('should handle arrays and complex types in context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: {
        arrayValue: [1, 2, 3],
        nestedArray: [[1, 2], [3, 4]],
        dateValue: new Date('2025-01-01T00:00:00Z'),
        regexValue: /test/gi,
      },
    });

    child.info('Complex types test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.arrayValue).toEqual([1, 2, 3]);
    expect(entry?.data?.nestedArray).toEqual([[1, 2], [3, 4]]);
    expect(entry?.data?.dateValue).toBeInstanceOf(Date);
    expect(entry?.data?.regexValue).toBeInstanceOf(RegExp);
  });

  test('should handle Error objects in context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const error = new Error('Test error');
    error.cause = new Error('Cause error');

    const child = logger.child({
      context: {
        lastError: error,
        errorType: 'TestError',
      },
    });

    child.error('Error context test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.errorType).toBe('TestError');
    // Error should be present but may be serialized
    expect(entry?.data?.lastError).toBeDefined();
  });

  test('should handle large context objects efficiently', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    // Create a large context object
    const largeContext: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      largeContext[`key${i}`] = `value${i}`;
    }

    const child = logger.child({
      context: largeContext,
    });

    const startTime = Date.now();
    child.info('Large context test');
    const duration = Date.now() - startTime;

    // Should complete quickly (less than 50ms for 100 keys)
    expect(duration).toBeLessThan(50);

    const entry = capture.getLastEntry();
    expect(Object.keys(entry?.data ?? {}).length).toBe(100);
    expect(entry?.data?.key0).toBe('value0');
    expect(entry?.data?.key99).toBe('value99');
  });

  test('should handle context merging with Symbol keys', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const symbolKey = Symbol('testSymbol');
    const context = {
      normalKey: 'value',
      [symbolKey]: 'symbolValue',
    };

    const child = logger.child({
      context: context as Record<string, unknown>,
    });

    child.info('Symbol key test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.normalKey).toBe('value');
    // Symbol keys may or may not be preserved depending on object spread behavior
  });

  test('should handle frozen and sealed objects in context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const frozenObj = Object.freeze({ frozen: true });
    const sealedObj = Object.seal({ sealed: true });

    const child = logger.child({
      context: {
        frozenData: frozenObj,
        sealedData: sealedObj,
        normal: 'value',
      },
    });

    child.info('Frozen/sealed object test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.frozenData).toEqual({ frozen: true });
    expect(entry?.data?.sealedData).toEqual({ sealed: true });
    expect(entry?.data?.normal).toBe('value');
  });

  test('should handle context with getters and computed properties', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const context = {
      staticValue: 'static',
      get computedValue() {
        return 'computed';
      },
    };

    const child = logger.child({
      context,
    });

    child.info('Getter test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.staticValue).toBe('static');
    // Getters should be evaluated when spread
    expect(entry?.data?.computedValue).toBe('computed');
  });

  test('should handle context with circular references gracefully', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const circular: Record<string, unknown> = { name: 'parent' };
    circular.self = circular;

    const child = logger.child({
      context: {
        normal: 'value',
        circular,
      },
    });

    // Should not throw
    expect(() => {
      child.info('Circular reference test');
    }).not.toThrow();

    const entry = capture.getLastEntry();
    expect(entry?.data?.normal).toBe('value');
    // Circular reference should be handled
    expect(entry?.data?.circular).toBeDefined();
  });

  test('should handle empty string keys in context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: {
        '': 'empty key value',
        'normal': 'normal value',
      },
    });

    child.info('Empty key test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.['']).toBe('empty key value');
    expect(entry?.data?.normal).toBe('normal value');
  });

  test('should handle numeric keys in context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: {
        123: 'numeric key',
        '456': 'string numeric key',
        normal: 'normal key',
      } as Record<string, unknown>,
    });

    child.info('Numeric key test');

    const entry = capture.getLastEntry();
    expect(entry?.data?.['123']).toBe('numeric key');
    expect(entry?.data?.['456']).toBe('string numeric key');
    expect(entry?.data?.normal).toBe('normal key');
  });

  test('should maintain context through flushAll and multiple operations', async () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: { persistent: true, sessionId: 'sess-123' },
    });

    child.info('Before flush');
    await child.flushAll();
    child.info('After flush');
    await logger.flushAll();
    child.info('After parent flush');

    expect(capture.entries).toHaveLength(3);
    capture.entries.forEach(entry => {
      expect(entry.data).toEqual({ persistent: true, sessionId: 'sess-123' });
    });
  });

  test('should handle rapid logging with context', () => {
    const capture = new CaptureTransport();
    logger.clearTransports();
    logger.addTransport(capture);
    logger.setOptions({ level: LogLevel.TRACE });

    const child = logger.child({
      context: { rapid: true },
    });

    // Log 100 messages rapidly
    for (let i = 0; i < 100; i++) {
      child.info(`Message ${i}`, { index: i });
    }

    expect(capture.entries).toHaveLength(100);
    
    // Verify first and last entries
    expect(capture.entries[0]?.data?.rapid).toBe(true);
    expect(capture.entries[0]?.data?.index).toBe(0);
    expect(capture.entries[99]?.data?.rapid).toBe(true);
    expect(capture.entries[99]?.data?.index).toBe(99);
  });
});
