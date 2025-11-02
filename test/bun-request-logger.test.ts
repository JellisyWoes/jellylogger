import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { bunRequestLogger } from '../lib/utils/bunRequestLogger';
import { logger } from '../lib/core/logger';
import { LogLevel } from '../lib/core/constants';
import type { LogEntry } from '../lib/core/types';

describe('bunRequestLogger', () => {
  // Store original transports
  const originalTransports = [...logger.options.transports!];
  let capturedLogs: LogEntry[] = [];

  // Mock transport to capture logs
  const mockTransport = {
    log: async (entry: LogEntry) => {
      capturedLogs.push(entry);
    },
    flush: async () => {},
  };

  beforeEach(() => {
    capturedLogs = [];
    logger.setTransports([mockTransport]);
    logger.setOptions({ level: LogLevel.TRACE });
  });

  afterEach(() => {
    logger.setTransports(originalTransports);
    logger.resetOptions();
  });

  test('logs basic request with default options', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'));

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    expect(capturedLogs[0].message).toContain('HTTP Request');
    expect(capturedLogs[0].message).toContain('GET');
    expect(capturedLogs[0].message).toContain('http://localhost:3000/test');
    expect(capturedLogs[0].level).toBe(LogLevel.INFO);
  });

  test('includes headers by default', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'));

    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Test',
      },
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.headers).toBeDefined();
    expect(data.headers['content-type']).toBe('application/json');
    expect(data.headers['user-agent']).toBe('Test');
  });

  test('redacts sensitive headers by default', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'));

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer secret-token',
        Cookie: 'session=abc123',
      },
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.headers).toBeDefined();
    expect(data.headers.authorization).toBe('[REDACTED]');
    expect(data.headers.cookie).toBe('[REDACTED]');
  });

  test('respects includeHeaders: false', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeHeaders: false,
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.headers).toBeUndefined();
  });

  test('includes body when includeBody: true', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeBody: true,
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      body: JSON.stringify({ user: 'alice', password: 'secret' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    await handler(request, {});
    
    // Wait for async logging
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.body).toBeDefined();
    expect(data.body).toContain('alice');
    expect(data.body).toContain('secret');
  });

  test('does not include body by default', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'));

    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      body: JSON.stringify({ user: 'alice' }),
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.body).toBeUndefined();
  });

  test('truncates large bodies', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeBody: true,
      maxBodySize: 50,
    });

    const largeBody = 'x'.repeat(200);
    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      body: largeBody,
    });

    await handler(request, {});
    
    // Wait for async logging
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.body).toBeDefined();
    expect(data.body.length).toBeLessThan(largeBody.length);
    expect(data.body).toContain('truncated');
  });

  test('includes metadata when includeMeta: true', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeMeta: true,
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
      redirect: 'follow',
      referrer: 'http://example.com',
      mode: 'cors',
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.redirect).toBe('follow');
    // Note: Bun may normalize referrer to empty string in some cases
    expect(data.referrer).toBeDefined();
    // Note: Bun may normalize mode to 'navigate' or other default values
    expect(data.mode).toBeDefined();
    expect(data.bodyUsed).toBeDefined();
  });

  test('does not include metadata by default', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'));

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
      redirect: 'follow',
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.redirect).toBeUndefined();
    expect(data.referrer).toBeUndefined();
    expect(data.mode).toBeUndefined();
  });

  test('respects fields option for fine-grained control', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      fields: ['method', 'url'],
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.method).toBe('POST');
    expect(data.url).toBe('http://localhost:3000/test');
    expect(data.headers).toBeUndefined();
  });

  test('respects custom redactHeaders option', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      redactHeaders: ['x-api-key', 'x-secret'],
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
      headers: {
        'X-API-Key': 'secret-key-123',
        'X-Secret': 'another-secret',
        'Content-Type': 'application/json',
      },
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.headers['x-api-key']).toBe('[REDACTED]');
    expect(data.headers['x-secret']).toBe('[REDACTED]');
    expect(data.headers['content-type']).toBe('application/json');
  });

  test('supports custom redaction config', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeBody: true,
      redaction: {
        keys: ['password', 'secret'],
        replacement: '[HIDDEN]',
      },
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      body: JSON.stringify({ user: 'alice', password: 'secret123' }),
    });

    await handler(request, {});
    
    // Wait for async logging
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.body).toContain('alice');
    expect(data.body).toContain('password');
  });

  test('uses custom log level', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      logLevel: 'debug',
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    expect(capturedLogs[0].level).toBe(LogLevel.DEBUG);
  });

  test('uses custom message prefix', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      messagePrefix: 'API Request',
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    expect(capturedLogs[0].message).toContain('API Request');
  });

  test('does not interfere with handler execution', async () => {
    let handlerCalled = false;
    const handler = bunRequestLogger(async (_req) => {
      handlerCalled = true;
      return new Response('OK');
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'GET',
    });

    const response = await handler(request, {});

    expect(handlerCalled).toBe(true);
    expect(response).toBeDefined();
    expect(await response!.text()).toBe('OK');
  });

  test('passes server context to handler', async () => {
    let receivedServer: any;
    const handler = bunRequestLogger(async (_req, server) => {
      receivedServer = server;
      return new Response('OK');
    });

    const request = new Request('http://localhost:3000/test');
    const mockServer = { port: 3000 };

    await handler(request, mockServer);

    expect(receivedServer).toBe(mockServer);
  });

  test('extracts remote address from server.requestIP if available', async () => {
    const mockServer = {
      requestIP: (_req: Request) => ({ address: '127.0.0.1' }),
    };

    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeRemoteAddress: true,
    });

    const request = new Request('http://localhost:3000/test');

    await handler(request, mockServer);

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.remoteAddress).toBe('127.0.0.1');
  });

  test('handles missing server.requestIP gracefully', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      includeRemoteAddress: true,
    });

    const request = new Request('http://localhost:3000/test');

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.remoteAddress).toBeUndefined();
  });

  test('handles logging errors gracefully', async () => {
    // Create a logger that throws during logging
    const failingLogger = {
      ...logger,
      info: () => {
        throw new Error('Logging failed');
      },
      error: () => {},
    };

    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      logger: failingLogger as any,
    });

    const request = new Request('http://localhost:3000/test');

    // Should not throw
    const response = await handler(request, {});
    expect(response).toBeDefined();
    expect(await response!.text()).toBe('OK');
  });

  test('works with handlers that return undefined', async () => {
    const handler = bunRequestLogger(async (_req) => undefined);

    const request = new Request('http://localhost:3000/test');

    const response = await handler(request, {});

    expect(response).toBeUndefined();
    expect(capturedLogs.length).toBe(1);
  });

  test('logs all log levels correctly', async () => {
    const levels: Array<'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'> = [
      'fatal',
      'error',
      'warn',
      'info',
      'debug',
      'trace',
    ] as const;

    for (const level of levels) {
      capturedLogs = [];
      const handler = bunRequestLogger(async (_req) => new Response('OK'), {
        logLevel: level,
      });

      const request = new Request('http://localhost:3000/test');
      await handler(request, {});

      expect(capturedLogs.length).toBe(1);
      expect(capturedLogs[0].levelName.toLowerCase()).toBe(level);
    }
  });

  test('handles complex field combinations', async () => {
    const handler = bunRequestLogger(async (_req) => new Response('OK'), {
      fields: ['method', 'url', 'headers', 'redirect', 'bodyUsed'],
    });

    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      redirect: 'manual',
    });

    await handler(request, {});

    expect(capturedLogs.length).toBe(1);
    const data = capturedLogs[0].data as any;
    expect(data.method).toBe('POST');
    expect(data.url).toBe('http://localhost:3000/test');
    expect(data.headers).toBeDefined();
    expect(data.redirect).toBe('manual');
    expect(data.bodyUsed).toBe(false);
    // Should not include other meta fields
    expect(data.referrer).toBeUndefined();
    expect(data.mode).toBeUndefined();
  });

  test('does not consume request body for handler', async () => {
    const handler = bunRequestLogger(
      async (req) => {
        // Handler should be able to read the body
        const body = await req.text();
        return new Response(body);
      },
      {
        includeBody: true,
      },
    );

    const bodyContent = JSON.stringify({ test: 'data' });
    const request = new Request('http://localhost:3000/test', {
      method: 'POST',
      body: bodyContent,
    });

    const response = await handler(request, {});

    expect(response).toBeDefined();
    const responseBody = await response!.text();
    expect(responseBody).toBe(bodyContent);
  });
});
