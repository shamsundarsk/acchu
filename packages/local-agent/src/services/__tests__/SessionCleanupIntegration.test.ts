import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionCleanupOrchestrator } from '../SessionCleanupOrchestrator';
import { SessionManager } from '../SessionManager';
import { FileHandler } from '../FileHandler';
import { SessionStatus } from '../../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('SessionCleanupOrchestrator Integration', () => {
  let orchestrator: SessionCleanupOrchestrator;
  let sessionManager: SessionManager;
  let fileHandler: FileHandler;
  let testTempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testTempDir = path.join(os.tmpdir(), 'test-cleanup-integration-' + Date.now());
    
    // Initialize real services with test configuration
    sessionManager = new SessionManager({
      shopId: 'test-shop',
      sessionTimeoutMinutes: 1, // Short timeout for testing
      tempDirectory: testTempDir
    });
    
    fileHandler = new FileHandler();
    orchestrator = new SessionCleanupOrchestrator(sessionManager, fileHandler);
  });

  afterEach(async () => {
    try {
      // Clean up test directory
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should integrate with SessionManager for manual termination', async () => {
    // Create a session
    const sessionId = await sessionManager.createSession();
    
    // Verify session exists
    let session = sessionManager.getSessionStatus(sessionId);
    expect(session).toBeDefined();
    expect(session?.status).toBe(SessionStatus.ACTIVE);

    // Perform manual termination through orchestrator
    const result = await orchestrator.performManualTermination(sessionId, 'integration_test');

    // Verify cleanup was successful
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe(sessionId);

    // Verify session is no longer accessible
    session = sessionManager.getSessionStatus(sessionId);
    expect(session).toBeNull();
  });

  it('should handle crash recovery scenario', async () => {
    // Create multiple sessions
    const sessionId1 = await sessionManager.createSession();
    const sessionId2 = await sessionManager.createSession();

    // Verify sessions exist
    expect(sessionManager.getSessionStatus(sessionId1)).toBeDefined();
    expect(sessionManager.getSessionStatus(sessionId2)).toBeDefined();

    // Simulate crash by shutting down session manager without cleanup
    await sessionManager.shutdown();

    // Create new instances (simulating restart)
    const newSessionManager = new SessionManager({
      shopId: 'test-shop',
      sessionTimeoutMinutes: 1,
      tempDirectory: testTempDir
    });
    
    const newFileHandler = new FileHandler();
    const newOrchestrator = new SessionCleanupOrchestrator(newSessionManager, newFileHandler);

    // Perform crash recovery
    const recoveryResult = await newOrchestrator.performCrashRecovery();

    // Verify orphaned sessions were detected and cleaned up
    expect(recoveryResult.success).toBe(true);
    expect(recoveryResult.orphanedSessions.length).toBeGreaterThan(0);
    expect(recoveryResult.totalRecovered).toBeGreaterThan(0);

    // Clean up new instances
    await newSessionManager.shutdown();
  });

  it('should provide system health monitoring', async () => {
    // Create a session for testing
    const sessionId = await sessionManager.createSession();

    // Get cleanup statistics
    const stats = await orchestrator.getCleanupStatistics();
    
    expect(stats).toBeDefined();
    expect(typeof stats.totalAuditEvents).toBe('number');
    expect(typeof stats.recentCleanups).toBe('number');
    expect(typeof stats.recentFailures).toBe('number');
    expect(typeof stats.averageCleanupTime).toBe('number');
    expect(typeof stats.orphanedSessionsDetected).toBe('number');

    // Perform system health check
    const healthCheck = await orchestrator.performSystemCleanupCheck();
    
    expect(healthCheck).toBeDefined();
    expect(typeof healthCheck.success).toBe('boolean');
    expect(Array.isArray(healthCheck.issues)).toBe(true);
    expect(Array.isArray(healthCheck.recommendations)).toBe(true);
    expect(['good', 'warning', 'critical']).toContain(healthCheck.systemHealth);

    // Clean up
    await orchestrator.performManualTermination(sessionId, 'test_cleanup');
  });

  it('should handle audit logging correctly', async () => {
    // Create and terminate a session
    const sessionId = await sessionManager.createSession();
    await orchestrator.performManualTermination(sessionId, 'audit_test');

    // Check audit events
    const auditEvents = orchestrator.getRecentAuditEvents(10);
    expect(auditEvents.length).toBeGreaterThan(0);

    // Verify event structure
    const terminationEvent = auditEvents.find(e => e.eventType === 'session_terminated');
    const destructionEvent = auditEvents.find(e => e.eventType === 'data_destroyed');

    expect(terminationEvent).toBeDefined();
    expect(destructionEvent).toBeDefined();

    if (terminationEvent) {
      expect(terminationEvent.sessionId).toBe(sessionId);
      expect(terminationEvent.metadata.trigger).toBe('manual');
      expect(terminationEvent.metadata.reason).toBe('audit_test');
    }

    // Test audit event cleanup
    const initialCount = auditEvents.length;
    const clearedCount = orchestrator.clearOldAuditEvents(0); // Clear all events
    expect(clearedCount).toBe(initialCount);
    
    const remainingEvents = orchestrator.getRecentAuditEvents();
    expect(remainingEvents.length).toBe(0);
  });

  it('should handle configuration options correctly', async () => {
    const sessionId = await sessionManager.createSession();

    // Test with custom configuration
    const customConfig = {
      verifyDeletion: false,
      logEvents: false,
      maxRetries: 1,
      retryDelayMs: 100
    };

    const result = await orchestrator.performManualTermination(sessionId, 'config_test', customConfig);

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe(sessionId);
    
    // With logEvents: false, there should be fewer audit events
    const auditEvents = orchestrator.getRecentAuditEvents();
    expect(auditEvents.length).toBe(0); // No events logged due to logEvents: false
  });
});