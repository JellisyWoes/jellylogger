import "./test-utils";
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { LogLevel, FileTransport, type LogEntry } from "../lib/index";
import { resetAllMocks } from "./test-utils";

describe("FileTransport Error Handling", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let mockBunWrite: any;
  let mockBunFile: any;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    resetAllMocks();

    // Create mock functions for Bun operations
    mockBunWrite = mock(async (_destination: any, _input: any, _options?: any) => {
      throw new Error("Mocked write operation - should not create files");
    });
    
    mockBunFile = mock((_path: string) => ({
      exists: async () => false,
      size: 0,
      text: async () => "",
      writer: () => ({
        write: mock(() => {}),
        flush: mock(async () => {}),
        end: mock(async () => {})
      })
    }));

    // Patch Bun.write and Bun.file directly (do not reassign globalThis.Bun)
    if (typeof Bun !== "undefined") {
      // @ts-ignore
      Bun.write = mockBunWrite;
      // @ts-ignore
      Bun.file = mockBunFile;
    }
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    resetAllMocks();
  });

  it("should handle write failures gracefully", async () => {
    const appendFileSync = mock(() => {
      throw new Error("Disk full");
    });

    const transport = new FileTransport("error.log", undefined, {
      appendFileSync
    });
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "Write failure test",
      args: { processedArgs: [], hasComplexArgs: false }
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    await transport.flush();
    
    // Wait a bit for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should log error to console - expect write error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ message: "Disk full" })
    );
    
    // Verify fs operation was attempted
    expect(appendFileSync).toHaveBeenCalled();
  });

  it("should handle file system permission errors", async () => {
    const appendFileSync = mock(() => {
      const error = new Error("Permission denied");
      (error as any).code = "EACCES";
      throw error;
    });

    const transport = new FileTransport("restricted.log", undefined, {
      appendFileSync
    });
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Permission test",
      args: { processedArgs: [], hasComplexArgs: false }
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    await transport.flush();
    
    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ code: "EACCES" })
    );
  });

  it("should handle file existence check failures", async () => {
    // FileTransport doesn't use Bun.file for basic logging operations
    // It only uses fs operations which we've already mocked
    const appendFileSync = mock(() => {
      throw new Error("Cannot write to file");
    });

    const transport = new FileTransport("check-error.log", undefined, {
      appendFileSync
    });
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "File check error test",
      args: { processedArgs: [], hasComplexArgs: false }
    };

    // Should still attempt to write despite file check error
    await transport.log(entry, { format: "json" });
    
    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify that write was attempted and failed
    expect(appendFileSync).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ message: "Cannot write to file" })
    );
  });

  it("should handle writer creation failures", async () => {
    const appendFileSync = mock(() => {
      throw new Error("Cannot write to file");
    });

    const transport = new FileTransport("writer-error.log", undefined, {
      appendFileSync
    });
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Writer error test",
      args: { processedArgs: [], hasComplexArgs: false }
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    await transport.flush();
    
    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(appendFileSync).toHaveBeenCalled();
  });

  it("should continue logging after temporary errors", async () => {
    let failureCount = 0;
    const appendFileSync = mock(() => {
      failureCount++;
      if (failureCount <= 2) {
        throw new Error("Temporary failure");
      }
      // Succeed on third attempt
    });

    const transport = new FileTransport("recovery.log", undefined, {
      appendFileSync
    });
    
    // Create a fresh console spy for this test
    consoleErrorSpy.mockRestore();
    const testErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    // Log entries sequentially
    await transport.log({
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "First attempt",
      args: { processedArgs: [], hasComplexArgs: false }
    }, { format: "json" });
    await transport.flush();

    await new Promise(resolve => setTimeout(resolve, 100));

    await transport.log({
      timestamp: "2023-01-01T12:01:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Second attempt",
      args: { processedArgs: [], hasComplexArgs: false }
    }, { format: "json" });
    await transport.flush();

    await new Promise(resolve => setTimeout(resolve, 100));

    await transport.log({
      timestamp: "2023-01-01T12:02:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Third attempt",
      args: { processedArgs: [], hasComplexArgs: false }
    }, { format: "json" });
    await transport.flush();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the expected behavior
    expect(testErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ message: "Temporary failure" })
    );
    expect(testErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    
    // The mock should have been called 3 times total
    expect(appendFileSync).toHaveBeenCalledTimes(3);
    
    testErrorSpy.mockRestore();
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  it("should handle buffer overflow gracefully", async () => {
    let callCount = 0;
    const appendFileSync = mock(() => {
      callCount++;
      if (callCount <= 5) {
        throw new Error("Buffer overflow");
      }
    });

    const transport = new FileTransport("buffer.log", undefined, {
      appendFileSync
    });

    consoleErrorSpy.mockRestore();
    const testErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const entries = Array.from({ length: 5 }, (_, i) => ({
      timestamp: `2023-01-01T12:${i.toString().padStart(2, '0')}:00.000Z`,
      level: LogLevel.INFO,
      levelName: "INFO",
      message: `Buffer test ${i}`,
      args: { processedArgs: [], hasComplexArgs: false }
    }));

    // Log entries one by one with delays
    for (const entry of entries) {
      await transport.log(entry, { format: "json" });
      await transport.flush();
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have at least 5 errors from failed writes
    expect(testErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ message: "Buffer overflow" })
    );
    expect(testErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
    
    testErrorSpy.mockRestore();
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  it("should handle corrupted file scenarios", async () => {
    // FileTransport primarily uses fs operations for basic logging
    // We should test error handling in the fs operations instead
    const appendFileSync = mock(() => {
      throw new Error("File corrupted - cannot append");
    });

    const transport = new FileTransport("corrupted.log", undefined, {
      appendFileSync
    });
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Corrupted file test",
      args: { processedArgs: [], hasComplexArgs: false }
    };

    // Should handle gracefully and continue logging
    await transport.log(entry, { format: "json" });
    
    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify that the error was handled gracefully
    expect(appendFileSync).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ message: "File corrupted - cannot append" })
    );
  });
});