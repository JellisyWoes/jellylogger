import "./test-utils";
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { logger, LogLevel, ConsoleTransport, FileTransport, type LogEntry } from "../lib/index";

describe("Console and File Transport Synchronization", () => {
  let consoleOutput: string[] = [];
  let fileContent: string = "";
  let mockBunOps: any;
  let consoleSpies: any = {};
  let originalConsoleMethods: any = {};

  beforeEach(() => {
    // Reset output captures
    consoleOutput = [];
    fileContent = "";

    // Mock Bun file operations
    mockBunOps = {
      file: mock(() => ({
        exists: async () => false,
        size: 0,
        text: async () => ""
      })),
      write: mock(async (_file: any, data: string) => {
        fileContent += data;
        return data.length;
      })
    };

    // Store original console methods
    originalConsoleMethods = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };

    // Mock console methods to capture output
    consoleSpies.log = spyOn(console, 'log').mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    consoleSpies.info = spyOn(console, 'info').mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    consoleSpies.warn = spyOn(console, 'warn').mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    consoleSpies.error = spyOn(console, 'error').mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });
    consoleSpies.debug = spyOn(console, 'debug').mockImplementation((msg: string) => {
      consoleOutput.push(msg);
    });

    // Reset logger options
    logger.resetOptions();
  });

  afterEach(() => {
    // Restore console methods
    Object.keys(consoleSpies).forEach(key => {
      consoleSpies[key]?.mockRestore();
    });
    console.log = originalConsoleMethods.log;
    console.info = originalConsoleMethods.info;
    console.warn = originalConsoleMethods.warn;
    console.error = originalConsoleMethods.error;
    console.debug = originalConsoleMethods.debug;
  });

  it("should write the same logs to both console and file in string format", async () => {
    // Setup transports
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("test.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [consoleTransport, fileTransport],
      format: "string"
    });

    // Log various types of messages
    logger.info("Simple info message");
    logger.warn("Warning message with data", { userId: "123", action: "login" });
    logger.error("Error message", new Error("Test error"));

    // Wait for async file operations
    await logger.flushAll();

    // Verify console output
    expect(consoleOutput).toHaveLength(3);
    expect(consoleOutput[0]).toContain("INFO ");
    expect(consoleOutput[0]).toContain("Simple info message");
    expect(consoleOutput[1]).toContain("WARN ");
    expect(consoleOutput[1]).toContain("Warning message with data");
    expect(consoleOutput[1]).toContain("userId");
    expect(consoleOutput[2]).toContain("ERROR");
    expect(consoleOutput[2]).toContain("Error message");

    // Verify file content
    expect(fileContent).toBeTruthy();
    const fileLines = fileContent.trim().split('\n');
    expect(fileLines).toHaveLength(3);

    // Check that both console and file contain the same core information
    expect(fileLines[0]).toContain("INFO ");
    expect(fileLines[0]).toContain("Simple info message");
    expect(fileLines[1]).toContain("WARN ");
    expect(fileLines[1]).toContain("Warning message with data");
    expect(fileLines[1]).toContain("userId");
    expect(fileLines[2]).toContain("ERROR");
    expect(fileLines[2]).toContain("Error message");
  });

  it("should write the same logs to both console and file in JSON format", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("test.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.DEBUG,
      transports: [consoleTransport, fileTransport],
      format: "json"
    });

    // Log with structured data
    logger.debug("Debug message", { 
      component: "auth", 
      operation: "validate",
      duration: 150
    });
    logger.info("User action", { userId: "456", action: "logout" });

    await logger.flushAll();

    // Parse console JSON output
    expect(consoleOutput).toHaveLength(2);
    const consoleEntry1 = JSON.parse(consoleOutput[0]);
    const consoleEntry2 = JSON.parse(consoleOutput[1]);

    // Parse file JSON output
    const fileLines = fileContent.trim().split('\n');
    expect(fileLines).toHaveLength(2);
    const fileEntry1 = JSON.parse(fileLines[0]);
    const fileEntry2 = JSON.parse(fileLines[1]);

    // Verify console and file have identical JSON structure and content
    expect(consoleEntry1.message).toBe(fileEntry1.message);
    expect(consoleEntry1.level).toBe(fileEntry1.level);
    expect(consoleEntry1.levelName).toBe(fileEntry1.levelName);
    expect(consoleEntry1.data).toEqual(fileEntry1.data);

    expect(consoleEntry2.message).toBe(fileEntry2.message);
    expect(consoleEntry2.level).toBe(fileEntry2.level);
    expect(consoleEntry2.levelName).toBe(fileEntry2.levelName);
    expect(consoleEntry2.data).toEqual(fileEntry2.data);

    // Verify specific content
    expect(consoleEntry1.message).toBe("Debug message");
    expect(consoleEntry1.data).toEqual({ 
      component: "auth", 
      operation: "validate",
      duration: 150
    });
    expect(consoleEntry2.message).toBe("User action");
    expect(consoleEntry2.data).toEqual({ userId: "456", action: "logout" });
  });

  it("should handle complex data structures identically in both transports", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("complex.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [consoleTransport, fileTransport],
      format: "json"
    });

    const complexData = {
      user: { id: 123, name: "John Doe", preferences: { theme: "dark" } },
      metadata: { 
        timestamp: "2023-01-01T12:00:00Z", 
        source: "api",
        nested: { deep: { value: "test" } }
      },
      items: [1, "two", { three: 3 }],
      nullValue: null,
      undefinedValue: undefined
    };

    logger.info("Complex data test", complexData);
    await logger.flushAll();

    // Parse outputs
    const consoleEntry = JSON.parse(consoleOutput[0]);
    const fileEntry = JSON.parse(fileContent.trim());

    // Verify identical structure and content
    expect(consoleEntry.message).toBe(fileEntry.message);
    expect(consoleEntry.data).toEqual(fileEntry.data);
    expect(consoleEntry.data.user.preferences.theme).toBe("dark");
    expect(consoleEntry.data.metadata.nested.deep.value).toBe("test");
    expect(consoleEntry.data.items).toEqual([1, "two", { three: 3 }]);
    expect(consoleEntry.data.nullValue).toBe(null);
    // undefined values are typically omitted in JSON serialization
  });

  it("should maintain timestamp consistency between console and file", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("timestamp.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [consoleTransport, fileTransport],
      format: "json",
      useHumanReadableTime: false // Use ISO timestamps for easier comparison
    });

    logger.info("Timestamp test");
    await logger.flushAll();

    const consoleEntry = JSON.parse(consoleOutput[0]);
    const fileEntry = JSON.parse(fileContent.trim());

    // Timestamps should be identical
    expect(consoleEntry.timestamp).toBe(fileEntry.timestamp);
    expect(consoleEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should handle different log levels consistently", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("levels.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.TRACE,
      transports: [consoleTransport, fileTransport],
      format: "json"
    });

    // Test all log levels
    logger.fatal("Fatal message");
    logger.error("Error message");
    logger.warn("Warning message");
    logger.info("Info message");
    logger.debug("Debug message");
    logger.trace("Trace message");

    await logger.flushAll();

    expect(consoleOutput).toHaveLength(6);
    const fileLines = fileContent.trim().split('\n');
    expect(fileLines).toHaveLength(6);

    // Verify each level is handled identically
    for (let i = 0; i < 6; i++) {
      const consoleEntry = JSON.parse(consoleOutput[i]);
      const fileEntry = JSON.parse(fileLines[i]);
      
      expect(consoleEntry.level).toBe(fileEntry.level);
      expect(consoleEntry.levelName).toBe(fileEntry.levelName);
      expect(consoleEntry.message).toBe(fileEntry.message);
    }

    // Verify specific levels
    const levels = ["FATAL", "ERROR", "WARN", "INFO", "DEBUG", "TRACE"];
    for (let i = 0; i < levels.length; i++) {
      const consoleEntry = JSON.parse(consoleOutput[i]);
      expect(consoleEntry.levelName).toBe(levels[i]);
    }
  });

  it("should handle errors and circular references consistently", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("errors.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.ERROR,
      transports: [consoleTransport, fileTransport],
      format: "json"
    });

    // Test error handling
    const error = new Error("Test error with stack");
    logger.error("Error handling test", error);

    // Test circular reference handling
    const circular: any = { name: "circular" };
    circular.self = circular;
    logger.error("Circular reference test", circular);

    await logger.flushAll();

    // The actual count should be 2 (one for each error log call)
    expect(consoleOutput).toHaveLength(2);
    const fileLines = fileContent.trim().split('\n');
    expect(fileLines).toHaveLength(2);

    // Parse first entry (error handling)
    const consoleErrorEntry = JSON.parse(consoleOutput[0]);
    const fileErrorEntry = JSON.parse(fileLines[0]);

    expect(consoleErrorEntry.message).toBe(fileErrorEntry.message);
    expect(consoleErrorEntry.message).toBe("Error handling test");
    
    // Both should have processed the error in args
    expect(consoleErrorEntry.args).toBeDefined();
    expect(consoleErrorEntry.args).toHaveLength(1);
    expect(fileErrorEntry.args).toBeDefined();
    expect(fileErrorEntry.args).toHaveLength(1);
    
    // Error should be serialized as an object with name, message, stack
    const consoleErrorArg = consoleErrorEntry.args[0];
    const fileErrorArg = fileErrorEntry.args[0];
    expect(consoleErrorArg.name).toBe("Error");
    expect(consoleErrorArg.message).toBe("Test error with stack");
    expect(fileErrorArg.name).toBe("Error");
    expect(fileErrorArg.message).toBe("Test error with stack");

    // Parse second entry (circular reference)
    const consoleCircularEntry = JSON.parse(consoleOutput[1]);
    const fileCircularEntry = JSON.parse(fileLines[1]);

    expect(consoleCircularEntry.message).toBe(fileCircularEntry.message);
    expect(consoleCircularEntry.message).toBe("Circular reference test");
    
    // For circular reference, the object is converted to a placeholder in args
    expect(consoleCircularEntry.args).toBeDefined();
    expect(fileCircularEntry.args).toBeDefined();
    expect(consoleCircularEntry.args).toHaveLength(1);
    expect(fileCircularEntry.args).toHaveLength(1);
    
    // The circular object should be replaced with a placeholder string
    expect(consoleCircularEntry.args[0]).toBe('[Object - Circular or Non-serializable]');
    expect(fileCircularEntry.args[0]).toBe('[Object - Circular or Non-serializable]');
    
    // Both should handle circular references identically
    expect(consoleCircularEntry.args).toEqual(fileCircularEntry.args);
    
    // Data field should be empty since the circular object was in args
    expect(consoleCircularEntry.data).toBeUndefined();
    expect(fileCircularEntry.data).toBeUndefined();
  });

  it("should respect log level filtering consistently", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("filtered.log", undefined, mockBunOps);

    logger.setOptions({
      level: LogLevel.WARN, // Only WARN and above should be logged
      transports: [consoleTransport, fileTransport],
      format: "string"
    });

    logger.trace("Should not appear");
    logger.debug("Should not appear");
    logger.info("Should not appear");
    logger.warn("Should appear");
    logger.error("Should appear");
    logger.fatal("Should appear");

    await logger.flushAll();

    // Both console and file should have exactly 3 entries
    expect(consoleOutput).toHaveLength(3);
    const fileLines = fileContent.trim().split('\n').filter(line => line.length > 0);
    expect(fileLines).toHaveLength(3);

    // Verify content consistency
    expect(consoleOutput[0]).toContain("WARN");
    expect(consoleOutput[0]).toContain("Should appear");
    expect(fileLines[0]).toContain("WARN");
    expect(fileLines[0]).toContain("Should appear");

    expect(consoleOutput[1]).toContain("ERROR");
    expect(fileLines[1]).toContain("ERROR");

    expect(consoleOutput[2]).toContain("FATAL");
    expect(fileLines[2]).toContain("FATAL");
  });
});
