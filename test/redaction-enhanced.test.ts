import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  ConsoleTransport,
  type LogEntry,
  LogLevel,
  redactLogEntry,
  redactObject,
  redactString,
  shouldRedactKey,
  shouldRedactValue,
} from '../lib/index';
import './test-utils'; // Import mocks first

describe('Enhanced Redaction', () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Nested Key Path Redaction', () => {
    it('should redact nested keys using dot notation', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Nested key test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          user: {
            profile: {
              email: 'user@example.com',
              phone: '123-456-7890',
            },
            password: 'secret123',
          },
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          keys: ['user.profile.email', 'password'],
          replacement: '[DOT_REDACTED]',
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.user.profile.email).toBe('[DOT_REDACTED]');
      expect(loggedData.data.user.profile.phone).toBe('123-456-7890');
      expect(loggedData.data.user.password).toBe('[DOT_REDACTED]');
    });

    it('should redact using wildcard patterns', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Wildcard redaction test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          user1: { token: 'token1' },
          user2: { token: 'token2' },
          admin: { apiKey: 'adminkey' },
          config: { secretKey: 'configkey' },
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          keys: ['*.token', '*Key', '*key'],
          replacement: '[WILDCARD_REDACTED]',
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.user1.token).toBe('[WILDCARD_REDACTED]');
      expect(loggedData.data.user2.token).toBe('[WILDCARD_REDACTED]');
      expect(loggedData.data.admin.apiKey).toBe('[WILDCARD_REDACTED]');
      expect(loggedData.data.config.secretKey).toBe('[WILDCARD_REDACTED]');
    });

    it('should redact using double wildcard patterns', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Double wildcard test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          deeply: {
            nested: {
              credentials: {
                secret: 'deep-secret',
              },
            },
          },
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          keys: ['**secret'],
          replacement: '[DEEP_REDACTED]',
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.deeply.nested.credentials.secret).toBe('[DEEP_REDACTED]');
    });
  });

  describe('Whitelist Support', () => {
    it('should not redact whitelisted keys', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Whitelist test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          password: 'secret1',
          adminPassword: 'secret2',
          token: 'token1',
          publicToken: 'token2',
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          keys: ['*password', '*token'],
          whitelist: ['adminPassword', 'publicToken'],
          replacement: '[REDACTED]',
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.password).toBe('[REDACTED]');
      expect(loggedData.data.adminPassword).toBe('secret2'); // Whitelisted
      expect(loggedData.data.token).toBe('[REDACTED]');
      expect(loggedData.data.publicToken).toBe('token2'); // Whitelisted
    });

    it('should support regex whitelist patterns', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Regex whitelist test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          password: 'secret1',
          publicPassword: 'secret2',
          token: 'token1',
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          keys: ['password', 'token'],
          whitelistPatterns: [/^public/],
          replacement: '[REDACTED]',
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.password).toBe('[REDACTED]');
      expect(loggedData.data.publicPassword).toBe('secret2'); // Matches whitelist pattern
      expect(loggedData.data.token).toBe('[REDACTED]');
    });
  });

  describe('Custom Redactors', () => {
    it('should use custom redactor function', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Custom redactor test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          password: 'secret123',
          apiKey: 'key456',
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          customRedactor: (value, context) => {
            if (context.key === 'password') {
              return '[CUSTOM_PASSWORD]';
            }
            if (context.key === 'apiKey') {
              return `[CUSTOM_${String(value).toUpperCase()}]`;
            }
            return value;
          },
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.password).toBe('[CUSTOM_PASSWORD]');
      expect(loggedData.data.apiKey).toBe('[CUSTOM_KEY456]');
    });

    it('should use field-specific custom redactors', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Field config test',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          password: 'secret123',
          token: 'abc456',
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          fieldConfigs: {
            password: {
              customRedactor: (value, context) => `[FIELD_PWD_${context.key}]`,
            },
            token: {
              replacement: '[FIELD_TOKEN]',
            },
          },
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.password).toBe('[FIELD_PWD_password]');
      expect(loggedData.data.token).toBe('[FIELD_TOKEN]');
    });
  });

  describe('Enhanced Audit System', () => {
    it('should trigger custom audit hooks', () => {
      const auditEvents: any[] = [];
      const auditHook = (event: any) => {
        auditEvents.push(event);
      };

      const config = {
        keys: ['password'],
        replacement: '[AUDITED]',
        auditHook,
      };

      const input = { password: 'secret' };
      redactObject(input, config, { key: '', path: '', field: '' });

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].type).toBe('key');
      expect(auditEvents[0].context.key).toBe('password');
      expect(auditEvents[0].before).toBe('secret');
      expect(auditEvents[0].after).toBe('[AUDITED]');
    });

    it('should handle audit hook errors gracefully', () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

      const config = {
        keys: ['password'],
        replacement: '[AUDITED]',
        auditHook: () => {
          throw new Error('Audit error');
        },
      };

      const input = { password: 'secret' };

      // Should not throw
      expect(() => redactObject(input, config, { key: '', path: '', field: '' })).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        '[REDACTION AUDIT] Error in audit hook:',
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });
  });

  describe('Audit Logging', () => {
    it('should log when redaction occurs if auditRedaction is enabled', () => {
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      const config = {
        keys: ['password'],
        replacement: '[AUDITED]',
        auditRedaction: true,
      };

      const input = { password: 'secret' };
      redactObject(input, config, { key: '', path: '', field: '' });

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[REDACTION AUDIT]'),
        expect.any(Object),
      );

      debugSpy.mockRestore();
    });

    it('should not log audit messages when auditRedaction is false', () => {
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      const config = {
        keys: ['password'],
        replacement: '[NOT_AUDITED]',
        auditRedaction: false,
      };

      const input = { password: 'secret' };
      redactObject(input, config, { key: '', path: '', field: '' });

      expect(debugSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
    });

    it('should not log audit messages when auditRedaction is undefined', () => {
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});

      const config = {
        keys: ['password'],
        replacement: '[NOT_AUDITED]',
        // auditRedaction is undefined
      };

      const input = { password: 'secret' };
      redactObject(input, config, { key: '', path: '', field: '' });

      expect(debugSpy).not.toHaveBeenCalled();

      debugSpy.mockRestore();
    });
  });

  describe('Utility Functions', () => {
    it('shouldRedactKey should work with various patterns', () => {
      const config = {
        keys: ['password', '*.token', 'user.email'],
        keyPatterns: [/^api/i],
        caseInsensitive: true,
      };

      expect(shouldRedactKey('password', 'password', config)).toBe(true);
      expect(shouldRedactKey('user.token', 'token', config)).toBe(true);
      expect(shouldRedactKey('user.email', 'email', config)).toBe(true);
      expect(shouldRedactKey('apiKey', 'apiKey', config)).toBe(true);
      expect(shouldRedactKey('safe', 'safe', config)).toBe(false);
    });

    it('shouldRedactValue should work with value patterns', () => {
      const config = {
        valuePatterns: [/^secret_/, /\d{4}-\d{4}-\d{4}-\d{4}/],
      };

      expect(shouldRedactValue('secret_123', config)).toBe(true);
      expect(shouldRedactValue('4111-1111-1111-1111', config)).toBe(true);
      expect(shouldRedactValue('safe_value', config)).toBe(false);
      expect(shouldRedactValue(123, config)).toBe(false);
    });

    it('redactString should replace patterns in strings', () => {
      const config = {
        redactStrings: true,
        stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g],
        replacement: '[CARD]',
      };

      const input = 'Card number 4111-1111-1111-1111 is valid';
      const result = redactString(input, config);
      expect(result).toBe('Card number [CARD] is valid');
    });

    it('redactString should work with enhanced context', () => {
      const config = {
        redactStrings: true,
        stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g],
        replacement: (value: any, context: any) => `[CARD_${context.field}]`,
      };

      const context = { key: '', path: 'message', field: 'message', originalValue: '' };
      const input = 'Card number 4111-1111-1111-1111 is valid';
      const result = redactString(input, config, context);
      expect(result).toBe('Card number [CARD_message] is valid');
    });

    it('redactLogEntry should be the unified API', () => {
      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Test unified API',
        args: { processedArgs: [], hasComplexArgs: false },
        data: {
          password: 'secret',
          custom: 'data',
        },
      };

      const config = {
        fields: ['data'],
        keys: ['password'],
        replacement: '[UNIFIED_REDACTED]',
      };

      const result = redactLogEntry(entry, config);

      expect(result.data!.password).toBe('[UNIFIED_REDACTED]');
      expect(result.data!.custom).toBe('data');
    });

    it('should target specific fields for redaction', () => {
      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Test field targeting',
        args: [{ password: 'arg_secret' }],
        data: { password: 'data_secret' },
        custom: { password: 'custom_secret' },
      } as any;

      const config = {
        fields: ['data'], // Only target data field
        keys: ['password'],
        replacement: '[FIELD_REDACTED]',
      };

      const result = redactLogEntry(entry, config);

      expect(result.data!.password).toBe('[FIELD_REDACTED]');
      expect((result.args![0] as any).password).toBe('arg_secret'); // Not targeted
      expect((result as any).custom.password).toBe('custom_secret'); // Not targeted
    });

    it('redactObject should handle complex nested structures', () => {
      const config = {
        keys: ['password', 'user.auth.secret'], // Use full path to match nested structure
        valuePatterns: [/^token_/],
        replacement: '[COMPLEX_REDACTED]',
      };

      const input = {
        user: {
          name: 'john',
          password: 'secret',
          auth: {
            secret: 'auth_secret',
          },
        },
        tokens: ['token_123', 'safe_value'],
      };

      const result = redactObject(input, config) as {
        user: {
          name: string;
          password: string;
          auth: { secret: string };
        };
        tokens: string[];
      };

      expect(result.user.name).toBe('john');
      expect(result.user.password).toBe('[COMPLEX_REDACTED]');
      expect(result.user.auth.secret).toBe('[COMPLEX_REDACTED]');
      expect(result.tokens[0]).toBe('[COMPLEX_REDACTED]');
      expect(result.tokens[1]).toBe('safe_value');
    });
  });

  describe('Complex Integration Tests', () => {
    it('should handle mixed redaction rules correctly', () => {
      const consoleTransport = new ConsoleTransport();

      const entry: LogEntry = {
        timestamp: '2023-01-01T12:00:00.000Z',
        level: LogLevel.INFO,
        levelName: 'INFO',
        message: 'Payment processed with card 4111-1111-1111-1111',
        args: { processedArgs: ['User token_abc123 authenticated'], hasComplexArgs: false },
        data: {
          user: {
            password: 'secret',
            profile: {
              creditCard: '4111-1111-1111-1111',
            },
          },
          session: {
            apiKey: 'key456',
            randomToken: 'token_xyz789',
          },
        },
      };

      consoleSpy.mockClear();

      consoleTransport.log(entry, {
        redaction: {
          keys: ['password', '*.apiKey'],
          keyPatterns: [/credit/i],
          valuePatterns: [/^token_/],
          redactStrings: true,
          stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g, /token_[a-z0-9]+/g],
          replacement: '[REDACTED]',
          redactIn: 'console',
        },
        format: 'json',
      });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);

      // Message should have credit card redacted
      expect(loggedData.message).toBe('Payment processed with card [REDACTED]');

      // Args should have token redacted
      expect(loggedData.args.processedArgs[0]).toBe('User [REDACTED] authenticated');

      // Data should have various redactions
      expect(loggedData.data.user.password).toBe('[REDACTED]');
      expect(loggedData.data.user.profile.creditCard).toBe('[REDACTED]');
      expect(loggedData.data.session.apiKey).toBe('[REDACTED]');
      expect(loggedData.data.session.randomToken).toBe('[REDACTED]');
    });
  });
});
