import { Router } from 'express';
import { SessionId, SessionInfo, ApiResponse, SessionStatus, PaymentStatus } from '../types';
import { validateSessionAccess, cleanupSessionConnection, SessionRequest } from '../middleware/sessionValidation';
import crypto from 'crypto';

const router = Router();

/**
 * Create a new session
 * Requirements: 2.1 - Session creation with security token
 */
router.post('/', async (req, res) => {
  try {
    // Generate unique session ID
    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    // Generate security token for WebSocket authentication
    const token = crypto.randomBytes(32).toString('hex');
    
    // TODO: Register session with Local Agent
    console.log(`Creating new session: ${sessionId}`);
    
    const response: ApiResponse = {
      success: true,
      sessionId,
      token, // Return token for WebSocket authentication
      message: 'Session created successfully',
    };

    res.status(201).json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session',
    };
    res.status(500).json(response);
  }
});

// Apply session validation middleware to routes that need it
router.use('/:sessionId', validateSessionAccess, cleanupSessionConnection);

/**
 * Validate session and get session information
 * Requirements: 2.2 - Session validation middleware
 */
router.get('/:sessionId', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = req.sessionData!; // Guaranteed to exist after middleware
    
    // TODO: Get actual session data from Local Agent
    // For now, return mock data based on validated session
    const sessionInfo: SessionInfo = {
      session: {
        id: sessionId,
        shopId: sessionData.shopId,
        status: SessionStatus.ACTIVE,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        expiresAt: new Date(Date.now() + 25 * 60 * 1000), // 25 minutes from now
        files: [],
        paymentStatus: PaymentStatus.PENDING,
      },
      isValid: true,
      timeRemaining: 25 * 60 * 1000, // 25 minutes
    };

    const response: ApiResponse<SessionInfo> = {
      success: true,
      data: sessionInfo,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

/**
 * Update session status
 * Requirements: 2.3 - Session status updates with validation
 */
router.patch('/:sessionId/status', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { status } = req.body;
    const sessionData = req.sessionData!;

    // Validate status value
    if (!status || !Object.values(SessionStatus).includes(status)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid session status'
      };
      res.status(400).json(response);
      return;
    }

    // TODO: Update session status with Local Agent
    console.log(`Updating session ${sessionId} status to ${status} for shop ${sessionData.shopId}`);
    
    const response: ApiResponse = {
      success: true,
      message: `Session ${sessionId} status updated to ${status}`,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

/**
 * End session and cleanup
 * Requirements: 2.4 - Session termination
 */
router.delete('/:sessionId', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = req.sessionData!;

    // TODO: Terminate session with Local Agent
    console.log(`Terminating session ${sessionId} for shop ${sessionData.shopId}`);
    
    const response: ApiResponse = {
      success: true,
      message: `Session ${sessionId} terminated successfully`,
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.status(500).json(response);
  }
});

export { router as sessionRoutes };