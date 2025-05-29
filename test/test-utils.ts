import { mock, expect } from "bun:test";
import type { BunFile as ActualBunFile } from "bun";
import type { Transport, LogEntry, TransportOptions } from "../lib/index";

// --- BUN MOCKS ---
const mockFileExistsForBunMock = mock<() => Promise<boolean>>(async () => false);
const mockFileTextForBunMock = mock<() => Promise<string>>(async () => "");
const mockBunFileInstanceWriterWriteForBunMock = mock(() => {});
const mockBunFileInstanceWriterFlushForBunMock = mock(async () => {});
const mockBunFileInstanceWriterEndForBunMock = mock(async () => {});

const mockBunFileInstanceForBunMock = {
  exists: mockFileExistsForBunMock,
  text: mockFileTextForBunMock,
  type: "application/octet-stream",
  size: 0,
  lastModified: 0,
  arrayBuffer: async () => new ArrayBuffer(0),
  slice: () => new Blob(),
  stream: () => new ReadableStream(),
  json: async () => ({}),
  writer: () => ({
    write: mockBunFileInstanceWriterWriteForBunMock,
    flush: mockBunFileInstanceWriterFlushForBunMock,
    end: mockBunFileInstanceWriterEndForBunMock,
  })
} as unknown as ActualBunFile;

export const actualMockBunFileFn = mock(() => mockBunFileInstanceForBunMock);

// Create a proper mock for Bun.write that matches the expected signature
export const actualMockBunWriteFn = mock(
  async (
    destination: any,
    input: any,
    _options?: any
  ) => Promise.resolve(1)
) as typeof Bun.write;

export const mockFileExists = mock(async () => false);
export const mockFileText = mock(async () => "");

// Mock for Bun shell operations
export const mockShellOps = {
  mkdir: mock(async () => ({ exitCode: 0 })),
  mv: mock(async () => ({ exitCode: 0 })),
  rm: mock(async () => ({ exitCode: 0 }))
};

// Mock for 'os' module to control EOL in tests
mock.module('os', () => ({ EOL: '\n' }));

// Setup Bun global mocks
if (typeof globalThis.Bun === 'undefined') {
  Object.defineProperty(globalThis, 'Bun', {
    value: {
      file: actualMockBunFileFn,
      write: actualMockBunWriteFn,
      $: mock((_strings: TemplateStringsArray, ..._values: any[]) => ({
        quiet: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      })),
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
} else {
  globalThis.Bun.file = actualMockBunFileFn;
  globalThis.Bun.write = actualMockBunWriteFn;
  (globalThis.Bun as any).$ = mock((strings: TemplateStringsArray, ...values: any[]) => ({
    quiet: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
  }));
}

// Bun operations mock factory
export function createMockBunOps(overrides: Partial<any> = {}) {
  return {
    file: actualMockBunFileFn,
    write: actualMockBunWriteFn,
    shell: mockShellOps,
    ...overrides
  };
}

// Memory-based transport for integration tests
export class MemoryTransport implements Transport {
  logs: string[] = [];

  async log(entry: LogEntry, options?: TransportOptions): Promise<void> {
    let output: string;
    
    if (options?.formatter) {
      try {
        const formatted = options.formatter(entry);
        output = typeof formatted === 'string' ? formatted : JSON.stringify(formatted);
      } catch (error) {
        // Fall back to default formatting if custom formatter fails
        output = this.getFormattedOutput(entry, options);
      }
    } else {
      output = this.getFormattedOutput(entry, options);
    }
    
    this.logs.push(output);
  }

  private getFormattedOutput(entry: LogEntry, options?: TransportOptions): string {
    const format = options?.format || "string";
    
    if (format === "json") {
      // Use JSON format similar to ConsoleTransport
      const jsonEntry: Record<string, any> = {
        timestamp: entry.timestamp,
        level: entry.level,
        levelName: entry.levelName,
        message: entry.message
      };
      
      if (entry.data && Object.keys(entry.data).length > 0) {
        jsonEntry.data = entry.data;
      }
      
      if (entry.args && entry.args.length > 0) {
        jsonEntry.args = entry.args;
      }
      
      return JSON.stringify(jsonEntry);
    } else {
      // Use string format - match the expected format from the tests
      const parts = [
        `[${entry.timestamp}]`,
        `${entry.levelName}:`,
        entry.message
      ];
      
      if (entry.data && Object.keys(entry.data).length > 0) {
        parts.push(JSON.stringify(entry.data));
      }
      
      if (entry.args && entry.args.length > 0) {
        parts.push(...entry.args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)));
      }
      
      return parts.join(' ');
    }
  }

  async flush(): Promise<void> {
    // Memory transport doesn't need flushing, but return resolved promise for consistency
    return Promise.resolve();
  }

  clear(): void {
    this.logs = [];
  }
}

// Helper to reset all mocks
export function resetAllMocks() {
  if ((actualMockBunFileFn as any).mockClear) {
    (actualMockBunFileFn as any).mockClear();
  }
  if ((actualMockBunWriteFn as any).mockClear) {
    (actualMockBunWriteFn as any).mockClear();
  }
  if (mockFileExists.mockClear) {
    mockFileExists.mockClear();
  }
  if (mockFileText.mockClear) {
    mockFileText.mockClear();
  }
  if (mockShellOps.mkdir.mockClear) {
    mockShellOps.mkdir.mockClear();
  }
  if (mockShellOps.mv.mockClear) {
    mockShellOps.mv.mockClear();
  }
  if (mockShellOps.rm.mockClear) {
    mockShellOps.rm.mockClear();
  }
}

// Helper to verify no real files were created
export function verifyNoRealFiles() {
  expect(actualMockBunWriteFn).not.toHaveBeenCalledWith(
    expect.stringMatching(/\.log$/),
    expect.anything()
  );
}

// Global setup to prevent any accidental real file operations
(globalThis as any).bunFileMock = actualMockBunFileFn;
(globalThis as any).bunWriteMock = actualMockBunWriteFn;

// Override any potential real Bun operations in test environment
if (typeof Bun !== 'undefined') {
  const originalFile = Bun.file;
  const originalWrite = Bun.write;

  // Store originals for potential restoration
  (globalThis as any).__originalBunFile = originalFile;
  (globalThis as any).__originalBunWrite = originalWrite;

  // Replace with mocks during tests
  Bun.file = actualMockBunFileFn as any;
  Bun.write = actualMockBunWriteFn as any;
}
