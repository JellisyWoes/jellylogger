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
  jellyLogger.addTransport(new ConsoleTransport());
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig));
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
  jellyLogger.addTransport(new ConsoleTransport());
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig));
  jellyLogger.addTransport(new DiscordWebhookTransport(discordWebhookUrl));
}

/**
 * Configure logger to use console and WebSocket transports.
 * @param websocketUrl - WebSocket server URL
 */
export function useConsoleAndWebSocket(websocketUrl: string): void {
  jellyLogger.clearTransports();
  jellyLogger.addTransport(new ConsoleTransport());
  jellyLogger.addTransport(new WebSocketTransport(websocketUrl));
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
  jellyLogger.addTransport(new ConsoleTransport());
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig));
  jellyLogger.addTransport(new DiscordWebhookTransport(discordWebhookUrl));
  jellyLogger.addTransport(new WebSocketTransport(websocketUrl));
}

/**
 * Add file logging to the current logger configuration.
 * @param filePath - Path to the log file
 * @param rotationConfig - Optional file rotation configuration
 */
export function addFileLogging(filePath: string, rotationConfig?: LogRotationConfig): void {
  jellyLogger.addTransport(new FileTransport(filePath, rotationConfig));
}

/**
 * Add Discord webhook logging to the current logger configuration.
 * @param discordWebhookUrl - Discord webhook URL
 */
export function addDiscordLogging(discordWebhookUrl: string): void {
  jellyLogger.addTransport(new DiscordWebhookTransport(discordWebhookUrl));
}

/**
 * Add WebSocket logging to the current logger configuration.
 * @param websocketUrl - WebSocket server URL
 */
export function addWebSocketLogging(websocketUrl: string): void {
  jellyLogger.addTransport(new WebSocketTransport(websocketUrl));
}