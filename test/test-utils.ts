import type { BunFile as ActualBunFile } from 'bun';
import { expect, mock } from 'bun:test';
import { statSync } from 'fs';
import type { LogEntry, Transport, TransportOptions } from '../lib/index';

// --- CONSOLE MOCKS ---
export const mockConsole = {
  log: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
};

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

// Apply console mocks globally
console.log = mockConsole.log;
console.info = mockConsole.info;
console.warn = mockConsole.warn;
console.error = mockConsole.error;
console.debug = mockConsole.debug;

// --- BUN MOCKS ---
const mockFileExistsForBunMock = mock<() => Promise<boolean>>(async () => false);
const mockFileTextForBunMock = mock<() => Promise<string>>(async () => '');
const mockBunFileInstanceWriterWriteForBunMock = mock(() => {});
const mockBunFileInstanceWriterFlushForBunMock = mock(async () => {});
const mockBunFileInstanceWriterEndForBunMock = mock(async () => {});

const mockBunFileInstanceForBunMock = {
  exists: mockFileExistsForBunMock,
  text: mockFileTextForBunMock,
  type: 'application/octet-stream',
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
  }),
} as unknown as ActualBunFile;

export const actualMockBunFileFn = mock(() => mockBunFileInstanceForBunMock);

// Create a proper mock for Bun.write that matches the expected signature
export const actualMockBunWriteFn = mock(async (_destination: any, _input: any, _options?: any) =>
  Promise.resolve(1),
) as typeof Bun.write;

export const mockFileExists = mock(async () => false);
export const mockFileText = mock(async () => '');

// Mock for Bun shell operations
export const mockShellOps = {
  mkdir: mock(async () => ({ exitCode: 0 })),
  mv: mock(async () => ({ exitCode: 0 })),
  rm: mock(async () => ({ exitCode: 0 })),
};

// Mock for 'os' module to control EOL in tests
mock.module('os', () => ({ EOL: '\n' }));

// Create a mock statSync function that returns a proper Stats object
const mockStatSyncFn = mock((_path: string | Buffer | URL) => {
  // Return a minimal mock that satisfies the Stats interface
  return {
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 123,
    ino: 1234567,
    mode: 0o644,
    nlink: 1,
    uid: 1000,
    gid: 1000,
    rdev: 0,
    size: 0, // This is the property actually used by FileTransport
    blksize: 4096,
    blocks: 0,
    atimeMs: Date.now(),
    mtimeMs: Date.now(),
    ctimeMs: Date.now(),
    birthtimeMs: Date.now(),
    atime: new Date(),
    mtime: new Date(),
    ctime: new Date(),
    birthtime: new Date(),
    // Add BigIntStats properties for compatibility
    atimeNs: BigInt(Date.now() * 1000000),
    mtimeNs: BigInt(Date.now() * 1000000),
    ctimeNs: BigInt(Date.now() * 1000000),
    birthtimeNs: BigInt(Date.now() * 1000000),
  };
}) as unknown as typeof statSync;

// Mock the 'fs' module to prevent real filesystem operations
export const mockFsOps = {
  existsSync: mock(() => true), // Always return true to avoid directory creation
  mkdirSync: mock(() => {}), // Mock directory creation
  appendFileSync: mock(() => {}), // Mock file writing
  statSync: mockStatSyncFn, // Mock file stats with proper Stats interface
  readFileSync: mock((...args: any[]) => {
    // Return string for utf8 encoding, Buffer otherwise
    const encoding = args[1];
    return encoding === 'utf8' ? '' : Buffer.from('');
  }) as typeof import('fs').readFileSync,
  writeFileSync: mock(() => {}), // Mock file writing
  renameSync: mock(() => {}), // Mock file renaming
  unlinkSync: mock(() => {}), // Mock file deletion
};

mock.module('fs', () => mockFsOps);

// Setup Bun global mocks
if (typeof globalThis.Bun === 'undefined') {
  Object.defineProperty(globalThis, 'Bun', {
    value: {
      file: actualMockBunFileFn,
      write: actualMockBunWriteFn,
      $: mock((_strings: TemplateStringsArray, ..._values: any[]) => ({
        quiet: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
      })),
    },
    writable: true,
    configurable: true,
    enumerable: true,
  });
} else {
  globalThis.Bun.file = actualMockBunFileFn;
  globalThis.Bun.write = actualMockBunWriteFn;
  (globalThis.Bun as any).$ = mock((_strings: TemplateStringsArray, ..._values: any[]) => ({
    quiet: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
  }));
}

// Bun operations mock factory
export function createMockBunOps(overrides: Partial<any> = {}) {
  return {
    file: actualMockBunFileFn,
    write: actualMockBunWriteFn,
    shell: mockShellOps,
    ...overrides,
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
      } catch (_error) {
        // Fall back to default formatting if custom formatter fails
        output = this.getFormattedOutput(entry, options);
      }
    } else {
      output = this.getFormattedOutput(entry, options);
    }

    this.logs.push(output);
  }

  private getFormattedOutput(entry: LogEntry, options?: TransportOptions): string {
    const format = options?.format || 'string';

    if (format === 'json') {
      // Use JSON format similar to ConsoleTransport
      const jsonEntry: Record<string, any> = {
        timestamp: entry.timestamp,
        level: entry.level,
        levelName: entry.levelName,
        message: entry.message,
      };

      if (entry.data && Object.keys(entry.data).length > 0) {
        jsonEntry.data = entry.data;
      }

      if (entry.args && entry.args.processedArgs && entry.args.processedArgs.length > 0) {
        jsonEntry.args = entry.args;
      }

      return JSON.stringify(jsonEntry);
    } else {
      // Use string format - match the expected format from the tests
      const parts = [`[${entry.timestamp}]`, `${entry.levelName}:`, entry.message];

      if (entry.data && Object.keys(entry.data).length > 0) {
        parts.push(JSON.stringify(entry.data));
      }

      if (entry.args && entry.args.processedArgs && entry.args.processedArgs.length > 0) {
        parts.push(
          ...entry.args.processedArgs.map(arg =>
            typeof arg === 'string' ? arg : JSON.stringify(arg),
          ),
        );
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

// Helper to create FileTransport with mocked filesystem operations
export async function createMockedFileTransport(filePath: string, rotationConfig?: any) {
  // Import FileTransport here to avoid circular imports
  const { FileTransport } = await import('../lib/transports/FileTransport');

  return new FileTransport(filePath, rotationConfig, {
    file: actualMockBunFileFn,
    write: actualMockBunWriteFn,
    appendFileSync: mockFsOps.appendFileSync,
    fs: mockFsOps,
    shell: mockShellOps,
  });
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
  // Reset fs mocks individually since some are cast to other types
  if (mockFsOps.existsSync.mockClear) {
    mockFsOps.existsSync.mockClear();
  }
  if (mockFsOps.mkdirSync.mockClear) {
    mockFsOps.mkdirSync.mockClear();
  }
  if (mockFsOps.appendFileSync.mockClear) {
    mockFsOps.appendFileSync.mockClear();
  }
  if ((mockFsOps.statSync as any).mockClear) {
    (mockFsOps.statSync as any).mockClear();
  }
  if ((mockFsOps.readFileSync as any).mockClear) {
    (mockFsOps.readFileSync as any).mockClear();
  }
  if (mockFsOps.writeFileSync.mockClear) {
    mockFsOps.writeFileSync.mockClear();
  }
  if (mockFsOps.renameSync.mockClear) {
    mockFsOps.renameSync.mockClear();
  }
  if (mockFsOps.unlinkSync.mockClear) {
    mockFsOps.unlinkSync.mockClear();
  }
  // Reset console mocks
  Object.values(mockConsole).forEach(mockFn => {
    if (mockFn.mockClear) {
      mockFn.mockClear();
    }
  });
}

// Helper to restore original console methods (for cleanup)
export function restoreConsole() {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

// Helper to verify no real files were created
export function verifyNoRealFiles() {
  expect(actualMockBunWriteFn).not.toHaveBeenCalledWith(
    expect.stringMatching(/\.log$/),
    expect.anything(),
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
