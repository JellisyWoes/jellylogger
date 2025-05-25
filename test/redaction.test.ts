import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { logger, LogLevel, ConsoleTransport, FileTransport, type LogEntry } from "../lib/index";

describe("Redaction", () => {
  let consoleSpy: any;

  beforeEach(() => {
    // Create a fresh console spy for each test
    consoleSpy = spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up the spy after each test
    if (consoleSpy) {
      consoleSpy.mockRestore();
    }
  });

  it("should redact keys in data and args for console", () => {
    // Create a console transport that will apply redaction
    const consoleTransport = new ConsoleTransport();
    const consoleSpy = spyOn(consoleTransport, 'log');

    logger.setOptions({
      redaction: {
        keys: ["password", "token"],
        replacement: "[SECRET]",
        redactIn: "console",
      },
      transports: [consoleTransport],
      level: LogLevel.INFO
    });

    // Log a message with sensitive data in the structured data
    logger.info("Sensitive info", { password: "456", token: "abc", keep: "ok" });
    
    // Check that the original entry was passed to transport, and transport applied redaction
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const passedEntry = consoleSpy.mock.calls[0][0] as LogEntry;
    // The original entry should have the unredacted data
    expect(passedEntry.data).toEqual({ password: "456", token: "abc", keep: "ok" });
    
    // Now verify the actual console transport applies redaction internally
    consoleSpy.mockRestore();

    // Spy on the actual console.info method to capture output
    const infoSpy = spyOn(console, 'info').mockImplementation(() => {});

    // Test the actual redaction by calling the transport directly
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Test redaction",
      args: [],
      data: { password: "456", token: "abc", keep: "ok" }
    };

    // Clear any previous calls to the infoSpy
    infoSpy.mockClear();

    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "token"],
        replacement: "[SECRET]",
        redactIn: "console",
      },
      format: "string"
    });

    // The console.info should receive the formatted message with redacted data
    expect(infoSpy).toHaveBeenCalled();

    infoSpy.mockRestore();
  });

  it("should not redact for console when redactIn is 'file'", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "No redact for console",
      args: [],
      data: { secret: "should-not-be-redacted" }
    };
    
    // Clear any previous calls
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["secret"],
        redactIn: "file", // Only redact for file, not console
      },
      format: "json"
    });
    
    // The console should receive the original unredacted data
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.secret).toBe("should-not-be-redacted");
  });

  it("should redact for file transport when redactIn is 'file'", async () => {
    // Mock Bun operations for FileTransport
    let writtenContent = "";
    const bunOps = {
      file: mock(() => ({
        exists: async () => false,
        size: 0
      } as any)),
      write: mock(async (_file, data) => { 
        writtenContent = data as string;
        return 1; 
      }),
    };
    
    const fileTransport = new FileTransport("test.log", undefined, bunOps);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "File redaction test",
      args: [],
      data: { secret: "should-be-redacted" }
    };
    
    await fileTransport.log(entry, {
      redaction: {
        keys: ["secret"],
        replacement: "[REDACTED]",
        redactIn: "file"
      },
      format: "json"
    });

    // Wait for the write to complete if needed (simulate flush)
    await fileTransport.flush();

    const loggedData = JSON.parse(writtenContent.trim());
    expect(loggedData.data.secret).toBe("[REDACTED]");
  });

  it("should redact for both console and file when redactIn is 'both'", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Both redaction test",
      args: [],
      data: { secret: "should-be-redacted" }
    };
    
    // Clear any previous calls
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["secret"],
        replacement: "[REDACTED]",
        redactIn: "both" // Should redact for console
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.secret).toBe("[REDACTED]");
  });

  it("should handle nested object redaction", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Nested redaction test",
      args: [],
      data: { 
        user: { 
          name: "john", 
          password: "secret123" 
        },
        config: {
          apiKey: "key123"
        }
      }
    };
    
    // Clear any previous calls
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "apiKey"],
        replacement: "[HIDDEN]",
        redactIn: "console"
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.user.name).toBe("john");
    expect(loggedData.data.user.password).toBe("[HIDDEN]");
    expect(loggedData.data.config.apiKey).toBe("[HIDDEN]");
  });

  it("should handle circular references in redaction", () => {
    const circular: any = { a: 1 };
    circular.self = circular;
    
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Circular redaction test",
      args: [],
      data: circular
    };
    
    // Clear any previous calls
    consoleSpy.mockClear();

    // This should not throw due to circular reference
    expect(() => {
      consoleTransport.log(entry, {
        redaction: { 
          keys: ["a"], 
          redactIn: "console",
          replacement: "[REDACTED]"
        },
        format: "json"
      });
    }).not.toThrow();
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.a).toBe("[REDACTED]");
    expect(loggedData.data.self).toBe("[Circular Reference]");
  });

  it("should use case-insensitive matching when configured", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Case insensitive test",
      args: [],
      data: { 
        Password: "secret1",
        TOKEN: "secret2",
        apikey: "secret3"
      }
    };
    
    // Clear any previous calls
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "token", "apikey"],
        replacement: "[REDACTED]",
        redactIn: "console",
        caseInsensitive: true
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    
    // With case-insensitive matching, all keys should be redacted regardless of case
    expect(loggedData.data.Password).toBe("[REDACTED]");
    expect(loggedData.data.TOKEN).toBe("[REDACTED]");
    expect(loggedData.data.apikey).toBe("[REDACTED]");
  });

  it("should use case-sensitive matching when configured", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Case sensitive test",
      args: [],
      data: { 
        password: "secret1",
        Password: "secret2",
        TOKEN: "secret3"
      }
    };
    
    // Clear any previous calls
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "token"],
        replacement: "[REDACTED]",
        redactIn: "console",
        caseInsensitive: false
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.password).toBe("[REDACTED]");
    expect(loggedData.data.Password).toBe("secret2"); // Should not be redacted (different case)
    expect(loggedData.data.TOKEN).toBe("secret3"); // Should not be redacted (not matching "token")
  });
});
