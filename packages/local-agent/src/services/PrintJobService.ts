import { 
  SessionId, 
  JobId, 
  PrintOptions, 
  PriceBreakdown, 
  PrintJob, 
  JobStatus,
  FileMetadata,
  PrintResult,
  AuditEvent,
  AuditEventType,
  PaymentRequest
} from '../types';
import { PrintManager } from './PrintManager';
import { SessionManager } from './SessionManager';
import { AuditLogger } from './AuditLogger';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface PrintJobRequest {
  sessionId: SessionId;
  files: string[];
  options: PrintOptions;
  pricing: PriceBreakdown;
  transactionId: string;
  paymentRequest?: PaymentRequest;
}

export interface PrintJobResponse {
  success: boolean;
  jobId?: JobId;
  error?: string;
}

export interface PrintJobStatusUpdate {
  jobId: JobId;
  sessionId: SessionId;
  status: JobStatus;
  progress: number;
  message?: string;
  error?: string;
  timestamp: Date;
}

/**
 * PrintJobService orchestrates the print job workflow
 * Requirements: 6.1, 6.4, 6.5 - Print job workflow, status updates, error handling
 */
export class PrintJobService {
  private printManager: PrintManager;
  private sessionManager: SessionManager;
  private auditLogger?: AuditLogger;
  private statusUpdateCallbacks: ((update: PrintJobStatusUpdate) => void)[] = [];

  constructor(printManager: PrintManager, sessionManager: SessionManager, auditLogger?: AuditLogger) {
    this.printManager = printManager;
    this.sessionManager = sessionManager;
    this.auditLogger = auditLogger;
  }

  /**
   * Create a new print job after payment verification
   * Requirements: 6.1 - Payment verification and print job creation
   */
  async createPrintJob(request: PrintJobRequest): Promise<PrintJobResponse> {
    try {
      console.log(`Creating print job for session ${request.sessionId}`);

      // Validate session exists and is active
      const session = this.sessionManager.getSessionStatus(request.sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found or expired'
        };
      }

      // Get session files directory
      const sessionDir = this.sessionManager.getSessionDirectory(request.sessionId);
      if (!sessionDir) {
        return {
          success: false,
          error: 'Session directory not found'
        };
      }

      // Validate files exist in session
      const fileMetadata: FileMetadata[] = [];
      for (const fileName of request.files) {
        const file = session.files.find(f => f.originalName === fileName);
        if (!file) {
          return {
            success: false,
            error: `File not found: ${fileName}`
          };
        }
        fileMetadata.push(file);
      }

      // Create print job with PrintManager
      const jobId = await this.printManager.queuePrintJob(
        request.sessionId,
        fileMetadata,
        request.options,
        request.pricing
      );

      // Log audit event and transaction
      if (this.auditLogger) {
        await this.auditLogger.logSessionEvent(request.sessionId, AuditEventType.PRINT_EXECUTED, {
          jobId,
          transactionId: request.transactionId,
          fileCount: fileMetadata.length,
          totalPrice: request.pricing.totalPrice,
          totalPages: request.pricing.totalPages
        });

        // Log transaction if payment request is provided
        if (request.paymentRequest) {
          const printJob: PrintJob = {
            id: jobId,
            sessionId: request.sessionId,
            files: fileMetadata.map(f => f.id),
            options: request.options,
            pricing: request.pricing,
            status: JobStatus.QUEUED,
            createdAt: new Date()
          };
          await this.auditLogger.logTransaction(printJob, request.paymentRequest);
        }
      }

      // Emit status update
      this.emitStatusUpdate({
        jobId,
        sessionId: request.sessionId,
        status: JobStatus.QUEUED,
        progress: 0,
        message: 'Print job created and queued',
        timestamp: new Date()
      });

      console.log(`Print job ${jobId} created successfully for session ${request.sessionId}`);

      return {
        success: true,
        jobId
      };

    } catch (error) {
      console.error('Error creating print job:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a print job (shopkeeper action)
   * Requirements: 6.4 - Shopkeeper print button and execution
   */
  async executePrintJob(sessionId: SessionId, jobId: JobId): Promise<PrintJobResponse> {
    try {
      console.log(`Executing print job ${jobId} for session ${sessionId}`);

      // Validate session
      const session = this.sessionManager.getSessionStatus(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found or expired'
        };
      }

      // Get session directory
      const sessionDir = this.sessionManager.getSessionDirectory(sessionId);
      if (!sessionDir) {
        return {
          success: false,
          error: 'Session directory not found'
        };
      }

      // Emit execution started update
      this.emitStatusUpdate({
        jobId,
        sessionId,
        status: JobStatus.PRINTING,
        progress: 0,
        message: 'Starting print job execution...',
        timestamp: new Date()
      });

      // Execute print job
      const result = await this.printManager.executePrintJob(jobId, sessionDir);

      if (result.success) {
        // Emit completion update
        this.emitStatusUpdate({
          jobId,
          sessionId,
          status: JobStatus.COMPLETED,
          progress: 100,
          message: 'Print job completed successfully',
          timestamp: new Date()
        });

        // Log completion audit event
        if (this.auditLogger) {
          await this.auditLogger.logSessionEvent(sessionId, AuditEventType.PRINT_EXECUTED, {
            jobId,
            status: 'completed',
            success: true,
            executionTime: new Date().toISOString()
          });
        }

        console.log(`Print job ${jobId} completed successfully`);
      } else {
        // Emit failure update
        this.emitStatusUpdate({
          jobId,
          sessionId,
          status: JobStatus.FAILED,
          progress: 0,
          message: 'Print job failed',
          error: result.error,
          timestamp: new Date()
        });

        console.error(`Print job ${jobId} failed:`, result.error);
      }

      return {
        success: result.success,
        jobId,
        error: result.error
      };

    } catch (error) {
      console.error('Error executing print job:', error);
      
      // Emit error update
      this.emitStatusUpdate({
        jobId,
        sessionId,
        status: JobStatus.FAILED,
        progress: 0,
        message: 'Print job execution error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get print job status and progress
   * Requirements: 6.3 - Print progress monitoring
   */
  getPrintJobStatus(jobId: JobId): PrintJobStatusUpdate | null {
    try {
      const progress = this.printManager.getPrintProgress(jobId);
      if (!progress) {
        return null;
      }

      return {
        jobId: progress.jobId,
        sessionId: '', // Will be filled by caller if needed
        status: progress.status,
        progress: progress.progress,
        message: progress.message,
        error: progress.error,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting print job status:', error);
      return null;
    }
  }

  /**
   * Retry a failed print job
   * Requirements: 6.5 - Handle print failures with retry mechanisms
   */
  async retryPrintJob(sessionId: SessionId, jobId: JobId): Promise<PrintJobResponse> {
    try {
      console.log(`Retrying print job ${jobId} for session ${sessionId}`);

      // Validate session
      const session = this.sessionManager.getSessionStatus(sessionId);
      if (!session) {
        return {
          success: false,
          error: 'Session not found or expired'
        };
      }

      // Get session directory
      const sessionDir = this.sessionManager.getSessionDirectory(sessionId);
      if (!sessionDir) {
        return {
          success: false,
          error: 'Session directory not found'
        };
      }

      // Emit retry started update
      this.emitStatusUpdate({
        jobId,
        sessionId,
        status: JobStatus.QUEUED,
        progress: 0,
        message: 'Retrying print job...',
        timestamp: new Date()
      });

      // Retry with PrintManager
      const result = await this.printManager.retryPrintJob(jobId, sessionDir);

      if (result.success) {
        console.log(`Print job ${jobId} retry completed successfully`);
      } else {
        console.error(`Print job ${jobId} retry failed:`, result.error);
      }

      return {
        success: result.success,
        jobId,
        error: result.error
      };

    } catch (error) {
      console.error('Error retrying print job:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cancel a print job
   */
  async cancelPrintJob(sessionId: SessionId, jobId: JobId): Promise<PrintJobResponse> {
    try {
      console.log(`Cancelling print job ${jobId} for session ${sessionId}`);

      const success = await this.printManager.cancelPrintJob(jobId);

      if (success) {
        // Emit cancellation update
        this.emitStatusUpdate({
          jobId,
          sessionId,
          status: JobStatus.FAILED,
          progress: 0,
          message: 'Print job cancelled',
          error: 'Cancelled by user',
          timestamp: new Date()
        });

        console.log(`Print job ${jobId} cancelled successfully`);
      }

      return {
        success,
        jobId,
        error: success ? undefined : 'Failed to cancel print job'
      };

    } catch (error) {
      console.error('Error cancelling print job:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all print jobs for a session
   */
  getSessionPrintJobs(sessionId: SessionId): PrintJob[] {
    try {
      return this.printManager.getSessionPrintJobs(sessionId);
    } catch (error) {
      console.error('Error getting session print jobs:', error);
      return [];
    }
  }

  /**
   * Register callback for status updates
   * Requirements: 6.4 - Real-time status updates
   */
  onStatusUpdate(callback: (update: PrintJobStatusUpdate) => void): void {
    this.statusUpdateCallbacks.push(callback);
  }

  /**
   * Remove status update callback
   */
  removeStatusUpdateCallback(callback: (update: PrintJobStatusUpdate) => void): void {
    const index = this.statusUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      this.statusUpdateCallbacks.splice(index, 1);
    }
  }

  /**
   * Emit status update to all registered callbacks
   */
  private emitStatusUpdate(update: PrintJobStatusUpdate): void {
    this.statusUpdateCallbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error('Error in status update callback:', error);
      }
    });
  }

  /**
   * Get audit log for a session
   */
  async getSessionAuditLog(sessionId: SessionId): Promise<AuditEvent[]> {
    if (!this.auditLogger) {
      return [];
    }
    const allEvents = await this.auditLogger.getRecentAuditEvents(1000);
    return allEvents.filter(event => event.sessionId === sessionId);
  }

  /**
   * Clean up completed print jobs for a session
   * Requirements: 7.3 - Session cleanup
   */
  cleanupSessionPrintJobs(sessionId: SessionId): void {
    try {
      this.printManager.cleanupSessionJobs(sessionId);
      console.log(`Cleaned up print jobs for session ${sessionId}`);
    } catch (error) {
      console.error('Error cleaning up session print jobs:', error);
    }
  }

  /**
   * Get print queue status
   */
  getPrintQueueStatus(): any {
    try {
      return this.printManager.getQueueStatus();
    } catch (error) {
      console.error('Error getting print queue status:', error);
      return {
        totalJobs: 0,
        queuedJobs: 0,
        printingJobs: 0,
        completedJobs: 0,
        failedJobs: 0
      };
    }
  }

  /**
   * Shutdown the print job service
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down PrintJobService...');
    
    // Clear callbacks
    this.statusUpdateCallbacks = [];
    
    console.log('PrintJobService shutdown complete');
  }
}