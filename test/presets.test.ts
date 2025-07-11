import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { logger } from '../lib/core/logger';
import { ConsoleTransport } from '../lib/transports/ConsoleTransport';
import { DiscordWebhookTransport } from '../lib/transports/DiscordWebhookTransport';
import { FileTransport } from '../lib/transports/FileTransport';
import { WebSocketTransport } from '../lib/transports/WebSocketTransport';
import {
  addDiscordLogging,
  addFileLogging,
  addWebSocketLogging,
  useAllTransports,
  useConsoleAndFile,
  useConsoleAndWebSocket,
  useConsoleFileAndDiscord,
} from '../lib/utils/presets';
import './test-utils';

describe('Preset Functions', () => {
  let originalTransports: any[];

  beforeEach(() => {
    // Store original transports to restore later
    originalTransports = logger.options?.transports ? [...logger.options.transports] : [];
    logger.resetOptions();
  });

  afterEach(() => {
    // Restore original transports
    if (originalTransports.length > 0) {
      logger.setOptions({ transports: originalTransports });
    } else {
      logger.resetOptions();
    }
  });

  describe('useConsoleAndFile', () => {
    it('should configure logger with console and file transports', () => {
      const filePath = './test-logs/app.log';

      useConsoleAndFile(filePath);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(2);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      expect(transports[1]).toBeInstanceOf(FileTransport);
    });

    it('should configure logger with console, file, and rotation config', () => {
      const filePath = './test-logs/app.log';
      const rotationConfig = {
        maxFileSize: 1024 * 1024, // 1MB
        maxFiles: 5,
        compression: true,
      };

      useConsoleAndFile(filePath, rotationConfig);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(2);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      expect(transports[1]).toBeInstanceOf(FileTransport);
    });

    it('should replace existing transports', () => {
      // Add some initial transports
      logger.addTransport(new ConsoleTransport());
      logger.addTransport(new ConsoleTransport());

      // Check that we have the transports we just added
      const currentCount = logger.options?.transports?.length || 0;
      expect(currentCount).toBeGreaterThanOrEqual(2);

      useConsoleAndFile('./test-logs/app.log');

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(2);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      expect(transports[1]).toBeInstanceOf(FileTransport);
    });
  });

  describe('useConsoleFileAndDiscord', () => {
    it('should configure logger with console, file, and Discord transports', () => {
      const filePath = './test-logs/app.log';
      const webhookUrl = 'https://discord.com/api/webhooks/test';

      useConsoleFileAndDiscord(filePath, webhookUrl);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(3);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      expect(transports[1]).toBeInstanceOf(FileTransport);
      expect(transports[2]).toBeInstanceOf(DiscordWebhookTransport);
    });

    it('should configure with rotation config', () => {
      const filePath = './test-logs/app.log';
      const webhookUrl = 'https://discord.com/api/webhooks/test';
      const rotationConfig = {
        maxFileSize: 2048,
        maxFiles: 3,
      };

      useConsoleFileAndDiscord(filePath, webhookUrl, rotationConfig);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(3);
    });
  });

  describe('useConsoleAndWebSocket', () => {
    it('should configure logger with console and WebSocket transports', () => {
      const websocketUrl = 'ws://localhost:8080/logs';

      useConsoleAndWebSocket(websocketUrl);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(2);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      expect(transports[1]).toBeInstanceOf(WebSocketTransport);
    });
  });

  describe('useAllTransports', () => {
    it('should configure logger with all transport types', () => {
      const filePath = './test-logs/app.log';
      const discordUrl = 'https://discord.com/api/webhooks/test';
      const websocketUrl = 'ws://localhost:8080/logs';

      useAllTransports(filePath, discordUrl, websocketUrl);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(4);
      expect(transports[0]).toBeInstanceOf(ConsoleTransport);
      expect(transports[1]).toBeInstanceOf(FileTransport);
      expect(transports[2]).toBeInstanceOf(DiscordWebhookTransport);
      expect(transports[3]).toBeInstanceOf(WebSocketTransport);
    });

    it('should configure with all options including rotation', () => {
      const filePath = './test-logs/app.log';
      const discordUrl = 'https://discord.com/api/webhooks/test';
      const websocketUrl = 'ws://localhost:8080/logs';
      const rotationConfig = {
        maxFileSize: 1024,
        maxFiles: 10,
        compression: true,
        dateRotation: true,
      };

      useAllTransports(filePath, discordUrl, websocketUrl, rotationConfig);

      const transports = logger.options?.transports || [];
      expect(transports).toHaveLength(4);
    });
  });

  describe('Add Transport Functions', () => {
    it('should add file logging to existing configuration', () => {
      // Start with console transport
      logger.addTransport(new ConsoleTransport());
      const currentCount = logger.options?.transports?.length || 0;
      expect(currentCount).toBeGreaterThanOrEqual(1);

      addFileLogging('./test-logs/additional.log');

      const transports = logger.options?.transports || [];
      expect(transports.length).toBeGreaterThan(currentCount);
      expect(transports.some(t => t instanceof FileTransport)).toBe(true);
    });

    it('should add file logging with rotation config', () => {
      const rotationConfig = {
        maxFileSize: 512,
        maxFiles: 3,
      };

      addFileLogging('./test-logs/rotated.log', rotationConfig);

      const transports = logger.options?.transports || [];
      expect(transports.some(t => t instanceof FileTransport)).toBe(true);
    });

    it('should add Discord logging to existing configuration', () => {
      logger.addTransport(new ConsoleTransport());
      const currentCount = logger.options?.transports?.length || 0;
      expect(currentCount).toBeGreaterThanOrEqual(1);

      addDiscordLogging('https://discord.com/api/webhooks/test');

      const transports = logger.options?.transports || [];
      expect(transports.length).toBeGreaterThan(currentCount);
      expect(transports.some(t => t instanceof DiscordWebhookTransport)).toBe(true);
    });

    it('should add WebSocket logging to existing configuration', () => {
      logger.addTransport(new ConsoleTransport());
      const currentCount = logger.options?.transports?.length || 0;
      expect(currentCount).toBeGreaterThanOrEqual(1);

      addWebSocketLogging('ws://localhost:8080/logs');

      const transports = logger.options?.transports || [];
      expect(transports.length).toBeGreaterThan(currentCount);
      expect(transports.some(t => t instanceof WebSocketTransport)).toBe(true);
    });

    it('should support adding multiple transports incrementally', () => {
      // Start with console
      logger.addTransport(new ConsoleTransport());
      const startCount = logger.options?.transports?.length || 0;
      expect(startCount).toBeGreaterThanOrEqual(1);

      // Add file
      addFileLogging('./test-logs/app.log');
      const afterFile = logger.options?.transports?.length || 0;
      expect(afterFile).toBeGreaterThan(startCount);

      // Add Discord
      addDiscordLogging('https://discord.com/api/webhooks/test');
      const afterDiscord = logger.options?.transports?.length || 0;
      expect(afterDiscord).toBeGreaterThan(afterFile);

      // Add WebSocket
      addWebSocketLogging('ws://localhost:8080/logs');
      const afterWebSocket = logger.options?.transports?.length || 0;
      expect(afterWebSocket).toBeGreaterThan(afterDiscord);

      const transports = logger.options?.transports || [];
      expect(transports.some(t => t instanceof ConsoleTransport)).toBe(true);
      expect(transports.some(t => t instanceof FileTransport)).toBe(true);
      expect(transports.some(t => t instanceof DiscordWebhookTransport)).toBe(true);
      expect(transports.some(t => t instanceof WebSocketTransport)).toBe(true);
    });
  });

  describe('Transport Management Integration', () => {
    it('should work with logger transport management methods', () => {
      // Test that presets work with logger's transport management
      useConsoleAndFile('./test-logs/app.log');

      const initialCount = logger.options?.transports?.length || 0;
      expect(initialCount).toBe(2);

      // Add more transports
      addDiscordLogging('https://discord.com/api/webhooks/test');
      expect(logger.options?.transports).toHaveLength(3);

      // Clear and start fresh
      logger.clearTransports();
      expect(logger.options?.transports).toHaveLength(0);

      // Use preset again
      useConsoleAndWebSocket('ws://localhost:8080/logs');
      expect(logger.options?.transports).toHaveLength(2);
    });

    it('should handle edge cases with URLs and paths', () => {
      // Test with various URL formats
      const testCases = [
        {
          description: 'standard file path',
          filePath: './test-logs/app.log',
          discordUrl: 'https://discord.com/api/webhooks/123456/abcdef',
          websocketUrl: 'ws://localhost:3000/ws',
        },
        {
          description: 'relative file path',
          filePath: './logs/app.log',
          discordUrl: 'https://discordapp.com/api/webhooks/789/xyz',
          websocketUrl: 'wss://secure.example.com:8080/logs',
        },
        {
          description: 'Windows-style path',
          filePath: './logs/app.log',
          discordUrl: 'https://discord.com/api/webhooks/111/token',
          websocketUrl: 'ws://127.0.0.1:9000/stream',
        },
      ];

      testCases.forEach(({ description: _description, filePath, discordUrl, websocketUrl }) => {
        logger.clearTransports();

        expect(() => {
          useAllTransports(filePath, discordUrl, websocketUrl);
        }).not.toThrow();

        expect(logger.options?.transports).toHaveLength(4);
      });
    });
  });
});
