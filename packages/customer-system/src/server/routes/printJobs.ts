import { Router } from 'express';
import { 
  ApiResponse, 
  PrintJob, 
  PrintOptions, 
  PriceBreakdown, 
  JobStatus,
  PaymentStatus,
  SessionId,
  JobId
} from '../types';
import { validateSessionAccess, SessionRequest } from '../middleware/sessionValidation';

const router = Router();

// We'll get the WebSocket server instance from the main server
let wss: any = null;

// Function to set WebSocket server instance
export function setWebSocketServer(webSocketServer: any) {
  wss = webSocketServer;
}

// Apply session validation middleware to all routes except demo routes
router.use('/:sessionId/*', (req, res, next) => {
  // Skip validation for demo sessions
  if (req.params.sessionId?.startsWith('demo-') || req.params.sessionId?.startsWith('test-')) {
    // Create mock session data for demo
    (req as any).sessionData = {
      sessionId: req.params.sessionId,
      token: 'demo-token',
      shopId: 'demo-shop',
      isValid: true
    };
    next();
  } else {
    validateSessionAccess(req as any, res, next);
  }
});

/**
 * Create print job after payment verification
 * Requirements: 6.1 - Payment verification and print job creation
 */
router.post('/:sessionId/create', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const { printOptions, transactionId, files, autoExecute } = req.body;
    const sessionData = req.sessionData!;

    // Validate print options
    if (!printOptions) {
      const response: ApiResponse = {
        success: false,
        error: 'Print options are required'
      };
      res.status(400).json(response);
      return;
    }

    // For demo purposes, don't require payment verification
    // TODO: Verify payment with actual payment gateway in production
    const paymentVerified = true; // Skip payment verification for demo
    
    if (!paymentVerified && transactionId) {
      const paymentCheck = await verifyPayment(transactionId);
      if (!paymentCheck) {
        const response: ApiResponse = {
          success: false,
          error: 'Payment not verified. Please complete payment before creating print job.'
        };
        res.status(400).json(response);
        return;
      }
    }

    // Use provided files or mock data
    const printFiles = files || ['document.pdf'];
    
    // Calculate pricing
    const pricing = calculatePricing(printFiles, printOptions);

    // Create print job request to Local Agent
    const printJobData = {
      sessionId,
      files: printFiles,
      options: printOptions,
      pricing,
      transactionId: transactionId || `demo-${Date.now()}`
    };

    // Generate job ID for demo
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Store print job in session for retrieval
    if (!sessionData.printJobs) {
      sessionData.printJobs = [];
    }
    
    const printJob = {
      id: jobId,
      sessionId,
      files: printFiles,
      options: printOptions,
      pricing,
      status: JobStatus.QUEUED,
      createdAt: new Date(),
      transactionId
    };

    sessionData.printJobs.push(printJob);

    // If autoExecute is true, immediately send to shopkeeper's queue via WebSocket
    if (autoExecute && wss) {
      console.log(`Auto-executing print job ${jobId} for session ${sessionId}`);
      
      // Send print job to Local Agent via WebSocket
      const message = {
        type: 'create-print-job',
        sessionId,
        jobId,
        data: {
          ...printJobData,
          autoExecute: true
        },
        timestamp: new Date()
      };

      // Broadcast to all connected Local Agents
      wss.clients.forEach((client: any) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(message));
        }
      });

      // Update job status to indicate it's been sent to queue
      printJob.status = JobStatus.QUEUED;
      
      console.log(`Print job ${jobId} sent to shopkeeper queue automatically`);
    }

    const response: ApiResponse = {
      success: true,
      data: {
        jobId,
        status: printJob.status,
        message: autoExecute ? 'Print job sent to shopkeeper queue' : 'Print job created successfully'
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error creating print job:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Failed to create print job'
    };
    res.status(500).json(response);
  }
});

/**
 * Execute print job (shopkeeper action)
 * Requirements: 6.4 - Shopkeeper print button and execution
 */
router.post('/:sessionId/execute/:jobId', async (req: SessionRequest, res) => {
  try {
    const { sessionId, jobId } = req.params;
    const sessionData = req.sessionData!;

    // TODO: Send execute command to Local Agent
    const result = await executePrintJobWithLocalAgent(sessionId, jobId);

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || 'Failed to execute print job'
      };
      res.status(500).json(response);
      return;
    }

    // Broadcast print job execution started
    broadcastToSession(sessionId, {
      type: 'print-job-executing',
      sessionId,
      jobId,
      status: JobStatus.PRINTING,
      timestamp: new Date()
    });

    const response: ApiResponse = {
      success: true,
      message: 'Print job execution started'
    };

    res.json(response);
  } catch (error) {
    console.error('Error executing print job:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute print job'
    };
    res.status(500).json(response);
  }
});

/**
 * Get pending print jobs for a session
 * Requirements: 6.3 - Print progress monitoring
 */
router.get('/:sessionId/pending', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = req.sessionData!;

    // Get pending jobs from session data
    const pendingJobs = (sessionData.printJobs || []).filter(job => 
      job.status === JobStatus.QUEUED || 
      job.status === JobStatus.PRINTING
    );

    console.log(`Found ${pendingJobs.length} pending jobs for session ${sessionId}`);

    const response: ApiResponse<{ jobs: any[] }> = {
      success: true,
      data: { jobs: pendingJobs }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting pending print jobs:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pending print jobs'
    };
    res.status(500).json(response);
  }
});

/**
 * Get all print jobs status for a session
 * Requirements: 6.3 - Print progress monitoring
 */
router.get('/:sessionId/status', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = req.sessionData!;

    // Get all jobs from session data
    const jobs = (sessionData.printJobs || []).map(job => ({
      jobId: job.jobId,
      fileName: job.files.join(', '),
      status: job.status,
      progress: job.progress || 0,
      submittedAt: job.createdAt.toISOString(),
      errorMessage: job.error || null
    }));

    console.log(`Returning ${jobs.length} jobs status for session ${sessionId}`);

    const response: ApiResponse<{ jobs: any[] }> = {
      success: true,
      data: { jobs }
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting print jobs status:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get print jobs status'
    };
    res.status(500).json(response);
  }
});

/**
 * Get print job status and progress
 * Requirements: 6.3 - Print progress monitoring
 */
router.get('/:sessionId/status/:jobId', async (req: SessionRequest, res) => {
  try {
    const { sessionId, jobId } = req.params;

    // TODO: Get actual status from Local Agent
    const status = await getPrintJobStatusFromLocalAgent(sessionId, jobId);

    const response: ApiResponse<any> = {
      success: true,
      data: status
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting print job status:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get print job status'
    };
    res.status(500).json(response);
  }
});

/**
 * Retry failed print job
 * Requirements: 6.5 - Handle print failures with retry mechanisms
 */
router.post('/:sessionId/retry/:jobId', async (req: SessionRequest, res) => {
  try {
    const { sessionId, jobId } = req.params;

    // TODO: Send retry command to Local Agent
    const result = await retryPrintJobWithLocalAgent(sessionId, jobId);

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || 'Failed to retry print job'
      };
      res.status(500).json(response);
      return;
    }

    // Broadcast print job retry started
    broadcastToSession(sessionId, {
      type: 'print-job-retrying',
      sessionId,
      jobId,
      status: JobStatus.QUEUED,
      timestamp: new Date()
    });

    const response: ApiResponse = {
      success: true,
      message: 'Print job retry initiated'
    };

    res.json(response);
  } catch (error) {
    console.error('Error retrying print job:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retry print job'
    };
    res.status(500).json(response);
  }
});

/**
 * Cancel print job
 */
router.delete('/:sessionId/cancel/:jobId', async (req: SessionRequest, res) => {
  try {
    const { sessionId, jobId } = req.params;

    // TODO: Send cancel command to Local Agent
    const result = await cancelPrintJobWithLocalAgent(sessionId, jobId);

    if (!result.success) {
      const response: ApiResponse = {
        success: false,
        error: result.error || 'Failed to cancel print job'
      };
      res.status(500).json(response);
      return;
    }

    // Broadcast print job cancelled
    broadcastToSession(sessionId, {
      type: 'print-job-cancelled',
      sessionId,
      jobId,
      status: JobStatus.FAILED,
      timestamp: new Date()
    });

    const response: ApiResponse = {
      success: true,
      message: 'Print job cancelled successfully'
    };

    res.json(response);
  } catch (error) {
    console.error('Error cancelling print job:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel print job'
    };
    res.status(500).json(response);
  }
});

// Helper functions

/**
 * Verify payment with payment gateway
 * Requirements: 6.1 - Payment verification
 */
async function verifyPayment(transactionId: string): Promise<boolean> {
  try {
    // TODO: Implement actual payment verification with UPI gateway
    // For MVP, simulate verification
    console.log(`Verifying payment for transaction: ${transactionId}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock verification (90% success rate)
    return Math.random() > 0.1;
  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
}

/**
 * Calculate pricing based on files and print options
 * Requirements: 4.2 - Print pricing calculation
 */
function calculatePricing(files: string[], options: PrintOptions): PriceBreakdown {
  // Mock pricing calculation
  // TODO: Implement actual page counting and pricing logic
  const totalPages = files.length * 2; // Assume 2 pages per file
  const colorPages = options.colorMode === 'color' ? totalPages : 0;
  const bwPages = options.colorMode === 'bw' ? totalPages : 0;
  
  const colorRate = 500; // ₹5.00 per page in paise
  const bwRate = 200;    // ₹2.00 per page in paise
  
  const basePrice = (colorPages * colorRate + bwPages * bwRate) * options.copies;
  const duplexDiscount = options.duplex ? Math.floor(basePrice * 0.1) : 0; // 10% discount
  const totalPrice = basePrice - duplexDiscount;

  return {
    totalPages: totalPages * options.copies,
    colorPages: colorPages * options.copies,
    bwPages: bwPages * options.copies,
    basePrice,
    totalPrice
  };
}

/**
 * Create print job with Local Agent
 */
async function createPrintJobWithLocalAgent(printJobData: any): Promise<JobId> {
  try {
    // Send message to Local Agent via WebSocket
    const message = {
      type: 'create-print-job',
      data: printJobData,
      timestamp: new Date()
    };

    // Find Local Agent WebSocket connection
    const localAgentWs = findLocalAgentConnection();
    if (!localAgentWs) {
      throw new Error('Local Agent not connected');
    }

    // Send message and wait for response
    localAgentWs.send(JSON.stringify(message));
    
    // For now, generate a job ID (in real implementation, wait for response)
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return jobId;
  } catch (error) {
    console.error('Error communicating with Local Agent:', error);
    throw new Error('Failed to create print job with Local Agent');
  }
}

/**
 * Execute print job with Local Agent
 */
async function executePrintJobWithLocalAgent(sessionId: SessionId, jobId: JobId): Promise<{ success: boolean; error?: string }> {
  try {
    const message = {
      type: 'execute-print-job',
      data: { sessionId, jobId },
      timestamp: new Date()
    };

    const localAgentWs = findLocalAgentConnection();
    if (!localAgentWs) {
      return { success: false, error: 'Local Agent not connected' };
    }

    localAgentWs.send(JSON.stringify(message));
    
    return { success: true };
  } catch (error) {
    console.error('Error executing print job with Local Agent:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Get print job status from Local Agent
 */
async function getPrintJobStatusFromLocalAgent(sessionId: SessionId, jobId: JobId): Promise<any> {
  try {
    const message = {
      type: 'get-print-status',
      data: { sessionId, jobId },
      timestamp: new Date()
    };

    const localAgentWs = findLocalAgentConnection();
    if (!localAgentWs) {
      throw new Error('Local Agent not connected');
    }

    localAgentWs.send(JSON.stringify(message));
    
    // Mock status response for now
    return {
      jobId,
      status: JobStatus.PRINTING,
      progress: 75,
      message: 'Printing page 3 of 4'
    };
  } catch (error) {
    console.error('Error getting print job status from Local Agent:', error);
    throw error;
  }
}

/**
 * Retry print job with Local Agent
 */
async function retryPrintJobWithLocalAgent(sessionId: SessionId, jobId: JobId): Promise<{ success: boolean; error?: string }> {
  try {
    const message = {
      type: 'retry-print-job',
      data: { sessionId, jobId },
      timestamp: new Date()
    };

    const localAgentWs = findLocalAgentConnection();
    if (!localAgentWs) {
      return { success: false, error: 'Local Agent not connected' };
    }

    localAgentWs.send(JSON.stringify(message));
    
    return { success: true };
  } catch (error) {
    console.error('Error retrying print job with Local Agent:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Cancel print job with Local Agent
 */
async function cancelPrintJobWithLocalAgent(sessionId: SessionId, jobId: JobId): Promise<{ success: boolean; error?: string }> {
  try {
    const message = {
      type: 'cancel-print-job',
      data: { sessionId, jobId },
      timestamp: new Date()
    };

    const localAgentWs = findLocalAgentConnection();
    if (!localAgentWs) {
      return { success: false, error: 'Local Agent not connected' };
    }

    localAgentWs.send(JSON.stringify(message));
    
    return { success: true };
  } catch (error) {
    console.error('Error cancelling print job with Local Agent:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Find Local Agent WebSocket connection
 */
function findLocalAgentConnection(): any {
  if (!wss || !wss.clients) {
    return null;
  }

  // Look for Local Agent connection (identified by specific message or connection type)
  // For now, assume the first connection is the Local Agent
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      return client;
    }
  }

  return null;
}

/**
 * Broadcast message to all clients in a session
 * Requirements: 6.4 - Real-time status updates
 */
function broadcastToSession(sessionId: SessionId, message: any): void {
  try {
    // Get WebSocket server instance and broadcast to session clients
    if (wss && wss.clients) {
      wss.clients.forEach((client: any) => {
        if (client.sessionId === sessionId && client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(message));
        }
      });
    }
  } catch (error) {
    console.error('Error broadcasting to session:', error);
  }
}

/**
 * Test endpoint for dashboard integration
 * Get pending print jobs for a session (test route)
 */
router.get('/test/:sessionId/pending', async (req: SessionRequest, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = req.sessionData!;

    // Get pending jobs from session data
    const pendingJobs = (sessionData.printJobs || []).filter(job => 
      job.status === JobStatus.QUEUED || 
      job.status === JobStatus.PRINTING
    );

    console.log(`[TEST ENDPOINT] Found ${pendingJobs.length} pending jobs for session ${sessionId}`);

    const response: ApiResponse<any[]> = {
      success: true,
      data: pendingJobs
    };

    res.json(response);
  } catch (error) {
    console.error('Error getting pending print jobs (test endpoint):', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pending print jobs'
    };
    res.status(500).json(response);
  }
});

export { router as printJobRoutes };
