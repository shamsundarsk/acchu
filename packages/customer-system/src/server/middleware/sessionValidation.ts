import { Request, Response, NextFunction } from 'express';
import { SessionId, ApiResponse } from '../types';

// Extended Request interface to include session data
export interface SessionRequest extends Request {
  sessionData?: {
    sessionId: SessionId;
    token: string;
    shopId: string;
    isValid: boolean;
  };
}

// Track active session connections to enforce single-customer access
const activeSessionConnections = new Map<SessionId, {
  connectedAt: Date;
  ipAddress: string;
  userAgent: string;
}>();

/**
 * Middleware to validate session access and enforce single-customer access
 * Requirements: 2.2, 2.3, 2.4 - Session validation, expiration checking, single-customer access
 */
export const validateSessionAccess = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const { token, shop } = req.query;

    // Validate required parameters
    if (!sessionId) {
      const response: ApiResponse = {
        success: false,
        error: 'Session ID is required'
      };
      res.status(400).json(response);
      return;
    }

    if (!token || typeof token !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication token is required'
      };
      res.status(401).json(response);
      return;
    }

    if (!shop || typeof shop !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Shop ID is required'
      };
      res.status(400).json(response);
      return;
    }

    // Check if session is already connected by another customer
    const existingConnection = activeSessionConnections.get(sessionId);
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';

    if (existingConnection) {
      // Check if it's the same client (same IP and User-Agent)
      const isSameClient = existingConnection.ipAddress === clientIP && 
                          existingConnection.userAgent === userAgent;
      
      if (!isSameClient) {
        const response: ApiResponse = {
          success: false,
          error: 'Session is already being accessed by another customer'
        };
        res.status(409).json(response); // Conflict
        return;
      }
    } else {
      // Register new connection
      activeSessionConnections.set(sessionId, {
        connectedAt: new Date(),
        ipAddress: clientIP,
        userAgent: userAgent
      });
    }

    // TODO: Validate session with Local Agent
    // For now, we'll simulate validation
    const isValidSession = await validateSessionWithLocalAgent(sessionId, token, shop);
    
    if (!isValidSession.isValid) {
      // Remove connection if validation fails
      activeSessionConnections.delete(sessionId);
      
      const response: ApiResponse = {
        success: false,
        error: isValidSession.error || 'Invalid session or expired'
      };
      res.status(401).json(response);
      return;
    }

    // Add session data to request for use in route handlers
    req.sessionData = {
      sessionId,
      token,
      shopId: shop,
      isValid: true
    };

    next();
  } catch (error) {
    console.error('Session validation error:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Internal server error during session validation'
    };
    res.status(500).json(response);
  }
};

/**
 * Middleware to clean up session connection when request ends
 */
export const cleanupSessionConnection = (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): void => {
  // Clean up connection when response finishes
  res.on('finish', () => {
    if (req.sessionData?.sessionId) {
      // Only remove if this was the last request from this session
      // In a real implementation, you might want more sophisticated connection tracking
      const { sessionId } = req.sessionData;
      
      // For now, we'll keep the connection active for a short time
      // to allow multiple requests from the same session
      setTimeout(() => {
        const connection = activeSessionConnections.get(sessionId);
        if (connection) {
          const timeSinceConnection = Date.now() - connection.connectedAt.getTime();
          // Remove connection if it's been inactive for more than 5 minutes
          if (timeSinceConnection > 5 * 60 * 1000) {
            activeSessionConnections.delete(sessionId);
            console.log(`Cleaned up inactive session connection: ${sessionId}`);
          }
        }
      }, 30000); // Check after 30 seconds
    }
  });

  next();
};

/**
 * Validates session with Local Agent
 * Requirements: 2.3 - Session expiration checking and error handling
 */
async function validateSessionWithLocalAgent(
  sessionId: SessionId, 
  token: string, 
  shopId: string
): Promise<{ isValid: boolean; error?: string }> {
  try {
    // TODO: Implement actual communication with Local Agent
    // This would typically be done via HTTP API, WebSocket, or shared database
    
    // For now, simulate validation logic
    // In real implementation, this would:
    // 1. Check if session exists in Local Agent
    // 2. Validate the authentication token
    // 3. Check if session has expired
    // 4. Verify shop ID matches
    
    // Simulate some sessions being expired (check before UUID validation)
    if (sessionId.startsWith('expired-')) {
      return { isValid: false, error: 'Session has expired' };
    }
    
    // Simulate some sessions being invalid (check before UUID validation)
    if (sessionId.startsWith('invalid-')) {
      return { isValid: false, error: 'Session not found' };
    }
    
    // Mock validation - accept sessions that look like UUIDs and have valid tokens
    const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!sessionIdPattern.test(sessionId)) {
      return { isValid: false, error: 'Invalid session ID format' };
    }
    
    if (!tokenPattern.test(token)) {
      return { isValid: false, error: 'Invalid authentication token format' };
    }
    
    return { isValid: true };
  } catch (error) {
    console.error('Error validating session with Local Agent:', error);
    return { isValid: false, error: 'Failed to validate session' };
  }
}

/**
 * Manually removes a session connection (called when session ends)
 */
export function removeSessionConnection(sessionId: SessionId): void {
  activeSessionConnections.delete(sessionId);
  console.log(`Removed session connection: ${sessionId}`);
}

/**
 * Gets active session connection count (for monitoring)
 */
export function getActiveConnectionCount(): number {
  return activeSessionConnections.size;
}

/**
 * Gets all active session connections (for debugging)
 */
export function getActiveConnections(): Map<SessionId, any> {
  return new Map(activeSessionConnections);
}

/**
 * Clears all session connections (for cleanup)
 */
export function clearAllConnections(): void {
  activeSessionConnections.clear();
  console.log('Cleared all session connections');
}