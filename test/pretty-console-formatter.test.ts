/**
 * Tests for PrettyConsoleFormatter
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { PrettyConsoleFormatter } from '../lib/formatters/PrettyConsoleFormatter';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry } from '../lib/core/types';
import { processLogArgs, getTimestamp } from '../lib/utils/serialization';

describe('PrettyConsoleFormatter', () => {
  let formatter: PrettyConsoleFormatter;
  
  beforeEach(() => {
    formatter = new PrettyConsoleFormatter();
  });

  // Helper function to create a log entry
  function createLogEntry(
    level: LogLevel, 
    message: string, 
    args: unknown[] = [], 
    data?: Record<string, unknown>
  ): LogEntry {
    return {
      timestamp: getTimestamp(false),
      level,
      levelName: LogLevel[level] || 'UNKNOWN',
      message,
      args: processLogArgs(args),
      data
    };
  }

  test('formats basic log entry without colors', () => {
    const entry = createLogEntry(LogLevel.INFO, 'Test message');
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('Test message');
    expect(result).toContain('INFO');
    expect(result).toContain('Message:');
    expect(result).toContain('─'); // separator line
  });

  test('formats log entry with structured data', () => {
    const entry = createLogEntry(
      LogLevel.INFO, 
      'User action', 
      [], 
      { 
        userId: 12345, 
        action: 'login',
        metadata: {
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0'
        }
      }
    );
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('Data:');
    expect(result).toContain('userId');
    expect(result).toContain('12345');
    expect(result).toContain('metadata');
    expect(result).toContain('ip');
    expect(result).toContain('192.168.1.1');
  });

  test('formats log entry with arguments', () => {
    const entry = createLogEntry(
      LogLevel.ERROR, 
      'Error occurred', 
      [
        'Error details',
        { errorCode: 500, message: 'Internal server error' },
        new Error('Test error')
      ]
    );
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('Arguments:');
    expect(result).toContain('1. [string]');
    expect(result).toContain('2. [object[2]]');
    expect(result).toContain('3. [error]');
    expect(result).toContain('Error details');
    expect(result).toContain('errorCode');
    expect(result).toContain('Internal server error');
  });

  test('handles different data types correctly', () => {
    const entry = createLogEntry(
      LogLevel.DEBUG, 
      'Type test', 
      [
        null,
        undefined,
        42,
        true,
        'string value',
        [1, 2, 3],
        new Date('2025-01-01'),
        { nested: { deep: 'value' } }
      ]
    );
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('[null]');
    expect(result).toContain('[undefined]');
    expect(result).toContain('[number]');
    expect(result).toContain('[boolean]');
    expect(result).toContain('[string]');
    expect(result).toContain('[array[3]]');
    expect(result).toContain('[date]');
    expect(result).toContain('[object[1]]');
  });

  test('wraps long messages correctly', () => {
    const longMessage = 'This is a very long message that should be wrapped across multiple lines when it exceeds the maximum line length configuration of the formatter.';
    const entry = createLogEntry(LogLevel.WARN, longMessage);
    
    const result = formatter.format(entry, { useColors: false });
    
    // Should contain the message broken across multiple lines
    const lines = result.split('\n');
    const messageLines = lines.filter(line => line.trim() && !line.includes('─') && !line.includes('Message:') && !line.includes('['));
    
    expect(messageLines.length).toBeGreaterThan(1);
    expect(messageLines.every(line => line.length <= 82)).toBe(true); // 80 + 2 for indentation
  });

  test('handles nested objects with proper indentation', () => {
    const entry = createLogEntry(
      LogLevel.INFO, 
      'Nested data test', 
      [], 
      {
        level1: {
          level2: {
            level3: {
              deepValue: 'found it!'
            }
          },
          siblingValue: 'also here'
        }
      }
    );
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('level1');
    expect(result).toContain('level2');
    expect(result).toContain('level3');
    expect(result).toContain('deepValue');
    expect(result).toContain('found it!');
    expect(result).toContain('siblingValue');
    
    // Check indentation increases for nested levels
    const lines = result.split('\n');
    const level1Line = lines.find(line => line.includes('level1:'));
    const level2Line = lines.find(line => line.includes('level2:'));
    const level3Line = lines.find(line => line.includes('level3:'));
    
    expect(level1Line).toBeDefined();
    expect(level2Line).toBeDefined();
    expect(level3Line).toBeDefined();
    
    // Each level should have more indentation
    const getIndentLevel = (line: string) => (line.match(/^ */)?.[0].length || 0);
    
    if (level1Line && level2Line && level3Line) {
      expect(getIndentLevel(level2Line)).toBeGreaterThan(getIndentLevel(level1Line));
      expect(getIndentLevel(level3Line)).toBeGreaterThan(getIndentLevel(level2Line));
    }
  });

  test('handles arrays properly', () => {
    const entry = createLogEntry(
      LogLevel.INFO, 
      'Array test', 
      [], 
      {
        items: [
          'first item',
          { id: 1, name: 'Object item' },
          [1, 2, 3],
          null
        ]
      }
    );
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('items: [array[4]]');
    expect(result).toContain('0: [string] first item');
    expect(result).toContain('1: [object[2]]');
    expect(result).toContain('2: [array[3]]');
    expect(result).toContain('3: [null]');
  });

  test('handles Error objects correctly', () => {
    const error = new Error('Test error message');
    error.name = 'CustomError';
    
    const entry = createLogEntry(LogLevel.ERROR, 'Error test', [error]);
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('[error]');
    expect(result).toContain('name');
    expect(result).toContain('CustomError');
    expect(result).toContain('message');
    expect(result).toContain('Test error message');
    expect(result).toContain('stack');
  });

  test('handles empty data and arguments', () => {
    const entry = createLogEntry(LogLevel.INFO, 'Empty test');
    
    const result = formatter.format(entry, { useColors: false });
    
    expect(result).toContain('Message:');
    expect(result).toContain('Empty test');
    expect(result).not.toContain('Data:');
    expect(result).not.toContain('Arguments:');
  });

  test('respects custom configuration options', () => {
    const customFormatter = new PrettyConsoleFormatter({ 
      indentSize: 4, 
      maxLineLength: 60 
    });
    
    const entry = createLogEntry(
      LogLevel.INFO, 
      'Configuration test', 
      [], 
      { key: 'value' }
    );
    
    const result = customFormatter.format(entry, { useColors: false });
    
    // Should use 4-space indentation
    const lines = result.split('\n');
    const dataLines = lines.filter(line => line.includes('key:'));
    
    if (dataLines.length > 0) {
      expect(dataLines[0]).toMatch(/^    /); // 4 spaces for first level
    }
    
    // Should respect shorter line length for separators
    const separatorLines = lines.filter(line => line.includes('─'));
    separatorLines.forEach(line => {
      expect(line.trim().length).toBeLessThanOrEqual(60);
    });
  });

  test('produces multi-line output for complex entries', () => {
    const entry = createLogEntry(
      LogLevel.INFO, 
      'Complex entry test', 
      [
        'argument 1',
        { arg2: 'value' }
      ], 
      {
        user: { id: 123, name: 'John' },
        request: { method: 'POST', url: '/api/users' }
      }
    );
    
    const result = formatter.format(entry, { useColors: false });
    const lines = result.split('\n');
    
    // Should be significantly more lines than a single-line formatter
    expect(lines.length).toBeGreaterThan(10);
    
    // Should contain all major sections
    expect(result).toContain('Message:');
    expect(result).toContain('Data:');
    expect(result).toContain('Arguments:');
    
    // Should have separators
    expect(lines.filter(line => line.includes('─')).length).toBeGreaterThanOrEqual(2);
  });
});
