import { 
  SessionId, 
  SessionStatus, 
  AuditEventType,
  AuditEvent 
} from '../types';
import { SessionManager } from './SessionManager';
import { FileHandler } from './FileHandler';
import { WindowsSecureDeletion } from './WindowsSecureDeletion';
import { AuditLogger } from './AuditLogger';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface CleanupResult {
  success: boolean;
  sessionId: SessionId;
  itemsDeleted: string[];
  errors: string[];
  verificationPassed: boolean;
  duration: number;
}

export interface CleanupConfig {
  verifyDeletion: boolean;
  logEvents: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface OrphanedSessionInfo {
  sessionId: SessionId;
  path: string;
  size: number;
  lastModified: Date;
  hasMetadata: boolean;
  fileCount: number;
}

/**
 * Comprehensive session cleanup orchestrator that handles all aspects of session data destruction
 * Requirements: 1.4, 7.3, 7.4 - Automatic cleanup, manual termination, crash recovery
 */
export class SessionCleanupOrchestrator {
  private readonly sessionManager: SessionManager;
  private readonly fileHandler: FileHandler;
  private readonly auditLogger: AuditLogger;
  private readonly defaultConfig: CleanupConfig = {
    verifyDeletion: true,
    logEvents: true,
    maxRetries: 3,
    retryDelayMs: 1000
  };

  constructor(sessionManager: SessionManager, fileHandler: FileHandler, auditLogger: AuditLogger) {
    this.sessionManager = sessionManager;
    this.fileHandler = fileHandler;
    this.auditLogger = auditLogger;
  }

  /**
   * Performs automatic cleanup when a session ends normally
   * Requirements: 1.4 - Automatic cleanup on session end
   */
  async performAutomaticCleanup(sessionId: SessionId, config?: Partial<CleanupConfig>): Promise<CleanupResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    
    console.log(`Starting automatic cleanup for session ${sessionId}`);
    
    try {
      // Log cleanup initiation
      if (finalConfig.logEvents) {
        await this.auditLogger.logSessionEvent(sessionId, AuditEventType.SESSION_TERMINATED, {
          trigger: 'automatic',
          reason: 'session_end'
        });
      }

      // Perform comprehensive cleanup
      const result = await this.executeCleanupWithRetries(sessionId, finalConfig);
      
      // Log successful cleanup
      if (finalConfig.logEvents && result.success) {
        await this.auditLogger.logSessionEvent(sessionId, AuditEventType.DATA_DESTROYED, {
          itemsDeleted: result.itemsDeleted,
          verificationPassed: result.verificationPassed,
          duration: result.duration
        });
      }

      console.log(`Automatic cleanup completed for session ${sessionId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Automatic cleanup failed for session ${sessionId}:`, error);
      
      return {
        success: false,
        sessionId,
        itemsDeleted: [],
        errors: [error instanceof Error ? error.message : String(error)],
        verificationPassed: false,
        duration
      };
    }
  }

  /**
   * Performs manual session termination with immediate cleanup
   * Requirements: 1.4 - Manual session termination functionality
   */
  async performManualTermination(sessionId: SessionId, reason?: string, config?: Partial<CleanupConfig>): Promise<CleanupResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    
    console.log(`Starting manual termination for session ${sessionId}, reason: ${reason || 'user_request'}`);
    
    try {
      // Verify session exists before termination
      const session = this.sessionManager.getSessionStatus(sessionId);
      if (!session) {
        console.warn(`Session ${sessionId} not found for manual termination`);
        return {
          success: true, // Consider it successful if already gone
          sessionId,
          itemsDeleted: [],
          errors: ['Session not found - may already be terminated'],
          verificationPassed: true,
          duration: Date.now() - startTime
        };
      }

      // Log termination initiation
      if (finalConfig.logEvents) {
        await this.auditLogger.logSessionEvent(sessionId, AuditEventType.SESSION_TERMINATED, {
          trigger: 'manual',
          reason: reason || 'user_request',
          sessionStatus: session.status
        });
      }

      // Update session status to terminated before cleanup
      await this.sessionManager.updateSessionStatus(sessionId, SessionStatus.TERMINATED);

      // Perform comprehensive cleanup
      const result = await this.executeCleanupWithRetries(sessionId, finalConfig);
      
      // Ensure session is removed from memory
      await this.sessionManager.terminateSession(sessionId);

      // Log successful cleanup
      if (finalConfig.logEvents && result.success) {
        await this.auditLogger.logSessionEvent(sessionId, AuditEventType.DATA_DESTROYED, {
          trigger: 'manual_termination',
          itemsDeleted: result.itemsDeleted,
          verificationPassed: result.verificationPassed,
          duration: result.duration
        });
      }

      console.log(`Manual termination completed for session ${sessionId}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Manual termination failed for session ${sessionId}:`, error);
      
      return {
        success: false,
        sessionId,
        itemsDeleted: [],
        errors: [error instanceof Error ? error.message : String(error)],
        verificationPassed: false,
        duration
      };
    }
  }

  /**
   * Detects and cleans up orphaned session data from system crashes
   * Requirements: 1.5, 7.2 - Crash recovery and orphaned data detection
   */
  async performCrashRecovery(config?: Partial<CleanupConfig>): Promise<{
    success: boolean;
    orphanedSessions: OrphanedSessionInfo[];
    cleanupResults: CleanupResult[];
    totalRecovered: number;
    errors: string[];
  }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    
    console.log('Starting crash recovery and orphaned data detection...');
    
    try {
      // Detect orphaned sessions
      const orphanedSessions = await this.detectOrphanedSessions();
      console.log(`Found ${orphanedSessions.length} orphaned sessions`);

      if (orphanedSessions.length === 0) {
        console.log('No orphaned sessions found');
        return {
          success: true,
          orphanedSessions: [],
          cleanupResults: [],
          totalRecovered: 0,
          errors: []
        };
      }

      // Log crash recovery initiation
      if (finalConfig.logEvents) {
        await this.auditLogger.logSystemEvent(AuditEventType.SESSION_TERMINATED, {
          trigger: 'crash_recovery',
          orphanedCount: orphanedSessions.length,
          totalSize: orphanedSessions.reduce((sum, s) => sum + s.size, 0)
        });
      }

      // Clean up each orphaned session
      const cleanupResults: CleanupResult[] = [];
      const errors: string[] = [];
      let successCount = 0;

      for (const orphanedSession of orphanedSessions) {
        try {
          console.log(`Cleaning up orphaned session: ${orphanedSession.sessionId}`);
          
          const result = await this.executeCleanupWithRetries(orphanedSession.sessionId, finalConfig);
          cleanupResults.push(result);
          
          if (result.success) {
            successCount++;
          } else {
            errors.push(...result.errors);
          }

        } catch (error) {
          const errorMsg = `Failed to cleanup orphaned session ${orphanedSession.sessionId}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      // Log crash recovery completion
      if (finalConfig.logEvents) {
        await this.auditLogger.logSystemEvent(AuditEventType.DATA_DESTROYED, {
          trigger: 'crash_recovery',
          totalOrphaned: orphanedSessions.length,
          successfullyRecovered: successCount,
          duration: Date.now() - startTime
        });
      }

      const success = successCount === orphanedSessions.length;
      console.log(`Crash recovery completed: ${successCount}/${orphanedSessions.length} sessions recovered successfully`);

      return {
        success,
        orphanedSessions,
        cleanupResults,
        totalRecovered: successCount,
        errors
      };

    } catch (error) {
      const errorMsg = `Crash recovery failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMsg);
      
      return {
        success: false,
        orphanedSessions: [],
        cleanupResults: [],
        totalRecovered: 0,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Detects orphaned session directories that may have been left behind
   */
  private async detectOrphanedSessions(): Promise<OrphanedSessionInfo[]> {
    const orphanedSessions: OrphanedSessionInfo[] = [];
    const tempDir = path.join(os.tmpdir(), 'acchu-sessions');

    try {
      // Check if temp directory exists
      try {
        await fs.access(tempDir);
      } catch {
        console.log('No temp directory found, no orphaned sessions to detect');
        return orphanedSessions;
      }

      const entries = await fs.readdir(tempDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionId = entry.name;
          const sessionPath = path.join(tempDir, sessionId);
          
          try {
            // Get directory stats
            const stats = await fs.stat(sessionPath);
            const size = await this.calculateDirectorySize(sessionPath);
            
            // Check for metadata file
            const metadataPath = path.join(sessionPath, 'metadata.json');
            let hasMetadata = false;
            try {
              await fs.access(metadataPath);
              hasMetadata = true;
            } catch {
              hasMetadata = false;
            }

            // Count files in session
            const fileCount = await this.countSessionFiles(sessionPath);

            // All sessions found during startup are considered orphaned
            // since active sessions are not persisted across restarts
            orphanedSessions.push({
              sessionId,
              path: sessionPath,
              size,
              lastModified: stats.mtime,
              hasMetadata,
              fileCount
            });

          } catch (error) {
            console.warn(`Failed to analyze potential orphaned session ${sessionId}:`, error);
          }
        }
      }

    } catch (error) {
      console.error('Failed to detect orphaned sessions:', error);
    }

    return orphanedSessions;
  }

  /**
   * Executes cleanup with retry logic and comprehensive verification
   */
  private async executeCleanupWithRetries(sessionId: SessionId, config: CleanupConfig): Promise<CleanupResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    const itemsDeleted: string[] = [];
    const errors: string[] = [];

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        console.log(`Cleanup attempt ${attempt}/${config.maxRetries} for session ${sessionId}`);

        // Step 1: Collect items to be deleted for logging
        const sessionPath = this.sessionManager.getSessionDirectory(sessionId);
        const itemsToDelete = await this.collectItemsForDeletion(sessionPath);
        
        // Step 2: Perform secure file deletion
        await this.fileHandler.secureDelete(sessionId);
        itemsDeleted.push(...itemsToDelete);

        // Step 3: Verify deletion if requested
        let verificationPassed = true;
        if (config.verifyDeletion) {
          verificationPassed = await this.verifyCleanupCompletion(sessionId, sessionPath);
          
          if (!verificationPassed) {
            throw new Error('Cleanup verification failed - some data may still exist');
          }
        }

        // Step 4: Additional cleanup verification
        const additionalVerification = await this.performAdditionalVerification(sessionId);
        if (!additionalVerification.success) {
          errors.push(...additionalVerification.errors);
        }

        console.log(`Cleanup successful for session ${sessionId} on attempt ${attempt}`);
        
        return {
          success: true,
          sessionId,
          itemsDeleted,
          errors,
          verificationPassed,
          duration: Date.now() - startTime
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = `Cleanup attempt ${attempt} failed: ${lastError.message}`;
        errors.push(errorMsg);
        console.warn(errorMsg);

        // Wait before retry (except on last attempt)
        if (attempt < config.maxRetries) {
          await this.delay(config.retryDelayMs * attempt); // Exponential backoff
        }
      }
    }

    // All attempts failed
    console.error(`All cleanup attempts failed for session ${sessionId}`);
    
    return {
      success: false,
      sessionId,
      itemsDeleted,
      errors,
      verificationPassed: false,
      duration: Date.now() - startTime
    };
  }

  /**
   * Collects list of items that will be deleted for audit logging
   */
  private async collectItemsForDeletion(sessionPath: string): Promise<string[]> {
    const items: string[] = [];
    
    try {
      const exists = await this.pathExists(sessionPath);
      if (!exists) {
        return items;
      }

      // Add the session directory itself
      items.push(sessionPath);

      // Recursively collect all files and subdirectories
      await this.collectItemsRecursively(sessionPath, items);
      
    } catch (error) {
      console.warn(`Failed to collect items for deletion from ${sessionPath}:`, error);
    }

    return items;
  }

  /**
   * Recursively collects all items in a directory
   */
  private async collectItemsRecursively(dirPath: string, items: string[]): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        items.push(fullPath);
        
        if (entry.isDirectory()) {
          await this.collectItemsRecursively(fullPath, items);
        }
      }
    } catch (error) {
      console.warn(`Failed to collect items from directory ${dirPath}:`, error);
    }
  }

  /**
   * Verifies that cleanup was completed successfully
   */
  private async verifyCleanupCompletion(sessionId: SessionId, sessionPath: string): Promise<boolean> {
    try {
      // Check if session directory still exists
      const directoryExists = await this.pathExists(sessionPath);
      if (directoryExists) {
        console.error(`Verification failed: Session directory still exists: ${sessionPath}`);
        return false;
      }

      // Use FileHandler's verification method
      const fileHandlerVerification = await this.fileHandler.verifyDeletion(sessionId);
      if (!fileHandlerVerification) {
        console.error(`Verification failed: FileHandler reports deletion incomplete for session ${sessionId}`);
        return false;
      }

      // Additional Windows-specific verification if available
      if (process.platform === 'win32') {
        const windowsVerification = await WindowsSecureDeletion.verifyDeletion(sessionPath);
        if (!windowsVerification) {
          console.error(`Verification failed: Windows secure deletion verification failed for ${sessionPath}`);
          return false;
        }
      }

      console.log(`Cleanup verification passed for session ${sessionId}`);
      return true;

    } catch (error) {
      console.error(`Verification error for session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Performs additional verification checks
   */
  private async performAdditionalVerification(sessionId: SessionId): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check if session still exists in SessionManager
      const session = this.sessionManager.getSessionStatus(sessionId);
      if (session) {
        errors.push('Session still exists in SessionManager after cleanup');
      }

      // Check for any remaining temporary files with session ID in name
      const tempDir = path.join(os.tmpdir(), 'acchu-sessions');
      try {
        const entries = await fs.readdir(tempDir);
        const remainingFiles = entries.filter(entry => entry.includes(sessionId));
        if (remainingFiles.length > 0) {
          errors.push(`Found ${remainingFiles.length} remaining files with session ID: ${remainingFiles.join(', ')}`);
        }
      } catch (error) {
        // Temp directory might not exist, which is fine
      }

      return {
        success: errors.length === 0,
        errors
      };

    } catch (error) {
      errors.push(`Additional verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, errors };
    }
  }

  /**
   * Calculates the total size of a directory
   */
  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += await this.calculateDirectorySize(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Failed to calculate directory size for ${dirPath}:`, error);
    }

    return totalSize;
  }

  /**
   * Counts the number of files in a session directory
   */
  private async countSessionFiles(sessionPath: string): Promise<number> {
    let fileCount = 0;

    try {
      const filesDir = path.join(sessionPath, 'files');
      try {
        const entries = await fs.readdir(filesDir);
        fileCount = entries.length;
      } catch {
        // Files directory might not exist
      }
    } catch (error) {
      console.warn(`Failed to count session files for ${sessionPath}:`, error);
    }

    return fileCount;
  }

  /**
   * Checks if a path exists
   */
  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets recent audit events for monitoring
   */
  async getRecentAuditEvents(limit: number = 100): Promise<AuditEvent[]> {
    return await this.auditLogger.getRecentAuditEvents(limit);
  }

  /**
   * Gets cleanup statistics for monitoring
   */
  async getCleanupStatistics(): Promise<{
    totalAuditEvents: number;
    recentCleanups: number;
    recentFailures: number;
    averageCleanupTime: number;
    orphanedSessionsDetected: number;
  }> {
    const auditStats = await this.auditLogger.getAuditStatistics();
    const recentEvents = await this.auditLogger.getRecentAuditEvents();
    
    const cleanupEvents = recentEvents.filter(e => e.eventType === AuditEventType.DATA_DESTROYED);
    const failureEvents = recentEvents.filter(e => e.metadata.success === false);
    
    const cleanupTimes = cleanupEvents
      .map(e => e.metadata.duration)
      .filter(d => typeof d === 'number');
    
    const averageCleanupTime = cleanupTimes.length > 0 
      ? cleanupTimes.reduce((sum, time) => sum + time, 0) / cleanupTimes.length 
      : 0;

    // Detect current orphaned sessions
    const orphanedSessions = await this.detectOrphanedSessions();

    return {
      totalAuditEvents: auditStats.totalAuditEvents,
      recentCleanups: cleanupEvents.length,
      recentFailures: failureEvents.length,
      averageCleanupTime,
      orphanedSessionsDetected: orphanedSessions.length
    };
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Performs a comprehensive system cleanup check
   */
  async performSystemCleanupCheck(): Promise<{
    success: boolean;
    issues: string[];
    recommendations: string[];
    systemHealth: 'good' | 'warning' | 'critical';
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check for orphaned sessions
      const orphanedSessions = await this.detectOrphanedSessions();
      if (orphanedSessions.length > 0) {
        issues.push(`Found ${orphanedSessions.length} orphaned sessions`);
        recommendations.push('Run crash recovery to clean up orphaned sessions');
      }

      // Check temp directory size
      const tempDirStats = await this.fileHandler.getTempDirectoryStats();
      if (tempDirStats.totalSessions > 10) {
        issues.push(`High number of session directories: ${tempDirStats.totalSessions}`);
        recommendations.push('Consider running cleanup to reduce session count');
      }

      // Check audit event count through audit logger
      const recentEvents = await this.auditLogger.getRecentAuditEvents(1000);
      if (recentEvents.length > 1000) {
        issues.push(`High number of audit events: ${recentEvents.length}`);
        recommendations.push('Clear old audit events to free memory');
      }

      // Determine system health
      let systemHealth: 'good' | 'warning' | 'critical' = 'good';
      if (issues.length > 0) {
        systemHealth = orphanedSessions.length > 5 ? 'critical' : 'warning';
      }

      return {
        success: true,
        issues,
        recommendations,
        systemHealth
      };

    } catch (error) {
      return {
        success: false,
        issues: [`System cleanup check failed: ${error instanceof Error ? error.message : String(error)}`],
        recommendations: ['Investigate system cleanup check failure'],
        systemHealth: 'critical'
      };
    }
  }
}