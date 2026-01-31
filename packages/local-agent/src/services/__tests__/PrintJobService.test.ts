import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrintJobService, PrintJobRequest } from '../PrintJobService';
import { PrintManager } from '../PrintManager';
import { SessionManager } from '../SessionManager';
import { SessionStatus, PaymentStatus, JobStatus } from '../../types';

// Mock the dependencies
vi.mock('../PrintManager');
vi.mock('../SessionManager');

describe('PrintJobService', () => {
  let printJobService: PrintJobService;
  let mockPrintManager: any;
  let mockSessionManager: any;

  beforeEach(() => {
    // Create mock instances
    mockPrintManager = {
      queuePrintJob: vi.fn(),
      executePrintJob: vi.fn(),
      retryPrintJob: vi.fn(),
      cancelPrintJob: vi.fn(),
      getPrintProgress: vi.fn(),
      getSessionPrintJobs: vi.fn(),
      cleanupSessionJobs: vi.fn(),
      getQueueStatus: vi.fn()
    };

    mockSessionManager = {
      getSessionStatus: vi.fn(),
      getSessionDirectory: vi.fn()
    };

    printJobService = new PrintJobService(mockPrintManager, mockSessionManager);
  });

  afterEach(async () => {
    await printJobService.shutdown();
    vi.clearAllMocks();
  });

  describe('createPrintJob', () => {
    it('should create print job successfully with valid session', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const mockSession = {
        id: sessionId,
        shopId: 'test-shop',
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [
          {
            id: 'file-1',
            originalName: 'test.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            uploadedAt: new Date(),
            localPath: '/tmp/test.pdf'
          }
        ],
        paymentStatus: PaymentStatus.COMPLETED
      };

      const request: PrintJobRequest = {
        sessionId,
        files: ['test.pdf'],
        options: {
          copies: 1,
          colorMode: 'bw',
          duplex: false,
          paperSize: 'A4'
        },
        pricing: {
          totalPages: 2,
          colorPages: 0,
          bwPages: 2,
          basePrice: 400,
          totalPrice: 400
        },
        transactionId: 'txn-123'
      };

      mockSessionManager.getSessionStatus.mockReturnValue(mockSession);
      mockSessionManager.getSessionDirectory.mockReturnValue('/tmp/sessions/test-session-123');
      mockPrintManager.queuePrintJob.mockResolvedValue('job-123');

      // Act
      const result = await printJobService.createPrintJob(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.jobId).toBe('job-123');
      expect(mockPrintManager.queuePrintJob).toHaveBeenCalledWith(
        sessionId,
        mockSession.files,
        request.options,
        request.pricing
      );
    });

    it('should fail when session does not exist', async () => {
      // Arrange
      const request: PrintJobRequest = {
        sessionId: 'invalid-session',
        files: ['test.pdf'],
        options: {
          copies: 1,
          colorMode: 'bw',
          duplex: false,
          paperSize: 'A4'
        },
        pricing: {
          totalPages: 2,
          colorPages: 0,
          bwPages: 2,
          basePrice: 400,
          totalPrice: 400
        },
        transactionId: 'txn-123'
      };

      mockSessionManager.getSessionStatus.mockReturnValue(null);

      // Act
      const result = await printJobService.createPrintJob(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session not found or expired');
      expect(mockPrintManager.queuePrintJob).not.toHaveBeenCalled();
    });

    it('should fail when file is not found in session', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const mockSession = {
        id: sessionId,
        shopId: 'test-shop',
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [], // No files
        paymentStatus: PaymentStatus.COMPLETED
      };

      const request: PrintJobRequest = {
        sessionId,
        files: ['nonexistent.pdf'],
        options: {
          copies: 1,
          colorMode: 'bw',
          duplex: false,
          paperSize: 'A4'
        },
        pricing: {
          totalPages: 2,
          colorPages: 0,
          bwPages: 2,
          basePrice: 400,
          totalPrice: 400
        },
        transactionId: 'txn-123'
      };

      mockSessionManager.getSessionStatus.mockReturnValue(mockSession);
      mockSessionManager.getSessionDirectory.mockReturnValue('/tmp/sessions/test-session-123');

      // Act
      const result = await printJobService.createPrintJob(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found: nonexistent.pdf');
      expect(mockPrintManager.queuePrintJob).not.toHaveBeenCalled();
    });
  });

  describe('executePrintJob', () => {
    it('should execute print job successfully', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const jobId = 'job-123';
      const mockSession = {
        id: sessionId,
        shopId: 'test-shop',
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [],
        paymentStatus: PaymentStatus.COMPLETED
      };

      mockSessionManager.getSessionStatus.mockReturnValue(mockSession);
      mockSessionManager.getSessionDirectory.mockReturnValue('/tmp/sessions/test-session-123');
      mockPrintManager.executePrintJob.mockResolvedValue({ success: true, jobId });

      // Act
      const result = await printJobService.executePrintJob(sessionId, jobId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.jobId).toBe(jobId);
      expect(mockPrintManager.executePrintJob).toHaveBeenCalledWith(jobId, '/tmp/sessions/test-session-123');
    });

    it('should handle print job execution failure', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const jobId = 'job-123';
      const mockSession = {
        id: sessionId,
        shopId: 'test-shop',
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [],
        paymentStatus: PaymentStatus.COMPLETED
      };

      mockSessionManager.getSessionStatus.mockReturnValue(mockSession);
      mockSessionManager.getSessionDirectory.mockReturnValue('/tmp/sessions/test-session-123');
      mockPrintManager.executePrintJob.mockResolvedValue({ 
        success: false, 
        jobId, 
        error: 'Printer offline' 
      });

      // Act
      const result = await printJobService.executePrintJob(sessionId, jobId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Printer offline');
    });
  });

  describe('retryPrintJob', () => {
    it('should retry print job successfully', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const jobId = 'job-123';
      const mockSession = {
        id: sessionId,
        shopId: 'test-shop',
        status: SessionStatus.ACTIVE,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        files: [],
        paymentStatus: PaymentStatus.COMPLETED
      };

      mockSessionManager.getSessionStatus.mockReturnValue(mockSession);
      mockSessionManager.getSessionDirectory.mockReturnValue('/tmp/sessions/test-session-123');
      mockPrintManager.retryPrintJob.mockResolvedValue({ success: true, jobId });

      // Act
      const result = await printJobService.retryPrintJob(sessionId, jobId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrintManager.retryPrintJob).toHaveBeenCalledWith(jobId, '/tmp/sessions/test-session-123');
    });
  });

  describe('getPrintJobStatus', () => {
    it('should return print job status', () => {
      // Arrange
      const jobId = 'job-123';
      const mockProgress = {
        jobId,
        status: JobStatus.PRINTING,
        progress: 50,
        message: 'Printing page 1 of 2'
      };

      mockPrintManager.getPrintProgress.mockReturnValue(mockProgress);

      // Act
      const result = printJobService.getPrintJobStatus(jobId);

      // Assert
      expect(result).toBeDefined();
      expect(result?.jobId).toBe(jobId);
      expect(result?.status).toBe(JobStatus.PRINTING);
      expect(result?.progress).toBe(50);
    });

    it('should return null for non-existent job', () => {
      // Arrange
      mockPrintManager.getPrintProgress.mockReturnValue(null);

      // Act
      const result = printJobService.getPrintJobStatus('non-existent-job');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('cancelPrintJob', () => {
    it('should cancel print job successfully', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const jobId = 'job-123';

      mockPrintManager.cancelPrintJob.mockResolvedValue(true);

      // Act
      const result = await printJobService.cancelPrintJob(sessionId, jobId);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPrintManager.cancelPrintJob).toHaveBeenCalledWith(jobId);
    });

    it('should handle cancellation failure', async () => {
      // Arrange
      const sessionId = 'test-session-123';
      const jobId = 'job-123';

      mockPrintManager.cancelPrintJob.mockResolvedValue(false);

      // Act
      const result = await printJobService.cancelPrintJob(sessionId, jobId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to cancel print job');
    });
  });

  describe('status update callbacks', () => {
    it('should register and call status update callbacks', () => {
      // Arrange
      const callback = vi.fn();
      printJobService.onStatusUpdate(callback);

      // Act - trigger a status update by calling the private method via reflection
      const update = {
        jobId: 'job-123',
        sessionId: 'session-123',
        status: JobStatus.PRINTING,
        progress: 50,
        message: 'Test update',
        timestamp: new Date()
      };

      // Access private method for testing
      (printJobService as any).emitStatusUpdate(update);

      // Assert
      expect(callback).toHaveBeenCalledWith(update);
    });

    it('should remove status update callbacks', () => {
      // Arrange
      const callback = vi.fn();
      printJobService.onStatusUpdate(callback);
      printJobService.removeStatusUpdateCallback(callback);

      // Act
      const update = {
        jobId: 'job-123',
        sessionId: 'session-123',
        status: JobStatus.PRINTING,
        progress: 50,
        message: 'Test update',
        timestamp: new Date()
      };

      (printJobService as any).emitStatusUpdate(update);

      // Assert
      expect(callback).not.toHaveBeenCalled();
    });
  });
});