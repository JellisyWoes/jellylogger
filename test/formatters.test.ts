import { beforeEach, describe, expect, it } from 'bun:test';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry } from '../lib/core/types';
import {
  BUILT_IN_FORMATTERS,
  createFormatter,
  DEFAULT_FORMATTER,
  LogfmtFormatter,
  NdjsonFormatter,
} from '../lib/formatters';
import './test-utils';

describe('Built-in Formatters', () => {
  const sampleEntry: LogEntry = {
    timestamp: '2023-01-01T12:00:00.000Z',
    level: LogLevel.INFO,
    levelName: 'INFO',
    message: 'Test message',
    args: { processedArgs: ['arg1', 42, { key: 'value' }], hasComplexArgs: true },
    data: {
      userId: '123',
      action: 'login',
      nested: { deeply: { value: 'test' } },
    },
  };

  describe('LogfmtFormatter', () => {
    let formatter: LogfmtFormatter;

    beforeEach(() => {
      formatter = new LogfmtFormatter();
    });

    it('should format basic log entry in logfmt style', () => {
      const result = formatter.format(sampleEntry);

      expect(result).toContain('ts=2023-01-01T12:00:00.000Z');
      expect(result).toContain('level=info');
      expect(result).toContain('msg="Test message"');
      expect(result).toContain('userId="123"');
      expect(result).toContain('action="login"');
    });

    it('should handle args in logfmt format', () => {
      const result = formatter.format(sampleEntry);

      expect(result).toContain('arg0="arg1"');
      expect(result).toContain('arg1="42"');
      expect(result).toContain('arg2="{\\"key\\":\\"value\\"}"');
    });

    it('should handle nested data objects', () => {
      const result = formatter.format(sampleEntry);

      expect(result).toContain('nested="{\\"deeply\\":{\\"value\\":\\"test\\"}}"');
    });

    it('should apply colors when useColors is true', () => {
      const result = formatter.format(sampleEntry, {
        useColors: true,
        consoleColors: {
          info: '#00ff00',
          dim: '#888888',
          bold: '#ffffff',
          reset: '\x1b[0m',
        },
      });

      // Should contain ANSI color codes
      expect(result).toMatch(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m'));
    });

    it('should escape quotes in message and values', () => {
      const entryWithQuotes: LogEntry = {
        ...sampleEntry,
        message: 'Message with "quotes"',
        data: { key: 'Value with "quotes"' },
      };

      const result = formatter.format(entryWithQuotes);

      expect(result).toContain('msg="Message with \\"quotes\\""');
      expect(result).toContain('key="Value with \\"quotes\\""');
    });

    it('should handle entry with no data or args', () => {
      const simpleEntry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.ERROR,
        levelName: 'ERROR',
        message: 'Simple message',
        args: { processedArgs: [], hasComplexArgs: false },
      };

      const result = formatter.format(simpleEntry);

      expect(result).toBe('ts=2023-01-01T12:00:00.000Z level=error msg="Simple message"');
    });

    it('should handle different log levels', () => {
      const levels = [
        { level: LogLevel.FATAL, name: 'FATAL' },
        { level: LogLevel.ERROR, name: 'ERROR' },
        { level: LogLevel.WARN, name: 'WARN' },
        { level: LogLevel.INFO, name: 'INFO' },
        { level: LogLevel.DEBUG, name: 'DEBUG' },
        { level: LogLevel.TRACE, name: 'TRACE' },
      ];

      levels.forEach(({ level, name }) => {
        const entry: LogEntry = {
          ...sampleEntry,
          level,
          levelName: name,
        };

        const result = formatter.format(entry);
        expect(result).toContain(`level=${name.toLowerCase()}`);
      });
    });
  });

  describe('NdjsonFormatter', () => {
    let formatter: NdjsonFormatter;

    beforeEach(() => {
      formatter = new NdjsonFormatter();
    });

    it('should format log entry as valid JSON', () => {
      const result = formatter.format(sampleEntry);

      const parsed = JSON.parse(result);
      expect(parsed.timestamp).toBe('2023-01-01T12:00:00.000Z');
      expect(parsed.level).toBe('info');
      expect(parsed.message).toBe('Test message');
      expect(parsed.userId).toBe('123');
      expect(parsed.action).toBe('login');
    });

    it('should include args when present', () => {
      const result = formatter.format(sampleEntry);

      const parsed = JSON.parse(result);
      expect(parsed.args).toBeDefined();
      expect(parsed.args.processedArgs).toEqual(['arg1', 42, { key: 'value' }]);
      expect(parsed.args.hasComplexArgs).toBe(true);
    });

    it('should not include args when empty', () => {
      const entryNoArgs: LogEntry = {
        ...sampleEntry,
        args: { processedArgs: [], hasComplexArgs: false },
      };

      const result = formatter.format(entryNoArgs);

      const parsed = JSON.parse(result);
      expect(parsed.args).toBeUndefined();
    });

    it('should flatten data into root level', () => {
      const result = formatter.format(sampleEntry);

      const parsed = JSON.parse(result);
      expect(parsed.userId).toBe('123');
      expect(parsed.action).toBe('login');
      expect(parsed.nested).toEqual({ deeply: { value: 'test' } });
    });

    it('should apply JSON colorization when colors enabled', () => {
      const result = formatter.format(sampleEntry, {
        useColors: true,
        consoleColors: {
          info: '#00ff00',
          dim: '#888888',
          bold: '#ffffff',
          reset: '\x1b[0m',
        },
      });

      // Should contain ANSI color codes for JSON highlighting
      expect(result).toMatch(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m'));
      expect(result).toContain('"level":"info"');
      expect(result).toContain('"message":"Test message"');
    });

    it('should handle circular references safely', () => {
      const circularData: any = { name: 'test' };
      circularData.self = circularData;

      const entryWithCircular: LogEntry = {
        ...sampleEntry,
        data: circularData,
      };

      const result = formatter.format(entryWithCircular);

      // Should not throw and should produce valid JSON
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('test');
      // The self property should be replaced with circular reference marker
      expect(typeof parsed.self === 'string' || typeof parsed.self === 'object').toBe(true);
    });

    it('should handle different log levels with colorization', () => {
      const errorEntry: LogEntry = {
        ...sampleEntry,
        level: LogLevel.ERROR,
        levelName: 'ERROR',
      };

      const result = formatter.format(errorEntry, {
        useColors: true,
        consoleColors: {
          error: '#ff0000',
          dim: '#888888',
          bold: '#ffffff',
          reset: '\x1b[0m',
        },
      });

      expect(result).toContain('"level":"error"');
      expect(result).toMatch(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m'));
    });
  });

  describe('Formatter Registry', () => {
    it('should export all built-in formatters', () => {
      expect(BUILT_IN_FORMATTERS.default).toBeDefined();
      expect(BUILT_IN_FORMATTERS.logfmt).toBeDefined();
      expect(BUILT_IN_FORMATTERS.ndjson).toBeDefined();
    });

    it('should create formatters by name', () => {
      const defaultFormatter = createFormatter('default');
      const logfmtFormatter = createFormatter('logfmt');
      const ndjsonFormatter = createFormatter('ndjson');

      expect(defaultFormatter).toBeDefined();
      expect(logfmtFormatter).toBeInstanceOf(LogfmtFormatter);
      expect(ndjsonFormatter).toBeInstanceOf(NdjsonFormatter);
    });

    it('should provide default formatter instance', () => {
      expect(DEFAULT_FORMATTER).toBeDefined();

      const result = DEFAULT_FORMATTER.format(sampleEntry);
      expect(result).toContain('[2023-01-01T12:00:00.000Z]');
      expect(result).toContain('INFO :');
      expect(result).toContain('Test message');
    });

    it('should handle formatter creation for all available types', () => {
      const formatterNames = Object.keys(BUILT_IN_FORMATTERS) as Array<
        keyof typeof BUILT_IN_FORMATTERS
      >;

      formatterNames.forEach(name => {
        const formatter = createFormatter(name);
        expect(formatter).toBeDefined();
        expect(typeof formatter.format).toBe('function');

        // Test that it can format a basic entry
        const result = formatter.format(sampleEntry);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Formatter Integration', () => {
    it('should handle special characters and unicode', () => {
      const unicodeEntry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Unicode test: 🚀 emoji and special chars: <>"\'&',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          unicode: '测试中文',
          emoji: '🎉🔥💻',
          special: "<script>alert('xss')</script>",
        },
      };

      const logfmtResult = new LogfmtFormatter().format(unicodeEntry);
      const ndjsonResult = new NdjsonFormatter().format(unicodeEntry);

      // Both should handle unicode safely
      expect(logfmtResult).toContain('🚀');
      expect(logfmtResult).toContain('测试中文');

      expect(() => JSON.parse(ndjsonResult)).not.toThrow();
      const parsed = JSON.parse(ndjsonResult);
      expect(parsed.unicode).toBe('测试中文');
      expect(parsed.emoji).toBe('🎉🔥💻');
    });

    it('should handle very large objects', () => {
      const largeData: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`field${i}`] = `value${i}`.repeat(10);
      }

      const largeEntry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Large data test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: largeData,
      };

      // Should not throw for any formatter
      expect(() => new LogfmtFormatter().format(largeEntry)).not.toThrow();
      expect(() => new NdjsonFormatter().format(largeEntry)).not.toThrow();
      expect(() => DEFAULT_FORMATTER.format(largeEntry)).not.toThrow();
    });
  });
});
