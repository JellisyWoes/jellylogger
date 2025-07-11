import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import {
  ConsoleTransport,
  FileTransport,
  logger,
  LogLevel,
  type LogEntry,
  type Transport,
} from '../lib/index';
import './test-utils'; // Import mocks first
import {
  actualMockBunFileFn,
  actualMockBunWriteFn,
  mockFileExists,
  mockFileText,
} from './test-utils';

describe('Logger', () => {
  let originalConsoleMethods: any = {};
  let mockConsoleTransportLog: any;

  beforeEach(() => {
    logger.resetOptions();

    if (typeof console !== 'undefined') {
      originalConsoleMethods = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
      };

      console.log = mock(() => {});
      console.info = mock(() => {});
      console.warn = mock(() => {});
      console.error = mock(() => {});
      console.debug = mock(() => {});
    }

    mockConsoleTransportLog = spyOn(ConsoleTransport.prototype, 'log');

    // Clear mock call history properly
    if ((actualMockBunWriteFn as any).mockClear) {
      (actualMockBunWriteFn as any).mockClear();
    }
    if ((actualMockBunFileFn as any).mockClear) {
      (actualMockBunFileFn as any).mockClear();
    }
    if (mockFileExists.mockClear) {
      mockFileExists.mockClear();
    }
    if (mockFileText.mockClear) {
      mockFileText.mockClear();
    }
  });

  afterEach(() => {
    if (typeof console !== 'undefined') {
      console.log = originalConsoleMethods.log;
      console.info = originalConsoleMethods.info;
      console.warn = originalConsoleMethods.warn;
      console.error = originalConsoleMethods.error;
      console.debug = originalConsoleMethods.debug;
    }

    mockConsoleTransportLog?.mockRestore();
  });

  describe('Default Options', () => {
    it('should have default options set correctly', () => {
      const options = logger.options;
      expect(options.level).toBe(LogLevel.INFO);
      expect(options.format).toBe('string');
      expect(options.useHumanReadableTime).toBe(true);
      expect(options.transports?.length).toBeGreaterThan(0);
    });
  });

  describe('setOptions and resetOptions', () => {
    it('should set options correctly', () => {
      logger.setOptions({
        level: LogLevel.DEBUG,
        format: 'json',
        useHumanReadableTime: false,
      });

      const options = logger.options;
      expect(options.level).toBe(LogLevel.DEBUG);
      expect(options.format).toBe('json');
      expect(options.useHumanReadableTime).toBe(false);
    });

    it('should reset options to defaults', () => {
      logger.setOptions({
        level: LogLevel.ERROR,
        format: 'json',
        useHumanReadableTime: false,
      });

      logger.resetOptions();

      const options = logger.options;
      expect(options.level).toBe(LogLevel.INFO);
      expect(options.format).toBe('string');
      expect(options.useHumanReadableTime).toBe(true);
    });

    it('should preserve transports when resetting options', () => {
      const initialTransportsLength = logger.options.transports?.length || 0;
      logger.setOptions({ level: LogLevel.ERROR });
      logger.resetOptions();
      expect(logger.options.transports?.length).toBe(initialTransportsLength);
    });
  });

  describe('Logging Methods', () => {
    const methods = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

    methods.forEach(method => {
      it(`should pass optionalParams to transport.log for ${method}`, () => {
        // Set log level to TRACE to ensure all methods are called
        logger.setOptions({ level: LogLevel.TRACE });

        const param1 = { test: 'data' };
        const param2 = 'param2';
        (logger[method] as Function)('test message', param1, param2);
        expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
        const logEntry = mockConsoleTransportLog.mock.calls[0][0] as LogEntry;
        expect(logEntry.data).toEqual(param1);
        // Args now contains the processLogArgs result structure
        expect(logEntry.args.processedArgs).toEqual([param2]);
        // Objects are considered complex args, so this should be true
        expect(logEntry.args.hasComplexArgs).toBe(true);
      });

      it(`should handle no optionalParams for ${method}`, () => {
        logger.setOptions({ level: LogLevel.TRACE });
        (logger[method] as Function)('test message without params');
        expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
        const logEntryArgs = mockConsoleTransportLog.mock.calls[0];
        expect(logEntryArgs[0].message).toBe('test message without params');
        // Args now contains the processLogArgs result structure
        expect(logEntryArgs[0].args.processedArgs).toEqual([]);
        expect(logEntryArgs[0].args.hasComplexArgs).toBe(false);
      });
    });
  });

  describe('Multiple Transports', () => {
    it('should write to multiple transports', () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new FileTransport('test.log', undefined, {
        file: actualMockBunFileFn,
        write: actualMockBunWriteFn,
        appendFileSync: mock(() => {}), // Mock to prevent real file creation
      });

      // Spy on both transports
      const transport1Spy = spyOn(transport1, 'log');
      const transport2Spy = spyOn(transport2, 'log');

      logger.setOptions({
        transports: [transport1, transport2],
        level: LogLevel.INFO,
      });

      logger.info('Test message');

      // Each transport should be called once
      expect(transport1Spy).toHaveBeenCalledTimes(1);
      expect(transport2Spy).toHaveBeenCalledTimes(1);

      transport1Spy.mockRestore();
      transport2Spy.mockRestore();
    });
  });

  // Additional edge case tests
  it('should not throw if transport.log throws', () => {
    const faultyTransport: Transport = {
      log: async () => {
        throw new Error('Transport error');
      },
    };

    logger.setOptions({
      transports: [faultyTransport],
      level: LogLevel.INFO,
    });

    expect(() => {
      logger.info('This should not crash');
    }).not.toThrow();
  });

  it('should allow setting custom transports at runtime', () => {
    const customTransport: Transport = {
      log: async () => {},
    };

    logger.setOptions({
      transports: [customTransport],
    });

    expect(logger.options.transports).toContain(customTransport);
  });

  it('should allow changing log level at runtime', () => {
    logger.setOptions({ level: LogLevel.ERROR });
    expect(logger.options.level).toBe(LogLevel.ERROR);

    logger.setOptions({ level: LogLevel.DEBUG });
    expect(logger.options.level).toBe(LogLevel.DEBUG);
  });

  it('should support multiple transports with different behaviors', () => {
    const logs: string[] = [];
    const transport1: Transport = {
      log: async entry => {
        logs.push(`T1: ${entry.message}`);
      },
    };
    const transport2: Transport = {
      log: async entry => {
        logs.push(`T2: ${entry.message}`);
      },
    };

    logger.setOptions({
      transports: [transport1, transport2],
      level: LogLevel.INFO,
    });

    logger.info('Multi-transport test');

    // Give a small delay for async operations
    setTimeout(() => {
      expect(logs).toContain('T1: Multi-transport test');
      expect(logs).toContain('T2: Multi-transport test');
    }, 10);
  });
});
// Additional edge case tests
it('should not throw if transport.log throws', () => {
  const badTransport: Transport = {
    log: (_entry: LogEntry) => {
      throw new Error('fail!');
    },
  };
  logger.setOptions({ transports: [badTransport], level: LogLevel.INFO });

  const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

  expect(() => {
    logger.info('this call should not throw');
  }).not.toThrow();

  expect(consoleErrorSpy).toHaveBeenCalled();
  if (consoleErrorSpy.mock.calls.length > 0) {
    expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/Synchronous error in transport 'Object':/);
    expect(consoleErrorSpy.mock.calls[0][1].message).toBe('fail!');
  }

  consoleErrorSpy.mockRestore();
});

it('should allow setting custom transports at runtime', () => {
  const calls: LogEntry[] = [];
  const customTransport: Transport = {
    async log(entry, _options) {
      calls.push(entry);
    },
  };
  logger.setOptions({ transports: [customTransport], level: LogLevel.INFO });
  logger.info('custom transport test');
  expect(calls.length).toBe(1);
  expect(calls[0].message).toBe('custom transport test');
});

it('should allow changing log level at runtime', () => {
  const testConsoleTransport = new ConsoleTransport();
  const transportSpy = spyOn(testConsoleTransport, 'log');
  logger.setOptions({ transports: [testConsoleTransport], level: LogLevel.WARN });

  logger.info('should not log this');
  expect(transportSpy).not.toHaveBeenCalled();

  logger.setOptions({ level: LogLevel.INFO });
  logger.info('should log this');
  expect(transportSpy).toHaveBeenCalledTimes(1);
  expect(transportSpy.mock.calls[0][0].message).toBe('should log this');

  logger.warn('should also log this');
  expect(transportSpy).toHaveBeenCalledTimes(2);
  expect(transportSpy.mock.calls[1][0].message).toBe('should also log this');

  transportSpy.mockRestore();
});

it('should support multiple transports with different behaviors', () => {
  let calledA = false,
    calledB = false;
  const transportA: Transport = {
    log: async () => {
      calledA = true;
    },
  };
  const transportB: Transport = {
    log: async () => {
      calledB = true;
    },
  };
  logger.setOptions({ transports: [transportA, transportB], level: LogLevel.INFO });
  logger.info('multi transport');
  expect(calledA).toBe(true);
  expect(calledB).toBe(true);
});
