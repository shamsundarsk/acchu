import { EventEmitter } from 'events';
import { SessionId, PrinterStatus } from '../types';
import { SessionManager } from './SessionManager';
import { PrintManager } from './PrintManager';
import { AuditLogger } from './AuditLogger';
import { AuditEventType } from '@sps/shared-types';

/**
 * Error severity levels for categorizing errors
 */
export enum ErrorSeverity {
  LOW = 'low',           // Minor issues that don't affect functionality
  MEDIUM = 'medium',     // Issues that may affect some functionality
  HIGH = 'high',         // Issues that significantly impact functionality
  CRITICAL = 'critical'  // Issues that require immediate fail-closed response
}

/**
 * Error categories for different types of system errors
 */
export enum ErrorCategory {
  NETWORK = 'network',
  PRINTER = 'printer',
  RESOURCE = 'resource',
  SESSION = 'session',
  FILE_SYSTEM = 'file_system',
  CONFIGURATION = 'configuration',
  SYSTEM = 'system'
}

/**
 * Structured error information
 */
export interface SystemError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: Date;
  sessionId?: SessionId;
  retryable: boolean;
  resolved: boolean;
}

/**
 * Error handling configuration
 */
export interface ErrorHandlerConfig {
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  resourceCheckIntervalMs?: number;
  networkTimeoutMs?: number;
  failClosedOnCritical?: boolean;
  auditLogger?: AuditLogger;
}

/**
 * Network connectivity status
 */
export interface NetworkStatus {
  isConnected: boolean;
  lastChecked: Date;
  consecutiveFailures: number;
  latencyMs?: number;
}

/**
 * System resource status
 */
export interface ResourceStatus {
  memoryUsagePercent: number;
  diskSpaceAvailableGB: number;
  cpuUsagePercent: number;
  isResourceConstrained: boolean;
  lastChecked: Date;
}

/**
 * Comprehensive error handling system for SecurePrint Session
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export class ErrorHandler extends EventEmitter {
  private errors: Map<string, SystemError> = new Map();
  private config: ErrorHandlerConfig & { 
    maxRetryAttempts: number;
    retryDelayMs: number;
    resourceCheckIntervalMs: number;
    networkTimeoutMs: number;
    failClosedOnCritical: boolean;
  };
  private sessionManager?: SessionManager;
  private printManager?: PrintManager;
  private auditLogger?: AuditLogger;
  
  // Status tracking
  private networkStatus: NetworkStatus = {
    isConnected: true,
    lastChecked: new Date(),
    consecutiveFailures: 0
  };
  
  private resourceStatus: ResourceStatus = {
    memoryUsagePercent: 0,
    diskSpaceAvailableGB: 0,
    cpuUsagePercent: 0,
    isResourceConstrained: false,
    lastChecked: new Date()
  };
  
  // Monitoring intervals
  private resourceMonitorInterval?: NodeJS.Timeout;
  private networkMonitorInterval?: NodeJS.Timeout;
  
  // Retry tracking
  private retryAttempts: Map<string, number> = new Map();
  
  constructor(config: ErrorHandlerConfig = {}) {
    super();
    
    this.config = {
      maxRetryAttempts: 3,
      retryDelayMs: 1000,
      resourceCheckIntervalMs: 30000, // 30 seconds
      networkTimeoutMs: 5000,
      failClosedOnCritical: true,
      auditLogger: undefined,
      ...config
    };
    
    this.auditLogger = config.auditLogger;
    this.startMonitoring();
  }

  /**
   * Initialize error handler with system components
   */
  initialize(sessionManager: SessionManager, printManager: PrintManager): void {
    this.sessionManager = sessionManager;
    this.printManager = printManager;
    
    console.log('ErrorHandler initialized with system components');
  }

  /**
   * Handles a system error with appropriate response based on severity
   * Requirements: 9.4 - Fail closed for critical errors
   */
  async handleError(
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string,
    details?: any,
    sessionId?: SessionId
  ): Promise<void> {
    const errorId = this.generateErrorId();
    const error: SystemError = {
      id: errorId,
      category,
      severity,
      message,
      details,
      timestamp: new Date(),
      sessionId,
      retryable: this.isRetryableError(category, severity),
      resolved: false
    };

    this.errors.set(errorId, error);
    
    // Log the error
    console.error(`[${severity.toUpperCase()}] ${category}: ${message}`, details);
    
    // Audit log the error
    if (this.auditLogger) {
      await this.auditLogger.logSystemEvent('ERROR_OCCURRED', {
        errorId,
        category,
        severity,
        message,
        sessionId
      });
    }

    // Emit error event for listeners
    this.emit('error', error);

    // Handle based on severity
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        await this.handleCriticalError(error);
        break;
      case ErrorSeverity.HIGH:
        await this.handleHighSeverityError(error);
        break;
      case ErrorSeverity.MEDIUM:
        await this.handleMediumSeverityError(error);
        break;
      case ErrorSeverity.LOW:
        await this.handleLowSeverityError(error);
        break;
    }
  }

  /**
   * Handles critical errors with fail-closed approach
   * Requirements: 9.4 - Fail closed by terminating active sessions and destroying data
   */
  private async handleCriticalError(error: SystemError): Promise<void> {
    console.error(`CRITICAL ERROR DETECTED: ${error.message}`);
    
    if (this.config.failClosedOnCritical && this.sessionManager) {
      try {
        // Get all active sessions
        const activeSessions = this.sessionManager.getActiveSessions();
        
        console.log(`Terminating ${activeSessions.length} active sessions due to critical error`);
        
        // Terminate all active sessions
        for (const session of activeSessions) {
          await this.sessionManager.terminateSession(session.id);
        }
        
        // Log the fail-closed action
        if (this.auditLogger) {
          await this.auditLogger.logSystemEvent('FAIL_CLOSED_TRIGGERED', {
            errorId: error.id,
            terminatedSessions: activeSessions.length,
            reason: error.message
          });
        }
        
        this.emit('failClosed', { error, terminatedSessions: activeSessions.length });
        
      } catch (failClosedError) {
        console.error('Failed to execute fail-closed procedure:', failClosedError);
        
        if (this.auditLogger) {
          await this.auditLogger.logSystemEvent('FAIL_CLOSED_FAILED', {
            errorId: error.id,
            failClosedError: failClosedError instanceof Error ? failClosedError.message : String(failClosedError)
          });
        }
      }
    }
  }

  /**
   * Handles high severity errors
   */
  private async handleHighSeverityError(error: SystemError): Promise<void> {
    // For high severity errors, we may need to prevent new sessions
    if (error.category === ErrorCategory.RESOURCE || error.category === ErrorCategory.PRINTER) {
      this.emit('preventNewSessions', error);
    }
    
    // Attempt recovery if retryable
    if (error.retryable) {
      await this.scheduleRetry(error);
    }
  }

  /**
   * Handles medium severity errors
   */
  private async handleMediumSeverityError(error: SystemError): Promise<void> {
    // Attempt recovery if retryable
    if (error.retryable) {
      await this.scheduleRetry(error);
    }
    
    // Notify about degraded functionality
    this.emit('degradedFunctionality', error);
  }

  /**
   * Handles low severity errors
   */
  private async handleLowSeverityError(error: SystemError): Promise<void> {
    // Just log and potentially retry
    if (error.retryable) {
      await this.scheduleRetry(error);
    }
  }

  /**
   * Schedules retry for retryable errors
   */
  private async scheduleRetry(error: SystemError): Promise<void> {
    const currentAttempts = this.retryAttempts.get(error.id) || 0;
    
    if (currentAttempts >= this.config.maxRetryAttempts) {
      console.log(`Max retry attempts reached for error ${error.id}`);
      return;
    }
    
    this.retryAttempts.set(error.id, currentAttempts + 1);
    
    const delay = this.config.retryDelayMs * Math.pow(2, currentAttempts); // Exponential backoff
    
    setTimeout(async () => {
      try {
        await this.attemptErrorRecovery(error);
      } catch (retryError) {
        console.error(`Retry failed for error ${error.id}:`, retryError);
        await this.scheduleRetry(error); // Try again
      }
    }, delay);
  }

  /**
   * Attempts to recover from an error
   */
  private async attemptErrorRecovery(error: SystemError): Promise<void> {
    console.log(`Attempting recovery for error ${error.id}: ${error.message}`);
    
    switch (error.category) {
      case ErrorCategory.NETWORK:
        await this.recoverNetworkError(error);
        break;
      case ErrorCategory.PRINTER:
        await this.recoverPrinterError(error);
        break;
      case ErrorCategory.RESOURCE:
        await this.recoverResourceError(error);
        break;
      default:
        console.log(`No specific recovery procedure for category ${error.category}`);
    }
  }

  /**
   * Recovers from network errors
   * Requirements: 9.1 - Network error detection and retry mechanisms
   */
  private async recoverNetworkError(error: SystemError): Promise<void> {
    // Test network connectivity
    const isConnected = await this.checkNetworkConnectivity();
    
    if (isConnected) {
      console.log(`Network connectivity restored for error ${error.id}`);
      await this.resolveError(error.id);
    } else {
      throw new Error('Network still unavailable');
    }
  }

  /**
   * Recovers from printer errors
   * Requirements: 9.2 - Printer status monitoring and error reporting
   */
  private async recoverPrinterError(error: SystemError): Promise<void> {
    if (!this.printManager) {
      throw new Error('PrintManager not available for recovery');
    }
    
    // Refresh printer status
    await this.printManager.refreshPrinterStatus();
    
    // Check if printer is now available
    const printerStatus = this.printManager.getPrinterStatus();
    
    if (printerStatus === PrinterStatus.ONLINE) {
      console.log(`Printer connectivity restored for error ${error.id}`);
      await this.resolveError(error.id);
    } else {
      throw new Error(`Printer still ${printerStatus.toLowerCase()}`);
    }
  }

  /**
   * Recovers from resource errors
   * Requirements: 9.3 - Resource monitoring and session prevention
   */
  private async recoverResourceError(error: SystemError): Promise<void> {
    // Check current resource status
    await this.checkResourceStatus();
    
    if (!this.resourceStatus.isResourceConstrained) {
      console.log(`Resource constraints resolved for error ${error.id}`);
      await this.resolveError(error.id);
    } else {
      throw new Error('System still resource constrained');
    }
  }

  /**
   * Marks an error as resolved
   */
  async resolveError(errorId: string): Promise<void> {
    const error = this.errors.get(errorId);
    if (!error) {
      return;
    }
    
    error.resolved = true;
    this.retryAttempts.delete(errorId);
    
    console.log(`Error ${errorId} resolved: ${error.message}`);
    
    if (this.auditLogger) {
      await this.auditLogger.logSystemEvent('ERROR_RESOLVED', {
        errorId,
        category: error.category,
        severity: error.severity
      });
    }
    
    this.emit('errorResolved', error);
  }

  /**
   * Checks network connectivity
   * Requirements: 9.1 - Network error detection
   */
  async checkNetworkConnectivity(): Promise<boolean> {
    try {
      const startTime = Date.now();
      
      // Try to reach a reliable endpoint
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.networkTimeoutMs)
      });
      
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        this.networkStatus = {
          isConnected: true,
          lastChecked: new Date(),
          consecutiveFailures: 0,
          latencyMs: latency
        };
        return true;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
      
    } catch (error) {
      this.networkStatus.consecutiveFailures++;
      this.networkStatus.isConnected = false;
      this.networkStatus.lastChecked = new Date();
      
      // Report network error if this is a new failure
      if (this.networkStatus.consecutiveFailures === 1) {
        await this.handleError(
          ErrorCategory.NETWORK,
          ErrorSeverity.HIGH,
          'Network connectivity lost',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
      
      return false;
    }
  }

  /**
   * Checks system resource status
   * Requirements: 9.3 - Resource monitoring and session prevention
   */
  async checkResourceStatus(): Promise<ResourceStatus> {
    try {
      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const totalMemory = require('os').totalmem();
      const memoryUsagePercent = (memoryUsage.rss / totalMemory) * 100;
      
      // Get disk space (simplified - would need platform-specific implementation)
      let diskSpaceAvailableGB = 10; // Default assumption
      try {
        const { execSync } = require('child_process');
        const diskInfo = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
        // Parse disk info for C: drive (simplified)
        const lines = diskInfo.split('\n');
        for (const line of lines) {
          if (line.includes('C:')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              diskSpaceAvailableGB = parseInt(parts[1]) / (1024 * 1024 * 1024);
            }
          }
        }
      } catch (diskError) {
        console.warn('Could not get disk space info:', diskError);
      }
      
      // Get CPU usage (simplified)
      const cpuUsagePercent = process.cpuUsage().user / 1000000; // Convert to percentage approximation
      
      // Determine if system is resource constrained
      const isResourceConstrained = 
        memoryUsagePercent > 85 || 
        diskSpaceAvailableGB < 1 || 
        cpuUsagePercent > 90;
      
      this.resourceStatus = {
        memoryUsagePercent,
        diskSpaceAvailableGB,
        cpuUsagePercent,
        isResourceConstrained,
        lastChecked: new Date()
      };
      
      // Report resource constraint if detected
      if (isResourceConstrained && !this.hasActiveError(ErrorCategory.RESOURCE)) {
        await this.handleError(
          ErrorCategory.RESOURCE,
          ErrorSeverity.HIGH,
          'System resource constraints detected',
          {
            memoryUsagePercent,
            diskSpaceAvailableGB,
            cpuUsagePercent
          }
        );
      }
      
      return this.resourceStatus;
      
    } catch (error) {
      console.error('Failed to check resource status:', error);
      
      // Assume constrained if we can't check
      this.resourceStatus.isResourceConstrained = true;
      this.resourceStatus.lastChecked = new Date();
      
      return this.resourceStatus;
    }
  }

  /**
   * Performs system integrity checks
   * Requirements: 9.5 - System recovery and integrity checks
   */
  async performIntegrityChecks(): Promise<boolean> {
    console.log('Performing system integrity checks...');
    
    try {
      let allChecksPass = true;
      
      // Check 1: Verify session manager is functional
      if (this.sessionManager) {
        try {
          const activeSessionCount = this.sessionManager.getActiveSessionCount();
          console.log(`Session manager check: ${activeSessionCount} active sessions`);
        } catch (error) {
          console.error('Session manager integrity check failed:', error);
          allChecksPass = false;
          
          await this.handleError(
            ErrorCategory.SESSION,
            ErrorSeverity.CRITICAL,
            'Session manager integrity check failed',
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
      }
      
      // Check 2: Verify print manager is functional
      if (this.printManager) {
        try {
          const printerStatus = this.printManager.getPrinterStatus();
          console.log(`Print manager check: printer status is ${printerStatus}`);
        } catch (error) {
          console.error('Print manager integrity check failed:', error);
          allChecksPass = false;
          
          await this.handleError(
            ErrorCategory.PRINTER,
            ErrorSeverity.HIGH,
            'Print manager integrity check failed',
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
      }
      
      // Check 3: Verify file system access
      try {
        const fs = require('fs/promises');
        const os = require('os');
        const path = require('path');
        
        const testDir = path.join(os.tmpdir(), 'acchu-integrity-test');
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, 'test.txt'), 'integrity test');
        await fs.rm(testDir, { recursive: true });
        
        console.log('File system integrity check: passed');
      } catch (error) {
        console.error('File system integrity check failed:', error);
        allChecksPass = false;
        
        await this.handleError(
          ErrorCategory.FILE_SYSTEM,
          ErrorSeverity.CRITICAL,
          'File system integrity check failed',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
      
      // Check 4: Verify network connectivity
      const networkOk = await this.checkNetworkConnectivity();
      if (!networkOk) {
        allChecksPass = false;
      }
      
      // Check 5: Verify resource availability
      const resourceStatus = await this.checkResourceStatus();
      if (resourceStatus.isResourceConstrained) {
        allChecksPass = false;
      }
      
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent('INTEGRITY_CHECK_COMPLETED', {
          allChecksPass,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`System integrity checks completed: ${allChecksPass ? 'PASSED' : 'FAILED'}`);
      return allChecksPass;
      
    } catch (error) {
      console.error('Failed to perform integrity checks:', error);
      
      await this.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        'System integrity check procedure failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      return false;
    }
  }

  /**
   * Starts monitoring for network and resource issues
   */
  private startMonitoring(): void {
    // Network monitoring
    this.networkMonitorInterval = setInterval(async () => {
      await this.checkNetworkConnectivity();
    }, 60000); // Check every minute
    
    // Resource monitoring
    this.resourceMonitorInterval = setInterval(async () => {
      await this.checkResourceStatus();
    }, this.config.resourceCheckIntervalMs);
    
    console.log('Error monitoring started');
  }

  /**
   * Stops monitoring
   */
  stopMonitoring(): void {
    if (this.networkMonitorInterval) {
      clearInterval(this.networkMonitorInterval);
      this.networkMonitorInterval = undefined;
    }
    
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
      this.resourceMonitorInterval = undefined;
    }
    
    console.log('Error monitoring stopped');
  }

  /**
   * Utility methods
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isRetryableError(category: ErrorCategory, severity: ErrorSeverity): boolean {
    // Critical errors are generally not retryable as they trigger fail-closed
    if (severity === ErrorSeverity.CRITICAL) {
      return false;
    }
    
    // Network and printer errors are typically retryable
    return category === ErrorCategory.NETWORK || 
           category === ErrorCategory.PRINTER ||
           category === ErrorCategory.RESOURCE;
  }

  private hasActiveError(category: ErrorCategory): boolean {
    for (const error of this.errors.values()) {
      if (error.category === category && !error.resolved) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets current system status
   */
  getSystemStatus(): {
    networkStatus: NetworkStatus;
    resourceStatus: ResourceStatus;
    activeErrors: SystemError[];
    isHealthy: boolean;
  } {
    const activeErrors = Array.from(this.errors.values()).filter(e => !e.resolved);
    const hasCriticalErrors = activeErrors.some(e => e.severity === ErrorSeverity.CRITICAL);
    
    return {
      networkStatus: { ...this.networkStatus },
      resourceStatus: { ...this.resourceStatus },
      activeErrors: activeErrors.map(e => ({ ...e })),
      isHealthy: !hasCriticalErrors && this.networkStatus.isConnected && !this.resourceStatus.isResourceConstrained
    };
  }

  /**
   * Gets error history
   */
  getErrorHistory(): SystemError[] {
    return Array.from(this.errors.values()).map(e => ({ ...e }));
  }

  /**
   * Clears resolved errors older than specified time
   */
  clearOldErrors(olderThanMs: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = new Date(Date.now() - olderThanMs);
    
    for (const [id, error] of this.errors.entries()) {
      if (error.resolved && error.timestamp < cutoffTime) {
        this.errors.delete(id);
      }
    }
  }

  /**
   * Shutdown the error handler
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down ErrorHandler...');
    
    this.stopMonitoring();
    this.removeAllListeners();
    this.errors.clear();
    this.retryAttempts.clear();
    
    console.log('ErrorHandler shutdown complete');
  }
}