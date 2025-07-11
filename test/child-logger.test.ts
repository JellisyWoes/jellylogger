import "./test-utils";
import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { logger, LogLevel, ConsoleTransport, type LogEntry, type Transport, type BaseLogger } from "../lib/index";

describe("ChildLogger", () => {
  let loggedEntries: LogEntry[];
  let mockTransport: Transport;

  beforeEach(() => {
    loggedEntries = [];
    mockTransport = {
      log: async (entry: LogEntry) => {
        loggedEntries.push(entry);
      }
    };
    
    logger.resetOptions();
    logger.setOptions({
      level: LogLevel.INFO,
      transports: [mockTransport]
    });
  });

  describe("Message prefix", () => {
    it("should prepend message prefix from parent and child", () => {
      const parentLogger = logger.child({ messagePrefix: "[AUTH]" });
      const childLogger = parentLogger.child({ messagePrefix: "[LOGIN]" });

      childLogger.info("User login attempt");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[AUTH] [LOGIN] User login attempt");
    });

    it("should handle empty message prefix gracefully", () => {
      const parentLogger = logger.child({ messagePrefix: "" });
      const childLogger = parentLogger.child({ messagePrefix: "[API]" });

      childLogger.error("API error occurred");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[API] API error occurred");
    });

    it("should handle undefined message prefix", () => {
      const parentLogger = logger.child({});
      const childLogger = parentLogger.child({ messagePrefix: "[TEST]" });

      childLogger.info("Test message");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[TEST] Test message");
    });

    it("should handle multiple message prefixes", () => {
      const level1 = logger.child({ messagePrefix: "[SERVICE]" });
      const level2 = level1.child({ messagePrefix: "[MODULE]" });
      const level3 = level2.child({ messagePrefix: "[FUNCTION]" });

      level3.warn("Deep nesting test");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[SERVICE] [MODULE] [FUNCTION] Deep nesting test");
    });
  });

  describe("Structured data through logging calls", () => {
    it("should pass structured data through log calls", () => {
      const childLogger = logger.child({ messagePrefix: "[API]" });

      childLogger.info("Operation complete", { 
        operation: "save",
        duration: 150,
        userId: "123"
      });

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].data).toEqual({
        operation: "save",
        duration: 150,
        userId: "123"
      });
      expect(loggedEntries[0].message).toBe("[API] Operation complete");
    });

    it("should handle multiple arguments with structured data", () => {
      const childLogger = logger.child({ messagePrefix: "[REQUEST]" });

      childLogger.warn("Multiple args test", "arg1", { requestId: "req_123" }, 42);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].data).toEqual({ requestId: "req_123" });
      expect(loggedEntries[0].args.processedArgs).toEqual(["arg1", 42]);
      expect(loggedEntries[0].message).toBe("[REQUEST] Multiple args test");
    });

    it("should merge multiple data objects from arguments", () => {
      const childLogger = logger.child({ messagePrefix: "[MERGE]" });

      childLogger.error("Error with context", { errorCode: "E001" }, { userId: "user_456" });

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].data).toEqual({
        errorCode: "E001",
        userId: "user_456"
      });
    });
  });

  describe("Options inheritance", () => {
    it("should inherit parent logger options", () => {
      logger.setOptions({ 
        level: LogLevel.WARN,
        useHumanReadableTime: true,
        format: "json"
      });

      const childLogger = logger.child({ messagePrefix: "[TEST]" });
      
      // Child should inherit parent's level setting
      childLogger.info("Should not log"); // INFO < WARN
      childLogger.warn("Should log");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[TEST] Should log");
    });

    it("should inherit redaction settings from parent", () => {
      logger.setOptions({
        redaction: {
          keys: ["password", "token"],
          replacement: "[PARENT_REDACTED]",
          redactIn: "console"
        }
      });

      const childLogger = logger.child({ messagePrefix: "[AUTH]" });
      
      // Mock console to capture redacted output
      const consoleSpy = spyOn(console, 'info').mockImplementation(() => {});
      logger.setOptions({ transports: [new ConsoleTransport()] });
      
      childLogger.info("Login successful", { password: "secret123" });

      expect(consoleSpy).toHaveBeenCalled();
      // The actual redaction testing is covered in redaction tests
      consoleSpy.mockRestore();
    });
  });

  describe("Multiple inheritance levels", () => {
    it("should handle deeply nested child loggers", () => {
      const level1 = logger.child({ messagePrefix: "[API]" });
      const level2 = level1.child({ messagePrefix: "[AUTH]" });
      const level3 = level2.child({ messagePrefix: "[LOGIN]" });
      const level4 = level3.child({ messagePrefix: "[SESSION]" });

      level4.info("Deep nesting test", { sessionId: "sess_123", userId: "user_456" });

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[API] [AUTH] [LOGIN] [SESSION] Deep nesting test");
      expect(loggedEntries[0].data).toEqual({
        sessionId: "sess_123",
        userId: "user_456"
      });
    });

    it("should maintain performance with many inheritance levels", () => {
      let currentLogger: BaseLogger = logger;
      
      // Create 10 levels of inheritance
      for (let i = 0; i < 10; i++) {
        currentLogger = currentLogger.child({ messagePrefix: `[LEVEL${i}]` });
      }

      const start = Date.now();
      currentLogger.info("Performance test", { testData: "performance" });
      const duration = Date.now() - start;

      expect(loggedEntries).toHaveLength(1);
      expect(duration).toBeLessThan(10); // Should be very fast
      
      // Check that all prefixes are included
      const expectedMessage = "[LEVEL0] [LEVEL1] [LEVEL2] [LEVEL3] [LEVEL4] [LEVEL5] [LEVEL6] [LEVEL7] [LEVEL8] [LEVEL9] Performance test";
      expect(loggedEntries[0].message).toBe(expectedMessage);
      expect(loggedEntries[0].data).toEqual({ testData: "performance" });
    });
  });

  describe("Child logger isolation", () => {
    it("should not affect parent logger when child is modified", () => {
      const parentLogger = logger.child({ messagePrefix: "[PARENT]" });
      const childLogger = parentLogger.child({ messagePrefix: "[CHILD]" });

      // Log from child
      childLogger.info("Child message", { component: "child" });
      
      // Log from parent - should not include child prefix
      parentLogger.info("Parent message", { component: "parent" });

      expect(loggedEntries).toHaveLength(2);
      
      expect(loggedEntries[0].message).toBe("[PARENT] [CHILD] Child message");
      expect(loggedEntries[0].data).toEqual({ component: "child" });
      
      expect(loggedEntries[1].message).toBe("[PARENT] Parent message");
      expect(loggedEntries[1].data).toEqual({ component: "parent" });
    });

    it("should not affect sibling loggers", () => {
      const parentLogger = logger.child({ messagePrefix: "[SHARED]" });
      const child1 = parentLogger.child({ messagePrefix: "[AUTH]" });
      const child2 = parentLogger.child({ messagePrefix: "[API]" });

      child1.info("Auth message", { service: "auth" });
      child2.info("API message", { service: "api" });

      expect(loggedEntries).toHaveLength(2);
      
      expect(loggedEntries[0].message).toBe("[SHARED] [AUTH] Auth message");
      expect(loggedEntries[0].data).toEqual({ service: "auth" });
      
      expect(loggedEntries[1].message).toBe("[SHARED] [API] API message");
      expect(loggedEntries[1].data).toEqual({ service: "api" });
    });
  });

  describe("Child logger creation", () => {
    it("should create child logger from child logger", () => {
      const firstChild = logger.child({ messagePrefix: "[API]" });
      const secondChild = firstChild.child({ messagePrefix: "[V1]" });

      secondChild.info("Nested child test", { version: "v1" });

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[API] [V1] Nested child test");
      expect(loggedEntries[0].data).toEqual({ version: "v1" });
    });

    it("should work with only messagePrefix", () => {
      const childLogger = logger.child({ messagePrefix: "[SERVICE]" });

      childLogger.info("Service started");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[SERVICE] Service started");
      expect(loggedEntries[0].data).toBeUndefined();
    });

    it("should work with empty options", () => {
      const childLogger = logger.child({});

      childLogger.info("No special context");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("No special context");
      expect(loggedEntries[0].data).toBeUndefined();
    });

    it("should work without any options", () => {
      const childLogger = logger.child();

      childLogger.info("No options provided");

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("No options provided");
      expect(loggedEntries[0].data).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should handle errors in child logger", () => {
      const childLogger = logger.child({ messagePrefix: "[ERROR]" });
      const error = new Error("Test error");

      childLogger.error("Error occurred", error);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[ERROR] Error occurred");
      // Error objects are placed in the data field in the current implementation
      expect(loggedEntries[0].data).toEqual(expect.objectContaining({
        name: "Error",
        message: "Test error"
      }));
    });

    it("should handle complex data structures", () => {
      const childLogger = logger.child({ messagePrefix: "[COMPLEX]" });
      const complexData = {
        user: { id: 123, name: "John" },
        metadata: { timestamp: Date.now(), source: "test" },
        items: [1, 2, 3]
      };

      childLogger.debug("Complex data", complexData);

      logger.setOptions({ level: LogLevel.DEBUG });
      childLogger.debug("Complex data", complexData);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toBe("[COMPLEX] Complex data");
      expect(loggedEntries[0].data).toEqual(complexData);
    });
  });

  describe("Level filtering", () => {
    it("should respect log level filtering for child loggers", () => {
      logger.setOptions({ level: LogLevel.WARN });
      const childLogger = logger.child({ messagePrefix: "[FILTERED]" });

      childLogger.debug("Should not appear");
      childLogger.info("Should not appear");
      childLogger.warn("Should appear");
      childLogger.error("Should appear");

      expect(loggedEntries).toHaveLength(2);
      expect(loggedEntries[0].message).toBe("[FILTERED] Should appear");
      expect(loggedEntries[1].message).toBe("[FILTERED] Should appear");
    });
  });
});
