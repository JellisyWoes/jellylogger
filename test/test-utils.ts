// --- START BUN MOCK DEFINITION ---
// This must be absolutely at the top, before any other imports that might touch 'bun' or its mocks.
import { mock, spyOn } from "bun:test"; // Import mock separately for early use if needed by definitions
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

const _internalMockBunFileFn = mock(() => mockBunFileInstanceForBunMock);
const _internalMockBunWriteFn = mock(async (_path: string | ActualBunFile | URL | number, _data: any) => { return Promise.resolve(1); }); // Default to resolve successfully

mock.module('bun', () => {
  return {
    file: _internalMockBunFileFn,
    write: _internalMockBunWriteFn,
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

// Mock console methods globally for all tests
export const infoSpy = spyOn(console, 'info').mockImplementation(() => {});
export const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
export const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
export const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

// Utility functions for creating and restoring console spies (centralized)
export function spyConsoleInfo() {
  const spy = spyOn(console, 'info').mockImplementation(() => {});
  return () => spy.mockRestore();
}
export function spyConsoleWarn() {
  const spy = spyOn(console, 'warn').mockImplementation(() => {});
  return () => spy.mockRestore();
}
export function spyConsoleError() {
  const spy = spyOn(console, 'error').mockImplementation(() => {});
  return () => spy.mockRestore();
}
export function spyConsoleDebug() {
  const spy = spyOn(console, 'debug').mockImplementation(() => {});
  return () => spy.mockRestore();
}

// Mock Bun file operations for testing
export const mockBunFileFn = mock(() => ({
  exists: async () => true,
  text: async () => "",
  size: 0,
} as any));

export const mockBunWriteFn = mock(async () => 1);

export const actualMockBunWriteFn = mockBunWriteFn;
export const actualMockBunFileFn = mockBunFileFn;

export const mockFileExists = mock(async () => true);
export const mockFileText = mock(async () => "");

// Global setup - use Object.defineProperty to avoid readonly issues
if (typeof globalThis.Bun === 'undefined') {
  Object.defineProperty(globalThis, 'Bun', {
    value: {
      file: mockBunFileFn,
      write: mockBunWriteFn,
    },
    writable: true,
    configurable: true
  });
} else {
  // If Bun already exists, just override the methods we need
  globalThis.Bun.file = mockBunFileFn;
  globalThis.Bun.write = mockBunWriteFn;
}
