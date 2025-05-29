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

    const transport = new FileTransport("error.log", undefined, mockBunOps);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "Write failure test",
      args: []
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    
    // flush() should not throw even if there were previous errors
    await transport.flush();

    // Should log error to console
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
      expect.objectContaining({ message: "Disk full" })
    );
  });

  it("should handle file system permission errors", async () => {
    mockBunOps.write = mock(async () => {
      const error = new Error("Permission denied");
      (error as any).code = "EACCES";
      throw error;
    });

    const transport = new FileTransport("restricted.log", undefined, mockBunOps);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Permission test",
      args: []
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    await transport.flush();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "FileTransport write error:",
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

    const transport = new FileTransport("check-error.log", undefined, mockBunOps);
    
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
    // Since we're not using writer() in the updated implementation,
    // test a different failure scenario
    mockBunOps.file = mock(() => ({
      exists: async () => false,
      size: 0,
      text: async () => ""
    }));

    mockBunOps.write = mock(async () => {
      throw new Error("Cannot write to file");
    });

    const transport = new FileTransport("writer-error.log", undefined, mockBunOps);
    
    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Writer error test",
      args: []
    };

    // Should not throw but log error to console
    await transport.log(entry, { format: "json" });
    await transport.flush();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("should continue logging after temporary errors", async () => {
    let failureCount = 0;
    mockBunOps.write = mock(async (path: string, data: string) => {
      failureCount++;
      if (failureCount <= 2) {
        throw new Error("Temporary failure");
      }
      return data.length; // Succeed on third attempt
    });

    const transport = new FileTransport("recovery.log", undefined, mockBunOps);
    
    // First two should not throw but log errors
    await transport.log({
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "First attempt",
      args: []
    }, { format: "json" });

    await transport.log({
      timestamp: "2023-01-01T12:01:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Second attempt",
      args: []
    }, { format: "json" });

    // Third should succeed
    await transport.log({
      timestamp: "2023-01-01T12:02:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Third attempt",
      args: []
    }, { format: "json" });

    await transport.flush();

    // Should have logged 4 errors (2 from failed writes, 2 more from flush attempts)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(4);
    expect(mockBunOps.write).toHaveBeenCalledTimes(3);
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

    const transport = new FileTransport("buffer.log", undefined, mockBunOps);

    // Log entries that will fail initially - should not throw
    const promises = Array.from({ length: 5 }, (_, i) =>
      transport.log({
        timestamp: `2023-01-01T12:${i.toString().padStart(2, '0')}:00.000Z`,
        level: LogLevel.INFO,
        levelName: "INFO",
        message: `Buffer test ${i}`,
        args: []
      }, { format: "json" })
    );

    // All should complete without throwing (errors logged to console)
    await Promise.all(promises);
    
    await transport.flush();

    // Should have logged 10 errors (5 from failed writes, 5 more from flush attempts)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(10);
  });

  it("should handle corrupted file scenarios", async () => {
    mockBunOps.file = mock(() => ({
      exists: async () => true,
      size: 1000,
      text: async () => {
        throw new Error("File corrupted");
      }
    }));

    const transport = new FileTransport("corrupted.log", undefined, mockBunOps);
    
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
