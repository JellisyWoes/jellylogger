import "./test-utils";
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { LogLevel, ConsoleTransport, FileTransport, logger, type LogEntry, type LogFormatter } from "../lib/index";

describe("Custom Formatter", () => {
  let mockBunOps: any;
  let writtenContent: string;

  beforeEach(() => {
    writtenContent = "";
    mockBunOps = {
      file: mock(() => ({
        exists: async () => false,
        size: 0,
        text: async () => ""
      })),
      write: mock(async (_path: string, data: string) => {
        writtenContent += data;
        return data.length;
      })
    };
  });

  it("should use custom formatter for console output", () => {
    const mockConsoleInfo = mock(() => {});
    const originalInfo = console.info;
    console.info = mockConsoleInfo;

    const customFormatter: LogFormatter = {
      format: (entry: LogEntry) => {
        return `🚀 ${entry.levelName} | ${entry.message} | ${entry.timestamp}`;
      }
    };

    const transport = new ConsoleTransport();
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Custom format test",
      args: []
    };

    transport.log(entry, { formatter: customFormatter.format });

    expect(mockConsoleInfo).toHaveBeenCalledWith(
      "🚀 INFO | Custom format test | 2023-01-01T12:00:00.000Z"
    );

    console.info = originalInfo;
  });

  it("should use custom formatter for file output", async () => {
    const customFormatter: LogFormatter = {
      format: (entry: LogEntry) => {
        return JSON.stringify({
          time: entry.timestamp,
          level: entry.levelName.toLowerCase(),
          msg: entry.message,
          data: entry.data || {},
          extra: entry.args
        });
      }
    };

    const transport = new FileTransport("custom.log", undefined, mockBunOps);
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "File format test",
      args: ["extra1", "extra2"],
      data: { errorCode: "E001" }
    };

    await transport.log(entry, { formatter: customFormatter.format });
    await transport.flush();

    const parsedOutput = JSON.parse(writtenContent.trim());
    expect(parsedOutput).toEqual({
      time: "2023-01-01T12:00:00.000Z",
      level: "error",
      msg: "File format test",
      data: { errorCode: "E001" },
      extra: ["extra1", "extra2"]
    });
  });

  it("should support formatter with structured data", async () => {
    const mockConsoleWarn = mock(() => {});
    const originalWarn = console.warn;
    console.warn = mockConsoleWarn;

    const structuredFormatter: LogFormatter = {
      format: (entry: LogEntry) => {
        const structured: Record<string, unknown> = {
          "@timestamp": entry.timestamp,
          "@level": entry.levelName,
          "@message": entry.message,
          ...(entry.data ?? {})
        };
        
        if (entry.args && entry.args.length > 0) {
          structured["@args"] = entry.args;
        }
        
        return JSON.stringify(structured);
      }
    };

    const transport = new ConsoleTransport();
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.WARN,
      levelName: "WARN",
      message: "Structured format test",
      args: [{ detail: "warning detail" }],
      data: { 
        service: "api",
        userId: "user123" 
      }
    };

    await transport.log(entry, { formatter: structuredFormatter.format });

    const expectedOutput = JSON.stringify({
      "@timestamp": "2023-01-01T12:00:00.000Z",
      "@level": "WARN",
      "@message": "Structured format test",
      "service": "api",
      "userId": "user123",
      "@args": [{ detail: "warning detail" }]
    });

    expect(mockConsoleWarn).toHaveBeenCalledWith(expectedOutput);
    console.warn = originalWarn;
  });

  it("should support conditional formatting based on log level", () => {
    const mockConsoleError = mock(() => {});
    const mockConsoleInfo = mock(() => {});
    const originalError = console.error;
    const originalInfo = console.info;
    console.error = mockConsoleError;
    console.info = mockConsoleInfo;

    const conditionalFormatter: LogFormatter = {
      format: (entry: LogEntry) => {
        if (entry.level <= LogLevel.ERROR && entry.level !== LogLevel.SILENT) {
          return `🔥 CRITICAL: ${entry.message} [${entry.timestamp}]`;
        } else {
          return `ℹ️  ${entry.message}`;
        }
      }
    };

    const transport = new ConsoleTransport();

    // Test error level
    transport.log({
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "Critical error occurred",
      args: []
    }, { formatter: conditionalFormatter.format });

    // Test info level
    transport.log({
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Normal operation",
      args: []
    }, { formatter: conditionalFormatter.format });

    expect(mockConsoleError).toHaveBeenCalledWith(
      "🔥 CRITICAL: Critical error occurred [2023-01-01T12:00:00.000Z]"
    );
    expect(mockConsoleInfo).toHaveBeenCalledWith("ℹ️  Normal operation");

    console.error = originalError;
    console.info = originalInfo;
  });

  it("should handle formatter errors gracefully", () => {
    const mockConsoleInfo = mock(() => {});
    const mockConsoleError = mock(() => {});
    const originalInfo = console.info;
    const originalError = console.error;
    console.info = mockConsoleInfo;
    console.error = mockConsoleError;

    const faultyFormatter: LogFormatter = {
      format: (_entry: LogEntry) => {
        throw new Error("Formatter explosion!");
      }
    };

    const transport = new ConsoleTransport();
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Test with faulty formatter",
      args: []
    };

    // Should fall back to default formatting and not crash
    expect(() => {
      transport.log(entry, { formatter: faultyFormatter.format });
    }).not.toThrow();

    // Should have logged an error about the formatter failure
    expect(mockConsoleError).toHaveBeenCalledWith(
      'Custom formatter failed, falling back to default:',
      'Formatter explosion!'
    );
    
    // Should have logged the original message using default formatting
    expect(mockConsoleInfo).toHaveBeenCalledWith(
      expect.stringContaining('Test with faulty formatter')
    );

    console.info = originalInfo;
    console.error = originalError;
  });

  it("should support formatter that returns objects for JSON serialization", async () => {
    const objectFormatter: LogFormatter = {
      format: (entry: LogEntry) => {
        // Return an object instead of a string
        return {
          timestamp: entry.timestamp,
          severity: entry.levelName,
          message: entry.message,
          metadata: {
            args: entry.args,
            data: entry.data
          }
        } as any; // Cast to any since formatter expects string
      }
    };

    const transport = new FileTransport("object.log", undefined, mockBunOps);
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.DEBUG,
      levelName: "DEBUG",
      message: "Object formatter test",
      args: ["debug_arg"],
      data: { debugFlag: true }
    };

    await transport.log(entry, { formatter: objectFormatter.format });
    await transport.flush();

    // The transport should handle the object by JSON.stringify-ing it
    const output = JSON.parse(writtenContent.trim());
    expect(output.severity).toBe("DEBUG");
    expect(output.message).toBe("Object formatter test");
    expect(output.metadata.args).toEqual(["debug_arg"]);
    expect(output.metadata.data).toEqual({ debugFlag: true });
  });

  it("should work with logger instance using custom formatter", () => {
    const mockConsoleInfo = mock(() => {});
    const originalInfo = console.info;
    console.info = mockConsoleInfo;

    const customFormatter = (entry: LogEntry) => {
      return `[${entry.levelName}] ${entry.timestamp} - ${entry.message}`;
    };

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [new ConsoleTransport()],
      formatter: customFormatter
    });

    logger.info("Logger with custom formatter");

    expect(mockConsoleInfo).toHaveBeenCalledWith(
      expect.stringMatching(/^\[INFO\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z - Logger with custom formatter$/)
    );

    console.info = originalInfo;
  });

  it("should support template-based formatting", () => {
    const mockConsoleInfo = mock(() => {});
    const originalInfo = console.info;
    console.info = mockConsoleInfo;

    const templateFormatter: LogFormatter = {
      format: (entry: LogEntry) => {
        let template = "${timestamp} [${level}] ${message}";
        
        if (entry.data && Object.keys(entry.data).length > 0) {
          template += " ${data}";
        }
        
        return template
          .replace("${timestamp}", entry.timestamp)
          .replace("${level}", entry.levelName)
          .replace("${message}", entry.message)
          .replace("${data}", entry.data ? JSON.stringify(entry.data) : "");
      }
    };

    const transport = new ConsoleTransport();
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Template test",
      args: [],
      data: { userId: "123", action: "login" }
    };

    transport.log(entry, { formatter: templateFormatter.format });

    expect(mockConsoleInfo).toHaveBeenCalledWith(
      '2023-01-01T12:00:00.000Z [INFO] Template test {"userId":"123","action":"login"}'
    );

    console.info = originalInfo;
  });
});
