import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { logger, LogLevel, ConsoleTransport, FileTransport, DiscordWebhookTransport, type Transport, type LogEntry, type LoggerOptions } from "../lib/index";

describe("Logger flushAll", () => {
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    logger.resetOptions();
    originalConsoleError = console.error;
    console.error = mock(() => {});
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("should flush all transports that have flush method", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("test.log");
    
    const consoleSpy = spyOn(consoleTransport, 'flush').mockResolvedValue(undefined);
    const fileSpy = spyOn(fileTransport, 'flush').mockResolvedValue(undefined);
    
    logger.setOptions({
      transports: [consoleTransport, fileTransport],
      level: LogLevel.INFO
    });
    
    await logger.flushAll();
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(fileSpy).toHaveBeenCalledTimes(1);
    
    consoleSpy.mockRestore();
    fileSpy.mockRestore();
  });

  it("should handle transports without flush method gracefully", async () => {
    const customTransport: Transport = {
      log: async (_entry: LogEntry, _options: LoggerOptions) => {}
      // No flush method
    };
    
    const consoleTransport = new ConsoleTransport();
    const consoleSpy = spyOn(consoleTransport, 'flush').mockResolvedValue(undefined);
    
    logger.setOptions({
      transports: [customTransport, consoleTransport],
      level: LogLevel.INFO
    });
    
    // Should not throw even though customTransport doesn't have flush
    await expect(logger.flushAll()).resolves.toBeUndefined();
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it("should handle flush errors gracefully", async () => {
    const consoleTransport = new ConsoleTransport();
    const fileTransport = new FileTransport("test.log");
    
    const consoleSpy = spyOn(consoleTransport, 'flush').mockRejectedValue(new Error("Console flush failed"));
    const fileSpy = spyOn(fileTransport, 'flush').mockResolvedValue(undefined);
    
    logger.setOptions({
      transports: [consoleTransport, fileTransport],
      level: LogLevel.INFO
    });
    
    // Should not throw even if one transport fails to flush
    await expect(logger.flushAll()).resolves.toBeUndefined();
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(fileSpy).toHaveBeenCalledTimes(1);
    
    // Should log the error to console
    expect(console.error).toHaveBeenCalledWith(
      "Error flushing transport 'ConsoleTransport':",
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
    fileSpy.mockRestore();
  });

  it("should flush Discord webhook transport", async () => {
    // Mock fetch for Discord webhook
    const fetchMock = mock(async () => new Response(null, { status: 204 }));
    (fetchMock as any).preconnect = () => Promise.resolve();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    
    const discordTransport = new DiscordWebhookTransport("http://discord.test/webhook", {
      suppressConsoleErrors: true
    });
    const consoleTransport = new ConsoleTransport();
    
    const discordSpy = spyOn(discordTransport, 'flush').mockResolvedValue(undefined);
    const consoleSpy = spyOn(consoleTransport, 'flush').mockResolvedValue(undefined);
    
    logger.setOptions({
      transports: [discordTransport, consoleTransport],
      level: LogLevel.INFO
    });
    
    await logger.flushAll();
    
    expect(discordSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    
    discordSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("should pass logger options to flush methods", async () => {
    const consoleTransport = new ConsoleTransport();
    const consoleSpy = spyOn(consoleTransport, 'flush').mockResolvedValue(undefined);
    
    const testOptions = {
      level: LogLevel.DEBUG,
      format: "json" as const,
      useHumanReadableTime: true,
      transports: [consoleTransport]
    };
    
    logger.setOptions(testOptions);
    
    await logger.flushAll();
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(expect.objectContaining({
      level: LogLevel.DEBUG,
      format: "json",
      useHumanReadableTime: true
    }));
    
    consoleSpy.mockRestore();
  });

  it("should work with empty transports array", async () => {
    logger.setOptions({
      transports: [],
      level: LogLevel.INFO
    });
    
    // Should not throw
    await expect(logger.flushAll()).resolves.toBeUndefined();
  });

  it("should handle multiple flush errors", async () => {
    const transport1: Transport = {
      log: async () => {},
      flush: async () => { throw new Error("Flush error 1"); }
    };
    
    const transport2: Transport = {
      log: async () => {},
      flush: async () => { throw new Error("Flush error 2"); }
    };
    
    logger.setOptions({
      transports: [transport1, transport2],
      level: LogLevel.INFO
    });
    
    await expect(logger.flushAll()).resolves.toBeUndefined();
    
    // Should log both errors
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      "Error flushing transport 'Object':",
      expect.objectContaining({ message: "Flush error 1" })
    );
    expect(console.error).toHaveBeenCalledWith(
      "Error flushing transport 'Object':",
      expect.objectContaining({ message: "Flush error 2" })
    );
  });

  it("should await all flush operations concurrently", async () => {
    const flushTimes: number[] = [];
    const startTime = Date.now();
    
    const transport1: Transport = {
      log: async () => {},
      flush: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        flushTimes.push(Date.now() - startTime);
      }
    };
    
    const transport2: Transport = {
      log: async () => {},
      flush: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        flushTimes.push(Date.now() - startTime);
      }
    };
    
    logger.setOptions({
      transports: [transport1, transport2],
      level: LogLevel.INFO
    });
    
    await logger.flushAll();
    
    // Both should complete around the same time (concurrent, not sequential)
    expect(flushTimes).toHaveLength(2);
    const timeDiff = Math.abs(flushTimes[0] - flushTimes[1]);
    expect(timeDiff).toBeLessThan(30); // Should be much less than 50ms if running concurrently
  });

  it("should work with child logger flush", async () => {
    const consoleTransport = new ConsoleTransport();
    const consoleSpy = spyOn(consoleTransport, 'flush').mockResolvedValue(undefined);
    
    logger.setOptions({
      transports: [consoleTransport],
      level: LogLevel.INFO
    });
    
    const childLogger = logger.child({ messagePrefix: "[CHILD]" });
    
    // Child logger should use the same transports as parent
    await logger.flushAll();
    
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
