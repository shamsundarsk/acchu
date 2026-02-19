import WebSocket from 'ws';
import { 
  SessionId, 
  JobId, 
  WebSocketEvent,
  SessionStatus,
  JobStatus
} from '../types';
import { PrintJobService, PrintJobStatusUpdate } from './PrintJobService';
import { SessionManager } from './SessionManager';

export interface WebSocketConfig {
  customerSystemUrl: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export interface LocalAgentMessage {
  type: 'print-job-status' | 'session-status' | 'printer-status' | 'error' | 
        'local-agent-connected' | 'pong' | 'print-job-created' | 
        'print-job-execution-result' | 'print-job-retry-result' | 
        'print-job-cancel-result' | 'print-job-status-update';
  sessionId?: SessionId;
  jobId?: JobId;
  data: any;
  timestamp: Date;
}

/**
 * WebSocketService handles real-time communication with Customer System
 * Requirements: 6.3, 6.4 - Real-time status updates and communication
 */
export class WebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private printJobService: PrintJobService;
  private sessionManager: SessionManager;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(
    config: WebSocketConfig, 
    printJobService: PrintJobService, 
    sessionManager: SessionManager
  ) {
    this.config = {
      reconnectInterval: 5000, // 5 seconds
      maxReconnectAttempts: 10,
      ...config
    };
    this.printJobService = printJobService;
    this.sessionManager = sessionManager;

    // Register for print job status updates
    this.printJobService.onStatusUpdate(this.handlePrintJobStatusUpdate.bind(this));
  }

  /**
   * Connect to Customer System WebSocket server
   */
  async connect(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      const wsUrl = this.config.customerSystemUrl.replace(/^http/, 'ws') + '/ws';
      console.log(`Connecting to Customer System WebSocket: ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('Connected to Customer System WebSocket');
        this.reconnectAttempts = 0;
        
        // Send initial connection message
        this.sendMessage({
          type: 'local-agent-connected',
          data: {
            shopId: this.sessionManager.getActiveSessions()[0]?.shopId || 'unknown',
            timestamp: new Date()
          },
          timestamp: new Date()
        });
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleIncomingMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`WebSocket connection closed: ${code} - ${reason}`);
        this.ws = null;
        
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (this.ws) {
          this.ws.close();
        }
      });

    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming messages from Customer System
   */
  private async handleIncomingMessage(message: any): Promise<void> {
    try {
      console.log('Received WebSocket message:', message);

      switch (message.type) {
        case 'create-print-job':
          await this.handleCreatePrintJob(message);
          break;
        
        case 'execute-print-job':
          await this.handleExecutePrintJob(message);
          break;
        
        case 'retry-print-job':
          await this.handleRetryPrintJob(message);
          break;
        
        case 'cancel-print-job':
          await this.handleCancelPrintJob(message);
          break;
        
        case 'get-print-status':
          await this.handleGetPrintStatus(message);
          break;
        
        case 'ping':
          this.sendMessage({
            type: 'pong',
            data: { timestamp: new Date() },
            timestamp: new Date()
          });
          break;
        
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }

  /**
   * Handle create print job request from Customer System
   */
  private async handleCreatePrintJob(message: any): Promise<void> {
    try {
      const { sessionId, jobId, data } = message;
      const { files, options, pricing, transactionId, autoExecute } = data;

      console.log(`Creating print job ${jobId} for session ${sessionId}`);

      // Create print job request
      const printJobRequest = {
        sessionId,
        files,
        options,
        pricing,
        transactionId
      };

      // Create the print job
      const result = await this.printJobService.createPrintJob(printJobRequest);

      if (result.success) {
        console.log(`Print job ${jobId} created successfully`);
        
        // If autoExecute is true, automatically add to shopkeeper's queue
        if (autoExecute) {
          console.log(`Auto-executing print job ${jobId} - adding to shopkeeper queue`);
          
          // Send status update that job is queued for shopkeeper
          this.sendMessage({
            type: 'print-job-status-update',
            sessionId,
            jobId: result.jobId || jobId,
            data: {
              status: 'QUEUED',
              progress: 0,
              message: 'Print job added to shopkeeper queue',
              timestamp: new Date()
            },
            timestamp: new Date()
          });
        }

        // Send success response
        this.sendMessage({
          type: 'print-job-created',
          sessionId,
          jobId: result.jobId || jobId,
          data: {
            success: true,
            status: autoExecute ? 'QUEUED' : 'CREATED',
            message: autoExecute ? 'Print job queued for shopkeeper' : 'Print job created'
          },
          timestamp: new Date()
        });

      } else {
        console.error(`Failed to create print job ${jobId}:`, result.error);
        
        // Send error response
        this.sendMessage({
          type: 'print-job-created',
          sessionId,
          jobId,
          data: {
            success: false,
            error: result.error
          },
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error handling create print job:', error);
      
      // Send error response
      this.sendMessage({
        type: 'print-job-created',
        sessionId: message.sessionId,
        jobId: message.jobId,
        data: {
          success: false,
          error: 'Internal error creating print job'
        },
        timestamp: new Date()
      });
    }
  }
            timestamp: new Date()
          });
          break;
        
        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling incoming message:', error);
      this.sendErrorMessage(message.sessionId, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle create print job request
   */
  private async handleCreatePrintJob(message: any): Promise<void> {
    const { sessionId, files, options, pricing, transactionId } = message.data;
    
    const result = await this.printJobService.createPrintJob({
      sessionId,
      files,
      options,
      pricing,
      transactionId
    });

    this.sendMessage({
      type: 'print-job-created',
      sessionId,
      jobId: result.jobId,
      data: {
        success: result.success,
        jobId: result.jobId,
        error: result.error
      },
      timestamp: new Date()
    });
  }

  /**
   * Handle execute print job request
   */
  private async handleExecutePrintJob(message: any): Promise<void> {
    try {
      const { sessionId, jobId } = message;
      
      console.log(`Executing print job ${jobId} for session ${sessionId}`);
      
      // Execute the print job
      const result = await this.printJobService.executePrintJob(sessionId, jobId);

      if (result.success) {
        // Send success response
        this.sendMessage({
          type: 'print-job-execution-result',
          sessionId,
          jobId,
          data: {
            success: true,
            message: 'Print job execution started'
          },
          timestamp: new Date()
        });
      } else {
        // Send error response
        this.sendMessage({
          type: 'print-job-execution-result',
          sessionId,
          jobId,
          data: {
            success: false,
            error: result.error
          },
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error executing print job:', error);
      
      this.sendMessage({
        type: 'print-job-execution-result',
        sessionId: message.sessionId,
        jobId: message.jobId,
        data: {
          success: false,
          error: 'Internal error executing print job'
        },
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle retry print job request
   */
  private async handleRetryPrintJob(message: any): Promise<void> {
    try {
      const { sessionId, jobId } = message;
      
      console.log(`Retrying print job ${jobId} for session ${sessionId}`);
      
      // Retry the print job
      const result = await this.printJobService.retryPrintJob(sessionId, jobId);

      this.sendMessage({
        type: 'print-job-retry-result',
        sessionId,
        jobId,
        data: {
          success: result.success,
          error: result.error
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error retrying print job:', error);
      
      this.sendMessage({
        type: 'print-job-retry-result',
        sessionId: message.sessionId,
        jobId: message.jobId,
        data: {
          success: false,
          error: 'Internal error retrying print job'
        },
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle cancel print job request
   */
  private async handleCancelPrintJob(message: any): Promise<void> {
    try {
      const { sessionId, jobId } = message;
      
      console.log(`Cancelling print job ${jobId} for session ${sessionId}`);
      
      // Cancel the print job
      const result = await this.printJobService.cancelPrintJob(sessionId, jobId);

      this.sendMessage({
        type: 'print-job-cancel-result',
        sessionId,
        jobId,
        data: {
          success: result.success,
          error: result.error
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error cancelling print job:', error);
      
      this.sendMessage({
        type: 'print-job-cancel-result',
        sessionId: message.sessionId,
        jobId: message.jobId,
        data: {
          success: false,
          error: 'Internal error cancelling print job'
        },
        timestamp: new Date()
      });
    }
  }

  /**
   * Handle get print status request
   */
  private async handleGetPrintStatus(message: any): Promise<void> {
    try {
      const { sessionId, jobId } = message;
      
      console.log(`Getting print status for job ${jobId} in session ${sessionId}`);
      
      // Get print job status
      const status = await this.printJobService.getPrintJobStatus(sessionId, jobId);

      this.sendMessage({
        type: 'print-job-status-update',
        sessionId,
        jobId,
        data: {
          status: status.status,
          progress: status.progress,
          message: status.message,
          error: status.error
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error getting print status:', error);
      
      this.sendMessage({
        type: 'print-job-status-update',
        sessionId: message.sessionId,
        jobId: message.jobId,
        data: {
          status: 'FAILED',
          error: 'Internal error getting print status'
        },
        timestamp: new Date()
      });
    }
  }
      type: 'print-job-execution-result',
      sessionId,
      jobId,
      data: {
        success: result.success,
        error: result.error
      },
      timestamp: new Date()
    });
  }

  /**
   * Handle retry print job request
   */
  private async handleRetryPrintJob(message: any): Promise<void> {
    const { sessionId, jobId } = message.data;
    
    const result = await this.printJobService.retryPrintJob(sessionId, jobId);

    this.sendMessage({
      type: 'print-job-retry-result',
      sessionId,
      jobId,
      data: {
        success: result.success,
        error: result.error
      },
      timestamp: new Date()
    });
  }

  /**
   * Handle cancel print job request
   */
  private async handleCancelPrintJob(message: any): Promise<void> {
    const { sessionId, jobId } = message.data;
    
    const result = await this.printJobService.cancelPrintJob(sessionId, jobId);

    this.sendMessage({
      type: 'print-job-cancel-result',
      sessionId,
      jobId,
      data: {
        success: result.success,
        error: result.error
      },
      timestamp: new Date()
    });
  }

  /**
   * Handle get print status request
   */
  private async handleGetPrintStatus(message: any): Promise<void> {
    const { sessionId, jobId } = message.data;
    
    const status = this.printJobService.getPrintJobStatus(jobId);

    this.sendMessage({
      type: 'print-job-status',
      sessionId,
      jobId,
      data: status,
      timestamp: new Date()
    });
  }

  /**
   * Handle print job status updates from PrintJobService
   */
  private handlePrintJobStatusUpdate(update: PrintJobStatusUpdate): void {
    this.sendMessage({
      type: 'print-job-status-update',
      sessionId: update.sessionId,
      jobId: update.jobId,
      data: {
        status: update.status,
        progress: update.progress,
        message: update.message,
        error: update.error
      },
      timestamp: update.timestamp
    });
  }

  /**
   * Send message to Customer System
   */
  private sendMessage(message: LocalAgentMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send message:', message.type);
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }

  /**
   * Send error message
   */
  private sendErrorMessage(sessionId: SessionId | undefined, error: string): void {
    this.sendMessage({
      type: 'error',
      sessionId,
      data: { error },
      timestamp: new Date()
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
        console.error('Max reconnection attempts reached, giving up');
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval! * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5)); // Exponential backoff

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Send session status update
   */
  sendSessionStatusUpdate(sessionId: SessionId, status: SessionStatus): void {
    this.sendMessage({
      type: 'session-status',
      sessionId,
      data: { status },
      timestamp: new Date()
    });
  }

  /**
   * Send printer status update
   */
  sendPrinterStatusUpdate(status: any): void {
    this.sendMessage({
      type: 'printer-status',
      data: status,
      timestamp: new Date()
    });
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
  } {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.config.maxReconnectAttempts!
    };
  }

  /**
   * Shutdown WebSocket service
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down WebSocketService...');
    
    this.isShuttingDown = true;

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close WebSocket connection
    if (this.ws) {
      this.ws.close(1000, 'Service shutdown');
      this.ws = null;
    }

    console.log('WebSocketService shutdown complete');
  }
}