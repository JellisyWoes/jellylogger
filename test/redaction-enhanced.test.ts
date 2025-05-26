import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { 
  LogLevel, 
  ConsoleTransport, 
  type LogEntry,
  shouldRedactKey,
  shouldRedactValue,
  redactString,
  needsRedaction,
  redactObject,
  getRedactedEntry
} from "../lib/index";

describe("Enhanced Redaction", () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("Nested Key Path Redaction", () => {
    it("should redact nested keys using dot notation", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Nested key test",
        args: [],
        data: { 
          user: { 
            profile: { 
              email: "user@example.com",
              phone: "123-456-7890" 
            },
            password: "secret123"
          }
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keys: ["user.profile.email", "password"],
          replacement: "[DOT_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.user.profile.email).toBe("[DOT_REDACTED]");
      expect(loggedData.data.user.profile.phone).toBe("123-456-7890");
      expect(loggedData.data.user.password).toBe("[DOT_REDACTED]");
    });

    it("should redact using wildcard patterns", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Wildcard redaction test",
        args: [],
        data: { 
          user1: { token: "token1" },
          user2: { token: "token2" },
          admin: { apiKey: "adminkey" },
          config: { secretKey: "configkey" }
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keys: ["*.token", "*Key", "*key"],
          replacement: "[WILDCARD_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.user1.token).toBe("[WILDCARD_REDACTED]");
      expect(loggedData.data.user2.token).toBe("[WILDCARD_REDACTED]");
      expect(loggedData.data.admin.apiKey).toBe("[WILDCARD_REDACTED]");
      expect(loggedData.data.config.secretKey).toBe("[WILDCARD_REDACTED]");
    });

    it("should redact using double wildcard patterns", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Double wildcard test",
        args: [],
        data: { 
          deeply: { 
            nested: { 
              credentials: { 
                secret: "deep-secret" 
              } 
            } 
          }
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keys: ["**secret"],
          replacement: "[DEEP_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.deeply.nested.credentials.secret).toBe("[DEEP_REDACTED]");
    });
  });

  describe("Regex Pattern Matching", () => {
    it("should redact keys using regex patterns", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Regex pattern test",
        args: [],
        data: { 
          apiKey1: "key1",
          apiKey2: "key2",
          publicData: "safe",
          secretToken: "token123"
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keyPatterns: [/^api/i, /secret/i],
          replacement: "[REGEX_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.apiKey1).toBe("[REGEX_REDACTED]");
      expect(loggedData.data.apiKey2).toBe("[REGEX_REDACTED]");
      expect(loggedData.data.publicData).toBe("safe");
      expect(loggedData.data.secretToken).toBe("[REGEX_REDACTED]");
    });
  });

  describe("Value-Based Redaction", () => {
    it("should redact values matching patterns regardless of keys", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Value pattern test",
        args: [],
        data: { 
          id: "user_12345",
          token: "auth_67890",
          name: "john",
          email: "user@domain.com"
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          valuePatterns: [/^user_/, /^auth_/],
          replacement: "[VALUE_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.id).toBe("[VALUE_REDACTED]");
      expect(loggedData.data.token).toBe("[VALUE_REDACTED]");
      expect(loggedData.data.name).toBe("john");
      expect(loggedData.data.email).toBe("user@domain.com");
    });

    it("should only redact string values for value patterns", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Value type test",
        args: [],
        data: { 
          stringValue: "secret_123",
          numberValue: 123,
          booleanValue: true,
          objectValue: { nested: "secret_456" }
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          valuePatterns: [/^secret_/],
          replacement: "[SECRET_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.stringValue).toBe("[SECRET_REDACTED]");
      expect(loggedData.data.numberValue).toBe(123);
      expect(loggedData.data.booleanValue).toBe(true);
      expect(loggedData.data.objectValue.nested).toBe("[SECRET_REDACTED]");
    });
  });

  describe("String Redaction", () => {
    it("should redact sensitive patterns in log messages", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Processing credit card 4111-1111-1111-1111 for user",
        args: [],
        data: {}
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          redactStrings: true,
          stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g],
          replacement: "[CARD_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.message).toBe("Processing credit card [CARD_REDACTED] for user");
    });

    it("should redact sensitive patterns in string arguments", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "User authentication",
        args: ["SSN: 123-45-6789", "Phone: 555-123-4567"],
        data: {}
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          redactStrings: true,
          stringPatterns: [/\d{3}-\d{2}-\d{4}/g, /\d{3}-\d{3}-\d{4}/g],
          replacement: "[PII_REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.args[0]).toBe("SSN: [PII_REDACTED]");
      expect(loggedData.args[1]).toBe("Phone: [PII_REDACTED]");
    });

    it("should not redact strings when redactStrings is false", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Credit card 4111-1111-1111-1111 processed",
        args: [],
        data: {}
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          redactStrings: false,
          stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g],
          replacement: "[REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.message).toBe("Credit card 4111-1111-1111-1111 processed");
    });
  });

  describe("Function-Based Replacement", () => {
    it("should use function replacement for custom redaction", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Function replacement test",
        args: [],
        data: { 
          password: "secret123",
          apiKey: "key456"
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keys: ["password", "apiKey"],
          replacement: (value, key, path) => `[${key.toUpperCase()}_HIDDEN]`,
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.password).toBe("[PASSWORD_HIDDEN]");
      expect(loggedData.data.apiKey).toBe("[APIKEY_HIDDEN]");
    });

    it("should provide correct path information to replacement function", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Path information test",
        args: [],
        data: { 
          user: { 
            credentials: { 
              password: "secret" 
            } 
          }
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keys: ["password"],
          replacement: (value, key, path) => `[REDACTED@${path}]`,
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      expect(loggedData.data.user.credentials.password).toBe("[REDACTED@user.credentials.password]");
    });
  });

  describe("Performance Optimization", () => {
    it("should avoid cloning when no redaction is needed", () => {
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "No redaction needed",
        args: [],
        data: { safe: "data", public: "info" }
      };
      
      const result = getRedactedEntry(entry, {
        keys: ["password", "secret"],
        redactIn: "console"
      }, "console");
      
      // Should return the same object reference when no redaction is needed
      expect(result).toBe(entry);
    });

    it("should use needsRedaction to check before processing", () => {
      const config = {
        keys: ["password"],
        valuePatterns: [/^secret_/]
      };

      const safeData = { name: "john", id: "123" };
      const unsafeData = { name: "john", password: "secret" };
      
      expect(needsRedaction(safeData, config)).toBe(false);
      expect(needsRedaction(unsafeData, config)).toBe(true);
    });
  });

  describe("Audit Logging", () => {
    it("should log when redaction occurs if auditRedaction is enabled", () => {
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});
      
      const config = {
        keys: ["password"],
        replacement: "[AUDITED]",
        auditRedaction: true
      };

      const input = { password: "secret" };
      redactObject(input, config, '', new WeakSet());

      expect(debugSpy).toHaveBeenCalledWith(
        "[REDACTION AUDIT] Redacted key: password at path: password"
      );
      
      debugSpy.mockRestore();
    });

    it("should not log audit messages when auditRedaction is false", () => {
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});
      
      const config = {
        keys: ["password"],
        replacement: "[NOT_AUDITED]",
        auditRedaction: false
      };

      const input = { password: "secret" };
      redactObject(input, config, '', new WeakSet());

      expect(debugSpy).not.toHaveBeenCalled();
      
      debugSpy.mockRestore();
    });

    it("should not log audit messages when auditRedaction is undefined", () => {
      const debugSpy = spyOn(console, 'debug').mockImplementation(() => {});
      
      const config = {
        keys: ["password"],
        replacement: "[NOT_AUDITED]"
        // auditRedaction is undefined
      };

      const input = { password: "secret" };
      redactObject(input, config, '', new WeakSet());

      expect(debugSpy).not.toHaveBeenCalled();
      
      debugSpy.mockRestore();
    });
  });

  describe("Utility Functions", () => {
    it("shouldRedactKey should work with various patterns", () => {
      const config = {
        keys: ["password", "*.token", "user.email"],
        keyPatterns: [/^api/i],
        caseInsensitive: true
      };

      expect(shouldRedactKey("password", "password", config)).toBe(true);
      expect(shouldRedactKey("user.token", "token", config)).toBe(true);
      expect(shouldRedactKey("user.email", "email", config)).toBe(true);
      expect(shouldRedactKey("apiKey", "apiKey", config)).toBe(true);
      expect(shouldRedactKey("safe", "safe", config)).toBe(false);
    });

    it("shouldRedactValue should work with value patterns", () => {
      const config = {
        valuePatterns: [/^secret_/, /\d{4}-\d{4}-\d{4}-\d{4}/]
      };

      expect(shouldRedactValue("secret_123", config)).toBe(true);
      expect(shouldRedactValue("4111-1111-1111-1111", config)).toBe(true);
      expect(shouldRedactValue("safe_value", config)).toBe(false);
      expect(shouldRedactValue(123, config)).toBe(false);
    });

    it("redactString should replace patterns in strings", () => {
      const config = {
        redactStrings: true,
        stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g],
        replacement: "[CARD]"
      };

      const input = "Card number 4111-1111-1111-1111 is valid";
      const result = redactString(input, config);
      expect(result).toBe("Card number [CARD] is valid");
    });

    it("redactObject should handle complex nested structures", () => {
      const config = {
        keys: ["password", "user.auth.secret"], // Use full path to match nested structure
        valuePatterns: [/^token_/],
        replacement: "[COMPLEX_REDACTED]"
      };

      const input = {
        user: {
          name: "john",
          password: "secret",
          auth: {
            secret: "auth_secret"
          }
        },
        tokens: ["token_123", "safe_value"]
      };

      const result = redactObject(input, config) as {
        user: {
          name: string;
          password: string;
          auth: { secret: string };
        };
        tokens: string[];
      };
      
      expect(result.user.name).toBe("john");
      expect(result.user.password).toBe("[COMPLEX_REDACTED]");
      expect(result.user.auth.secret).toBe("[COMPLEX_REDACTED]");
      expect(result.tokens[0]).toBe("[COMPLEX_REDACTED]");
      expect(result.tokens[1]).toBe("safe_value");
    });
  });

  describe("Complex Integration Tests", () => {
    it("should handle mixed redaction rules correctly", () => {
      const consoleTransport = new ConsoleTransport();
      
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "Payment processed with card 4111-1111-1111-1111",
        args: ["User token_abc123 authenticated"],
        data: { 
          user: {
            password: "secret",
            profile: {
              creditCard: "4111-1111-1111-1111"
            }
          },
          session: {
            apiKey: "key456",
            randomToken: "token_xyz789"
          }
        }
      };
      
      consoleSpy.mockClear();
      
      consoleTransport.log(entry, {
        redaction: {
          keys: ["password", "*.apiKey"],
          keyPatterns: [/credit/i],
          valuePatterns: [/^token_/],
          redactStrings: true,
          stringPatterns: [/\d{4}-\d{4}-\d{4}-\d{4}/g, /token_[a-z0-9]+/g],
          replacement: "[REDACTED]",
          redactIn: "console"
        },
        format: "json"
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0]);
      
      // Message should have credit card redacted
      expect(loggedData.message).toBe("Payment processed with card [REDACTED]");
      
      // Args should have token redacted  
      expect(loggedData.args[0]).toBe("User [REDACTED] authenticated");
      
      // Data should have various redactions
      expect(loggedData.data.user.password).toBe("[REDACTED]");
      expect(loggedData.data.user.profile.creditCard).toBe("[REDACTED]");
      expect(loggedData.data.session.apiKey).toBe("[REDACTED]");
      expect(loggedData.data.session.randomToken).toBe("[REDACTED]");
    });
  });
});
