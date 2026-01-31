import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { 
  validateSessionAccess, 
  cleanupSessionConnection, 
  removeSessionConnection,
  getActiveConnectionCount,
  clearAllConnections,
  SessionRequest 
} from '../middleware/sessionValidation';

// Mock Express objects
const createMockRequest = (params: any = {}, query: any = {}, headers: any = {}): SessionRequest => ({
  params,
  query,
  get: (header: string) => headers[header],
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' }
} as any);

const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    on: vi.fn()
  };
  return res as any as Response;
};

const createMockNext = () => vi.fn() as NextFunction;

describe('Session Validation Middleware', () => {
  beforeEach(() => {
    clearAllConnections();
  });

  describe('validateSessionAccess', () => {
    it('should reject request without session ID', async () => {
      const req = createMockRequest({}, { token: 'valid-token', shop: 'test-shop' });
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session ID is required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      const req = createMockRequest(
        { sessionId: 'test-session-123' }, 
        { shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication token is required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request without shop ID', async () => {
      const req = createMockRequest(
        { sessionId: 'test-session-123' }, 
        { token: 'valid-token' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Shop ID is required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept valid session with proper UUID format', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.sessionData).toEqual({
        sessionId,
        token,
        shopId: 'test-shop',
        isValid: true
      });
      expect(getActiveConnectionCount()).toBe(1);
    });

    it('should reject expired session', async () => {
      const sessionId = 'expired-0000-0000-0000-000000000000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session has expired'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid session', async () => {
      const sessionId = 'invalid-0000-0000-0000-000000000000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject malformed session ID', async () => {
      const sessionId = 'not-a-uuid';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid session ID format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject malformed token', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const token = 'not-a-uuid';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid authentication token format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow same client to access session multiple times', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req1 = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' },
        { 'User-Agent': 'TestBrowser/1.0' }
      );
      req1.ip = '192.168.1.100';
      
      const req2 = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' },
        { 'User-Agent': 'TestBrowser/1.0' }
      );
      req2.ip = '192.168.1.100';
      
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      // First request should succeed
      await validateSessionAccess(req1, res1, next1);
      expect(next1).toHaveBeenCalled();
      expect(getActiveConnectionCount()).toBe(1);

      // Second request from same client should also succeed
      await validateSessionAccess(req2, res2, next2);
      expect(next2).toHaveBeenCalled();
      expect(getActiveConnectionCount()).toBe(1);
    });

    it('should reject different client accessing same session', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      // First client
      const req1 = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' },
        { 'User-Agent': 'TestBrowser/1.0' }
      );
      req1.ip = '192.168.1.100';
      
      // Second client (different IP and User-Agent)
      const req2 = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' },
        { 'User-Agent': 'DifferentBrowser/2.0' }
      );
      req2.ip = '192.168.1.101';
      
      const res1 = createMockResponse();
      const res2 = createMockResponse();
      const next1 = createMockNext();
      const next2 = createMockNext();

      // First request should succeed
      await validateSessionAccess(req1, res1, next1);
      expect(next1).toHaveBeenCalled();
      expect(getActiveConnectionCount()).toBe(1);

      // Second request from different client should be rejected
      await validateSessionAccess(req2, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(409);
      expect(res2.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session is already being accessed by another customer'
      });
      expect(next2).not.toHaveBeenCalled();
    });
  });

  describe('Connection Management', () => {
    it('should track active connections', async () => {
      expect(getActiveConnectionCount()).toBe(0);

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);
      
      expect(getActiveConnectionCount()).toBe(1);
    });

    it('should remove session connection manually', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const token = '550e8400-e29b-41d4-a716-446655440001';
      
      const req = createMockRequest(
        { sessionId }, 
        { token, shop: 'test-shop' }
      );
      const res = createMockResponse();
      const next = createMockNext();

      await validateSessionAccess(req, res, next);
      expect(getActiveConnectionCount()).toBe(1);

      removeSessionConnection(sessionId);
      expect(getActiveConnectionCount()).toBe(0);
    });

    it('should clear all connections', async () => {
      // Add multiple connections
      const sessions = [
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001'
      ];

      for (const sessionId of sessions) {
        const req = createMockRequest(
          { sessionId }, 
          { token: '550e8400-e29b-41d4-a716-446655440002', shop: 'test-shop' }
        );
        req.ip = `192.168.1.${sessions.indexOf(sessionId) + 100}`;
        
        const res = createMockResponse();
        const next = createMockNext();

        await validateSessionAccess(req, res, next);
      }

      expect(getActiveConnectionCount()).toBe(2);

      clearAllConnections();
      expect(getActiveConnectionCount()).toBe(0);
    });
  });

  describe('cleanupSessionConnection', () => {
    it('should set up cleanup on response finish', () => {
      const req = createMockRequest();
      req.sessionData = {
        sessionId: 'test-session',
        token: 'test-token',
        shopId: 'test-shop',
        isValid: true
      };
      
      const res = createMockResponse();
      const next = createMockNext();

      cleanupSessionConnection(req, res, next);

      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(next).toHaveBeenCalled();
    });
  });
});