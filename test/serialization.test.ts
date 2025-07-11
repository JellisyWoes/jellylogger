import { describe, expect, it } from 'bun:test';
import {
  processLogArgs,
  safeJsonStringify,
  safeStringify,
  serializeError,
} from '../lib/utils/serialization';

describe('Serialization Utilities', () => {
  describe('safeStringify', () => {
    it('should stringify basic types', () => {
      expect(safeStringify('string')).toBe('string');
      expect(safeStringify(123)).toBe('123');
      expect(safeStringify(true)).toBe('true');
      expect(safeStringify(null)).toBe('null');
      expect(safeStringify(undefined)).toBe('undefined');
    });

    it('should handle objects', () => {
      const obj = { key: 'value', number: 42 };
      const result = safeStringify(obj);
      expect(result).toBe('{"key":"value","number":42}');
    });

    it('should handle circular references', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      const result = safeStringify(obj);
      expect(result).toContain('[Circular Reference]');
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('safeJsonStringify', () => {
    it('should create valid JSON for basic objects', () => {
      const obj = {
        string: 'value',
        number: 42,
        boolean: true,
        nullValue: null,
        array: [1, 2, 3],
      };

      const result = safeJsonStringify(obj);
      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);
      expect(parsed.string).toBe('value');
      expect(parsed.number).toBe(42);
      expect(parsed.boolean).toBe(true);
      expect(parsed.nullValue).toBe(null);
      expect(parsed.array).toEqual([1, 2, 3]);
    });

    it('should handle circular references in JSON', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      const result = safeJsonStringify(obj);
      expect(() => JSON.parse(result)).not.toThrow();

      const parsed = JSON.parse(result);
      expect(parsed.name).toBe('test');
      expect(parsed.self).toBe('[Circular Reference]');
    });
  });

  describe('processLogArgs', () => {
    it('should process basic arguments', () => {
      const args = ['string', 123, true, null];
      const result = processLogArgs(args);

      expect(result.processedArgs).toEqual(args);
      expect(result.hasComplexArgs).toBe(false);
    });

    it('should detect complex arguments', () => {
      const args = ['string', { key: 'value' }, [1, 2, 3]];
      const result = processLogArgs(args);

      expect(result.processedArgs).toHaveLength(3);
      expect(result.hasComplexArgs).toBe(true);
    });
  });

  describe('serializeError', () => {
    it('should serialize basic error properties', () => {
      const error = new Error('Test message');
      error.stack = 'Error: Test message\n    at test';

      const result = serializeError(error);

      expect(result.name).toBe('Error');
      expect(result.message).toBe('Test message');
      expect(result.stack).toContain('Error: Test message');
    });
  });
});
