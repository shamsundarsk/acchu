import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../SessionManager';
import { SessionStatus } from '../../types';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      shopId: 'test-shop',
      sessionTimeoutMinutes: 30,
      tempDirectory: '/tmp/test-acchu-sessions'
    });
  });

  afterEach(async () => {
    // Clean up any created sessions
    if (sessionManager) {
      await sessionManager.shutdown();
    }
  });

  it('should create a new session with unique ID', async () => {
    const sessionId = await sessionManager.createSession();
    
    expect(sessionId).toBeDefined();
    expect(typeof sessionId).toBe('string');
    expect(sessionId.length).toBeGreaterThan(0);
  });

  it('should return session status for valid session', async () => {
    const sessionId = await sessionManager.createSession();
    const session = sessionManager.getSessionStatus(sessionId);
    
    expect(session).toBeDefined();
    expect(session?.id).toBe(sessionId);
    expect(session?.status).toBe(SessionStatus.ACTIVE);
    expect(session?.shopId).toBe('test-shop');
  });

  it('should return null for invalid session ID', () => {
    const session = sessionManager.getSessionStatus('invalid-session-id');
    expect(session).toBeNull();
  });

  it('should terminate session and clean up data', async () => {
    const sessionId = await sessionManager.createSession();
    
    // Verify session exists
    let session = sessionManager.getSessionStatus(sessionId);
    expect(session).toBeDefined();
    
    // Terminate session
    await sessionManager.terminateSession(sessionId);
    
    // Verify session is removed
    session = sessionManager.getSessionStatus(sessionId);
    expect(session).toBeNull();
  });

  it('should validate session data correctly', async () => {
    const sessionId = await sessionManager.createSession();
    const session = sessionManager.getSessionStatus(sessionId);
    
    expect(session).toBeDefined();
    expect(session?.createdAt).toBeInstanceOf(Date);
    expect(session?.expiresAt).toBeInstanceOf(Date);
    expect(session?.expiresAt.getTime()).toBeGreaterThan(session?.createdAt.getTime() || 0);
    expect(Array.isArray(session?.files)).toBe(true);
  });

  it('should handle multiple sessions independently', async () => {
    const sessionId1 = await sessionManager.createSession();
    const sessionId2 = await sessionManager.createSession();
    
    expect(sessionId1).not.toBe(sessionId2);
    
    const session1 = sessionManager.getSessionStatus(sessionId1);
    const session2 = sessionManager.getSessionStatus(sessionId2);
    
    expect(session1?.id).toBe(sessionId1);
    expect(session2?.id).toBe(sessionId2);
    
    // Terminate one session
    await sessionManager.terminateSession(sessionId1);
    
    // Verify only the terminated session is removed
    expect(sessionManager.getSessionStatus(sessionId1)).toBeNull();
    expect(sessionManager.getSessionStatus(sessionId2)).toBeDefined();
  });
});