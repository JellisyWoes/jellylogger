import { logger } from '../core/logger';
import { FileTransport, type LogRotationConfig } from '../transports/FileTransport';
import { ConsoleTransport } from '../transports/ConsoleTransport';
import { DiscordWebhookTransport } from '../transports/DiscordWebhookTransport';
import { WebSocketTransport } from '../transports/WebSocketTransport';
import type { JellyLogger } from '../core/types';

// Cast logger to JellyLogger to access transport management methods
const jellyLogger = logger as JellyLogger;

/**
 * Configure logger to use both console and file transports.
 * @param filePath - Path to the log file
 * @param rotationConfig - Optional file rotation configuration
 */
export function useConsoleAndFile(filePath: string, rotationConfig?: LogRotationConfig): void {
  jellyLogger.clearTransports();
  jellyLogger.addTransport(new ConsoleTransport() as any); // Cast to any for compatibility
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig) as any);
}

/**
 * Configure logger to use console, file, and Discord webhook transports.
 * @param filePath - Path to the log file
 * @param discordWebhookUrl - Discord webhook URL
 * @param rotationConfig - Optional file rotation configuration
 */
export function useConsoleFileAndDiscord(
  filePath: string,
  discordWebhookUrl: string,
  rotationConfig?: LogRotationConfig
): void {
  jellyLogger.clearTransports();
  jellyLogger.addTransport(new ConsoleTransport() as any);
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig) as any);
  jellyLogger.addTransport(new DiscordWebhookTransport(discordWebhookUrl) as any);
}

/**
 * Configure logger to use console and WebSocket transports.
 * @param websocketUrl - WebSocket server URL
 */
export function useConsoleAndWebSocket(websocketUrl: string): void {
  jellyLogger.clearTransports();
  jellyLogger.addTransport(new ConsoleTransport() as any);
  jellyLogger.addTransport(new WebSocketTransport(websocketUrl) as any);
}

/**
 * Configure logger to use all available transports.
 * @param filePath - Path to the log file
 * @param discordWebhookUrl - Discord webhook URL
 * @param websocketUrl - WebSocket server URL
 * @param rotationConfig - Optional file rotation configuration
 */
export function useAllTransports(
  filePath: string,
  discordWebhookUrl: string,
  websocketUrl: string,
  rotationConfig?: LogRotationConfig
): void {
  jellyLogger.clearTransports();
  jellyLogger.addTransport(new ConsoleTransport() as any);
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig) as any);
  jellyLogger.addTransport(new DiscordWebhookTransport(discordWebhookUrl) as any);
  jellyLogger.addTransport(new WebSocketTransport(websocketUrl) as any);
}

/**
 * Add file logging to the current logger configuration.
 * @param filePath - Path to the log file
 * @param rotationConfig - Optional file rotation configuration
 */
export function addFileLogging(filePath: string, rotationConfig?: LogRotationConfig): void {
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig) as any);
}

/**
 * Add Discord webhook logging to the current logger configuration.
 * @param discordWebhookUrl - Discord webhook URL
 */
export function addDiscordLogging(discordWebhookUrl: string): void {
  jellyLogger.addTransport(new DiscordWebhookTransport(discordWebhookUrl) as any);
}

/**
 * Add WebSocket logging to the current logger configuration.
 * @param websocketUrl - WebSocket server URL
 */
export function addWebSocketLogging(websocketUrl: string): void {
  jellyLogger.addTransport(new WebSocketTransport(websocketUrl) as any);
}