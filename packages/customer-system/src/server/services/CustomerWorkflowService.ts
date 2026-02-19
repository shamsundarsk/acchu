import { EventEmitter } from 'events';
import { 
  SessionId, 
  JobId, 
  SessionStatus, 
  JobStatus, 
  PrintOptions, 
  PriceBreakdown,
  FileMetadata,
  PaymentStatus,
  PaymentRequest,
  ApiResponse
} from '../types';

export interface CustomerWorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  error?: string;
  data?: any;
}

export interface CustomerWorkflow {
  id: string;
  sessionId: SessionId;
  type: 'file_upload' | 'print_configuration' | 'payment_processing' | 'print_execution';
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  steps: CustomerWorkflowStep[];
  startTime: Date;
  endTime?: Date;
  error?: string;
  metadata?: any;
}

export interface FileUploadWorkflowData {
  sessionId: SessionId;
  files: Express.Multer.File[];
  customerInfo?: {
    ipAddress: string;
    userAgent: string;
  };
}

export interface PrintConfigurationWorkflowData {
  sessionId: SessionId;
  printOptions: PrintOptions;
  files: FileMetadata[];
}

export interface PaymentWorkflowData {
  sessionId: SessionId;
  pricing: PriceBreakdown;
  printOptions: PrintOptions;
  files: FileMetadata[];
}

export interface PrintExecutionWorkflowData {
  sessionId: SessionId;
  jobId: JobId;
  transactionId: string;
}

/**
 * CustomerWorkflowService manages end-to-end workflows from the Customer System perspective
 * Requirements: 15.1 - Complete workflow integration from customer interface
 */
export class CustomerWorkflowService extends EventEmitter {
  private activeWorkflows = new Map<string, CustomerWorkflow>();
  private workflowHistory: CustomerWorkflow[] = [];
  private maxHistorySize = 100;
  private localAgentConnected = false;

  constructor() {
    super();
  }

  /**
   * Set Local Agent connection status
   */
  setLocalAgentConnection(connected: boolean): void {
    this.localAgentConnected = connected;
    this.emit('localAgentConnectionChanged', connected);
  }

  /**
   * Execute file upload workflow
   * Requirements: 3.1, 3.2, 3.3 - File upload and validation
   */
  async executeFileUploadWorkflow(workflowData: FileUploadWorkflowData): Promise<{
    workflow: CustomerWorkflow;
    uploadResults: any[];
  }> {
    const workflowId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow: CustomerWorkflow = {
      id: workflowId,
      sessionId: workflowData.sessionId,
      type: 'file_upload',
      status: 'running',
      steps: [
        { id: 'validate_session', name: 'Validate Session Access', status: 'pending' },
        { id: 'validate_files', name: 'Validate File Formats and Sizes', status: 'pending' },
        { id: 'process_files', name: 'Process and Extract Metadata', status: 'pending' },
        { id: 'transfer_to_local_agent', name: 'Transfer Files to Local Agent', status: 'pending' },
        { id: 'verify_transfer', name: 'Verify File Transfer', status: 'pending' }
      ],
      startTime: new Date(),
      metadata: {
        fileCount: workflowData.files.length,
        totalSize: workflowData.files.reduce((sum, f) => sum + f.size, 0),
        customerInfo: workflowData.customerInfo
      }
    };

    this.activeWorkflows.set(workflowId, workflow);
    this.emit('workflowStarted', workflow);

    const uploadResults: any[] = [];

    try {
      // Step 1: Validate Session
      await this.executeWorkflowStep(workflow, 'validate_session', async () => {
        if (!this.localAgentConnected) {
          throw new Error('Local Agent not connected');
        }

        // Validate session exists and is active
        const sessionValid = await this.validateSessionWithLocalAgent(workflowData.sessionId);
        if (!sessionValid) {
          throw new Error('Session is not valid or has expired');
        }

        return { sessionValid: true };
      });

      // Step 2: Validate Files
      await this.executeWorkflowStep(workflow, 'validate_files', async () => {
        const validationResults = [];
        
        for (const file of workflowData.files) {
          const validation = this.validateFile(file);
          if (!validation.isValid) {
            throw new Error(`File validation failed for ${file.originalname}: ${validation.errors.join(', ')}`);
          }
          validationResults.push(validation);
        }

        return { validatedFiles: validationResults };
      });

      // Step 3: Process Files
      await this.executeWorkflowStep(workflow, 'process_files', async () => {
        const processedFiles = [];
        
        for (const file of workflowData.files) {
          const fileMetadata: FileMetadata = {
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            uploadedAt: new Date(),
            localPath: '', // Will be set by Local Agent
            pageCount: await this.estimatePageCount(file)
          };

          processedFiles.push({
            metadata: fileMetadata,
            buffer: file.buffer
          });
        }

        return { processedFiles };
      });

      // Step 4: Transfer to Local Agent
      await this.executeWorkflowStep(workflow, 'transfer_to_local_agent', async () => {
        const transferResults = [];
        
        for (const processedFile of workflow.steps[2].data.processedFiles) {
          const transferResult = await this.transferFileToLocalAgent(
            workflowData.sessionId,
            processedFile.metadata,
            processedFile.buffer
          );
          
          transferResults.push(transferResult);
          uploadResults.push({
            fileId: processedFile.metadata.id,
            metadata: processedFile.metadata
          });
        }

        return { transferResults };
      });

      // Step 5: Verify Transfer
      await this.executeWorkflowStep(workflow, 'verify_transfer', async () => {
        const verificationResults = [];
        
        for (const result of uploadResults) {
          const verified = await this.verifyFileWithLocalAgent(
            workflowData.sessionId,
            result.fileId
          );
          
          if (!verified) {
            throw new Error(`File transfer verification failed for ${result.fileId}`);
          }
          
          verificationResults.push({ fileId: result.fileId, verified });
        }

        return { verificationResults };
      });

      workflow.status = 'completed';
      workflow.endTime = new Date();
      this.emit('workflowCompleted', workflow);

    } catch (error) {
      workflow.status = 'failed';
      workflow.endTime = new Date();
      workflow.error = error instanceof Error ? error.message : String(error);
      this.emit('workflowFailed', workflow, error);
      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
      this.addToHistory(workflow);
    }

    return { workflow, uploadResults };
  }

  /**
   * Execute print configuration workflow
   * Requirements: 4.1, 4.2, 4.5 - Print options and pricing
   */
  async executePrintConfigurationWorkflow(workflowData: PrintConfigurationWorkflowData): Promise<{
    workflow: CustomerWorkflow;
    pricing: PriceBreakdown;
  }> {
    const workflowId = `config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow: CustomerWorkflow = {
      id: workflowId,
      sessionId: workflowData.sessionId,
      type: 'print_configuration',
      status: 'running',
      steps: [
        { id: 'validate_options', name: 'Validate Print Options', status: 'pending' },
        { id: 'calculate_pricing', name: 'Calculate Pricing', status: 'pending' },
        { id: 'verify_with_local_agent', name: 'Verify Configuration with Local Agent', status: 'pending' }
      ],
      startTime: new Date(),
      metadata: {
        printOptions: workflowData.printOptions,
        fileCount: workflowData.files.length
      }
    };

    this.activeWorkflows.set(workflowId, workflow);
    this.emit('workflowStarted', workflow);

    let pricing: PriceBreakdown = {
      totalPages: 0,
      colorPages: 0,
      bwPages: 0,
      basePrice: 0,
      totalPrice: 0
    };

    try {
      // Step 1: Validate Options
      await this.executeWorkflowStep(workflow, 'validate_options', async () => {
        const validation = this.validatePrintOptions(workflowData.printOptions);
        if (!validation.isValid) {
          throw new Error(`Print options validation failed: ${validation.errors.join(', ')}`);
        }

        return { optionsValid: true };
      });

      // Step 2: Calculate Pricing
      await this.executeWorkflowStep(workflow, 'calculate_pricing', async () => {
        pricing = await this.calculatePricing(workflowData.files, workflowData.printOptions);
        
        if (pricing.totalPrice <= 0) {
          throw new Error('Invalid pricing calculation');
        }

        return { pricing };
      });

      // Step 3: Verify with Local Agent
      await this.executeWorkflowStep(workflow, 'verify_with_local_agent', async () => {
        const verified = await this.verifyConfigurationWithLocalAgent(
          workflowData.sessionId,
          workflowData.printOptions,
          pricing
        );

        if (!verified) {
          throw new Error('Configuration verification with Local Agent failed');
        }

        return { configurationVerified: true };
      });

      workflow.status = 'completed';
      workflow.endTime = new Date();
      this.emit('workflowCompleted', workflow);

    } catch (error) {
      workflow.status = 'failed';
      workflow.endTime = new Date();
      workflow.error = error instanceof Error ? error.message : String(error);
      this.emit('workflowFailed', workflow, error);
      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
      this.addToHistory(workflow);
    }

    return { workflow, pricing };
  }

  /**
   * Execute payment processing workflow
   * Requirements: 5.1, 5.2, 5.4, 5.5 - Payment processing and verification
   */
  async executePaymentWorkflow(workflowData: PaymentWorkflowData): Promise<{
    workflow: CustomerWorkflow;
    paymentRequest: PaymentRequest;
  }> {
    const workflowId = `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow: CustomerWorkflow = {
      id: workflowId,
      sessionId: workflowData.sessionId,
      type: 'payment_processing',
      status: 'running',
      steps: [
        { id: 'generate_payment_request', name: 'Generate Payment Request', status: 'pending' },
        { id: 'create_upi_qr', name: 'Create UPI QR Code', status: 'pending' },
        { id: 'monitor_payment', name: 'Monitor Payment Status', status: 'pending' },
        { id: 'verify_payment', name: 'Verify Payment Completion', status: 'pending' },
        { id: 'notify_local_agent', name: 'Notify Local Agent of Payment', status: 'pending' }
      ],
      startTime: new Date(),
      metadata: {
        amount: workflowData.pricing.totalPrice,
        printOptions: workflowData.printOptions,
        fileCount: workflowData.files.length
      }
    };

    this.activeWorkflows.set(workflowId, workflow);
    this.emit('workflowStarted', workflow);

    let paymentRequest: PaymentRequest = {
      sessionId: workflowData.sessionId,
      amount: 0,
      upiId: '',
      transactionId: '',
      status: PaymentStatus.PENDING,
      createdAt: new Date()
    };

    try {
      // Step 1: Generate Payment Request
      await this.executeWorkflowStep(workflow, 'generate_payment_request', async () => {
        const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        paymentRequest = {
          sessionId: workflowData.sessionId,
          amount: workflowData.pricing.totalPrice,
          upiId: 'merchant@upi', // This would be configured
          transactionId,
          status: PaymentStatus.PENDING,
          createdAt: new Date()
        };

        return { paymentRequest };
      });

      // Step 2: Create UPI QR Code
      await this.executeWorkflowStep(workflow, 'create_upi_qr', async () => {
        const upiString = `upi://pay?pa=${paymentRequest.upiId}&pn=ACCHU&am=${paymentRequest.amount / 100}&tr=${paymentRequest.transactionId}&tn=Print Payment`;
        
        // In a real implementation, this would generate an actual QR code
        const qrCodeData = {
          upiString,
          qrCodeUrl: `data:image/png;base64,mock-qr-code-data`,
          paymentUrl: upiString
        };

        return { qrCodeData };
      });

      // Step 3: Monitor Payment (for MVP, simulate)
      await this.executeWorkflowStep(workflow, 'monitor_payment', async () => {
        // For MVP, simulate payment monitoring
        // In production, this would integrate with actual payment gateway
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing time
        
        return { paymentMonitored: true };
      });

      // Step 4: Verify Payment
      await this.executeWorkflowStep(workflow, 'verify_payment', async () => {
        // For MVP, simulate payment verification
        const paymentVerified = Math.random() > 0.1; // 90% success rate for testing
        
        if (!paymentVerified) {
          throw new Error('Payment verification failed');
        }

        paymentRequest.status = PaymentStatus.COMPLETED;
        paymentRequest.completedAt = new Date();

        return { paymentVerified: true };
      });

      // Step 5: Notify Local Agent
      await this.executeWorkflowStep(workflow, 'notify_local_agent', async () => {
        const notified = await this.notifyLocalAgentOfPayment(
          workflowData.sessionId,
          paymentRequest
        );

        if (!notified) {
          throw new Error('Failed to notify Local Agent of payment completion');
        }

        return { localAgentNotified: true };
      });

      workflow.status = 'completed';
      workflow.endTime = new Date();
      this.emit('workflowCompleted', workflow);

    } catch (error) {
      workflow.status = 'failed';
      workflow.endTime = new Date();
      workflow.error = error instanceof Error ? error.message : String(error);
      this.emit('workflowFailed', workflow, error);
      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
      this.addToHistory(workflow);
    }

    return { workflow, paymentRequest };
  }

  /**
   * Execute print execution workflow
   * Requirements: 6.1, 6.4, 6.5 - Print job execution and monitoring
   */
  async executePrintExecutionWorkflow(workflowData: PrintExecutionWorkflowData): Promise<{
    workflow: CustomerWorkflow;
    printResult: any;
  }> {
    const workflowId = `print-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const workflow: CustomerWorkflow = {
      id: workflowId,
      sessionId: workflowData.sessionId,
      type: 'print_execution',
      status: 'running',
      steps: [
        { id: 'create_print_job', name: 'Create Print Job with Local Agent', status: 'pending' },
        { id: 'wait_for_execution', name: 'Wait for Shopkeeper Execution', status: 'pending' },
        { id: 'monitor_progress', name: 'Monitor Print Progress', status: 'pending' },
        { id: 'verify_completion', name: 'Verify Print Completion', status: 'pending' }
      ],
      startTime: new Date(),
      metadata: {
        jobId: workflowData.jobId,
        transactionId: workflowData.transactionId
      }
    };

    this.activeWorkflows.set(workflowId, workflow);
    this.emit('workflowStarted', workflow);

    let printResult: any;

    try {
      // Step 1: Create Print Job
      await this.executeWorkflowStep(workflow, 'create_print_job', async () => {
        const jobCreated = await this.createPrintJobWithLocalAgent(
          workflowData.sessionId,
          workflowData.jobId,
          workflowData.transactionId
        );

        if (!jobCreated) {
          throw new Error('Failed to create print job with Local Agent');
        }

        return { printJobCreated: true };
      });

      // Step 2: Wait for Execution (this step completes when shopkeeper clicks print)
      await this.executeWorkflowStep(workflow, 'wait_for_execution', async () => {
        // This step is completed externally when the shopkeeper executes the print job
        // For now, we'll simulate this
        return { waitingForExecution: true };
      });

      // Step 3: Monitor Progress
      await this.executeWorkflowStep(workflow, 'monitor_progress', async () => {
        printResult = await this.monitorPrintProgress(workflowData.sessionId, workflowData.jobId);
        return { progressMonitored: true, printResult };
      });

      // Step 4: Verify Completion
      await this.executeWorkflowStep(workflow, 'verify_completion', async () => {
        if (printResult.status !== JobStatus.COMPLETED) {
          throw new Error(`Print job not completed. Status: ${printResult.status}`);
        }

        return { printCompleted: true };
      });

      workflow.status = 'completed';
      workflow.endTime = new Date();
      this.emit('workflowCompleted', workflow);

    } catch (error) {
      workflow.status = 'failed';
      workflow.endTime = new Date();
      workflow.error = error instanceof Error ? error.message : String(error);
      this.emit('workflowFailed', workflow, error);
      throw error;
    } finally {
      this.activeWorkflows.delete(workflowId);
      this.addToHistory(workflow);
    }

    return { workflow, printResult };
  }

  /**
   * Execute a single workflow step with error handling
   */
  private async executeWorkflowStep(
    workflow: CustomerWorkflow,
    stepId: string,
    stepFunction: () => Promise<any>
  ): Promise<void> {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in workflow`);
    }

    step.status = 'in_progress';
    step.startTime = new Date();
    this.emit('stepStarted', workflow, step);

    try {
      const result = await stepFunction();
      step.status = 'completed';
      step.endTime = new Date();
      step.data = result;
      this.emit('stepCompleted', workflow, step);
    } catch (error) {
      step.status = 'failed';
      step.endTime = new Date();
      step.error = error instanceof Error ? error.message : String(error);
      this.emit('stepFailed', workflow, step, error);
      throw error;
    }
  }

  // Helper methods for integration with Local Agent

  private async validateSessionWithLocalAgent(sessionId: SessionId): Promise<boolean> {
    // This would send a WebSocket message to Local Agent to validate session
    // For now, simulate validation
    return true;
  }

  private validateFile(file: Express.Multer.File): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      errors.push('File size exceeds 10MB limit');
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`Unsupported file type: ${file.mimetype}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async estimatePageCount(file: Express.Multer.File): Promise<number> {
    // This would analyze the file to determine page count
    // For now, return a simple estimate based on file type
    if (file.mimetype === 'application/pdf') {
      return Math.ceil(file.size / 50000); // Rough estimate
    } else if (file.mimetype.startsWith('image/')) {
      return 1;
    } else {
      return Math.ceil(file.size / 30000); // Rough estimate for documents
    }
  }

  private async transferFileToLocalAgent(
    sessionId: SessionId,
    metadata: FileMetadata,
    buffer: Buffer
  ): Promise<any> {
    // This would send the file to Local Agent via WebSocket or HTTP
    // For now, simulate transfer
    return { success: true, fileId: metadata.id };
  }

  private async verifyFileWithLocalAgent(sessionId: SessionId, fileId: string): Promise<boolean> {
    // This would verify the file was received and stored by Local Agent
    // For now, simulate verification
    return true;
  }

  private validatePrintOptions(options: PrintOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.copies < 1 || options.copies > 10) {
      errors.push('Copies must be between 1 and 10');
    }

    if (!['color', 'bw'].includes(options.colorMode)) {
      errors.push('Color mode must be "color" or "bw"');
    }

    if (!['A4', 'Letter'].includes(options.paperSize)) {
      errors.push('Paper size must be "A4" or "Letter"');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async calculatePricing(files: FileMetadata[], options: PrintOptions): Promise<PriceBreakdown> {
    const totalPages = files.reduce((sum, file) => sum + (file.pageCount || 1), 0);
    const colorPages = options.colorMode === 'color' ? totalPages : 0;
    const bwPages = options.colorMode === 'bw' ? totalPages : 0;
    
    const colorRate = 500; // ₹5.00 per page in paise
    const bwRate = 200;    // ₹2.00 per page in paise
    
    const basePrice = (colorPages * colorRate + bwPages * bwRate) * options.copies;
    const duplexDiscount = options.duplex ? Math.floor(basePrice * 0.1) : 0;
    const totalPrice = basePrice - duplexDiscount;

    return {
      totalPages: totalPages * options.copies,
      colorPages: colorPages * options.copies,
      bwPages: bwPages * options.copies,
      basePrice,
      totalPrice
    };
  }

  private async verifyConfigurationWithLocalAgent(
    sessionId: SessionId,
    options: PrintOptions,
    pricing: PriceBreakdown
  ): Promise<boolean> {
    // This would verify the configuration with Local Agent
    // For now, simulate verification
    return true;
  }

  private async notifyLocalAgentOfPayment(
    sessionId: SessionId,
    paymentRequest: PaymentRequest
  ): Promise<boolean> {
    // This would notify Local Agent of payment completion via WebSocket
    // For now, simulate notification
    return true;
  }

  private async createPrintJobWithLocalAgent(
    sessionId: SessionId,
    jobId: JobId,
    transactionId: string
  ): Promise<boolean> {
    // This would create the print job with Local Agent
    // For now, simulate creation
    return true;
  }

  private async monitorPrintProgress(sessionId: SessionId, jobId: JobId): Promise<any> {
    // This would monitor print progress via WebSocket updates
    // For now, simulate monitoring
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          status: JobStatus.COMPLETED,
          progress: 100,
          message: 'Print completed successfully'
        });
      }, 5000); // Simulate 5 second print job
    });
  }

  private addToHistory(workflow: CustomerWorkflow): void {
    this.workflowHistory.unshift(workflow);
    if (this.workflowHistory.length > this.maxHistorySize) {
      this.workflowHistory = this.workflowHistory.slice(0, this.maxHistorySize);
    }
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows(): CustomerWorkflow[] {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get workflow history
   */
  getWorkflowHistory(limit: number = 50): CustomerWorkflow[] {
    return this.workflowHistory.slice(0, limit);
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStatistics(): {
    active: number;
    completed: number;
    failed: number;
    successRate: number;
  } {
    const active = this.activeWorkflows.size;
    const completed = this.workflowHistory.filter(w => w.status === 'completed').length;
    const failed = this.workflowHistory.filter(w => w.status === 'failed').length;
    
    const total = completed + failed;
    const successRate = total > 0 ? (completed / total) * 100 : 0;

    return {
      active,
      completed,
      failed,
      successRate
    };
  }
}