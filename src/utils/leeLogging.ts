import { Logger } from "./Logger";
import type { LogLevel, LogEntry, LensExecutionConfig } from "@gravitate-health/lens-execution-environment/dist/types/types";

// LEE Logging Configuration from Environment Variables
const LEE_LOG_LEVEL = (process.env.LEE_LOG_LEVEL || "INFO").toUpperCase() as LogLevel;
const LEE_LOGGING_ENABLED = process.env.LEE_LOGGING_ENABLED !== "false"; // defaults to true
const LENS_LOGGING_ENABLED = process.env.LENS_LOGGING_ENABLED !== "false"; // defaults to true

// Log level hierarchy for filtering
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    "FATAL": 5,
    "ERROR": 4,
    "WARN": 3,
    "INFO": 2,
    "DEBUG": 1
};

/**
 * Helper function to check if a log entry should be logged based on configured level
 */
const shouldLog = (entryLevel: LogLevel, configuredLevel: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[entryLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];
};

/**
 * Custom log sink for LEE logs - integrates with focusing-manager's Logger
 */
const leeLogSink = (entry: LogEntry): void => {
    if (!LEE_LOGGING_ENABLED || !shouldLog(entry.level, LEE_LOG_LEVEL)) {
        return;
    }
    
    const logMessage = `[LEE${entry.lensId ? ` - ${entry.lensId}` : ''}] ${entry.message}`;
    
    switch (entry.level) {
        case "ERROR":
        case "FATAL":
            Logger.logError(entry.file, entry.task, logMessage);
            break;
        case "WARN":
            Logger.logWarn(entry.file, entry.task, logMessage);
            break;
        case "INFO":
            Logger.logInfo(entry.file, entry.task, logMessage);
            break;
        case "DEBUG":
            Logger.logDebug(entry.file, entry.task, logMessage);
            break;
    }
};

/**
 * Custom log sink for lens logs - integrates with focusing-manager's Logger
 */
const lensLogSink = (entry: LogEntry): void => {
    if (!LENS_LOGGING_ENABLED || !shouldLog(entry.level, LEE_LOG_LEVEL)) {
        return;
    }
    
    const logMessage = `[LENS${entry.lensId ? ` - ${entry.lensId}` : ''}] ${entry.message}`;
    
    switch (entry.level) {
        case "ERROR":
        case "FATAL":
            Logger.logError(entry.file, entry.task, logMessage);
            break;
        case "WARN":
            Logger.logWarn(entry.file, entry.task, logMessage);
            break;
        case "INFO":
            Logger.logInfo(entry.file, entry.task, logMessage);
            break;
        case "DEBUG":
            Logger.logDebug(entry.file, entry.task, logMessage);
            break;
    }
};

/**
 * Returns the logging configuration for Lens Execution Environment
 */
export const getLeeLoggingConfig = (): LensExecutionConfig["logging"] => {
    return {
        leeLogger: leeLogSink,
        lensLogger: lensLogSink,
        disableLensLogging: !LENS_LOGGING_ENABLED
    };
};
