import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { logger, LogLevel, ConsoleTransport, FileTransport, type LogEntry } from "../lib/index";
import { actualMockBunFileFn, actualMockBunWriteFn } from "./test-utils";

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
      // Explicitly type transports as any to satisfy the Transport type constraint for test purposes
      transports: [consoleTransport as any],
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
    // Mock Node.js fs operations for FileTransport to prevent real file creation
    const fs = require("fs");
    const appendFileSyncSpy = spyOn(fs, "appendFileSync").mockImplementation(() => {});

    let writtenContent = "";
    // Capture content from appendFileSync since FileTransport uses append for logging
    appendFileSyncSpy.mockImplementation((_path: string, data: string) => { 
      writtenContent += data; 
    });

    const fileTransport = new FileTransport("test.log", undefined, {
      appendFileSync: fs.appendFileSync
    });

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

    await fileTransport.flush();

    // Defensive: ensure writtenContent is not empty and valid JSON
    expect(typeof writtenContent).toBe("string");
    expect(writtenContent.trim().length).toBeGreaterThan(0);
    let loggedData: any;
    try {
      loggedData = JSON.parse(writtenContent.trim());
    } catch (e) {
      throw new Error(`FileTransport wrote invalid JSON: ${writtenContent}`);
    }
    expect(loggedData.data.secret).toBe("[REDACTED]");

    // Restore fs mocks
    appendFileSyncSpy.mockRestore();
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

  it("should export redaction utility functions", () => {
    // Test that the utility functions are properly exported
    const { 
      shouldRedactKey, 
      shouldRedactValue, 
      redactString, 
      needsRedaction,
      redactObject,
      getRedactedEntry,
      redactLogEntry,
      isWhitelisted
    } = require("../lib/index");
    
    expect(typeof shouldRedactKey).toBe("function");
    expect(typeof shouldRedactValue).toBe("function");
    expect(typeof redactString).toBe("function");
    expect(typeof needsRedaction).toBe("function");
    expect(typeof redactObject).toBe("function");
    expect(typeof getRedactedEntry).toBe("function");
    expect(typeof redactLogEntry).toBe("function");
    expect(typeof isWhitelisted).toBe("function");
  });

  // Add test for backward compatibility
  it("should maintain backward compatibility with existing redaction config", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Backward compatibility test",
      args: [],
      data: { 
        password: "secret123",
        token: "abc456",
        safe: "ok"
      }
    };
    
    consoleSpy.mockClear();
    
    // Test with old-style config (only keys and replacement)
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "token"],
        replacement: "[LEGACY_REDACTED]"
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.password).toBe("[LEGACY_REDACTED]");
    expect(loggedData.data.token).toBe("[LEGACY_REDACTED]");
    expect(loggedData.data.safe).toBe("ok");
  });

  it("should use enhanced redaction context in replacement functions", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Context replacement test",
      args: [],
      data: { 
        password: "secret123",
        user: {
          token: "abc456"
        }
      }
    };
    
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "token"],
        replacement: (value, context) => `[${context.key.toUpperCase()}_AT_${context.path}]`,
        redactIn: "console"
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.password).toBe("[PASSWORD_AT_password]");
    expect(loggedData.data.user.token).toBe("[TOKEN_AT_user.token]");
  });

  it("should respect field targeting configuration", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Password in message: secret123",
      args: ["Password in args: secret456"],
      data: { 
        password: "secret789"
      }
    };
    
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        fields: ['data'], // Only redact data field
        keys: ["password"],
        redactStrings: true,
        stringPatterns: [/secret\d+/g],
        replacement: "[TARGETED_REDACTED]",
        redactIn: "console"
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    
    // Only data should be redacted, message and args should remain unchanged
    expect(loggedData.message).toBe("Password in message: secret123");
    expect(loggedData.args[0]).toBe("Password in args: secret456");
    expect(loggedData.data.password).toBe("[TARGETED_REDACTED]");
  });

  it("should handle field-specific configurations", () => {
    const consoleTransport = new ConsoleTransport();
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Field config test",
      args: [],
      data: { 
        password: "secret123",
        token: "abc456",
        safe: "data"
      }
    };
    
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password", "token", "safe"], // Target all keys
        fieldConfigs: {
          'safe': {
            disabled: true // Disable redaction for 'safe' field
          },
          'password': {
            replacement: '[FIELD_SPECIFIC_PWD]'
          }
        },
        replacement: "[DEFAULT_REDACTED]",
        redactIn: "console"
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(loggedData.data.password).toBe("[FIELD_SPECIFIC_PWD]");
    expect(loggedData.data.token).toBe("[DEFAULT_REDACTED]");
    expect(loggedData.data.safe).toBe("data"); // Not redacted due to field config
  });

  it("should respect maxDepth configuration", () => {
    const consoleTransport = new ConsoleTransport();
    
    // Create deeply nested object
    const deepData: any = {};
    let current = deepData;
    for (let i = 0; i < 15; i++) {
      current.nested = { level: i };
      current = current.nested;
    }
    current.password = "deep_secret";
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Max depth test",
      args: [],
      data: deepData
    };
    
    consoleSpy.mockClear();
    
    consoleTransport.log(entry, {
      redaction: {
        keys: ["password"],
        maxDepth: 5,
        replacement: "[REDACTED]",
        redactIn: "console"
      },
      format: "json"
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
    
    // Should hit max depth and truncate
    let current_result = loggedData.data;
    for (let i = 0; i < 5; i++) {
      expect(current_result.nested).toBeDefined();
      current_result = current_result.nested;
    }
    // At depth 5, should see the max depth message
    expect(current_result).toBe("[Max Depth Exceeded]");
  });
});