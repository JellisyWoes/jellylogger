import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { LogLevel, ConsoleTransport, logger, type LogEntry, type LoggerOptions } from "../lib/index";

describe("ConsoleTransport", () => {
  let transport: ConsoleTransport;
  const consoleSpies: { [key in keyof typeof console]?: any } = {};
  let mockConsoleTransportLog: ReturnType<typeof spyOn>;

  beforeEach(() => {
    transport = new ConsoleTransport();
    mockConsoleTransportLog = spyOn(ConsoleTransport.prototype, 'log');
    
    // Spy on actual console methods that ConsoleTransport uses
    (Object.keys(console) as Array<keyof typeof console>).forEach(key => {
      if (typeof console[key] === 'function') {
        // @ts-ignore
        consoleSpies[key] = spyOn(console, key).mockImplementation(() => {});
      }
    });
  });

  afterEach(() => {
    mockConsoleTransportLog.mockRestore();
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
        timestamp: new Date().toISOString(),
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

      expect(firstArg).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(firstArg).toContain(`${expectedLevelString}:`);
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
        const spiedConsoleMethod = consoleSpies[consoleMethod];
        expect(spiedConsoleMethod).toHaveBeenCalledTimes(1);
        expect(spiedConsoleMethod.mock.calls[0][0]).toBe(JSON.stringify(entry));

        // ...existing verification logic...
      });
  });

  it("should format string logs correctly", () => {
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Hello",
      args: ["world"],
    };
    transport.log(entry, { format: "string" } as LoggerOptions);
    expect(consoleSpies.info).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.info.mock.calls[0][0] as string;

    expect(firstArg).toContain("[2023-01-01T12:00:00.000Z]");
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
    expect(consoleSpies.warn.mock.calls[0].length).toBe(1); 
  });

  // Color system tests
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
    expect(consoleSpies.error).toHaveBeenCalledTimes(1);
    const firstArg = consoleSpies.error.mock.calls[0][0] as string;
    expect(firstArg).toContain("Color test");
    expect(firstArg).toContain("FATAL:");
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

  // Edge case tests
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

  // Error object tests
  it("should log error objects with cause", () => {
    const err = new Error("top");
    (err as any).cause = new Error("cause");
    logger.setOptions({ level: LogLevel.INFO, transports: [new ConsoleTransport()] });
    const transportInstance = logger.options.transports?.[0] as ConsoleTransport;
    const transportSpy = spyOn(transportInstance, 'log').mockResolvedValue(undefined);

    logger.error("Error with cause", err);
    expect(transportSpy).toHaveBeenCalledTimes(1);
    const entry = transportSpy.mock.calls[0][0] as LogEntry;
    expect(entry.args[0]).toBeDefined();
    const loggedError = entry.args[0] as any;
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
    const transportInstance = logger.options.transports?.[0] as ConsoleTransport;
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
    const transportInstance = logger.options.transports?.[0] as ConsoleTransport;
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
    const transportInstance = logger.options.transports?.[0] as ConsoleTransport;
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
    expect(loggedError.cause).toBe("[object Object]");
    transportSpy.mockRestore();
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
    expect(consoleSpies.info).toHaveBeenCalledWith("12345");
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
});
