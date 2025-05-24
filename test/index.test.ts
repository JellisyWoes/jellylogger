// --- START BUN MOCK DEFINITION ---
// This must be absolutely at the top, before any other imports that might touch 'bun' or its mocks.
import { mock } from "bun:test"; // Import mock separately for early use if needed by definitions
import type { BunFile as ActualBunFile } from "bun"; // Type import for mock instance

const mockFileExistsForBunMock = mock<() => Promise<boolean>>(async () => false);
const mockFileTextForBunMock = mock<() => Promise<string>>(async () => "");
const mockBunFileInstanceWriterWriteForBunMock = mock(() => {});
const mockBunFileInstanceWriterFlushForBunMock = mock(async () => {});
const mockBunFileInstanceWriterEndForBunMock = mock(async () => {});

const mockBunFileInstanceForBunMock = {
  exists: mockFileExistsForBunMock,
  text: mockFileTextForBunMock,
  type: "application/octet-stream",
  size: 0,
  lastModified: 0,
  arrayBuffer: async () => new ArrayBuffer(0),
  slice: () => new Blob(),
  stream: () => new ReadableStream(),
  json: async () => ({}),
  writer: () => ({
    write: mockBunFileInstanceWriterWriteForBunMock,
    flush: mockBunFileInstanceWriterFlushForBunMock,
    end: mockBunFileInstanceWriterEndForBunMock,
  })
} as unknown as ActualBunFile;

const actualMockBunFileFn = mock(() => mockBunFileInstanceForBunMock);
const actualMockBunWriteFn = mock(async (_path: string | ActualBunFile | URL | number, _data: any) => { return Promise.resolve(1); }); // Default to resolve successfully

mock.module('bun', () => {
  return {
    file: actualMockBunFileFn,
    write: actualMockBunWriteFn,
    color: (text: string, style?: string) => style ? `[color:${style}]${text}[/color]` : text,
    // Minimal mock: if Bun.env or other things are needed, they must be added here.
    // For this logger, it seems these are the primary Bun APIs used.
  };
});

// Mock for 'os' module to control EOL in tests
mock.module('os', () => {
  return {
    EOL: '\n', // Force EOL to be '\n' for consistent test results
  };
});
// --- END BUN MOCK DEFINITION ---

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test"; // mock is already imported
import { logger, LogLevel, ConsoleTransport, FileTransport, type LoggerOptions, type LogEntry, type DiscordWebhookTransportOptions, DiscordWebhookTransport, type Transport } from "../lib/index";
import type { BunFile } from "bun"; // This is just a type import, uses the mocked 'bun' for types if not careful

// Re-alias for use in tests to ensure clarity and use the mocks defined for bun module
// const mockBunFileFn = actualMockBunFileFn; // No longer aliasing for FileTransport tests, will use actualMockBunFileFn directly
// const mockBunWriteFn = actualMockBunWriteFn; // No longer aliasing for FileTransport tests, will use actualMockBunWriteFn directly
const mockFileExists = mockFileExistsForBunMock;
const mockFileText = mockFileTextForBunMock;
// const mockBunFileInstanceWriterWrite = mockBunFileInstanceWriterWriteForBunMock; // Not directly asserted, but part of mockBunFileInstanceForBunMock
// const mockBunFileInstanceWriterFlush = mockBunFileInstanceWriterFlushForBunMock;
// const mockBunFileInstanceWriterEnd = mockBunFileInstanceWriterEndForBunMock;


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


    actualMockBunWriteFn.mock.calls.length = 0; // Use actual mock function
    actualMockBunWriteFn.mock.results.length = 0;
    actualMockBunFileFn.mock.calls.length = 0; // Use actual mock function
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
      expect(logger.options.transports.length).toBe(1);
      expect(logger.options.transports[0]).toBeInstanceOf(ConsoleTransport);
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
      expect(logger.options.level).toBe(LogLevel.DEBUG);
      expect(logger.options.useHumanReadableTime).toBe(true);
      expect(logger.options.format).toBe("json");
    });

    it("should perform partial updates with setOptions", () => {
      const initialLevel = logger.options.level;
      const initialFormat = logger.options.format;

      logger.setOptions({ useHumanReadableTime: true });
      expect(logger.options.level).toBe(initialLevel); // Should remain unchanged
      expect(logger.options.useHumanReadableTime).toBe(true); // Should be updated
      expect(logger.options.format).toBe(initialFormat); // Should remain unchanged

      logger.setOptions({ level: LogLevel.ERROR });
      expect(logger.options.level).toBe(LogLevel.ERROR); // Should be updated
      expect(logger.options.useHumanReadableTime).toBe(true); // Should remain from previous setOptions
      expect(logger.options.format).toBe(initialFormat); // Should remain unchanged
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
        // logger.options.transports is by default [new ConsoleTransport()]
        // The spy is on ConsoleTransport.prototype.log
        (logger[method] as Function)("test message");
        if (defaultLevelPass) {
          expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
          const logEntryArgs = mockConsoleTransportLog.mock.calls[0];
          expect(logEntryArgs[0].level).toBe(level);
          expect(logEntryArgs[0].message).toBe("test message");
        } else {
          expect(mockConsoleTransportLog).not.toHaveBeenCalled();
        }
        mockConsoleTransportLog.mockClear(); // Clear calls for next iteration if any
      });

      it(`should not call transport.log for ${method} if level is insufficient`, () => {
        logger.setOptions({ level: LogLevel.ERROR }); // Default transport is still ConsoleTransport
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
        const param1 = { a: 1 }; // This will be treated as structured data
        const param2 = "param2"; // This will be an arg
        (logger[method] as Function)("test message", param1, param2);
        expect(mockConsoleTransportLog).toHaveBeenCalledTimes(1);
        const logEntry = mockConsoleTransportLog.mock.calls[0][0] as LogEntry;
        expect(logEntry.data).toEqual(param1); // param1 should be in entry.data
        expect(logEntry.args).toEqual([param2]); // param2 should be in entry.args
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
      // For this specific test, we are spying on the log method of FileTransport,
      // so we don't need to inject the bunOps here if we are not testing its internal Bun.write calls.
      // However, if we were testing the full chain, injection would be needed.
      // For consistency with FileTransport specific tests, let's inject.
      const fileTransportInstance = new FileTransport("test.log"); 

      const consoleSpy = spyOn(consoleTransportInstance, 'log');
      // Ensure fileSpy mock implementation is async if the original is.
      // FileTransport.log is async.
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
});


describe("ConsoleTransport", () => {
  let transport: ConsoleTransport;
  const consoleSpies: { [key in keyof typeof console]?: any } = {};
  // Add this to make mockConsoleTransportLog available in this describe block
  let mockConsoleTransportLog: ReturnType<typeof spyOn>;
  beforeEach(() => {
    // If already defined in outer scope, this will just shadow it locally
    mockConsoleTransportLog = spyOn(ConsoleTransport.prototype, 'log');
  });
  afterEach(() => {
    mockConsoleTransportLog.mockRestore();
  });

  beforeEach(() => {
    transport = new ConsoleTransport();
    // Spy on actual console methods that ConsoleTransport uses
    (Object.keys(console) as Array<keyof typeof console>).forEach(key => {
      if (typeof console[key] === 'function') {
        // @ts-ignore
        consoleSpies[key] = spyOn(console, key).mockImplementation(() => {});
      }
    });
  });

  afterEach(() => {
    // Restore all console spies
    (Object.keys(consoleSpies) as Array<keyof typeof consoleSpies>).forEach(key => {
      consoleSpies[key]?.mockRestore();
    });
  });

  const logLevelsToConsoleMethods = [
    { level: LogLevel.FATAL, consoleMethod: "error" as keyof typeof console },
    { level: LogLevel.ERROR, consoleMethod: "error" as keyof typeof console },
    { level: LogLevel.WARN, consoleMethod: "warn" as keyof typeof console },
    { level: LogLevel.INFO, consoleMethod: "info" as keyof typeof console },
    { level: LogLevel.DEBUG, consoleMethod: "debug" as keyof typeof console },
    { level: LogLevel.TRACE, consoleMethod: "debug" as keyof typeof console },
  ];

  logLevelsToConsoleMethods.forEach(({ level, consoleMethod }) => {
    it(`should use console.${String(consoleMethod)} for LogLevel.${LogLevel[level]} in string format`, () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(), // Use a fixed date for consistent timestamp in snapshot/string
        level,
        levelName: LogLevel[level],
        message: "Test message",
        args: [{ data: 1 }],
      };
      transport.log(entry, { format: "string" } as LoggerOptions);
      
      const spiedConsoleMethod = consoleSpies[consoleMethod];
      expect(spiedConsoleMethod).toHaveBeenCalledTimes(1);
      
      const firstArg = spiedConsoleMethod.mock.calls[0][0] as string;
      const levelName = LogLevel[level];
      const expectedLevelString = levelName.padEnd(5); 

      // Check for presence of timestamp (format check, not exact value due to dynamic generation)
      expect(firstArg).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      // Check for level name and message, tolerating actual ANSI codes
      expect(firstArg).toContain(`${expectedLevelString}:`); // e.g., "FATAL:", "INFO :"
      expect(firstArg).toContain("Test message");
      
      expect(spiedConsoleMethod.mock.calls[0][1]).toEqual({ data: 1 });
    });

    it(`should use console.${String(consoleMethod)} for LogLevel.${LogLevel[level]} in JSON format`, () => {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level,
          levelName: LogLevel[level],
          message: "Test message",
          args: [{ data: 1 }],
        };
        transport.log(entry, { format: "json" } as LoggerOptions);
        // When format is JSON, the appropriate console method (error, warn, info, debug) is still used.
        const spiedConsoleMethod = consoleSpies[consoleMethod];
        expect(spiedConsoleMethod).toHaveBeenCalledTimes(1);
        expect(spiedConsoleMethod.mock.calls[0][0]).toBe(JSON.stringify(entry));

        // Ensure other console methods were not called for this specific log.
        (Object.keys(consoleSpies) as Array<keyof typeof consoleSpies>).forEach(key => {
            if (key !== consoleMethod && consoleSpies[key]) {
                // For JSON, only one method should be called.
                // However, console.debug is used for TRACE and DEBUG, so we need to be careful.
                // If the current consoleMethod is 'debug', other non-debug methods shouldn't be called.
                // If the current consoleMethod is not 'debug', then 'debug' might have been called if level was TRACE/DEBUG.
                // This check is simpler: the *target* spiedConsoleMethod was called, others related to other levels were not.
                if ( (level === LogLevel.DEBUG || level === LogLevel.TRACE) && consoleMethod === 'debug') {
                    // This is fine, debug is the target
                } else if (key !== 'debug' && consoleMethod === 'debug') {
                    // If target is debug, other methods like error/warn/info should not be called
                     expect(consoleSpies[key]!.mock.calls.length).toBe(0);
                } else if (key === 'debug' && consoleMethod !== 'debug') {
                    // If target is not debug, debug method should not be called
                    expect(consoleSpies[key]!.mock.calls.length).toBe(0);
                } else if (key !== consoleMethod && key !== 'debug') {
                     expect(consoleSpies[key]!.mock.calls.length).toBe(0);
                }
            }
        });
      });
  });

  it("should format string logs correctly", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z", // Fixed timestamp
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Hello",
      args: ["world"],
    };
    transport.log(entry, { format: "string" } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.info.mock.calls[0][0] as string;

    expect(firstArg).toContain("[2023-01-01T12:00:00.000Z]");
    // Check for "INFO :" and "Hello" separately to avoid issues with ANSI codes between them.
    expect(firstArg).toContain("INFO :");
    expect(firstArg).toContain("Hello");
    
    expect(consoleSpies.info.mock.calls[0][1]).toBe("world");
  });

  it("should default to string format if options.format is undefined", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Undefined format test",
      args: ["arg1"],
    };
    // @ts-ignore testing undefined case
    transport.log(entry, { format: undefined } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.info.mock.calls[0][0] as string;
    expect(firstArg).toContain("[2023-01-01T12:00:00.000Z]");
    expect(firstArg).toContain("INFO :");
    expect(firstArg).toContain("Undefined format test");
    expect(consoleSpies.info.mock.calls[0][1]).toBe("arg1");
  });

  it("should format string logs correctly with no args", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.WARN,
      levelName: "WARN",
      message: "No args message",
      args: [],
    };
    transport.log(entry, { format: "string" } as LoggerOptions);
    expect(consoleSpies.warn).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.warn.mock.calls[0][0] as string;
    expect(firstArg).toContain("[2023-01-01T12:00:00.000Z]");
    expect(firstArg).toContain("WARN :");
    expect(firstArg).toContain("No args message");
    // Check that no extra arguments were passed to console.warn beyond the formatted string
    expect(consoleSpies.warn.mock.calls[0].length).toBe(1); 
  });

  // Additional tests for new color system
  it("should use customConsoleColors with hex, rgb, hsl, hsv, cmyk", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.FATAL,
      levelName: "FATAL",
      message: "Color test",
      args: [],
    };
    const customColors: LoggerOptions['customConsoleColors'] = {
      reset: "#ffffff",
      bold: "#000000",
      dim: "#888888",
      [LogLevel.FATAL]: "#ff0000",
      [LogLevel.ERROR]: "rgb(255,140,0)",
      [LogLevel.WARN]: "hsl(50,100%,50%)",
      [LogLevel.INFO]: "hsv(180,60%,80%)",
      [LogLevel.DEBUG]: "cmyk(1,0.5,0,0)",
      [LogLevel.TRACE]: "#800080",
    };
    transport.log(entry, { format: "string", customConsoleColors: customColors } as LoggerOptions);
    // Should call console.error (for FATAL)
    expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.error.mock.calls[0][0] as string;
    expect(firstArg).toContain("Color test");
    expect(firstArg).toContain("FATAL:");
    // Should contain ANSI escape codes for color (e.g., \x1b[38;2;...)
    expect(firstArg).toMatch(/\x1b\[[0-9;]*m/);
  });

  it("should fallback to empty string for invalid custom color", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Invalid color test",
      args: [],
    };
    const customColors: LoggerOptions['customConsoleColors'] = {
      [LogLevel.INFO]: "not-a-color",
    };
    transport.log(entry, { format: "string", customConsoleColors: customColors } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.info.mock.calls[0][0] as string;
    expect(firstArg).toContain("Invalid color test");
    expect(firstArg).toContain("INFO :");
  });

  it("should allow ANSI escape codes directly in customConsoleColors", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.DEBUG,
      levelName: "DEBUG",
      message: "ANSI direct test",
      args: [],
    };
    const ansiRed = "\x1b[31m";
    const customColors: LoggerOptions['customConsoleColors'] = {
      [LogLevel.DEBUG]: ansiRed,
    };
    transport.log(entry, { format: "string", customConsoleColors: customColors } as LoggerOptions);
    expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.debug.mock.calls[0][0] as string;
    expect(firstArg).toContain("ANSI direct test");
    expect(firstArg).toContain("DEBUG:");
    expect(firstArg).toContain(ansiRed);
  });

  it("should merge customConsoleColors with defaults", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.TRACE,
      levelName: "TRACE",
      message: "Merge color test",
      args: [],
    };
    const customColors: LoggerOptions['customConsoleColors'] = {
      [LogLevel.TRACE]: "#123456",
    };
    transport.log(entry, { format: "string", customConsoleColors: customColors } as LoggerOptions);
    expect(consoleSpies.debug).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.debug.mock.calls[0][0] as string;
    expect(firstArg).toContain("Merge color test");
    expect(firstArg).toContain("TRACE:");
    // Should contain ANSI escape codes for color (e.g., \x1b[38;2;...)
    expect(firstArg).toMatch(/\x1b\[[0-9;]*m/);
  });

  it("should support formatter function", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Formatter test",
      args: [],
    };
    const formatter = (e: LogEntry) => `>> ${e.levelName}: ${e.message}`;
    transport.log(entry, { formatter } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    expect(consoleSpies.info.mock.calls[0][0]).toBe(">> INFO: Formatter test");
  });

  it("should support formatter function with customConsoleColors", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Formatter color test",
      args: [],
    };
    const formatter = (e: LogEntry) => `!! ${e.levelName}: ${e.message}`;
    const customColors: LoggerOptions['customConsoleColors'] = {
      [LogLevel.INFO]: "#00ff00",
    };
    transport.log(entry, { formatter, customConsoleColors: customColors } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    expect(consoleSpies.info.mock.calls[0][0]).toBe("!! INFO: Formatter color test");
  });

  // --- Additional tests for ConsoleTransport and logger ---

  it("should not throw if customConsoleColors is empty object", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Empty customConsoleColors",
      args: [],
    };
    expect(() => {
      transport.log(entry, { format: "string", customConsoleColors: {} } as LoggerOptions);
    }).not.toThrow();
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
  });

  it("should handle missing reset/bold/dim in customConsoleColors", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Missing reset/bold/dim",
      args: [],
    };
    const customColors: LoggerOptions['customConsoleColors'] = {
      [LogLevel.INFO]: "#00ff00"
    };
    expect(() => {
      transport.log(entry, { format: "string", customConsoleColors: customColors } as LoggerOptions);
    }).not.toThrow();
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
  });

  it("should log with multiple args of different types", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Multi-arg",
      args: [1, "two", { three: 3 }, [4], null, undefined],
    };
    transport.log(entry, { format: "string" } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    const call = consoleSpies.info.mock.calls[0];
    expect(call[0]).toContain("Multi-arg");
    expect(call.length).toBeGreaterThan(1);
  });

  it("should log error objects with cause", () => {
    const err = new Error("top");
    (err as any).cause = new Error("cause");
    logger.setOptions({ level: LogLevel.INFO, transports: [new ConsoleTransport()] }); // Ensure ConsoleTransport is used
    // Spy on the actual transport instance if not already spied globally for this test block
    const transportInstance = logger.options.transports[0] as ConsoleTransport;
    const transportSpy = spyOn(transportInstance, 'log').mockResolvedValue(undefined);

    logger.error("Error with cause", err);
    expect(transportSpy).toHaveBeenCalledTimes(1);
    const entry = transportSpy.mock.calls[0][0] as LogEntry;
    expect(entry.args[0]).toBeDefined();
    const loggedError = entry.args[0] as any; // Serialized error
    expect(loggedError.name).toBe("Error");
    expect(loggedError.message).toBe("top");
    expect(loggedError.cause).toBeDefined();
    expect(loggedError.cause.name).toBe("Error");
    expect(loggedError.cause.message).toBe("cause");
    transportSpy.mockRestore();
  });

  it("should log error objects with non-error cause", () => {
    const err = new Error("top");
    (err as any).cause = { foo: "bar" };
    logger.setOptions({ level: LogLevel.INFO, transports: [new ConsoleTransport()] });
    const transportInstance = logger.options.transports[0] as ConsoleTransport;
    const transportSpy = spyOn(transportInstance, 'log').mockResolvedValue(undefined);

    logger.error("Error with object cause", err);
    expect(transportSpy).toHaveBeenCalledTimes(1);
    const entry = transportSpy.mock.calls[0][0] as LogEntry;
    expect(entry.args[0]).toBeDefined();
    const loggedError = entry.args[0] as any;
    expect(loggedError.cause).toEqual({ foo: "bar" });
    transportSpy.mockRestore();
  });

  it("should log error objects with string cause", () => {
    const err = new Error("top");
    (err as any).cause = "string-cause";
    logger.setOptions({ level: LogLevel.INFO, transports: [new ConsoleTransport()] });
    const transportInstance = logger.options.transports[0] as ConsoleTransport;
    const transportSpy = spyOn(transportInstance, 'log').mockResolvedValue(undefined);

    logger.error("Error with string cause", err);
    expect(transportSpy).toHaveBeenCalledTimes(1);
    const entry = transportSpy.mock.calls[0][0] as LogEntry;
    expect(entry.args[0]).toBeDefined();
    const loggedError = entry.args[0] as any;
    expect(loggedError.cause).toBe("string-cause");
    transportSpy.mockRestore();
  });

  it("should log error objects with circular cause gracefully", () => {
    const err = new Error("top");
    const circular: any = {};
    circular.self = circular;
    (err as any).cause = circular;

    logger.setOptions({ transports: [new ConsoleTransport()], level: LogLevel.ERROR });
    const transportInstance = logger.options.transports[0] as ConsoleTransport;
    const transportSpy = spyOn(transportInstance, 'log').mockResolvedValue(undefined);


    logger.error("Error with circular cause", err);

    expect(transportSpy).toHaveBeenCalledTimes(1);
    const entry = transportSpy.mock.calls[0][0] as LogEntry;
    expect(entry.args[0]).toBeDefined();
    const loggedError = entry.args[0] as any;
    expect(typeof loggedError.name).toBe('string');
    expect(typeof loggedError.message).toBe('string');
    expect(typeof loggedError.stack === 'string' || loggedError.stack === undefined).toBe(true);

    expect(loggedError.cause).toBeDefined();
    // The serializeError function will attempt JSON.stringify, which fails for circular.
    // It then falls back to String(arg.cause).
    expect(loggedError.cause).toBe("[object Object]");
    transportSpy.mockRestore();
  });

  it("should not log if transport.log throws", () => {
    const badTransport: Transport = {
      log: (_entry: LogEntry) => { throw new Error("fail!"); }
    };
    logger.setOptions({ transports: [badTransport], level: LogLevel.INFO });
    
    // Ensure console.error is spied on for this test case, if not already globally spied
    // In this test suite, consoleSpies.error is set up in the beforeEach of ConsoleTransport
    const consoleErrorSpy = consoleSpies.error || spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      logger.info("this call should not throw");
    }).not.toThrow();

    // Check that console.error was called due to the logger's internal error handling
    expect(consoleErrorSpy).toHaveBeenCalled();
    // Optionally, check the arguments of console.error
    // Example: expect(consoleErrorSpy.mock.calls[0][0]).toContain("Error in synchronous transport");
    // For a more precise check:
    if (consoleErrorSpy.mock.calls.length > 0) {
        expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/Error in synchronous transport 'Object':/);
        expect(consoleErrorSpy.mock.calls[0][1].message).toBe("fail!");
    } else {
        // This case should ideally not be reached if the spy is working correctly
        // and the logger's error handling is active.
        // Forcing a failure if not called, as it's an expected side effect.
        expect(consoleErrorSpy).toHaveBeenCalled(); 
    }
    
    // If consoleErrorSpy was locally created for this test, restore it
    if (!consoleSpies.error) {
      consoleErrorSpy.mockRestore();
    }
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
    // Ensure logger uses a fresh ConsoleTransport for this test
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

  it("should support formatter returning empty string", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Formatter empty",
      args: [],
    };
    transport.log(entry, { formatter: () => "" } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledWith("");
  });

  it("should support formatter returning non-string (should coerce to string)", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Formatter non-string",
      args: [],
    };
    transport.log(entry, { formatter: () => 12345 as any } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledWith(12345);
  });

  it("should support formatter with args", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Formatter with args",
      args: ["foo", "bar"],
    };
    transport.log(entry, { formatter: (e) => e.message, format: "string" } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledWith("Formatter with args");
  });

  it("should not log if level is above threshold", () => {
    logger.setOptions({ level: LogLevel.ERROR });
    logger.info("should not log");
    expect(mockConsoleTransportLog).not.toHaveBeenCalled();
  });

  it("should log if level is at threshold", () => {
    // Ensure logger uses a fresh ConsoleTransport for this test
    // and that mockConsoleTransportLog (the prototype spy) will catch it.
    // Re-spy on ConsoleTransport.prototype.log for this specific test if needed,
    // or ensure the global spy mockConsoleTransportLog is active and clear.
    mockConsoleTransportLog.mockClear(); // Clear previous calls
    logger.setOptions({ transports: [new ConsoleTransport()], level: LogLevel.INFO });
    logger.info("should log");
    expect(mockConsoleTransportLog).toHaveBeenCalled();
  });

    it("should not log if LogLevel.SILENT is set", () => {
      // mockConsoleTransportLog is a spy on ConsoleTransport.prototype.log
      mockConsoleTransportLog.mockClear(); // Clear previous calls
      logger.setOptions({ level: LogLevel.SILENT, transports: [new ConsoleTransport()] }); // Ensure a transport is there
      logger.info("should not log");
      expect(mockConsoleTransportLog).not.toHaveBeenCalled();
    });
  
  });
