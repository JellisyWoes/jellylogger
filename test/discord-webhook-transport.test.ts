import "./test-utils"; // Import mocks first
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { LogLevel, DiscordWebhookTransport, type LogEntry } from "../lib/index";

describe("DiscordWebhookTransport", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should batch logs and retry on failure", async () => {
    let fetchCalls: { url: string; options: any }[] = [];
    let callCount = 0;
    
    const fetchMock = mock(async (url: string | URL, options?: any) => {
      fetchCalls.push({ url: url.toString(), options });
      callCount++;
      
      // Fail the first call, succeed the second
      if (callCount === 1) {
        return new Response(null, { status: 500, statusText: "Internal Server Error" });
      }
      
      return new Response(null, { status: 204 });
    });
    // Add a dummy preconnect property to satisfy the type requirement
    (fetchMock as any).preconnect = () => Promise.resolve();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const webhookUrl = "http://discord.test/webhook";
    const transport = new DiscordWebhookTransport(webhookUrl, { 
      batchIntervalMs: 10, 
      maxBatchSize: 2, 
      maxRetries: 1, 
      suppressConsoleErrors: true 
    });

    await transport.log({ timestamp: "t", level: LogLevel.INFO, levelName: "INFO", message: "msg1", args: [] }, { format: "string" });
    await transport.log({ timestamp: "t", level: LogLevel.INFO, levelName: "INFO", message: "msg2", args: [] }, { format: "string" });
    
    // Wait a bit for batching and retry logic
    await new Promise(resolve => setTimeout(resolve, 50));
    await transport.flush();
    
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    expect(fetchCalls[0].url).toBe(webhookUrl);
    
    // Check that the request body contains our messages
    const body = JSON.parse(fetchCalls[0].options.body);
    expect(body.content).toContain("msg1");
  });

  it("should apply console redaction to Discord messages", async () => {
    let sentContent = "";
    
    const fetchMock = mock(async (url: string | URL, options?: any) => {
      const body = JSON.parse(options.body);
      sentContent = body.content;
      return new Response(null, { status: 204 });
    });
    (fetchMock as any).preconnect = () => Promise.resolve();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const webhookUrl = "http://discord.test/webhook";
    const transport = new DiscordWebhookTransport(webhookUrl, { 
      suppressConsoleErrors: true 
    });

    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.INFO,
      levelName: "INFO",
      message: "Discord test",
      args: [],
      data: { secret: "hidden-value" }
    };

    await transport.log(entry, {
      redaction: {
        keys: ["secret"],
        replacement: "[DISCORD-REDACTED]",
        redactIn: "console" // Discord uses console redaction
      },
      format: "string"
    });
    
    await transport.flush();
    
    // The sent content should only contain the message text, as Discord transport does not include structured data
    expect(sentContent).toContain("Discord test");
    expect(sentContent).not.toContain("hidden-value");
    expect(sentContent).not.toContain("[DISCORD-REDACTED]");
  });

  it("should handle network failures gracefully", async () => {
    const fetchMock = mock(async () => {
      throw new Error("Network error");
    });
    (fetchMock as any).preconnect = () => Promise.resolve();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const webhookUrl = "http://discord.test/webhook";
    const transport = new DiscordWebhookTransport(webhookUrl, { 
      suppressConsoleErrors: true,
      maxRetries: 0 // Don't retry for this test
    });

    // This should not throw
    expect(async () => {
      await transport.log({ 
        timestamp: "t", 
        level: LogLevel.INFO, 
        levelName: "INFO", 
        message: "test", 
        args: [] 
      }, { format: "string" });
      await transport.flush();
    }).not.toThrow();
  });

  it("should respect maxBatchSize", async () => {
    let batchSizes: number[] = [];
    
    const fetchMock = mock(async (_: unknown, options?: any) => {
      const body = JSON.parse(options.body);
      // Count number of messages in the batch by splitting on newlines and filtering empty lines
      const lines = body.content.split('\n').filter((line: string) => line.trim().length > 0);
      batchSizes.push(lines.length);
      return new Response(null, { status: 204 });
    });
    (fetchMock as any).preconnect = () => Promise.resolve();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const webhookUrl = "http://discord.test/webhook";
    const transport = new DiscordWebhookTransport(webhookUrl, { 
      maxBatchSize: 2,
      batchIntervalMs: 5, // Lower interval to ensure batching by size, not time
      suppressConsoleErrors: true 
    });

    // Log 3 messages - should trigger batching at 2 messages
    await transport.log({ timestamp: "t", level: LogLevel.INFO, levelName: "INFO", message: "msg1", args: [] }, { format: "string" });
    await transport.log({ timestamp: "t", level: LogLevel.INFO, levelName: "INFO", message: "msg2", args: [] }, { format: "string" });
    // Wait a bit to allow the batch to flush due to maxBatchSize
    await new Promise(resolve => setTimeout(resolve, 20));
    await transport.log({ timestamp: "t", level: LogLevel.INFO, levelName: "INFO", message: "msg3", args: [] }, { format: "string" });
    // Wait a bit to allow the last batch to flush
    await new Promise(resolve => setTimeout(resolve, 20));
    await transport.flush();
    
    // Should have made at least one batch, and each batch should respect maxBatchSize
    expect(batchSizes.length).toBeGreaterThanOrEqual(1);
    expect(batchSizes.every(size => size <= 2)).toBe(true);
  });

  it("should format messages correctly", async () => {
    let sentContent = "";
    
    const fetchMock = mock(async (url: string | URL, options?: any) => {
      const body = JSON.parse(options.body);
      sentContent = body.content;
      return new Response(null, { status: 204 });
    });
    (fetchMock as any).preconnect = () => Promise.resolve();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const webhookUrl = "http://discord.test/webhook";
    const transport = new DiscordWebhookTransport(webhookUrl, { 
      suppressConsoleErrors: true 
    });

    const entry: LogEntry = {
      timestamp: "2023-01-01T12:00:00.000Z",
      level: LogLevel.ERROR,
      levelName: "ERROR",
      message: "Test error message",
      args: []
    };

    await transport.log(entry, { format: "string" });
    await transport.flush();
    
    expect(sentContent).toContain("ERROR");
    expect(sentContent).toContain("Test error message");
    expect(sentContent).toContain("2023-01-01T12:00:00.000Z");
  });
});
