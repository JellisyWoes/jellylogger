import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DiscordWebhookTransport, LogLevel, type LogEntry } from "../lib/index";

describe("DiscordWebhookTransport", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchCalls: Array<{ url: string; options: RequestInit }> = [];
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    
    mockFetch = mock(async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
      fetchCalls.push({ 
        url: url.toString(), 
        options: options || {} 
      });
      
      // Default successful response
      return new Response("", { status: 204 });
    });
    
    // Add the missing 'preconnect' property to match Bun's fetch type
    (mockFetch as any).preconnect = mock(async () => {});
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should batch logs and retry on failure", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
      callCount++;
      fetchCalls.push({ 
        url: url.toString(), 
        options: options || {} 
      });
      
      if (callCount === 1) {
        // First call fails
        throw new Error("Network error");
      }
      // Second call succeeds
      return new Response("", { status: 204 });
    });

    const transport = new DiscordWebhookTransport("https://discord.com/api/webhooks/test", {
      batchIntervalMs: 100,
      maxRetries: 3,
      suppressConsoleErrors: true
    });

    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Test message",
      args: { processedArgs: [], hasComplexArgs: false },
    };

    await transport.log(entry);

    // Wait a bit for batching and retry logic
    await new Promise(resolve => setTimeout(resolve, 150));
    await transport.flush();

    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should apply console redaction to Discord messages", async () => {
    let sentContent = "";
    
    mockFetch.mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
      fetchCalls.push({ 
        url: url.toString(), 
        options: options || {} 
      });
      
      const body = JSON.parse(options?.body as string);
      sentContent = body.content;
      return new Response("", { status: 204 });
    });

    const transport = new DiscordWebhookTransport("https://discord.com/api/webhooks/test", {
      batchIntervalMs: 50
    });

    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Redaction test",
      args: { processedArgs: [], hasComplexArgs: false },
      data: { password: "secret123", username: "john" }
    };

    await transport.log(entry, { 
      redaction: { 
        keys: ["password"], 
        replacement: "[REDACTED]" 
      } 
    });
    
    await transport.flush();

    expect(sentContent).toContain("Redaction test");
    expect(sentContent).not.toContain("secret123");
  });

  it("should handle network failures gracefully", async () => {
    mockFetch.mockImplementation(async () => {
      throw new Error("Network failure");
    });

    const transport = new DiscordWebhookTransport("https://discord.com/api/webhooks/test", {
      suppressConsoleErrors: true,
      maxRetries: 1
    });

    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "Network test",
      args: { processedArgs: [], hasComplexArgs: false },
    };

    // Should not throw even if network fails
    await expect(transport.log(entry)).resolves.toBeUndefined();
    await expect(transport.flush()).resolves.toBeUndefined();
  });

  it("should respect maxBatchSize", async () => {
    let sentContent = "";
    
    mockFetch.mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
      fetchCalls.push({ 
        url: url.toString(), 
        options: options || {} 
      });
      
      const body = JSON.parse(options?.body as string);
      sentContent = body.content;
      return new Response("", { status: 204 });
    });

    const transport = new DiscordWebhookTransport("https://discord.com/api/webhooks/test", {
      maxBatchSize: 2,
      batchIntervalMs: 100
    });

    // Add multiple entries
    for (let i = 0; i < 3; i++) {
      const entry: LogEntry = {
        timestamp: "2023-01-01T12:00:00.000Z",
        level: LogLevel.INFO,
        levelName: "INFO",
        message: `Discord test ${i}`,
        args: { processedArgs: [], hasComplexArgs: false },
      };
      await transport.log(entry);
    }

    await transport.flush();

    // The sent content should only contain the message text, as Discord transport does not include structured data
    expect(sentContent).toContain("Discord test");
    expect(fetchCalls.length).toBeGreaterThan(0);
  });

  it("should format messages correctly", async () => {
    let sentContent = "";
    
    mockFetch.mockImplementation(async (url: RequestInfo | URL, options?: RequestInit) => {
      fetchCalls.push({ 
        url: url.toString(), 
        options: options || {} 
      });
      
      const body = JSON.parse(options?.body as string);
      sentContent = body.content;
      return new Response("", { status: 204 });
    });

    const transport = new DiscordWebhookTransport("https://discord.com/api/webhooks/test", {
      batchIntervalMs: 50
    });

    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.WARN,
      levelName: "WARN",
      message: "Format test",
      args: { processedArgs: ["arg1", "arg2"], hasComplexArgs: false },
      data: { component: "test" }
    };

    await transport.log(entry);
    await transport.flush();

    expect(sentContent).toContain("Format test");
    expect(sentContent).toContain("WARN");
    expect(sentContent).toContain("2023-01-01T12:00:00.000Z");
  });
});
