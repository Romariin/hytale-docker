/**
 * Available log levels
 */
export type LogLevel = "info" | "warn" | "error" | "success" | "step";

/**
 * Logger interface for consistent logging across modules
 */
export interface ILogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  step(message: string): void;
  header(title: string, subtitle?: string): void;
  divider(): void;
}
