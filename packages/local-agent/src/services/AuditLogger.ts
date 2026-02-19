import { 
  SessionId, 
  AuditEvent, 
  AuditEventType,
  PrintJob,
  PaymentRequest 
} from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogConfig {
  logDirectory: string;
  maxLogFileSize: number; // bytes
  retentionDays: number;
  enableConsoleOutput: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface TransactionLogEntry {
  sessionId: SessionId;
  timestamp: Date;
  totalPages: number;
  colorPages: number;
  bwPages: number;
  totalPrice: number; // in paise
  paymentMethod: string;
  printOptions: {
    copies: number;
    colorMode: 'color' | 'bw';
    duplex: boolean;
    paperSize: string;
  };
}

export interface LogRotationResult {
  rotatedFiles: string[];
  deletedFiles: string[];
  errors: string[];
}

/**
 * Comprehensive audit logging system for SecurePrint Session
 * Requirements: 8.1, 8.2, 8.3, 8.5 - Event logging, privacy preservation, transaction logging, retention
 */
export class AuditLogger {
  private readonly config: AuditLogConfig;
  private readonly logFilePath: string;
  private readonly transactionLogPath: string;
  private readonly privacyFilters: Set<string>;

  private readonly defaultConfig: AuditLogConfig = {
    logDirectory: path.join(os.tmpdir(), 'acchu-audit-logs'),
    maxLogFileSize: 10 * 1024 * 1024, // 10MB
    retentionDays: 30,
    enableConsoleOutput: true,
    logLevel: 'info'
  };

  constructor(config?: Partial<AuditLogConfig>) {
    this.config = { ...this.defaultConfig, ...config };
    this.logFilePath = path.join(this.config.logDirectory, 'audit.log');
    this.transactionLogPath = path.join(this.config.logDirectory, 'transactions.log');
    
    // Initialize privacy filters - fields that should never be logged
    this.privacyFilters = new Set([
      'originalName',
      'fileName', 
      'fileContent',
      'fileBuffer',
      'customerName',
      'customerPhone',
      'customerEmail',
      'personalInfo',
      'documentContent',
      'upiId',
      'paymentDetails'
    ]);

    this.initializeLogDirectory();
  }

  /**
   * Logs a session-related audit event
   * Requirements: 8.1 - Event logging with timestamps and session IDs
   */
  async logSessionEvent(
    sessionId: SessionId, 
    eventType: AuditEventType, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const auditEvent: AuditEvent = {
      id: uuidv4(),
      sessionId,
      eventType,
      timestamp: new Date(),
      metadata: this.sanitizeMetadata(metadata)
    };

    await this.writeAuditEvent(auditEvent);
  }

  /**
   * Logs a system-level audit event (not tied to a specific session)
   * Requirements: 8.1 - System event logging
   */
  async logSystemEvent(
    eventType: AuditEventType, 
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const auditEvent: AuditEvent = {
      id: uuidv4(),
      sessionId: 'system' as SessionId,
      eventType,
      timestamp: new Date(),
      metadata: this.sanitizeMetadata(metadata)
    };

    await this.writeAuditEvent(auditEvent);
  }

  /**
   * Logs a completed print job transaction
   * Requirements: 8.3 - Transaction logging for completed print jobs
   */
  async logTransaction(
    printJob: PrintJob, 
    paymentRequest: PaymentRequest
  ): Promise<void> {
    const transactionEntry: TransactionLogEntry = {
      sessionId: printJob.sessionId,
      timestamp: new Date(),
      totalPages: printJob.pricing.totalPages,
      colorPages: printJob.pricing.colorPages,
      bwPages: printJob.pricing.bwPages,
      totalPrice: printJob.pricing.totalPrice,
      paymentMethod: 'UPI', // For MVP, always UPI
      printOptions: {
        copies: printJob.options.copies,
        colorMode: printJob.options.colorMode,
        duplex: printJob.options.duplex,
        paperSize: printJob.options.paperSize
      }
    };

    await this.writeTransactionLog(transactionEntry);

    // Also log as audit event
    await this.logSessionEvent(printJob.sessionId, AuditEventType.PRINT_EXECUTED, {
      jobId: printJob.id,
      totalPages: printJob.pricing.totalPages,
      totalPrice: printJob.pricing.totalPrice,
      paymentStatus: paymentRequest.status,
      transactionId: paymentRequest.transactionId
    });
  }

  /**
   * Performs log rotation and cleanup based on retention policy
   * Requirements: 8.5 - Log rotation and 30-day retention
   */
  async performLogRotation(): Promise<LogRotationResult> {
    const result: LogRotationResult = {
      rotatedFiles: [],
      deletedFiles: [],
      errors: []
    };

    try {
      // Ensure log directory exists
      await this.ensureLogDirectory();

      // Rotate audit log if it exceeds size limit
      const auditRotationResult = await this.rotateLogFile(this.logFilePath, 'audit');
      result.rotatedFiles.push(...auditRotationResult.rotatedFiles);
      result.errors.push(...auditRotationResult.errors);

      // Rotate transaction log if it exceeds size limit
      const transactionRotationResult = await this.rotateLogFile(this.transactionLogPath, 'transactions');
      result.rotatedFiles.push(...transactionRotationResult.rotatedFiles);
      result.errors.push(...transactionRotationResult.errors);

      // Clean up old log files based on retention policy
      const cleanupResult = await this.cleanupOldLogs();
      result.deletedFiles.push(...cleanupResult.deletedFiles);
      result.errors.push(...cleanupResult.errors);

      if (this.config.enableConsoleOutput) {
        console.log(`Log rotation completed: ${result.rotatedFiles.length} rotated, ${result.deletedFiles.length} deleted`);
      }

    } catch (error) {
      const errorMsg = `Log rotation failed: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      console.error(errorMsg);
    }

    return result;
  }

  /**
   * Retrieves recent audit events for monitoring
   */
  async getRecentAuditEvents(limit: number = 100): Promise<AuditEvent[]> {
    try {
      const logContent = await this.readLogFile(this.logFilePath);
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // Get the last 'limit' lines and parse them
      const recentLines = lines.slice(-limit);
      const events: AuditEvent[] = [];

      for (const line of recentLines) {
        try {
          const event = JSON.parse(line) as AuditEvent;
          // Convert timestamp string back to Date object
          event.timestamp = new Date(event.timestamp);
          events.push(event);
        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }

      return events.reverse(); // Most recent first

    } catch (error) {
      console.error('Failed to retrieve recent audit events:', error);
      return [];
    }
  }

  /**
   * Retrieves recent transaction logs for business monitoring
   */
  async getRecentTransactions(limit: number = 50): Promise<TransactionLogEntry[]> {
    try {
      const logContent = await this.readLogFile(this.transactionLogPath);
      const lines = logContent.split('\n').filter(line => line.trim());
      
      // Get the last 'limit' lines and parse them
      const recentLines = lines.slice(-limit);
      const transactions: TransactionLogEntry[] = [];

      for (const line of recentLines) {
        try {
          const transaction = JSON.parse(line) as TransactionLogEntry;
          // Convert timestamp string back to Date object
          transaction.timestamp = new Date(transaction.timestamp);
          transactions.push(transaction);
        } catch (parseError) {
          // Skip malformed lines
          continue;
        }
      }

      return transactions.reverse(); // Most recent first

    } catch (error) {
      console.error('Failed to retrieve recent transactions:', error);
      return [];
    }
  }

  /**
   * Gets audit logging statistics for monitoring
   */
  async getAuditStatistics(): Promise<{
    totalAuditEvents: number;
    totalTransactions: number;
    logFileSize: number;
    transactionLogSize: number;
    oldestEventDate?: Date;
    newestEventDate?: Date;
    eventsByType: Record<string, number>;
  }> {
    try {
      const [auditEvents, transactions] = await Promise.all([
        this.getRecentAuditEvents(1000), // Get more for statistics
        this.getRecentTransactions(1000)
      ]);

      // Get file sizes
      const [auditStats, transactionStats] = await Promise.all([
        this.getFileStats(this.logFilePath),
        this.getFileStats(this.transactionLogPath)
      ]);

      // Calculate event type distribution
      const eventsByType: Record<string, number> = {};
      for (const event of auditEvents) {
        eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      }

      // Find date range
      const dates = auditEvents.map(e => e.timestamp).sort((a, b) => a.getTime() - b.getTime());

      return {
        totalAuditEvents: auditEvents.length,
        totalTransactions: transactions.length,
        logFileSize: auditStats?.size || 0,
        transactionLogSize: transactionStats?.size || 0,
        oldestEventDate: dates[0],
        newestEventDate: dates[dates.length - 1],
        eventsByType
      };

    } catch (error) {
      console.error('Failed to get audit statistics:', error);
      return {
        totalAuditEvents: 0,
        totalTransactions: 0,
        logFileSize: 0,
        transactionLogSize: 0,
        eventsByType: {}
      };
    }
  }

  /**
   * Sanitizes metadata to remove privacy-sensitive information
   * Requirements: 8.2 - Privacy-preserving log filtering
   */
  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Skip privacy-sensitive fields
      if (this.privacyFilters.has(key)) {
        continue;
      }

      // Recursively sanitize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else if (Array.isArray(value)) {
        // For arrays, sanitize each element if it's an object
        sanitized[key] = value.map(item => 
          item && typeof item === 'object' ? this.sanitizeMetadata(item) : item
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Writes an audit event to the log file
   */
  private async writeAuditEvent(event: AuditEvent): Promise<void> {
    try {
      await this.ensureLogDirectory();
      
      const logLine = JSON.stringify(event) + '\n';
      await fs.appendFile(this.logFilePath, logLine, 'utf8');

      if (this.config.enableConsoleOutput && this.shouldLogToConsole(event.eventType)) {
        console.log(`[AUDIT] ${event.eventType} - Session: ${event.sessionId} - ${JSON.stringify(event.metadata)}`);
      }

      // Check if log rotation is needed
      await this.checkAndRotateIfNeeded(this.logFilePath, 'audit');

    } catch (error) {
      console.error('Failed to write audit event:', error);
      throw error;
    }
  }

  /**
   * Writes a transaction log entry
   */
  private async writeTransactionLog(transaction: TransactionLogEntry): Promise<void> {
    try {
      await this.ensureLogDirectory();
      
      const logLine = JSON.stringify(transaction) + '\n';
      await fs.appendFile(this.transactionLogPath, logLine, 'utf8');

      if (this.config.enableConsoleOutput) {
        console.log(`[TRANSACTION] Session: ${transaction.sessionId} - Pages: ${transaction.totalPages} - Price: ₹${transaction.totalPrice / 100}`);
      }

      // Check if log rotation is needed
      await this.checkAndRotateIfNeeded(this.transactionLogPath, 'transactions');

    } catch (error) {
      console.error('Failed to write transaction log:', error);
      throw error;
    }
  }

  /**
   * Initializes the log directory on startup
   */
  private async initializeLogDirectory(): Promise<void> {
    try {
      await this.ensureLogDirectory();
      
      // Log system startup
      await this.logSystemEvent(AuditEventType.SESSION_CREATED, {
        event: 'audit_logger_initialized',
        config: {
          logDirectory: this.config.logDirectory,
          retentionDays: this.config.retentionDays,
          maxLogFileSize: this.config.maxLogFileSize
        }
      });

    } catch (error) {
      console.error('Failed to initialize audit logger:', error);
    }
  }

  /**
   * Ensures the log directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.logDirectory, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error);
      throw error;
    }
  }

  /**
   * Checks if a log file needs rotation and rotates it if necessary
   */
  private async checkAndRotateIfNeeded(filePath: string, logType: string): Promise<void> {
    try {
      const stats = await this.getFileStats(filePath);
      if (stats && stats.size > this.config.maxLogFileSize) {
        await this.rotateLogFile(filePath, logType);
      }
    } catch (error) {
      // File might not exist yet, which is fine
    }
  }

  /**
   * Rotates a log file when it exceeds the size limit
   */
  private async rotateLogFile(filePath: string, logType: string): Promise<{ rotatedFiles: string[]; errors: string[] }> {
    const result = { rotatedFiles: [] as string[], errors: [] as string[] };

    try {
      const stats = await this.getFileStats(filePath);
      if (!stats || stats.size <= this.config.maxLogFileSize) {
        return result; // No rotation needed
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = `${filePath}.${timestamp}`;

      // Move current log to rotated file
      await fs.rename(filePath, rotatedPath);
      result.rotatedFiles.push(rotatedPath);

      if (this.config.enableConsoleOutput) {
        console.log(`Rotated ${logType} log: ${path.basename(rotatedPath)}`);
      }

    } catch (error) {
      const errorMsg = `Failed to rotate ${logType} log: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      console.error(errorMsg);
    }

    return result;
  }

  /**
   * Cleans up old log files based on retention policy
   */
  private async cleanupOldLogs(): Promise<{ deletedFiles: string[]; errors: string[] }> {
    const result = { deletedFiles: [] as string[], errors: [] as string[] };

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

      const files = await fs.readdir(this.config.logDirectory);
      
      for (const file of files) {
        // Only process rotated log files (contain timestamp)
        if (!file.includes('.log.') || !file.match(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)) {
          continue;
        }

        const filePath = path.join(this.config.logDirectory, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            result.deletedFiles.push(file);
            
            if (this.config.enableConsoleOutput) {
              console.log(`Deleted old log file: ${file}`);
            }
          }
        } catch (error) {
          const errorMsg = `Failed to process log file ${file}: ${error instanceof Error ? error.message : String(error)}`;
          result.errors.push(errorMsg);
        }
      }

    } catch (error) {
      const errorMsg = `Failed to cleanup old logs: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(errorMsg);
      console.error(errorMsg);
    }

    return result;
  }

  /**
   * Reads content from a log file
   */
  private async readLogFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      // File might not exist yet
      return '';
    }
  }

  /**
   * Gets file statistics
   */
  private async getFileStats(filePath: string): Promise<{ size: number; mtime: Date } | null> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        mtime: stats.mtime
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Determines if an event type should be logged to console based on log level
   */
  private shouldLogToConsole(eventType: AuditEventType): boolean {
    const criticalEvents = [
      AuditEventType.SESSION_TERMINATED,
      AuditEventType.DATA_DESTROYED,
      AuditEventType.PRINT_EXECUTED
    ];

    const infoEvents = [
      AuditEventType.SESSION_CREATED,
      AuditEventType.PAYMENT_COMPLETED
    ];

    switch (this.config.logLevel) {
      case 'error':
        return false; // Only errors, no audit events
      case 'warn':
        return criticalEvents.includes(eventType);
      case 'info':
        return criticalEvents.includes(eventType) || infoEvents.includes(eventType);
      case 'debug':
        return true; // All events
      default:
        return true;
    }
  }

  /**
   * Performs a health check on the audit logging system
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
    recommendations: string[];
    logDirectorySize: number;
    oldestLogAge: number; // days
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let logDirectorySize = 0;
    let oldestLogAge = 0;

    try {
      // Check if log directory is accessible
      await this.ensureLogDirectory();

      // Calculate total log directory size
      const files = await fs.readdir(this.config.logDirectory);
      for (const file of files) {
        const filePath = path.join(this.config.logDirectory, file);
        const stats = await this.getFileStats(filePath);
        if (stats) {
          logDirectorySize += stats.size;
          
          // Calculate age of oldest log
          const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
          oldestLogAge = Math.max(oldestLogAge, ageInDays);
        }
      }

      // Check for issues
      if (logDirectorySize > 100 * 1024 * 1024) { // 100MB
        issues.push(`Log directory size is large: ${Math.round(logDirectorySize / 1024 / 1024)}MB`);
        recommendations.push('Consider reducing retention period or increasing rotation frequency');
      }

      if (oldestLogAge > this.config.retentionDays + 5) {
        issues.push(`Old logs found beyond retention period: ${Math.round(oldestLogAge)} days old`);
        recommendations.push('Run log cleanup to remove old files');
      }

      // Test write permissions
      const testFile = path.join(this.config.logDirectory, '.write-test');
      try {
        await fs.writeFile(testFile, 'test');
        await fs.unlink(testFile);
      } catch (error) {
        issues.push('Cannot write to log directory');
        recommendations.push('Check directory permissions');
      }

      return {
        healthy: issues.length === 0,
        issues,
        recommendations,
        logDirectorySize,
        oldestLogAge
      };

    } catch (error) {
      return {
        healthy: false,
        issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Investigate audit logger configuration'],
        logDirectorySize: 0,
        oldestLogAge: 0
      };
    }
  }
}