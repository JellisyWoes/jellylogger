import "./test-utils";
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { logger } from "../lib/core/logger";
import { ConsoleTransport } from "../lib/transports/ConsoleTransport";
import { FileTransport } from "../lib/transports/FileTransport";
import { DiscordWebhookTransport } from "../lib/transports/DiscordWebhookTransport";
import { LogLevel } from "../lib/core/constants";
import type { Transport, LogEntry } from "../lib/core/types";
import { resetAllMocks } from "./test-utils";

describe("Logger Transport Management", () => {
  beforeEach(() => {
    // Clear transports and reset to clean state
    logger.clearTransports();
    // Reset all mocks including console mocks
    resetAllMocks();
  });

  describe("addTransport", () => {
    it("should add transport to empty transports array", () => {
      expect(logger.options?.transports).toHaveLength(0);
      
      const consoleTransport = new ConsoleTransport();
      logger.addTransport(consoleTransport);
      
      expect(logger.options?.transports).toHaveLength(1);
      expect(logger.options?.transports?.[0]).toBe(consoleTransport);
    });

    it("should add transport to existing transports", () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new FileTransport("./test-logs/app.log");
      
      logger.addTransport(transport1);
      expect(logger.options?.transports).toHaveLength(1);
      
      logger.addTransport(transport2);
      expect(logger.options?.transports).toHaveLength(2);
      expect(logger.options?.transports?.[0]).toBe(transport1);
      expect(logger.options?.transports?.[1]).toBe(transport2);
    });

    it("should initialize transports array if undefined", () => {
      // Ensure transports is undefined
      logger.options.transports = undefined;
      
      const transport = new ConsoleTransport();
      logger.addTransport(transport);
      
      expect(logger.options.transports).toBeDefined();
      expect(logger.options.transports).toHaveLength(1);
      expect(logger.options.transports![0]).toBe(transport);
    });

    it("should support adding multiple transport types", () => {
      const consoleTransport = new ConsoleTransport();
      const fileTransport = new FileTransport("./test-logs/app.log");
      const discordTransport = new DiscordWebhookTransport("https://discord.com/webhook");
      
      logger.addTransport(consoleTransport);
      logger.addTransport(fileTransport);
      logger.addTransport(discordTransport);
      
      expect(logger.options?.transports).toHaveLength(3);
      expect(logger.options?.transports?.[0]).toBeInstanceOf(ConsoleTransport);
      expect(logger.options?.transports?.[1]).toBeInstanceOf(FileTransport);
      expect(logger.options?.transports?.[2]).toBeInstanceOf(DiscordWebhookTransport);
    });
  });

  describe("removeTransport", () => {
    it("should remove transport from transports array", () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new FileTransport("./test-logs/app.log");
      
      logger.addTransport(transport1);
      logger.addTransport(transport2);
      expect(logger.options?.transports).toHaveLength(2);
      
      logger.removeTransport(transport1);
      expect(logger.options?.transports).toHaveLength(1);
      expect(logger.options?.transports?.[0]).toBe(transport2);
    });

    it("should handle removing non-existent transport", () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new FileTransport("./test-logs/app.log");
      const transport3 = new ConsoleTransport(); // Different instance
      
      logger.addTransport(transport1);
      logger.addTransport(transport2);
      expect(logger.options?.transports).toHaveLength(2);
      
      // Try to remove transport that wasn't added
      logger.removeTransport(transport3);
      expect(logger.options?.transports).toHaveLength(2);
    });

    it("should handle removing transport when transports is undefined", () => {
      logger.options.transports = undefined;
      const transport = new ConsoleTransport();
      
      // Should not throw
      expect(() => {
        logger.removeTransport(transport);
      }).not.toThrow();
    });

    it("should remove correct transport when multiple of same type", () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new ConsoleTransport();
      const transport3 = new FileTransport("./test-logs/app.log");
      
      logger.addTransport(transport1);
      logger.addTransport(transport2);
      logger.addTransport(transport3);
      expect(logger.options?.transports).toHaveLength(3);
      
      logger.removeTransport(transport2);
      expect(logger.options?.transports).toHaveLength(2);
      expect(logger.options?.transports?.[0]).toBe(transport1);
      expect(logger.options?.transports?.[1]).toBe(transport3);
    });
  });

  describe("clearTransports", () => {
    it("should clear all transports", () => {
      logger.addTransport(new ConsoleTransport());
      logger.addTransport(new FileTransport("./test-logs/app.log"));
      logger.addTransport(new DiscordWebhookTransport("https://discord.com/webhook"));
      
      expect(logger.options?.transports).toHaveLength(3);
      
      logger.clearTransports();
      
      expect(logger.options?.transports).toHaveLength(0);
      expect(Array.isArray(logger.options?.transports)).toBe(true);
    });

    it("should work when transports is already empty", () => {
      expect(logger.options?.transports).toHaveLength(0);
      
      expect(() => {
        logger.clearTransports();
      }).not.toThrow();
      
      expect(logger.options?.transports).toHaveLength(0);
    });

    it("should work when transports is undefined", () => {
      logger.options.transports = undefined;
      
      expect(() => {
        logger.clearTransports();
      }).not.toThrow();
      
      expect(logger.options.transports).toBeDefined();
      expect(logger.options.transports).toHaveLength(0);
    });
  });

  describe("setTransports", () => {
    it("should replace all transports with new array", () => {
      const oldTransport = new ConsoleTransport();
      logger.addTransport(oldTransport);
      expect(logger.options?.transports).toHaveLength(1);
      
      const newTransports = [
        new FileTransport("./test-logs/app.log"),
        new DiscordWebhookTransport("https://discord.com/webhook")
      ];
      
      logger.setTransports(newTransports);
      
      expect(logger.options?.transports).toHaveLength(2);
      expect(logger.options?.transports?.[0]).toBe(newTransports[0]);
      expect(logger.options?.transports?.[1]).toBe(newTransports[1]);
      expect(logger.options?.transports?.includes(oldTransport)).toBe(false);
    });

    it("should create copy of transports array", () => {
      const transports = [new ConsoleTransport(), new FileTransport("./test-logs/app.log")];
      
      logger.setTransports(transports);
      
      // Modify original array
      transports.push(new DiscordWebhookTransport("https://discord.com/webhook"));
      
      // Logger's transports should not be affected
      expect(logger.options?.transports).toHaveLength(2);
      expect(transports).toHaveLength(3);
    });

    it("should handle empty array", () => {
      logger.addTransport(new ConsoleTransport());
      expect(logger.options?.transports).toHaveLength(1);
      
      logger.setTransports([]);
      
      expect(logger.options?.transports).toHaveLength(0);
    });

    it("should handle single transport in array", () => {
      const transport = new ConsoleTransport();
      logger.setTransports([transport]);
      
      expect(logger.options?.transports).toHaveLength(1);
      expect(logger.options?.transports?.[0]).toBe(transport);
    });
  });

  describe("Transport Management Integration", () => {
    it("should work with logger methods after transport management", () => {
      const consoleTransport = new ConsoleTransport();
      const spy = spyOn(consoleTransport, 'log');
      
      logger.addTransport(consoleTransport);
      logger.info("Test message");
      
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].message).toBe("Test message");
      
      spy.mockRestore();
    });

    it("should handle multiple transports receiving same log", () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new ConsoleTransport();
      
      const spy1 = spyOn(transport1, 'log');
      const spy2 = spyOn(transport2, 'log');
      
      logger.addTransport(transport1);
      logger.addTransport(transport2);
      
      logger.warn("Warning message");
      
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(1);
      expect(spy1.mock.calls[0][0].message).toBe("Warning message");
      expect(spy2.mock.calls[0][0].message).toBe("Warning message");
      
      spy1.mockRestore();
      spy2.mockRestore();
    });

    it("should handle transport removal during active logging", () => {
      const transport1 = new ConsoleTransport();
      const transport2 = new ConsoleTransport();
      
      const spy1 = spyOn(transport1, 'log');
      const spy2 = spyOn(transport2, 'log');
      
      logger.addTransport(transport1);
      logger.addTransport(transport2);
      
      logger.info("Before removal");
      
      logger.removeTransport(transport1);
      
      logger.info("After removal");
      
      // First transport should have been called once, second twice
      expect(spy1).toHaveBeenCalledTimes(1);
      expect(spy2).toHaveBeenCalledTimes(2);
      
      spy1.mockRestore();
      spy2.mockRestore();
    });

    it("should handle clearTransports during active logging", () => {
      const transport = new ConsoleTransport();
      const spy = spyOn(transport, 'log');
      
      logger.addTransport(transport);
      logger.info("Before clear");
      
      logger.clearTransports();
      logger.info("After clear");
      
      // Transport should only receive the first message
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].message).toBe("Before clear");
      
      spy.mockRestore();
    });

    it("should handle setTransports replacement during logging", () => {
      const oldTransport = new ConsoleTransport();
      const newTransport = new ConsoleTransport();
      
      const oldSpy = spyOn(oldTransport, 'log');
      const newSpy = spyOn(newTransport, 'log');
      
      logger.addTransport(oldTransport);
      logger.info("Before replacement");
      
      logger.setTransports([newTransport]);
      logger.info("After replacement");
      
      expect(oldSpy).toHaveBeenCalledTimes(1);
      expect(newSpy).toHaveBeenCalledTimes(1);
      expect(oldSpy.mock.calls[0][0].message).toBe("Before replacement");
      expect(newSpy.mock.calls[0][0].message).toBe("After replacement");
      
      oldSpy.mockRestore();
      newSpy.mockRestore();
    });
  });

  describe("Custom Transport Support", () => {
    it("should support custom transport implementations", () => {
      const messages: any[] = [];
      
      const customTransport: Transport = {
        log: async (entry: LogEntry) => {
          messages.push({ level: entry.levelName, message: entry.message });
        }
      };
      
      logger.addTransport(customTransport);
      logger.error("Custom transport test");
      
      expect(messages).toHaveLength(1);
      expect(messages[0].level).toBe("ERROR");
      expect(messages[0].message).toBe("Custom transport test");
    });

    it("should handle custom transports with flush method", async () => {
      let flushed = false;
      
      const customTransport: Transport = {
        log: async (entry: LogEntry) => {},
        flush: async () => {
          flushed = true;
        }
      };
      
      logger.addTransport(customTransport);
      
      await logger.flushAll();
      
      expect(flushed).toBe(true);
    });

    it("should handle mix of built-in and custom transports", () => {
      const consoleTransport = new ConsoleTransport();
      const customMessages: any[] = [];
      
      const customTransport: Transport = {
        log: async (entry: LogEntry) => {
          customMessages.push(entry.message);
        }
      };
      
      const consoleSpy = spyOn(consoleTransport, 'log');
      
      // Set logger level to DEBUG to ensure debug messages are logged
      const originalLevel = logger.options?.level;
      logger.setOptions({ level: LogLevel.DEBUG });
      
      logger.addTransport(consoleTransport);
      logger.addTransport(customTransport);
      
      logger.debug("Mixed transport test");
      
      // Debug level should be logged now that LogLevel.DEBUG is enabled
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect(customMessages).toHaveLength(1);
      expect(customMessages[0]).toBe("Mixed transport test");
      
      // Restore original level
      if (originalLevel !== undefined) {
        logger.setOptions({ level: originalLevel });
      }
      
      consoleSpy.mockRestore();
    });
  });
});
