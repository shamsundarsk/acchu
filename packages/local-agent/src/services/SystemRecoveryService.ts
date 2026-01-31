import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from './SessionManager';
import { PrintManager } from './PrintManager';
import { AuditLogger } from './AuditLogger';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './ErrorHandler';
import { ResourceMonitor } from './ResourceMonitor';
import { PrinterStatus } from '../types';

/**
 * System component health status
 */
export interface ComponentHealth {
  name: string;
  isHealthy: boolean;
  lastChecked: Date;
  error?: string;
  details?: any;
}

/**
 * System integrity check result
 */
export interface IntegrityCheckResult {
  overallHealth: boolean;
  components: ComponentHealth[];
  timestamp: Date;
  recoveryActions: string[];
}

/**
 * Recovery action result
 */
export interface RecoveryActionResult {
  action: string;
  success: boolean;
  message: string;
  timestamp: Date;
}

/**
 * System recovery configuration
 */
export interface SystemRecoveryConfig {
  integrityCheckIntervalMs?: number;
  autoRecoveryEnabled?: boolean;
  maxRecoveryAttempts?: number;
  recoveryTimeoutMs?: number;
}

/**
 * System recovery service for integrity checks and automated recovery
 * Requirements: 9.5 - System recovery and integrity checks
 */
export class SystemRecoveryService extends EventEmitter {
  private config: Required<SystemRecoveryConfig>;
  private sessionManager?: SessionManager;
  private printManager?: PrintManager;
  private auditLogger?: AuditLogger;
  private errorHandler?: ErrorHandler;
  private resourceMonitor?: ResourceMonitor;
  
  private integrityCheckInterval?: NodeJS.Timeout;
  private lastIntegrityCheck?: IntegrityCheckResult;
  private recoveryAttempts: Map<string, number> = new Map();
  private isRecovering = false;

  constructor(config: SystemRecoveryConfig = {}) {
    super();
    
    this.config = {
      integrityCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
      autoRecoveryEnabled: true,
      maxRecoveryAttempts: 3,
      recoveryTimeoutMs: 30000, // 30 seconds
      ...config
    };
  }

  /**
   * Initialize the recovery service with system components
   */
  initialize(
    sessionManager: SessionManager,
    printManager: PrintManager,
    auditLogger: AuditLogger,
    errorHandler: ErrorHandler,
    resourceMonitor: ResourceMonitor
  ): void {
    this.sessionManager = sessionManager;
    this.printManager = printManager;
    this.auditLogger = auditLogger;
    this.errorHandler = errorHandler;
    this.resourceMonitor = resourceMonitor;
    
    console.log('SystemRecoveryService initialized with all components');
  }

  /**
   * Starts periodic integrity checks
   */
  startPeriodicChecks(): void {
    if (this.integrityCheckInterval) {
      return;
    }
    
    // Perform initial check
    this.performIntegrityCheck();
    
    // Schedule periodic checks
    this.integrityCheckInterval = setInterval(() => {
      this.performIntegrityCheck();
    }, this.config.integrityCheckIntervalMs);
    
    console.log(`Periodic integrity checks started (interval: ${this.config.integrityCheckIntervalMs}ms)`);
  }

  /**
   * Stops periodic integrity checks
   */
  stopPeriodicChecks(): void {
    if (this.integrityCheckInterval) {
      clearInterval(this.integrityCheckInterval);
      this.integrityCheckInterval = undefined;
      console.log('Periodic integrity checks stopped');
    }
  }

  /**
   * Performs comprehensive system integrity check
   * Requirements: 9.5 - System recovery and integrity checks
   */
  async performIntegrityCheck(): Promise<IntegrityCheckResult> {
    console.log('Performing system integrity check...');
    
    const components: ComponentHealth[] = [];
    const recoveryActions: string[] = [];
    
    try {
      // Check 1: Session Manager
      components.push(await this.checkSessionManagerHealth());
      
      // Check 2: Print Manager
      components.push(await this.checkPrintManagerHealth());
      
      // Check 3: File System Access
      components.push(await this.checkFileSystemHealth());
      
      // Check 4: Resource Status
      components.push(await this.checkResourceHealth());
      
      // Check 5: Network Connectivity
      components.push(await this.checkNetworkHealth());
      
      // Check 6: Audit Logger
      components.push(await this.checkAuditLoggerHealth());
      
      // Check 7: Temporary Directory Integrity
      components.push(await this.checkTempDirectoryHealth());
      
      // Determine overall health
      const overallHealth = components.every(c => c.isHealthy);
      
      // Identify recovery actions needed
      for (const component of components) {
        if (!component.isHealthy) {
          recoveryActions.push(`Recover ${component.name}: ${component.error}`);
        }
      }
      
      const result: IntegrityCheckResult = {
        overallHealth,
        components,
        timestamp: new Date(),
        recoveryActions
      };
      
      this.lastIntegrityCheck = result;
      
      // Log the check result
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent('INTEGRITY_CHECK_COMPLETED', {
          overallHealth,
          unhealthyComponents: components.filter(c => !c.isHealthy).length,
          recoveryActionsNeeded: recoveryActions.length
        });
      }
      
      this.emit('integrityCheckCompleted', result);
      
      // Trigger recovery if needed and auto-recovery is enabled
      if (!overallHealth && this.config.autoRecoveryEnabled && !this.isRecovering) {
        await this.initiateSystemRecovery(result);
      }
      
      console.log(`Integrity check completed: ${overallHealth ? 'HEALTHY' : 'ISSUES DETECTED'}`);
      return result;
      
    } catch (error) {
      console.error('Failed to perform integrity check:', error);
      
      const errorResult: IntegrityCheckResult = {
        overallHealth: false,
        components: [{
          name: 'IntegrityCheck',
          isHealthy: false,
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : String(error)
        }],
        timestamp: new Date(),
        recoveryActions: ['Investigate integrity check failure']
      };
      
      this.lastIntegrityCheck = errorResult;
      return errorResult;
    }
  }

  /**
   * Checks Session Manager health
   */
  private async checkSessionManagerHealth(): Promise<ComponentHealth> {
    try {
      if (!this.sessionManager) {
        return {
          name: 'SessionManager',
          isHealthy: false,
          lastChecked: new Date(),
          error: 'SessionManager not initialized'
        };
      }
      
      // Test basic functionality
      const activeSessionCount = this.sessionManager.getActiveSessionCount();
      const activeSessions = this.sessionManager.getActiveSessions();
      
      // Verify session data consistency
      if (activeSessions.length !== activeSessionCount) {
        throw new Error('Session count mismatch detected');
      }
      
      return {
        name: 'SessionManager',
        isHealthy: true,
        lastChecked: new Date(),
        details: {
          activeSessionCount,
          sessionsConsistent: true
        }
      };
      
    } catch (error) {
      return {
        name: 'SessionManager',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks Print Manager health
   */
  private async checkPrintManagerHealth(): Promise<ComponentHealth> {
    try {
      if (!this.printManager) {
        return {
          name: 'PrintManager',
          isHealthy: false,
          lastChecked: new Date(),
          error: 'PrintManager not initialized'
        };
      }
      
      // Check printer status
      const printerStatus = this.printManager.getPrinterStatus();
      const availablePrinters = this.printManager.getAvailablePrinters();
      const queueStatus = this.printManager.getQueueStatus();
      
      // Printer should be available for the system to be healthy
      const isHealthy = printerStatus === PrinterStatus.ONLINE && availablePrinters.length > 0;
      
      return {
        name: 'PrintManager',
        isHealthy,
        lastChecked: new Date(),
        error: isHealthy ? undefined : `Printer status: ${printerStatus}`,
        details: {
          printerStatus,
          availablePrinters: availablePrinters.length,
          queueStatus
        }
      };
      
    } catch (error) {
      return {
        name: 'PrintManager',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks file system health
   */
  private async checkFileSystemHealth(): Promise<ComponentHealth> {
    try {
      const testDir = path.join(os.tmpdir(), 'acchu-integrity-test');
      const testFile = path.join(testDir, 'test.txt');
      const testContent = 'integrity test';
      
      // Test directory creation
      await fs.mkdir(testDir, { recursive: true });
      
      // Test file write
      await fs.writeFile(testFile, testContent, 'utf8');
      
      // Test file read
      const readContent = await fs.readFile(testFile, 'utf8');
      if (readContent !== testContent) {
        throw new Error('File content mismatch');
      }
      
      // Test file deletion
      await fs.unlink(testFile);
      
      // Test directory deletion
      await fs.rmdir(testDir);
      
      return {
        name: 'FileSystem',
        isHealthy: true,
        lastChecked: new Date(),
        details: {
          testPath: testDir,
          operationsSuccessful: true
        }
      };
      
    } catch (error) {
      return {
        name: 'FileSystem',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks resource health
   */
  private async checkResourceHealth(): Promise<ComponentHealth> {
    try {
      if (!this.resourceMonitor) {
        return {
          name: 'ResourceMonitor',
          isHealthy: false,
          lastChecked: new Date(),
          error: 'ResourceMonitor not initialized'
        };
      }
      
      const resourceStatus = this.resourceMonitor.getResourceStatus();
      const currentMetrics = resourceStatus.currentMetrics;
      
      if (!currentMetrics) {
        throw new Error('No resource metrics available');
      }
      
      const isHealthy = !resourceStatus.isConstrained;
      
      return {
        name: 'ResourceMonitor',
        isHealthy,
        lastChecked: new Date(),
        error: isHealthy ? undefined : 'System resource constraints detected',
        details: {
          memoryUsage: currentMetrics.memory.usagePercent,
          diskFree: currentMetrics.disk.freeGB,
          cpuUsage: currentMetrics.cpu.usagePercent,
          activeAlerts: resourceStatus.activeAlerts.length
        }
      };
      
    } catch (error) {
      return {
        name: 'ResourceMonitor',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks network health
   */
  private async checkNetworkHealth(): Promise<ComponentHealth> {
    try {
      // Simple connectivity test
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const isHealthy = response.ok;
      
      return {
        name: 'Network',
        isHealthy,
        lastChecked: new Date(),
        error: isHealthy ? undefined : `HTTP ${response.status}`,
        details: {
          statusCode: response.status,
          responseTime: Date.now()
        }
      };
      
    } catch (error) {
      return {
        name: 'Network',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks audit logger health
   */
  private async checkAuditLoggerHealth(): Promise<ComponentHealth> {
    try {
      if (!this.auditLogger) {
        return {
          name: 'AuditLogger',
          isHealthy: false,
          lastChecked: new Date(),
          error: 'AuditLogger not initialized'
        };
      }
      
      // Test logging functionality
      await this.auditLogger.logSystemEvent('HEALTH_CHECK', {
        timestamp: new Date().toISOString()
      });
      
      return {
        name: 'AuditLogger',
        isHealthy: true,
        lastChecked: new Date(),
        details: {
          testLogSuccessful: true
        }
      };
      
    } catch (error) {
      return {
        name: 'AuditLogger',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Checks temporary directory health
   */
  private async checkTempDirectoryHealth(): Promise<ComponentHealth> {
    try {
      const tempDir = path.join(os.tmpdir(), 'acchu-sessions');
      
      // Check if temp directory exists and is accessible
      await fs.access(tempDir);
      
      // Check directory permissions
      const stats = await fs.stat(tempDir);
      if (!stats.isDirectory()) {
        throw new Error('Temp path is not a directory');
      }
      
      // Check for orphaned files (this is a simplified check)
      const entries = await fs.readdir(tempDir);
      
      return {
        name: 'TempDirectory',
        isHealthy: true,
        lastChecked: new Date(),
        details: {
          path: tempDir,
          exists: true,
          entryCount: entries.length
        }
      };
      
    } catch (error) {
      return {
        name: 'TempDirectory',
        isHealthy: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Initiates system recovery procedures
   */
  private async initiateSystemRecovery(integrityResult: IntegrityCheckResult): Promise<void> {
    if (this.isRecovering) {
      console.log('Recovery already in progress, skipping');
      return;
    }
    
    this.isRecovering = true;
    console.log('Initiating system recovery procedures...');
    
    try {
      const recoveryResults: RecoveryActionResult[] = [];
      
      for (const component of integrityResult.components) {
        if (!component.isHealthy) {
          const result = await this.recoverComponent(component);
          recoveryResults.push(result);
        }
      }
      
      // Log recovery completion
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent('SYSTEM_RECOVERY_COMPLETED', {
          recoveryActions: recoveryResults.length,
          successfulActions: recoveryResults.filter(r => r.success).length,
          failedActions: recoveryResults.filter(r => !r.success).length
        });
      }
      
      this.emit('systemRecoveryCompleted', {
        integrityResult,
        recoveryResults
      });
      
      // Perform another integrity check to verify recovery
      setTimeout(() => {
        this.performIntegrityCheck();
      }, 5000);
      
    } catch (error) {
      console.error('System recovery failed:', error);
      
      if (this.errorHandler) {
        await this.errorHandler.handleError(
          ErrorCategory.SYSTEM,
          ErrorSeverity.CRITICAL,
          'System recovery procedure failed',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    } finally {
      this.isRecovering = false;
    }
  }

  /**
   * Attempts to recover a specific component
   */
  private async recoverComponent(component: ComponentHealth): Promise<RecoveryActionResult> {
    const attemptKey = component.name;
    const currentAttempts = this.recoveryAttempts.get(attemptKey) || 0;
    
    if (currentAttempts >= this.config.maxRecoveryAttempts) {
      return {
        action: `Recover ${component.name}`,
        success: false,
        message: 'Max recovery attempts exceeded',
        timestamp: new Date()
      };
    }
    
    this.recoveryAttempts.set(attemptKey, currentAttempts + 1);
    
    try {
      console.log(`Attempting to recover ${component.name} (attempt ${currentAttempts + 1}/${this.config.maxRecoveryAttempts})`);
      
      switch (component.name) {
        case 'PrintManager':
          await this.recoverPrintManager();
          break;
        case 'Network':
          await this.recoverNetwork();
          break;
        case 'FileSystem':
          await this.recoverFileSystem();
          break;
        case 'TempDirectory':
          await this.recoverTempDirectory();
          break;
        default:
          throw new Error(`No recovery procedure for ${component.name}`);
      }
      
      // Reset attempt counter on success
      this.recoveryAttempts.delete(attemptKey);
      
      return {
        action: `Recover ${component.name}`,
        success: true,
        message: 'Recovery successful',
        timestamp: new Date()
      };
      
    } catch (error) {
      return {
        action: `Recover ${component.name}`,
        success: false,
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      };
    }
  }

  /**
   * Recovers print manager
   */
  private async recoverPrintManager(): Promise<void> {
    if (!this.printManager) {
      throw new Error('PrintManager not available');
    }
    
    // Refresh printer detection
    await this.printManager.refreshPrinterStatus();
    
    // Verify printer is now available
    const printerStatus = this.printManager.getPrinterStatus();
    if (printerStatus !== PrinterStatus.ONLINE) {
      throw new Error(`Printer still ${printerStatus.toLowerCase()}`);
    }
  }

  /**
   * Recovers network connectivity
   */
  private async recoverNetwork(): Promise<void> {
    // Wait a moment for network to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test connectivity
    const response = await fetch('https://www.google.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      throw new Error(`Network still unavailable: HTTP ${response.status}`);
    }
  }

  /**
   * Recovers file system
   */
  private async recoverFileSystem(): Promise<void> {
    // Attempt to recreate temp directory structure
    const tempDir = path.join(os.tmpdir(), 'acchu-sessions');
    await fs.mkdir(tempDir, { recursive: true });
    
    // Test file operations
    const testFile = path.join(tempDir, 'recovery-test.txt');
    await fs.writeFile(testFile, 'recovery test', 'utf8');
    await fs.unlink(testFile);
  }

  /**
   * Recovers temporary directory
   */
  private async recoverTempDirectory(): Promise<void> {
    const tempDir = path.join(os.tmpdir(), 'acchu-sessions');
    
    // Recreate directory if it doesn't exist
    await fs.mkdir(tempDir, { recursive: true });
    
    // Clean up any orphaned files
    if (this.sessionManager) {
      await this.sessionManager.cleanupOrphanedSessions();
    }
  }

  /**
   * Gets the last integrity check result
   */
  getLastIntegrityCheck(): IntegrityCheckResult | null {
    return this.lastIntegrityCheck || null;
  }

  /**
   * Forces an immediate integrity check
   */
  async forceIntegrityCheck(): Promise<IntegrityCheckResult> {
    return this.performIntegrityCheck();
  }

  /**
   * Gets recovery status
   */
  getRecoveryStatus(): {
    isRecovering: boolean;
    lastCheck: IntegrityCheckResult | null;
    recoveryAttempts: Record<string, number>;
  } {
    return {
      isRecovering: this.isRecovering,
      lastCheck: this.lastIntegrityCheck || null,
      recoveryAttempts: Object.fromEntries(this.recoveryAttempts)
    };
  }

  /**
   * Resets recovery attempt counters
   */
  resetRecoveryAttempts(): void {
    this.recoveryAttempts.clear();
    console.log('Recovery attempt counters reset');
  }

  /**
   * Shutdown the recovery service
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down SystemRecoveryService...');
    
    this.stopPeriodicChecks();
    this.removeAllListeners();
    this.recoveryAttempts.clear();
    
    console.log('SystemRecoveryService shutdown complete');
  }
}