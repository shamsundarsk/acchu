import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionCleanupOrchestrator, CleanupResult } from '../SessionCleanupOrchestrator';
import { SessionManager } from '../SessionManager';
import { FileHandler } from '../FileHandler';
import { SessionStatus, AuditEventType } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock the dependencies
vi.mock('fs/promises');
vi.mock('../WindowsSecureDeletion');

describe('SessionCleanupOrchestrator', () => {
  let orchestrator: SessionCleanupOrchestrator;
  let mockSessionManager: SessionManager;
  let mockFileHandler: FileHandler;
  let testSessionId: string;

  beforeEach(() => {
    // Create mock instances
    mockSessionManager = {
      getSessionStatus: vi.fn(),
      updateSessionStatus: vi.fn(),
      terminateSession: vi.fn(),
      getSessionDirectory: vi.fn(),
    } as any;

    mockFileHandler = {
      secureDelete: vi.fn(),
      verifyDeletion: vi.fn(),
      getTempDirectoryStats: vi.fn(),
      sessionExists: vi.fn(),
    } as any;

    orchestrator = new SessionCleanupOrchestrator(mockSessionManager, mockFileHandler);
    testSessionId = 'test-session-' + Date.now();

    // Setup default mock implementations
    vi.mocked(mockSessionManager.getSessionDirectory).mockReturnValue(`/tmp/acchu-sessions/${testSessionId}`);
    vi.mocked(mockFileHandler.secureDelete).mockResolvedValue(undefined);
    vi.mocked(mockFileHandler.verifyDeletion).mockResolvedValue(true);
    
    // Setup default fs mocks
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Automatic Cleanup', () => {
    it('should perform successful automatic cleanup', async () => {
      // Setup mocks for successful cleanup
      vi.mocked(fs.readdir).mockResolvedValue([]);
      
      // Mock fs.access to simulate directory deletion (should throw ENOENT after cleanup)
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(testSessionId);
      expect(result.verificationPassed).toBe(true);
      expect(mockFileHandler.secureDelete).toHaveBeenCalledWith(testSessionId);
      expect(mockFileHandler.verifyDeletion).toHaveBeenCalledWith(testSessionId);
    });

    it('should handle cleanup failures with retries', async () => {
      // Make secure delete fail initially, then succeed
      vi.mocked(mockFileHandler.secureDelete)
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce(undefined);

      // Mock successful verification after retry
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      expect(result.success).toBe(true);
      expect(mockFileHandler.secureDelete).toHaveBeenCalledTimes(2);
      expect(result.errors).toContain('Cleanup attempt 1 failed: First attempt failed');
    });

    it('should fail after maximum retries', async () => {
      // Make secure delete always fail
      vi.mocked(mockFileHandler.secureDelete).mockRejectedValue(new Error('Persistent failure'));

      const result = await orchestrator.performAutomaticCleanup(testSessionId, { maxRetries: 2 });

      expect(result.success).toBe(false);
      expect(mockFileHandler.secureDelete).toHaveBeenCalledTimes(2);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle verification failures', async () => {
      vi.mocked(mockFileHandler.verifyDeletion).mockResolvedValue(false);
      // Mock directory still exists (verification failure)
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      expect(result.success).toBe(false);
      expect(result.verificationPassed).toBe(false);
      expect(result.errors.some(error => error.includes('verification failed'))).toBe(true);
    });
  });

  describe('Manual Termination', () => {
    it('should perform successful manual termination', async () => {
      const mockSession = {
        id: testSessionId,
        status: SessionStatus.ACTIVE,
        shopId: 'test-shop',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [],
        paymentStatus: 'pending'
      };

      vi.mocked(mockSessionManager.getSessionStatus).mockReturnValue(mockSession as any);
      vi.mocked(mockSessionManager.updateSessionStatus).mockResolvedValue(true);
      vi.mocked(mockSessionManager.terminateSession).mockResolvedValue(undefined);
      // Mock successful cleanup verification
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await orchestrator.performManualTermination(testSessionId, 'user_request');

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(testSessionId);
      expect(mockSessionManager.updateSessionStatus).toHaveBeenCalledWith(testSessionId, SessionStatus.TERMINATED);
      expect(mockSessionManager.terminateSession).toHaveBeenCalledWith(testSessionId);
      expect(mockFileHandler.secureDelete).toHaveBeenCalledWith(testSessionId);
    });

    it('should handle termination of non-existent session gracefully', async () => {
      vi.mocked(mockSessionManager.getSessionStatus).mockReturnValue(null);

      const result = await orchestrator.performManualTermination(testSessionId);

      expect(result.success).toBe(true);
      expect(result.errors).toContain('Session not found - may already be terminated');
      expect(mockFileHandler.secureDelete).not.toHaveBeenCalled();
    });

    it('should handle session manager errors during termination', async () => {
      const mockSession = {
        id: testSessionId,
        status: SessionStatus.ACTIVE,
        shopId: 'test-shop',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [],
        paymentStatus: 'pending'
      };

      vi.mocked(mockSessionManager.getSessionStatus).mockReturnValue(mockSession as any);
      vi.mocked(mockSessionManager.updateSessionStatus).mockRejectedValue(new Error('Update failed'));

      const result = await orchestrator.performManualTermination(testSessionId);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('Update failed'))).toBe(true);
    });
  });

  describe('Crash Recovery', () => {
    it('should detect and clean up orphaned sessions', async () => {
      const tempDir = path.join(os.tmpdir(), 'acchu-sessions');
      const orphanedSessionId1 = 'orphaned-1';
      const orphanedSessionId2 = 'orphaned-2';

      // Mock directory structure
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: orphanedSessionId1, isDirectory: () => true },
        { name: orphanedSessionId2, isDirectory: () => true },
        { name: 'not-a-directory.txt', isDirectory: () => false }
      ] as any);

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date(),
        isDirectory: () => true
      } as any);

      // Mock successful cleanup for both sessions
      vi.mocked(mockFileHandler.secureDelete).mockResolvedValue(undefined);
      vi.mocked(mockFileHandler.verifyDeletion).mockResolvedValue(true);

      const result = await orchestrator.performCrashRecovery();

      expect(result.success).toBe(true);
      expect(result.orphanedSessions).toHaveLength(2);
      expect(result.totalRecovered).toBe(2);
      expect(result.cleanupResults).toHaveLength(2);
      expect(mockFileHandler.secureDelete).toHaveBeenCalledTimes(2);
    });

    it('should handle no orphaned sessions gracefully', async () => {
      // Mock empty temp directory
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await orchestrator.performCrashRecovery();

      expect(result.success).toBe(true);
      expect(result.orphanedSessions).toHaveLength(0);
      expect(result.totalRecovered).toBe(0);
      expect(result.cleanupResults).toHaveLength(0);
    });

    it('should handle missing temp directory', async () => {
      // Mock temp directory not existing
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await orchestrator.performCrashRecovery();

      expect(result.success).toBe(true);
      expect(result.orphanedSessions).toHaveLength(0);
      expect(result.totalRecovered).toBe(0);
    });

    it('should handle partial cleanup failures during crash recovery', async () => {
      const orphanedSessionId1 = 'orphaned-1';
      const orphanedSessionId2 = 'orphaned-2';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: orphanedSessionId1, isDirectory: () => true },
        { name: orphanedSessionId2, isDirectory: () => true }
      ] as any);

      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date(),
        isDirectory: () => true
      } as any);

      // Make first cleanup succeed, second fail
      vi.mocked(mockFileHandler.secureDelete)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Cleanup failed'));

      vi.mocked(mockFileHandler.verifyDeletion).mockResolvedValue(true);

      const result = await orchestrator.performCrashRecovery();

      expect(result.success).toBe(false); // Not all sessions recovered
      expect(result.orphanedSessions).toHaveLength(2);
      expect(result.totalRecovered).toBe(1); // Only one succeeded
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup Verification', () => {
    it('should verify cleanup completion successfully', async () => {
      // Mock successful verification
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT')); // Directory doesn't exist
      vi.mocked(mockFileHandler.verifyDeletion).mockResolvedValue(true);

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      expect(result.success).toBe(true);
      expect(result.verificationPassed).toBe(true);
    });

    it('should detect verification failures', async () => {
      // Mock verification failure - directory still exists
      vi.mocked(fs.access).mockResolvedValue(undefined); // Directory still exists
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      expect(result.success).toBe(false);
      expect(result.verificationPassed).toBe(false);
    });

    it('should handle verification errors gracefully', async () => {
      // Mock verification throwing an error
      vi.mocked(fs.access).mockRejectedValue(new Error('Permission denied'));
      vi.mocked(mockFileHandler.verifyDeletion).mockRejectedValue(new Error('Verification error'));

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      expect(result.success).toBe(false);
      expect(result.verificationPassed).toBe(false);
    });
  });

  describe('Audit Logging', () => {
    it('should log audit events during cleanup', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockResolvedValue([]);

      await orchestrator.performAutomaticCleanup(testSessionId);

      const auditEvents = orchestrator.getRecentAuditEvents();
      expect(auditEvents.length).toBeGreaterThan(0);
      
      const terminationEvent = auditEvents.find(e => e.eventType === AuditEventType.SESSION_TERMINATED);
      const destructionEvent = auditEvents.find(e => e.eventType === AuditEventType.DATA_DESTROYED);
      
      expect(terminationEvent).toBeDefined();
      expect(destructionEvent).toBeDefined();
    });

    it('should clear old audit events', async () => {
      // Add some events first
      await orchestrator.performAutomaticCleanup(testSessionId);
      
      const initialCount = orchestrator.getRecentAuditEvents().length;
      expect(initialCount).toBeGreaterThan(0);

      // Clear events older than 0 hours (should clear all)
      const clearedCount = orchestrator.clearOldAuditEvents(0);
      
      expect(clearedCount).toBe(initialCount);
      expect(orchestrator.getRecentAuditEvents()).toHaveLength(0);
    });
  });

  describe('System Health Monitoring', () => {
    it('should provide cleanup statistics', async () => {
      // Perform some cleanup operations first
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(mockFileHandler.getTempDirectoryStats).mockResolvedValue({
        totalSessions: 0,
        totalSize: 0
      });

      await orchestrator.performAutomaticCleanup(testSessionId);

      const stats = await orchestrator.getCleanupStatistics();

      expect(stats).toBeDefined();
      expect(typeof stats.totalAuditEvents).toBe('number');
      expect(typeof stats.recentCleanups).toBe('number');
      expect(typeof stats.recentFailures).toBe('number');
      expect(typeof stats.averageCleanupTime).toBe('number');
      expect(typeof stats.orphanedSessionsDetected).toBe('number');
    });

    it('should perform system cleanup check', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue([]);
      vi.mocked(mockFileHandler.getTempDirectoryStats).mockResolvedValue({
        totalSessions: 2,
        totalSize: 1024
      });

      const healthCheck = await orchestrator.performSystemCleanupCheck();

      expect(healthCheck).toBeDefined();
      expect(typeof healthCheck.success).toBe('boolean');
      expect(Array.isArray(healthCheck.issues)).toBe(true);
      expect(Array.isArray(healthCheck.recommendations)).toBe(true);
      expect(['good', 'warning', 'critical']).toContain(healthCheck.systemHealth);
    });

    it('should detect system health issues', async () => {
      // Mock many orphaned sessions
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readdir).mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({ 
          name: `orphaned-${i}`, 
          isDirectory: () => true 
        })) as any
      );
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: new Date(),
        isDirectory: () => true
      } as any);
      vi.mocked(mockFileHandler.getTempDirectoryStats).mockResolvedValue({
        totalSessions: 15,
        totalSize: 1024 * 1024
      });

      const healthCheck = await orchestrator.performSystemCleanupCheck();

      expect(healthCheck.systemHealth).toBe('critical');
      expect(healthCheck.issues.length).toBeGreaterThan(0);
      expect(healthCheck.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File system error'));
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Cannot read directory'));

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      // Should still attempt cleanup even with file system errors
      expect(mockFileHandler.secureDelete).toHaveBeenCalled();
    });

    it('should handle session manager errors during cleanup', async () => {
      vi.mocked(mockSessionManager.getSessionStatus).mockImplementation(() => {
        throw new Error('SessionManager error');
      });

      const result = await orchestrator.performManualTermination(testSessionId);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('SessionManager error'))).toBe(true);
    });

    it('should handle file handler errors during cleanup', async () => {
      vi.mocked(mockFileHandler.secureDelete).mockRejectedValue(new Error('FileHandler error'));

      const result = await orchestrator.performAutomaticCleanup(testSessionId, { maxRetries: 1 });

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('FileHandler error'))).toBe(true);
    });
  });

  describe('Configuration Options', () => {
    it('should respect custom configuration options', async () => {
      const customConfig = {
        verifyDeletion: false,
        logEvents: false,
        maxRetries: 1,
        retryDelayMs: 100
      };

      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockResolvedValue([]);

      const result = await orchestrator.performAutomaticCleanup(testSessionId, customConfig);

      expect(result.success).toBe(true);
      // With verifyDeletion: false, verification should be skipped
      expect(result.verificationPassed).toBe(true);
    });

    it('should use default configuration when not provided', async () => {
      vi.mocked(mockFileHandler.secureDelete).mockRejectedValue(new Error('Test failure'));

      const result = await orchestrator.performAutomaticCleanup(testSessionId);

      // Should use default maxRetries (3)
      expect(mockFileHandler.secureDelete).toHaveBeenCalledTimes(3);
    });
  });
});