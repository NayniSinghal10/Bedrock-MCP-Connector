/**
 * Log levels
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
    level: LogLevel;
    prefix?: string;
    enableTimestamps?: boolean;
}

/**
 * Simple logger utility
 */
export class Logger {
    private level: LogLevel;
    private prefix: string;
    private enableTimestamps: boolean;

    /**
     * Create a new logger
     * 
     * @param config - Logger configuration
     */
    constructor(config: LoggerConfig) {
        this.level = config.level;
        this.prefix = config.prefix || '';
        this.enableTimestamps = config.enableTimestamps || false;
    }

    /**
     * Log a debug message
     * 
     * @param message - The message to log
     * @param args - Additional arguments to log
     */
    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    /**
     * Log an info message
     * 
     * @param message - The message to log
     * @param args - Additional arguments to log
     */
    info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    /**
     * Log a warning message
     * 
     * @param message - The message to log
     * @param args - Additional arguments to log
     */
    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    /**
     * Log an error message
     * 
     * @param message - The message to log
     * @param args - Additional arguments to log
     */
    error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args);
    }

    /**
     * Set the log level
     * 
     * @param level - The log level
     */
    setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * Log a message at the specified level
     * 
     * @param level - The log level
     * @param message - The message to log
     * @param args - Additional arguments to log
     * @private
     */
    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (level < this.level) {
            return;
        }

        let prefix = this.prefix ? `[${this.prefix}] ` : '';

        if (this.enableTimestamps) {
            const timestamp = new Date().toISOString();
            prefix = `[${timestamp}] ${prefix}`;
        }

        const levelPrefix = this.getLevelPrefix(level);
        const formattedMessage = `${prefix}${levelPrefix}${message}`;

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(formattedMessage, ...args);
                break;
            case LogLevel.INFO:
                console.info(formattedMessage, ...args);
                break;
            case LogLevel.WARN:
                console.warn(formattedMessage, ...args);
                break;
            case LogLevel.ERROR:
                console.error(formattedMessage, ...args);
                break;
        }
    }

    /**
     * Get the prefix for the specified log level
     * 
     * @param level - The log level
     * @returns The level prefix
     * @private
     */
    private getLevelPrefix(level: LogLevel): string {
        switch (level) {
            case LogLevel.DEBUG:
                return '[DEBUG] ';
            case LogLevel.INFO:
                return '[INFO] ';
            case LogLevel.WARN:
                return '[WARN] ';
            case LogLevel.ERROR:
                return '[ERROR] ';
            default:
                return '';
        }
    }
}

/**
 * Create a default logger
 * 
 * @param prefix - Optional prefix for log messages
 * @returns A new logger with default configuration
 */
export function createDefaultLogger(prefix?: string): Logger {
    return new Logger({
        level: LogLevel.INFO,
        prefix,
        enableTimestamps: true
    });
}
