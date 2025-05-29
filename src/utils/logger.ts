import { format } from 'util';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class Logger {
  private level: LogLevel;
  private readonly levelNames: Record<LogLevel, string> = {
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.DEBUG]: 'DEBUG',
  };

  constructor() {
    const debug = process.env.DEBUG === 'true';
    const logLevel = process.env.LOG_LEVEL?.toLowerCase();

    if (logLevel) {
      switch (logLevel) {
        case 'error':
          this.level = LogLevel.ERROR;
          break;
        case 'warn':
          this.level = LogLevel.WARN;
          break;
        case 'info':
          this.level = LogLevel.INFO;
          break;
        case 'debug':
          this.level = LogLevel.DEBUG;
          break;
        default:
          this.level = debug ? LogLevel.DEBUG : LogLevel.INFO;
      }
    } else {
      this.level = debug ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (level <= this.level) {
      const timestamp = new Date().toISOString();
      const levelStr = this.levelNames[level];
      const formattedMessage = format(message, ...args);

      // Always use console.error for MCP servers as stdout is reserved for protocol
      console.error(`[${timestamp}] [${levelStr}] ${formattedMessage}`);
    }
  }

  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }
}

export const logger = new Logger();
