import "./test-utils";
import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { LogLevel, FileTransport, type LogEntry } from "../lib/index";

describe("FileTransport Error Handling", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let mockBunOps: any;

  beforeEach(() => {
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    mockBunOps = {
      file: mock(() => ({
        exists: async () => false,
        size: 0,
        text: async () => ""
      })),
      write: mock(async () => 1)
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("should handle write failures gracefully", async () => {
    mockBunOps.write = mock(async () => {
      throw new Error("Disk full");
    });

    // Disable auto-flush to prevent repeated flush attempts
    const transport = new FileTransport("error.log", undefined, mockBunOps, 0);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "Write failure test",
      args: []
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    
    // Wait a bit for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should log error to console - expect stream write error
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport stream write error:",
      expect.objectContaining({ message: "Disk full" })
    );
  });

  it("should handle file system permission errors", async () => {
    mockBunOps.write = mock(async () => {
      const error = new Error("Permission denied");
      (error as any).code = "EACCES";
      throw error;
    });

    // Disable auto-flush to prevent repeated flush attempts
    const transport = new FileTransport("restricted.log", undefined, mockBunOps, 0);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Permission test",
      args: []
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    
    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport stream write error:",
      expect.objectContaining({ code: "EACCES" })
    );
  });

  it("should handle file existence check failures", async () => {
    mockBunOps.file = mock(() => ({
      exists: async () => {
        throw new Error("Cannot access file");
      },
      size: 0,
      text: async () => ""
    }));

    const transport = new FileTransport("check-error.log", undefined, mockBunOps, 0);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "File check error test",
      args: []
    };

    // Should still write the log entry despite file check error
    await transport.log(entry, { format: "json" });
  });

  it("should handle writer creation failures", async () => {
    // Test stream creation failure by providing invalid operations
    mockBunOps.write = mock(async () => {
      throw new Error("Cannot write to file");
    });

    const transport = new FileTransport("writer-error.log", undefined, mockBunOps, 0);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Writer error test",
      args: []
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    
    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("should continue logging after temporary errors", async () => {
    let failureCount = 0;
    mockBunOps.write = mock(async (path: any, data: string) => {
      failureCount++;
      if (failureCount <= 2) {
        throw new Error("Temporary failure");
      }
      return data.length; // Succeed on third attempt
    });

    const transport = new FileTransport("recovery.log", undefined, mockBunOps, 0);
    
    // Create a fresh console spy for this test to avoid interference
    consoleErrorSpy.mockRestore(); // Clean up the beforeEach spy first
    const testErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    // Log entries sequentially and wait for each to process completely
    await transport.log({
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "First attempt",
      args: []
    }, { format: "json" });

    // Wait for the first write to complete and error to be logged
    await new Promise(resolve => setTimeout(resolve, 100));

    await transport.log({
      timestamp: "2023-01-01T12:01:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Second attempt",
      args: []
    }, { format: "json" });

    // Wait for the second write to complete and error to be logged
    await new Promise(resolve => setTimeout(resolve, 100));

    await transport.log({
      timestamp: "2023-01-01T12:02:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Third attempt",
      args: []
    }, { format: "json" });

    // Wait for the third write to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the expected behavior
    expect(testErrorSpy).toHaveBeenCalledWith(
      "FileTransport stream write error:",
      expect.objectContaining({ message: "Temporary failure" })
    );
    expect(testErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    
    // The mock should have been called 3 times total
    expect(mockBunOps.write).toHaveBeenCalledTimes(3);
    
    testErrorSpy.mockRestore();
    // Restore the original spy for other tests
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  it("should handle buffer overflow gracefully", async () => {
    // Mock a scenario where writes fail initially
    let callCount = 0;
    mockBunOps.write = mock(async () => {
      callCount++;
      if (callCount <= 5) {
        throw new Error("Buffer overflow");
      }
      return 1;
    });

    const transport = new FileTransport("buffer.log", undefined, mockBunOps, 0);

    // Create a fresh console spy for this test
    consoleErrorSpy.mockRestore(); // Clean up the beforeEach spy first
    const testErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    // Log entries sequentially to control error timing better
    const entries = Array.from({ length: 5 }, (_, i) => ({
      timestamp: `2023-01-01T12:${i.toString().padStart(2, '0')}:00.000Z`,
      level: LogLevel.INFO,
      levelName: "INFO",
      message: `Buffer test ${i}`,
      args: []
    }));

    // Log entries one by one with small delays to ensure proper error handling
    for (const entry of entries) {
      await transport.log(entry, { format: "json" });
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    
    // Wait for final async error handling
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have at least 5 errors from failed stream writes
    // (may have more due to auto-flush or retry mechanisms)
    expect(testErrorSpy).toHaveBeenCalledWith(
      "FileTransport stream write error:",
      expect.objectContaining({ message: "Buffer overflow" })
    );
    expect(testErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
    
    testErrorSpy.mockRestore();
    // Restore the original spy for other tests
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  it("should handle corrupted file scenarios", async () => {
    mockBunOps.file = mock(() => ({
      exists: async () => true,
      size: 1000,
      text: async () => {
        throw new Error("File corrupted");
      }
    }));

    const transport = new FileTransport("corrupted.log", undefined, mockBunOps, 0);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Corrupted file test",
      args: []
    };

    // Should handle gracefully and continue logging (no size-based rotation needed)
    await transport.log(entry, { format: "json" });
  });
});