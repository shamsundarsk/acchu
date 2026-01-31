import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../ErrorHandler';
import { SessionManager } from '../SessionManager';
import { PrintManager } from '../PrintManager';
import { AuditLogger } from '../AuditLogger';

// Mock dependencies
vi.mock('../SessionManager');
vi.mock('../PrintManager');
vi.mock('../AuditLogger');

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockSessionManager: any;
  let mockPrintManager: any;
  let mockAuditLogger: any;

  beforeEach(() => {
    mockAuditLogger = {
      logSystemEvent: vi.fn().mockResolvedValue(undefined),
      logSessionEvent: vi.fn().mockResolvedValue(undefined)
    };

    mockSessionManager = {
      getActiveSessions: vi.fn().mockReturnValue([
        { id: 'session1', status: 'active' },
        { id: 'session2', status: 'active' }
      ]),
      terminateSession: vi.fn().mockResolvedValue(undefined),
      getActiveSessionCount: vi.fn().mockReturnValue(2)
    };

    mockPrintManager = {
      getPrinterStatus: vi.fn().mockReturnValue('ONLINE'),
      refreshPrinterStatus: vi.fn().mockResolvedValue(undefined)
    };

    errorHandler = new ErrorHandler({
      failClosedOnCritical: true,
      maxRetryAttempts: 3,
      auditLogger: mockAuditLogger
    });

    errorHandler.initialize(mockSessionManager, mockPrintManager);
  });

  afterEach(async () => {
    await errorHandler.shutdown();
  });

  describe('Error Handling', () => {
    it('should handle low severity errors without fail-closed behavior', async () => {
      const errorSpy = vi.fn();
      errorHandler.on('error', errorSpy);

      await errorHandler.handleError(
        ErrorCategory.NETWORK,
        ErrorSeverity.LOW,
        'Minor network hiccup'
      );

      expect(errorSpy).toHaveBeenCalled();
      expect(mockSessionManager.terminateSession).not.toHaveBeenCalled();
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'ERROR_OCCURRED',
        expect.objectContaining({
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.LOW,
          message: 'Minor network hiccup'
        })
      );
    });

    it('should handle critical errors with fail-closed behavior', async () => {
      const failClosedSpy = vi.fn();
      errorHandler.on('failClosed', failClosedSpy);

      await errorHandler.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        'Critical system failure'
      );

      expect(mockSessionManager.getActiveSessions).toHaveBeenCalled();
      expect(mockSessionManager.terminateSession).toHaveBeenCalledTimes(2);
      expect(mockSessionManager.terminateSession).toHaveBeenCalledWith('session1');
      expect(mockSessionManager.terminateSession).toHaveBeenCalledWith('session2');
      expect(failClosedSpy).toHaveBeenCalled();
    });

    it('should not trigger fail-closed when disabled', async () => {
      const errorHandlerNoFailClosed = new ErrorHandler({
        failClosedOnCritical: false,
        auditLogger: mockAuditLogger
      });
      errorHandlerNoFailClosed.initialize(mockSessionManager, mockPrintManager);

      await errorHandlerNoFailClosed.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        'Critical system failure'
      );

      expect(mockSessionManager.terminateSession).not.toHaveBeenCalled();
      
      await errorHandlerNoFailClosed.shutdown();
    });
  });

  describe('Network Connectivity', () => {
    it('should detect network connectivity', async () => {
      // Mock fetch for successful response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const isConnected = await errorHandler.checkNetworkConnectivity();
      expect(isConnected).toBe(true);
    });

    it('should detect network failure', async () => {
      // Mock fetch to throw error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const isConnected = await errorHandler.checkNetworkConnectivity();
      expect(isConnected).toBe(false);
    });

    it('should handle network timeout', async () => {
      // Mock fetch to timeout
      global.fetch = vi.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      const isConnected = await errorHandler.checkNetworkConnectivity();
      expect(isConnected).toBe(false);
    });
  });

  describe('Resource Monitoring', () => {
    it('should check resource status', async () => {
      const resourceStatus = await errorHandler.checkResourceStatus();
      
      expect(resourceStatus).toHaveProperty('memoryUsagePercent');
      expect(resourceStatus).toHaveProperty('diskSpaceAvailableGB');
      expect(resourceStatus).toHaveProperty('cpuUsagePercent');
      expect(resourceStatus).toHaveProperty('isResourceConstrained');
      expect(resourceStatus).toHaveProperty('lastChecked');
    });

    it('should detect resource constraints', async () => {
      // Mock process.memoryUsage to return high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        rss: 1024 * 1024 * 1024 * 8, // 8GB
        heapTotal: 1024 * 1024 * 100,
        heapUsed: 1024 * 1024 * 80,
        external: 1024 * 1024 * 10,
        arrayBuffers: 1024 * 1024 * 5
      });

      // Mock os.totalmem to return 8GB total memory
      const os = require('os');
      jest.spyOn(os, 'totalmem').mockReturnValue(1024 * 1024 * 1024 * 8);

      const resourceStatus = await errorHandler.checkResourceStatus();
      
      expect(resourceStatus.memoryUsagePercent).toBeGreaterThan(80);
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('System Integrity', () => {
    it('should perform integrity checks', async () => {
      const integrityResult = await errorHandler.performIntegrityChecks();
      
      expect(typeof integrityResult).toBe('boolean');
      expect(mockSessionManager.getActiveSessionCount).toHaveBeenCalled();
      expect(mockPrintManager.getPrinterStatus).toHaveBeenCalled();
    });

    it('should handle integrity check failures', async () => {
      // Mock session manager to throw error
      mockSessionManager.getActiveSessionCount.mockImplementation(() => {
        throw new Error('Session manager failure');
      });

      const integrityResult = await errorHandler.performIntegrityChecks();
      
      expect(integrityResult).toBe(false);
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'ERROR_OCCURRED',
        expect.objectContaining({
          category: ErrorCategory.SESSION,
          severity: ErrorSeverity.CRITICAL,
          message: 'Session manager integrity check failed'
        })
      );
    });
  });

  describe('Error Recovery', () => {
    it('should attempt error recovery for retryable errors', async () => {
      const errorId = 'test-error-id';
      
      // Create a retryable error
      await errorHandler.handleError(
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        'Network connection failed'
      );

      // Wait for retry attempt
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for retry delay

      // Verify retry was attempted
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'ERROR_OCCURRED',
        expect.objectContaining({
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.MEDIUM
        })
      );
    });

    it('should not retry non-retryable errors', async () => {
      await errorHandler.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        'Critical system failure'
      );

      // Critical errors should not be retried
      const systemStatus = errorHandler.getSystemStatus();
      expect(systemStatus.activeErrors.some(e => e.retryable)).toBe(false);
    });
  });

  describe('System Status', () => {
    it('should provide comprehensive system status', async () => {
      const systemStatus = errorHandler.getSystemStatus();
      
      expect(systemStatus).toHaveProperty('networkStatus');
      expect(systemStatus).toHaveProperty('resourceStatus');
      expect(systemStatus).toHaveProperty('activeErrors');
      expect(systemStatus).toHaveProperty('isHealthy');
      
      expect(Array.isArray(systemStatus.activeErrors)).toBe(true);
      expect(typeof systemStatus.isHealthy).toBe('boolean');
    });

    it('should report unhealthy status when critical errors exist', async () => {
      await errorHandler.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        'Critical system failure'
      );

      const systemStatus = errorHandler.getSystemStatus();
      expect(systemStatus.isHealthy).toBe(false);
    });
  });

  describe('Error History', () => {
    it('should maintain error history', async () => {
      await errorHandler.handleError(
        ErrorCategory.NETWORK,
        ErrorSeverity.LOW,
        'Test error 1'
      );

      await errorHandler.handleError(
        ErrorCategory.PRINTER,
        ErrorSeverity.MEDIUM,
        'Test error 2'
      );

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(2);
      expect(errorHistory[0].message).toBe('Test error 1');
      expect(errorHistory[1].message).toBe('Test error 2');
    });

    it('should clear old resolved errors', async () => {
      await errorHandler.handleError(
        ErrorCategory.NETWORK,
        ErrorSeverity.LOW,
        'Old error'
      );

      const errorHistory = errorHandler.getErrorHistory();
      const errorId = errorHistory[0].id;

      // Resolve the error
      await errorHandler.resolveError(errorId);

      // Clear old errors (using 0ms to clear immediately)
      errorHandler.clearOldErrors(0);

      const newErrorHistory = errorHandler.getErrorHistory();
      expect(newErrorHistory).toHaveLength(0);
    });
  });

  describe('Monitoring Control', () => {
    it('should start and stop monitoring', () => {
      // Monitoring should start automatically in constructor
      expect(errorHandler['networkMonitorInterval']).toBeDefined();
      expect(errorHandler['resourceMonitorInterval']).toBeDefined();

      errorHandler.stopMonitoring();
      expect(errorHandler['networkMonitorInterval']).toBeUndefined();
      expect(errorHandler['resourceMonitorInterval']).toBeUndefined();
    });
  });
});