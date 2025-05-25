// --- START BUN MOCK DEFINITION ---
// This must be absolutely at the top, before any other imports that might touch 'bun' or its mocks.
import { mock } from "bun:test"; // Import mock separately for early use if needed by definitions
import type { BunFile as ActualBunFile } from "bun"; // Type import for mock instance

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

const actualMockBunFileFn = mock(() => mockBunFileInstanceForBunMock);
const actualMockBunWriteFn = mock(async (_path: string | ActualBunFile | URL | number, _data: any) => { return Promise.resolve(1); }); // Default to resolve successfully

mock.module('bun', () => {
  return {
    file: actualMockBunFileFn,
    write: actualMockBunWriteFn,
    color: (text: string, style?: string) => style ? `[color:${style}]${text}[/color]` : text,
    // Minimal mock: if Bun.env or other things are needed, they must be added here.
    // For this logger, it seems these are the primary Bun APIs used.
  };
});

// Mock for 'os' module to control EOL in tests
mock.module('os', () => {
  return {
    EOL: '\n', // Force EOL to be '\n' for consistent test results
  };
});
// --- END BUN MOCK DEFINITION ---

export {
  actualMockBunFileFn,
  actualMockBunWriteFn,
  mockFileExistsForBunMock as mockFileExists,
  mockFileTextForBunMock as mockFileText,
  mockBunFileInstanceWriterWriteForBunMock,
  mockBunFileInstanceWriterFlushForBunMock,
  mockBunFileInstanceWriterEndForBunMock
};
