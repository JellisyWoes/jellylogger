import "./test-utils";
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { logger, LogLevel, ConsoleTransport, type LogEntry } from "../lib/index";
import { MemoryTransport, resetAllMocks } from "./test-utils";

describe("Console and File Transport Synchronization", () => {
  let consoleOutput: string[] = [];
  let memoryTransport: MemoryTransport;
  let consoleSpies: any = {};
  let originalConsoleMethods: any = {};

  beforeEach(() => {
    // Reset output captures
    consoleOutput = [];
    memoryTransport = new MemoryTransport();
    resetAllMocks();

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
    
    resetAllMocks();
  });

  it("should write the same logs to both console and memory transport in string format", async () => {
    // Setup transports with memory transport instead of file
    const consoleTransport = new ConsoleTransport();

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [consoleTransport, memoryTransport],
      format: "string"
    });

    // Log various types of messages
    logger.info("Simple info message");
    logger.warn("Warning message with data", { userId: "123", action: "login" });
    logger.error("Error message", new Error("Test error"));

    // Wait for async operations
    await logger.flushAll();

    // Verify console output
    expect(consoleOutput).toHaveLength(3);
    expect(consoleOutput[0]).toContain("INFO");
    expect(consoleOutput[0]).toContain("Simple info message");
    expect(consoleOutput[1]).toContain("WARN");
    expect(consoleOutput[1]).toContain("Warning message with data");
    expect(consoleOutput[1]).toContain("userId");
    expect(consoleOutput[2]).toContain("ERROR");
    expect(consoleOutput[2]).toContain("Error message");

    // Verify memory transport content - should match console format
    expect(memoryTransport.logs).toHaveLength(3);
    expect(memoryTransport.logs[0]).toContain("INFO");
    expect(memoryTransport.logs[0]).toContain("Simple info message");
    expect(memoryTransport.logs[1]).toContain("WARN");
    expect(memoryTransport.logs[1]).toContain("Warning message with data");
    expect(memoryTransport.logs[1]).toContain("userId");
    expect(memoryTransport.logs[2]).toContain("ERROR");
    expect(memoryTransport.logs[2]).toContain("Error message");
  });

  it("should write the same logs to both console and memory transport in JSON format", async () => {
    const consoleTransport = new ConsoleTransport();

    logger.setOptions({
      level: LogLevel.DEBUG,
      transports: [consoleTransport, memoryTransport],
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

    // Parse memory transport JSON output
    expect(memoryTransport.logs).toHaveLength(2);
    const memoryEntry1 = JSON.parse(memoryTransport.logs[0]);
    const memoryEntry2 = JSON.parse(memoryTransport.logs[1]);

    // Verify console and memory transport have identical JSON structure and content
    expect(consoleEntry1.message).toBe(memoryEntry1.message);
    expect(consoleEntry1.level).toBe(memoryEntry1.level);
    expect(consoleEntry1.levelName).toBe(memoryEntry1.levelName);
    expect(consoleEntry1.data).toEqual(memoryEntry1.data);

    expect(consoleEntry2.message).toBe(memoryEntry2.message);
    expect(consoleEntry2.level).toBe(memoryEntry2.level);
    expect(consoleEntry2.levelName).toBe(memoryEntry2.levelName);
    expect(consoleEntry2.data).toEqual(memoryEntry2.data);

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

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [consoleTransport, memoryTransport],
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
    const memoryEntry = JSON.parse(memoryTransport.logs[0]);

    // Verify identical structure and content
    expect(consoleEntry.message).toBe(memoryEntry.message);
    expect(consoleEntry.data).toEqual(memoryEntry.data);
    expect(consoleEntry.data.user.preferences.theme).toBe("dark");
    expect(consoleEntry.data.metadata.nested.deep.value).toBe("test");
    expect(consoleEntry.data.items).toEqual([1, "two", { three: 3 }]);
    expect(consoleEntry.data.nullValue).toBe(null);
  });

  it("should maintain timestamp consistency between console and memory transport", async () => {
    const consoleTransport = new ConsoleTransport();

    logger.setOptions({
      level: LogLevel.INFO,
      transports: [consoleTransport, memoryTransport],
      format: "json",
      useHumanReadableTime: false
    });

    logger.info("Timestamp test");
    await logger.flushAll();

    const consoleEntry = JSON.parse(consoleOutput[0]);
    const memoryEntry = JSON.parse(memoryTransport.logs[0]);

    // Timestamps should be identical
    expect(consoleEntry.timestamp).toBe(memoryEntry.timestamp);
    expect(consoleEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("should handle different log levels consistently", async () => {
    const consoleTransport = new ConsoleTransport();

    logger.setOptions({
      level: LogLevel.TRACE,
      transports: [consoleTransport, memoryTransport],
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
    expect(memoryTransport.logs).toHaveLength(6);

    // Verify each level is handled identically
    for (let i = 0; i < 6; i++) {
      const consoleEntry = JSON.parse(consoleOutput[i]);
      const memoryEntry = JSON.parse(memoryTransport.logs[i]);
      
      expect(consoleEntry.level).toBe(memoryEntry.level);
      expect(consoleEntry.levelName).toBe(memoryEntry.levelName);
      expect(consoleEntry.message).toBe(memoryEntry.message);
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

    logger.setOptions({
      level: LogLevel.ERROR,
      transports: [consoleTransport, memoryTransport],
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

    expect(consoleOutput).toHaveLength(2);
    expect(memoryTransport.logs).toHaveLength(2);

    // Parse first entry (error handling)
    const consoleErrorEntry = JSON.parse(consoleOutput[0]);
    const memoryErrorEntry = JSON.parse(memoryTransport.logs[0]);

    expect(consoleErrorEntry.message).toBe(memoryErrorEntry.message);
    expect(consoleErrorEntry.message).toBe("Error handling test");
    
    // Both should have processed the error in args
    expect(consoleErrorEntry.args).toBeDefined();
    expect(consoleErrorEntry.args).toHaveLength(1);
    expect(memoryErrorEntry.args).toBeDefined();
    expect(memoryErrorEntry.args).toHaveLength(1);
    
    // Error should be serialized as an object with name, message, stack
    const consoleErrorArg = consoleErrorEntry.args[0];
    const memoryErrorArg = memoryErrorEntry.args[0];
    expect(consoleErrorArg.name).toBe("Error");
    expect(consoleErrorArg.message).toBe("Test error with stack");
    expect(memoryErrorArg.name).toBe("Error");
    expect(memoryErrorArg.message).toBe("Test error with stack");

    // Parse second entry (circular reference)
    const consoleCircularEntry = JSON.parse(consoleOutput[1]);
    const memoryCircularEntry = JSON.parse(memoryTransport.logs[1]);

    expect(consoleCircularEntry.message).toBe(memoryCircularEntry.message);
    expect(consoleCircularEntry.message).toBe("Circular reference test");
    
    // For circular reference, both should handle it identically
    expect(consoleCircularEntry.args).toEqual(memoryCircularEntry.args);
  });

  it("should respect log level filtering consistently", async () => {
    const consoleTransport = new ConsoleTransport();

    logger.setOptions({
      level: LogLevel.WARN,
      transports: [consoleTransport, memoryTransport],
      format: "string"
    });

    logger.trace("Should not appear");
    logger.debug("Should not appear");
    logger.info("Should not appear");
    logger.warn("Should appear");
    logger.error("Should appear");
    logger.fatal("Should appear");

    await logger.flushAll();

    // Both console and memory transport should have exactly 3 entries
    expect(consoleOutput).toHaveLength(3);
    expect(memoryTransport.logs).toHaveLength(3);

    // Verify content consistency
    expect(consoleOutput[0]).toContain("WARN");
    expect(consoleOutput[0]).toContain("Should appear");
    expect(memoryTransport.logs[0]).toContain("WARN");
    expect(memoryTransport.logs[0]).toContain("Should appear");

    expect(consoleOutput[1]).toContain("ERROR");
    expect(memoryTransport.logs[1]).toContain("ERROR");

    expect(consoleOutput[2]).toContain("FATAL");
    expect(memoryTransport.logs[2]).toContain("FATAL");
  });
});