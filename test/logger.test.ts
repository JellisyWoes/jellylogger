import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { logger, LogLevel, ConsoleTransport, FileTransport, type LoggerOptions, type LogEntry, type Transport } from "../lib/index";
import { actualMockBunFileFn, actualMockBunWriteFn, mockFileExists, mockFileText } from "./test-utils";

describe("Logger", () => {
  let originalConsoleMethods: any = {};
  let mockConsoleTransportLog: any;

  beforeEach(() => {
    logger.resetOptions(); 

    if (typeof console !== 'undefined') {
        originalConsoleMethods.log = console.log;
        originalConsoleMethods.info = console.info;
        originalConsoleMethods.warn = console.warn;
        originalConsoleMethods.error = console.error;
        originalConsoleMethods.debug = console.debug;

        console.log = mock(() => {});
        console.info = mock(() => {});
        console.warn = mock(() => {});
        console.error = mock(() => {});
        console.debug = mock(() => {});
    }

    mockConsoleTransportLog = spyOn(ConsoleTransport.prototype, 'log'); 

    actualMockBunWriteFn.mock.calls.length = 0;
    actualMockBunWriteFn.mock.results.length = 0;
    actualMockBunFileFn.mock.calls.length = 0;
    actualMockBunFileFn.mock.results.length = 0;
    mockFileExists.mock.calls.length = 0;
    mockFileExists.mock.results.length = 0;
    mockFileText.mock.calls.length = 0;
    mockFileText.mock.results.length = 0;
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

  describe("Default Options", () => {
    it("should have default options set correctly", () => {
      expect(logger.options.level).toBe(LogLevel.INFO);
      expect(logger.options.useHumanReadableTime).toBe(false);
      expect(logger.options.transports?.length ?? 0).toBe(1);
      expect(logger.options.transports?.[0]).toBeInstanceOf(ConsoleTransport);
      expect(logger.options.format).toBe("string");
    });
  });

  describe("setOptions and resetOptions", () => {
    it("should update options with setOptions", () => {
      const newOptions: LoggerOptions = {
        level: LogLevel.DEBUG,
        useHumanReadableTime: true,
        format: "json",
      };
      logger.setOptions(newOptions);
      expect((logger.options.level ?? LogLevel.INFO)).toBe(LogLevel.DEBUG);
      expect(logger.options.useHumanReadableTime).toBe(true);
      expect((logger.options.format ?? "string") as "string" | "json").toBe("json");
    });

    it("should perform partial updates with setOptions", () => {
      const initialLevel = logger.options.level;
      const initialFormat = logger.options.format;

      logger.setOptions({ useHumanReadableTime: true });
      expect((logger.options.level ?? LogLevel.INFO) as LogLevel).toBe(initialLevel as LogLevel);
      expect(logger.options.useHumanReadableTime).toBe(true);
      expect((logger.options.format ?? "string") as "string" | "json").toBe(initialFormat as "string" | "json");

      logger.setOptions({ level: LogLevel.ERROR });
      expect((logger.options.level ?? LogLevel.INFO) as LogLevel).toBe(LogLevel.ERROR);
      expect(logger.options.useHumanReadableTime).toBe(true);
      expect((logger.options.format ?? "string") as "string" | "json").toBe(initialFormat as "string" | "json");
    });

    it("should not change options with setOptions({})", () => {
      const originalOptions = { ...logger.options };
      logger.setOptions({});
      expect(logger.options).toEqual(originalOptions);
    });

    it("should reset options with resetOptions", () => {
      logger.setOptions({ level: LogLevel.WARN, useHumanReadableTime: true });
      logger.resetOptions();
      expect(logger.options.level).toBe(LogLevel.INFO);
      expect(logger.options.useHumanReadableTime).toBe(false);
    });
  });

  describe("Logging Methods", () => {
    const testCases = [
      { level: LogLevel.FATAL, method: "fatal" as keyof typeof logger, defaultLevelPass: true },
      { level: LogLevel.ERROR, method: "error" as keyof typeof logger, defaultLevelPass: true },
      { level: LogLevel.WARN, method: "warn" as keyof typeof logger, defaultLevelPass: true },
      { level: LogLevel.INFO, method: "info" as keyof typeof logger, defaultLevelPass: true },
      { level: LogLevel.DEBUG, method: "debug" as keyof typeof logger, defaultLevelPass: false },
      { level: LogLevel.TRACE, method: "trace" as keyof typeof logger, defaultLevelPass: false },
    ];

    testCases.forEach(({ level, method, defaultLevelPass }) => {
      it(`should call transport.log for ${method} if level is sufficient`, () => {
        (logger[method] as Function)("test message");
        if (defaultLevelPass) {
          expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
          const logEntryArgs = mockConsoleTransportLog.mock.calls[0];
          expect(logEntryArgs[0].level).toBe(level);
          expect(logEntryArgs[0].message).toBe("test message");
        } else {
          expect(mockConsoleTransportLog).not.toHaveBeenCalled();
        }
        mockConsoleTransportLog.mockClear();
      });

      it(`should not call transport.log for ${method} if level is insufficient`, () => {
        logger.setOptions({ level: LogLevel.ERROR });
        (logger[method] as Function)("test message");
        if (level <= LogLevel.ERROR) {
          expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
        } else {
          expect(mockConsoleTransportLog).not.toHaveBeenCalled();
        }
        mockConsoleTransportLog.mockClear();
      });

      it(`should pass optionalParams to transport.log for ${method}`, () => {
        logger.setOptions({ level: LogLevel.TRACE }); 
        const param1 = { a: 1 };
        const param2 = "param2";
        (logger[method] as Function)("test message", param1, param2);
        expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
        const logEntry = mockConsoleTransportLog.mock.calls[0][0] as LogEntry;
        expect(logEntry.data).toEqual(param1);
        expect(logEntry.args).toEqual([param2]);
        mockConsoleTransportLog.mockClear();
      });

      it(`should handle no optionalParams for ${method}`, () => {
        logger.setOptions({ level: LogLevel.TRACE }); 
        (logger[method] as Function)("test message without params");
        expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
        const logEntryArgs = mockConsoleTransportLog.mock.calls[0];
        expect(logEntryArgs[0].message).toBe("test message without params");
        expect(logEntryArgs[0].args).toEqual([]);
        mockConsoleTransportLog.mockClear();
      });
    });

    it("should not log if LogLevel.SILENT is set", () => {
      logger.setOptions({ level: LogLevel.SILENT });
      logger.fatal("test fatal");
      logger.info("test info");
      expect(mockConsoleTransportLog).not.toHaveBeenCalled();
    });

    it("should use humanReadableTime when set", () => {
      logger.setOptions({ useHumanReadableTime: true });
      logger.info("test message");
      expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
      const logEntryArgs = mockConsoleTransportLog.mock.calls[0];
      expect(logEntryArgs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (AM|PM)$/);
    });

    it("should use ISO time when humanReadableTime is false", () => {
      logger.setOptions({ useHumanReadableTime: false });
      logger.info("test message");
      expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
      const logEntryArgs = mockConsoleTransportLog.mock.calls[0];
      expect(logEntryArgs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("Multiple Transports", () => {
    it("should call log on all configured transports", () => {
      const consoleTransportInstance = new ConsoleTransport();
      const fileTransportInstance = new FileTransport("test.log"); 

      const consoleSpy = spyOn(consoleTransportInstance, 'log');
      const fileSpy = spyOn(fileTransportInstance, 'log').mockImplementation(async () => {}); 
      
      logger.setOptions({ transports: [consoleTransportInstance, fileTransportInstance], level: LogLevel.INFO });
      logger.info("multi-transport test");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(fileSpy).toHaveBeenCalledTimes(1);

      const consoleLogEntry = consoleSpy.mock.calls[0]![0] as LogEntry;
      const fileLogEntry = fileSpy.mock.calls[0]![0] as LogEntry;

      expect(consoleLogEntry.message).toBe("multi-transport test");
      expect(fileLogEntry.message).toBe("multi-transport test");

      consoleSpy.mockRestore();
      fileSpy.mockRestore();
    });
  });

  // Additional edge case tests
  it("should not throw if transport.log throws", () => {
    const badTransport: Transport = {
      log: (_entry: LogEntry) => { throw new Error("fail!"); }
    };
    logger.setOptions({ transports: [badTransport], level: LogLevel.INFO });
    
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      logger.info("this call should not throw");
    }).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
    if (consoleErrorSpy.mock.calls.length > 0) {
        expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/Synchronous error in transport 'Object':/);
        expect(consoleErrorSpy.mock.calls[0][1].message).toBe("fail!");
    }
    
    consoleErrorSpy.mockRestore();
  });

  it("should allow setting custom transports at runtime", () => {
    const calls: LogEntry[] = [];
    const customTransport: Transport = {
      async log(entry, _options) { calls.push(entry); }
    };
    logger.setOptions({ transports: [customTransport], level: LogLevel.INFO });
    logger.info("custom transport test");
    expect(calls.length).toBe(1);
    expect(calls[0].message).toBe("custom transport test");
  });

  it("should allow changing log level at runtime", () => {
    const testConsoleTransport = new ConsoleTransport();
    const transportSpy = spyOn(testConsoleTransport, 'log');
    logger.setOptions({ transports: [testConsoleTransport], level: LogLevel.WARN });

    logger.info("should not log this");
    expect(transportSpy).not.toHaveBeenCalled();

    logger.setOptions({ level: LogLevel.INFO });
    logger.info("should log this");
    expect(transportSpy).toHaveBeenCalledTimes(1);
    expect(transportSpy.mock.calls[0][0].message).toBe("should log this");

    logger.warn("should also log this");
    expect(transportSpy).toHaveBeenCalledTimes(2);
    expect(transportSpy.mock.calls[1][0].message).toBe("should also log this");

    transportSpy.mockRestore();
  });

  it("should support multiple transports with different behaviors", () => {
    let calledA = false, calledB = false;
    const transportA: Transport = { log: async () => { calledA = true; } };
    const transportB: Transport = { log: async () => { calledB = true; } };
    logger.setOptions({ transports: [transportA, transportB], level: LogLevel.INFO });
    logger.info("multi transport");
    expect(calledA).toBe(true);
    expect(calledB).toBe(true);
  });
});
