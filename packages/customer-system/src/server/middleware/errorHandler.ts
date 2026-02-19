import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

/**
 * Custom error class for session-related errors
 */
export class SessionError extends Error {
  public statusCode: number;
  public errorCode: string;

  constructor(message: string, statusCode: number = 400, errorCode: string = 'SESSION_ERROR') {
    super(message);
    this.name = 'SessionError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

/**
 * Predefined session error types
 * Requirements: 2.3, 2.4 - Invalid session error responses
 */
export class SessionErrors {
  static sessionNotFound(sessionId: string): SessionError {
    return new SessionError(
      `Session ${sessionId} not found or has been terminated`,
      404,
      'SESSION_NOT_FOUND'
    );
  }

  static sessionExpired(sessionId: string): SessionError {
    return new SessionError(
      `Session ${sessionId} has expired`,
      410, // Gone
      'SESSION_EXPIRED'
    );
  }

  static sessionAlreadyActive(sessionId: string): SessionError {
    return new SessionError(
      `Session ${sessionId} is already being accessed by another customer`,
      409, // Conflict
      'SESSION_ALREADY_ACTIVE'
    );
  }

  static invalidToken(): SessionError {
    return new SessionError(
      'Invalid or missing authentication token',
      401,
      'INVALID_TOKEN'
    );
  }

  static sessionTerminated(sessionId: string): SessionError {
    return new SessionError(
      `Session ${sessionId} has been terminated`,
      410, // Gone
      'SESSION_TERMINATED'
    );
  }

  static shopMismatch(): SessionError {
    return new SessionError(
      'Session does not belong to the specified shop',
      403, // Forbidden
      'SHOP_MISMATCH'
    );
  }

  static sessionValidationFailed(): SessionError {
    return new SessionError(
      'Failed to validate session with local agent',
      503, // Service Unavailable
      'VALIDATION_FAILED'
    );
  }
}

/**
 * Global error handler middleware
 * Requirements: 2.3 - Error handling and invalid session responses
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    sessionId: req.params.sessionId
  });

  // Handle SessionError instances
  if (error instanceof SessionError) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
      data: {
        errorCode: error.errorCode,
        sessionId: req.params.sessionId
      }
    };
    
    res.status(error.statusCode).json(response);
    return;
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    const response: ApiResponse = {
      success: false,
      error: 'Invalid request data',
      data: {
        errorCode: 'VALIDATION_ERROR',
        details: error.message
      }
    };
    
    res.status(400).json(response);
    return;
  }

  // Handle generic errors
  const response: ApiResponse = {
    success: false,
    error: 'Internal server error',
    data: {
      errorCode: 'INTERNAL_ERROR'
    }
  };

  res.status(500).json(response);
};

/**
 * 404 handler for unknown routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    error: 'Endpoint not found',
    data: {
      errorCode: 'NOT_FOUND',
      path: req.path
    }
  };

  res.status(404).json(response);
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};