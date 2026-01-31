import { SessionManager, SessionManagerConfig } from './SessionManager';
import { PrintManager, PrintManagerConfig } from './PrintManager';
import { PrintJobService } from './PrintJobService';
import { WebSocketService, WebSocketConfig } from './WebSocketService';
import { FileHandler } from './FileHandler';
import { SessionCleanupOrchestrator, CleanupResult } from './SessionCleanupOrchestrator';
import { ErrorHandler, ErrorCategory, ErrorSeverity } from './ErrorHandler';
import { NetworkRetryService } from './NetworkRetryService';
import { ResourceMonitor } from './ResourceMonitor';
import { SystemRecoveryService } from './SystemRecoveryService';
import { AuditLogger } from './AuditLogger';
import { WorkflowOrchestrator, PrintWorkflowData } from './WorkflowOrchestrator';
import { WorkflowMonitoringService } from './WorkflowMonitoringService';
import { 
  SessionId, 
  JobId, 
  SessionStatus,
  PrinterStatus
} from '../types';

export interface LocalAgentConfig {
  shopId: string;
  sessionManager: SessionManagerConfig;
  printManager: PrintManagerConfig;
  webSocket: WebSocketConfig;
  errorHandling?: {
    failClosedOnCritical?: boolean;
    maxRetryAttempts?: number;
    resourceMonitoringEnabled?: boolean;
    integrityCheckIntervalMs?: number;
  };
}

/**
 * LocalAgentOrchestrator coordinates all services for the Local Agent with comprehensive error handling
 * Requirements: 6.1, 6.4, 6.5 - Complete print job workflow orchestration
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5 - Comprehensive error handling and recovery
 */
export class LocalAgentOrchestrator {
  private sessionManager: SessionManager;
  private printManager: PrintManager;
  private printJobService: PrintJobService;
  private webSocketService: WebSocketService;
  private fileHandler: FileHandler;
  private cleanupOrchestrator: SessionCleanupOrchestrator;
  private auditLogger: AuditLogger;
  
  // Error handling and monitoring services
  private errorHandler: ErrorHandler;
  private networkRetryService: NetworkRetryService;
  private resourceMonitor: ResourceMonitor;
  private systemRecoveryService: SystemRecoveryService;
  
  // Workflow orchestration services
  private workflowOrchestrator: WorkflowOrchestrator;
  private workflowMonitoring: WorkflowMonitoringService;
  
  private config: LocalAgentConfig;
  private isInitialized = false;
  private isShuttingDown = false;

  constructor(config: LocalAgentConfig) {
    this.config = config;

    // Initialize audit logger first
    this.auditLogger = new AuditLogger({
      logDirectory: './logs',
      retentionDays: 30
    });

    // Initialize error handling services
    this.errorHandler = new ErrorHandler({
      failClosedOnCritical: config.errorHandling?.failClosedOnCritical ?? true,
      maxRetryAttempts: config.errorHandling?.maxRetryAttempts ?? 3,
      auditLogger: this.auditLogger
    });

    this.networkRetryService = new NetworkRetryService({
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 1000,
      exponentialBackoff: true
    });

    this.resourceMonitor = new ResourceMonitor({
      monitoringIntervalMs: 30000,
      enableAlerts: true
    });

    this.systemRecoveryService = new SystemRecoveryService({
      integrityCheckIntervalMs: config.errorHandling?.integrityCheckIntervalMs ?? 300000,
      autoRecoveryEnabled: true
    });

    // Initialize core services with error handling integration
    this.sessionManager = new SessionManager({
      ...config.sessionManager,
      auditLogger: this.auditLogger
    });
    
    this.printManager = new PrintManager(config.printManager);
    this.fileHandler = new FileHandler();
    
    // Initialize cleanup orchestrator
    this.cleanupOrchestrator = new SessionCleanupOrchestrator(this.sessionManager, this.fileHandler, this.auditLogger);
    
    // Initialize orchestration services
    this.printJobService = new PrintJobService(this.printManager, this.sessionManager);
    this.webSocketService = new WebSocketService(
      config.webSocket, 
      this.printJobService, 
      this.sessionManager
    );

    // Initialize workflow orchestration services
    this.workflowMonitoring = new WorkflowMonitoringService(this.auditLogger);
    this.workflowOrchestrator = new WorkflowOrchestrator(this, this.auditLogger);

    // Set up workflow event listeners
    this.setupWorkflowEventListeners();

    // Set up error handling event listeners
    this.setupErrorHandling();
  }

  /**
   * Set up workflow event listeners for comprehensive monitoring
   * Requirements: 15.1 - Comprehensive logging and monitoring
   */
  private setupWorkflowEventListeners(): void {
    // Listen to workflow orchestrator events
    this.workflowOrchestrator.on('workflowStarted', (workflow) => {
      this.workflowMonitoring.recordWorkflowStarted(
        workflow.id,
        workflow.sessionId,
        workflow.type,
        workflow.metadata
      );
    });

    this.workflowOrchestrator.on('workflowCompleted', (workflow) => {
      this.workflowMonitoring.recordWorkflowCompleted(
        workflow.id,
        workflow.sessionId,
        workflow.type,
        { duration: workflow.totalDuration }
      );
    });

    this.workflowOrchestrator.on('workflowFailed', (workflow, error) => {
      this.workflowMonitoring.recordWorkflowFailed(
        workflow.id,
        workflow.sessionId,
        workflow.type,
        error
      );
    });

    this.workflowOrchestrator.on('stepCompleted', (workflow, step) => {
      if (step.startTime && step.endTime) {
        const duration = step.endTime.getTime() - step.startTime.getTime();
        this.workflowMonitoring.recordStepCompleted(
          workflow.id,
          workflow.sessionId,
          step.id,
          step.name,
          duration,
          step.data
        );
      }
    });

    this.workflowOrchestrator.on('stepFailed', (workflow, step, error) => {
      const duration = step.startTime && step.endTime 
        ? step.endTime.getTime() - step.startTime.getTime() 
        : undefined;
      
      this.workflowMonitoring.recordStepFailed(
        workflow.id,
        workflow.sessionId,
        step.id,
        step.name,
        error,
        duration
      );
    });

    // Listen to monitoring alerts
    this.workflowMonitoring.on('alertCreated', async (alert) => {
      console.warn(`Performance Alert: ${alert.message}`);
      
      // Handle critical alerts with fail-closed behavior if needed
      if (alert.severity === 'critical' && alert.type === 'resource_constraint') {
        await this.errorHandler.handleError(
          ErrorCategory.RESOURCE,
          ErrorSeverity.CRITICAL,
          `Critical performance alert: ${alert.message}`,
          alert.data
        );
      }
    });
  }

  /**
   * Set up error handling event listeners and integrations
   * Requirements: 9.4 - Fail-closed error handling for critical errors
   */
  private setupErrorHandling(): void {
    // Handle critical errors with fail-closed behavior
    this.errorHandler.on('error', async (error) => {
      if (error.severity === ErrorSeverity.CRITICAL) {
        console.error(`CRITICAL ERROR: ${error.message}`);
        await this.handleCriticalError(error);
      }
    });

    // Handle fail-closed events
    this.errorHandler.on('failClosed', async (event) => {
      console.error(`FAIL-CLOSED TRIGGERED: ${event.error.message}, terminated ${event.terminatedSessions} sessions`);
      
      // Log the fail-closed event
      await this.auditLogger.logSystemEvent('FAIL_CLOSED_EXECUTED', {
        errorId: event.error.id,
        terminatedSessions: event.terminatedSessions,
        reason: event.error.message
      });
    });

    // Handle resource alerts
    this.resourceMonitor.on('resourceAlert', async (alert) => {
      console.warn(`Resource alert: ${alert.message}`);
      
      if (alert.level === 'critical') {
        await this.errorHandler.handleError(
          ErrorCategory.RESOURCE,
          ErrorSeverity.CRITICAL,
          `Critical resource constraint: ${alert.message}`,
          alert
        );
      }
    });

    // Handle system recovery events
    this.systemRecoveryService.on('systemRecoveryCompleted', (event) => {
      console.log(`System recovery completed: ${event.recoveryResults.length} actions performed`);
    });

    // Handle network retry events
    this.networkRetryService.on('requestFailed', async (event) => {
      await this.errorHandler.handleError(
        ErrorCategory.NETWORK,
        ErrorSeverity.HIGH,
        `Network request failed: ${event.url}`,
        event
      );
    });

    // Note: PrintManager doesn't emit events directly
    // Printer errors are handled through the print job execution methods
  }

  /**
   * Initialize the Local Agent and all services with comprehensive error handling
   * Requirements: 9.5 - System recovery and integrity checks
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing Local Agent Orchestrator with comprehensive error handling...');

      // Initialize error handling services first
      this.errorHandler.initialize(this.sessionManager, this.printManager);
      this.systemRecoveryService.initialize(
        this.sessionManager,
        this.printManager,
        this.auditLogger,
        this.errorHandler,
        this.resourceMonitor
      );

      // Start monitoring services
      this.resourceMonitor.startMonitoring();
      this.systemRecoveryService.startPeriodicChecks();

      // Perform initial system integrity check
      console.log('Performing initial system integrity check...');
      const integrityResult = await this.systemRecoveryService.performIntegrityCheck();
      
      if (!integrityResult.overallHealth) {
        console.warn('System integrity issues detected during initialization');
        
        // Log integrity issues but continue initialization
        await this.auditLogger.logSystemEvent('INITIALIZATION_INTEGRITY_ISSUES', {
          unhealthyComponents: integrityResult.components.filter(c => !c.isHealthy).length,
          recoveryActionsNeeded: integrityResult.recoveryActions.length
        });
      }

      // Perform crash recovery and cleanup orphaned sessions
      console.log('Performing crash recovery...');
      const crashRecoveryResult = await this.cleanupOrchestrator.performCrashRecovery();
      if (crashRecoveryResult.totalRecovered > 0) {
        console.log(`Crash recovery completed: ${crashRecoveryResult.totalRecovered} orphaned sessions cleaned up`);
      }

      // Initialize printer detection with error handling
      try {
        await this.printManager.detectPrinters();
      } catch (error) {
        await this.errorHandler.handleError(
          ErrorCategory.PRINTER,
          ErrorSeverity.HIGH,
          'Failed to detect printers during initialization',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
      
      // Connect to Customer System with retry logic
      try {
        await this.webSocketService.connect();
      } catch (error) {
        await this.errorHandler.handleError(
          ErrorCategory.NETWORK,
          ErrorSeverity.MEDIUM,
          'Failed to connect to Customer System during initialization',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }

      // Set up periodic status monitoring
      this.startStatusMonitoring();

      this.isInitialized = true;
      console.log('Local Agent Orchestrator initialized successfully with error handling');

      // Log successful initialization
      await this.auditLogger.logSystemEvent('SYSTEM_INITIALIZED', {
        integrityHealthy: integrityResult.overallHealth,
        crashRecoveredSessions: crashRecoveryResult.totalRecovered
      });

    } catch (error) {
      console.error('Failed to initialize Local Agent Orchestrator:', error);
      
      // Handle initialization failure as critical error
      await this.errorHandler.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.CRITICAL,
        'System initialization failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      throw error;
    }
  }

  /**
   * Handles critical errors that require immediate fail-closed response
   * Requirements: 9.4 - Fail closed by terminating active sessions and destroying data
   */
  private async handleCriticalError(error: any): Promise<void> {
    if (this.isShuttingDown) {
      return; // Avoid recursive shutdown
    }

    try {
      console.error(`Handling critical error: ${error.message}`);
      
      // Get all active sessions before termination
      const activeSessions = this.sessionManager.getActiveSessions();
      
      // Terminate all active sessions immediately
      const terminationPromises = activeSessions.map(async (session) => {
        try {
          await this.terminateSession(session.id, 'critical_error_fail_closed');
          return { sessionId: session.id, success: true };
        } catch (terminationError) {
          console.error(`Failed to terminate session ${session.id}:`, terminationError);
          return { sessionId: session.id, success: false, error: terminationError };
        }
      });

      const terminationResults = await Promise.allSettled(terminationPromises);
      const successfulTerminations = terminationResults.filter(
        (result) => result.status === 'fulfilled' && result.value.success
      ).length;

      console.log(`Critical error handling: terminated ${successfulTerminations}/${activeSessions.length} sessions`);

      // Log the critical error response
      await this.auditLogger.logSystemEvent('CRITICAL_ERROR_RESPONSE', {
        errorId: error.id,
        errorMessage: error.message,
        totalSessions: activeSessions.length,
        successfulTerminations,
        failedTerminations: activeSessions.length - successfulTerminations
      });

    } catch (handlingError) {
      console.error('Failed to handle critical error:', handlingError);
      
      // Last resort: log the failure
      try {
        await this.auditLogger.logSystemEvent('CRITICAL_ERROR_HANDLING_FAILED', {
          originalError: error.message,
          handlingError: handlingError instanceof Error ? handlingError.message : String(handlingError)
        });
      } catch (logError) {
        console.error('Failed to log critical error handling failure:', logError);
      }
    }
  }

  /**
   * Create a new session with error handling
   * Requirements: 1.1 - Session creation with QR code generation
   * Requirements: 9.3 - Resource monitoring and session prevention
   */
  async createSession(): Promise<{
    sessionId: SessionId;
    qrCodeData: any;
    sessionUrl: string;
  }> {
    try {
      // Check if new sessions should be prevented due to resource constraints
      if (this.resourceMonitor.shouldPreventNewSessions()) {
        const resourceStatus = this.resourceMonitor.getResourceStatus();
        
        await this.errorHandler.handleError(
          ErrorCategory.RESOURCE,
          ErrorSeverity.HIGH,
          'Session creation prevented due to resource constraints',
          { resourceStatus }
        );
        
        throw new Error('Cannot create new session: system resource constraints detected');
      }

      const sessionId = await this.sessionManager.createSession();
      const qrCodeData = this.sessionManager.getSessionQRCode(sessionId);
      const sessionUrl = this.sessionManager.getSessionURL(sessionId);

      if (!qrCodeData || !sessionUrl) {
        await this.errorHandler.handleError(
          ErrorCategory.SESSION,
          ErrorSeverity.HIGH,
          'Failed to generate QR code or session URL',
          { sessionId }
        );
        throw new Error('Failed to generate QR code or session URL');
      }

      // Notify Customer System about new session with retry logic
      try {
        this.webSocketService.sendSessionStatusUpdate(sessionId, SessionStatus.ACTIVE);
      } catch (wsError) {
        // Don't fail session creation for WebSocket errors, just log
        await this.errorHandler.handleError(
          ErrorCategory.NETWORK,
          ErrorSeverity.MEDIUM,
          'Failed to notify Customer System about new session',
          { sessionId, error: wsError instanceof Error ? wsError.message : String(wsError) }
        );
      }

      console.log(`Created new session: ${sessionId}`);

      return {
        sessionId,
        qrCodeData,
        sessionUrl
      };

    } catch (error) {
      console.error('Error creating session:', error);
      
      await this.errorHandler.handleError(
        ErrorCategory.SESSION,
        ErrorSeverity.HIGH,
        'Session creation failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      throw error;
    }
  }

  /**
   * Get session status and information
   */
  getSessionStatus(sessionId: SessionId): any {
    const session = this.sessionManager.getSessionStatus(sessionId);
    if (!session) {
      return null;
    }

    const qrCodeData = this.sessionManager.getSessionQRCode(sessionId);
    const printJobs = this.printJobService.getSessionPrintJobs(sessionId);

    return {
      session,
      qrCodeData,
      printJobs,
      isActive: session.status === SessionStatus.ACTIVE
    };
  }

  /**
   * Execute complete print workflow from file upload to completion
   * Requirements: 15.1 - Complete workflow integration
   */
  async executeCompletePrintWorkflow(workflowData: PrintWorkflowData): Promise<any> {
    try {
      console.log(`Starting complete print workflow for session ${workflowData.sessionId}`);
      
      const result = await this.workflowOrchestrator.executeCompletePrintWorkflow(workflowData);
      
      console.log(`Complete print workflow ${result.id} finished with status: ${result.status}`);
      return result;
      
    } catch (error) {
      console.error('Error in complete print workflow:', error);
      
      // Record error in monitoring
      this.workflowMonitoring.recordError(
        workflowData.sessionId,
        error instanceof Error ? error : new Error(String(error)),
        { workflowType: 'complete_print_workflow', workflowData }
      );
      
      throw error;
    }
  }

  /**
   * Execute session cleanup workflow
   * Requirements: 1.4, 7.3 - Session cleanup and data destruction
   */
  async executeSessionCleanupWorkflow(sessionId: SessionId, reason: string = 'manual'): Promise<any> {
    try {
      console.log(`Starting session cleanup workflow for session ${sessionId}`);
      
      const result = await this.workflowOrchestrator.executeSessionCleanupWorkflow(sessionId, reason);
      
      console.log(`Session cleanup workflow ${result.id} finished with status: ${result.status}`);
      return result;
      
    } catch (error) {
      console.error('Error in session cleanup workflow:', error);
      
      // Record error in monitoring
      this.workflowMonitoring.recordError(
        sessionId,
        error instanceof Error ? error : new Error(String(error)),
        { workflowType: 'session_cleanup', reason }
      );
      
      throw error;
    }
  }

  /**
   * Execute error recovery workflow
   * Requirements: 9.4, 9.5 - Error handling and system recovery
   */
  async executeErrorRecoveryWorkflow(error: Error, context?: any): Promise<any> {
    try {
      console.log('Starting error recovery workflow');
      
      const result = await this.workflowOrchestrator.executeErrorRecoveryWorkflow(error, context);
      
      console.log(`Error recovery workflow ${result.id} finished with status: ${result.status}`);
      return result;
      
    } catch (recoveryError) {
      console.error('Error in recovery workflow:', recoveryError);
      
      // Record error in monitoring
      this.workflowMonitoring.recordError(
        context?.sessionId || 'system',
        recoveryError instanceof Error ? recoveryError : new Error(String(recoveryError)),
        { workflowType: 'error_recovery', originalError: error.message, context }
      );
      
      throw recoveryError;
    }
  }

  /**
   * Get workflow monitoring metrics and status
   * Requirements: 15.1 - Comprehensive logging and monitoring
   */
  getWorkflowMetrics(): {
    metrics: any;
    systemHealth: any;
    activeWorkflows: any[];
    recentEvents: any[];
    alerts: any[];
  } {
    return {
      metrics: this.workflowMonitoring.getMetrics(),
      systemHealth: this.workflowMonitoring.getSystemHealth(),
      activeWorkflows: this.workflowOrchestrator.getActiveWorkflows(),
      recentEvents: this.workflowMonitoring.getRecentEvents(50),
      alerts: this.workflowMonitoring.getAlerts()
    };
  }

  /**
   * Get workflow statistics for reporting
   */
  getWorkflowStatistics(): any {
    return {
      orchestrator: this.workflowOrchestrator.getWorkflowStatistics(),
      monitoring: this.workflowMonitoring.getMetrics(),
      systemHealth: this.workflowMonitoring.getSystemHealth()
    };
  }

  /**
   * Export workflow data for analysis
   */
  exportWorkflowData(format: 'json' | 'csv' = 'json'): string {
    return this.workflowMonitoring.exportData(format);
  }

  /**
   * Terminate a session with complete workflow
   * Requirements: 1.4 - Manual session termination with workflow integration
   */
  async terminateSession(sessionId: SessionId, reason?: string): Promise<CleanupResult> {
    try {
      // Clean up print jobs first
      this.printJobService.cleanupSessionPrintJobs(sessionId);

      // Use cleanup orchestrator for comprehensive termination
      const cleanupResult = await this.cleanupOrchestrator.performManualTermination(sessionId, reason);

      // Notify Customer System
      this.webSocketService.sendSessionStatusUpdate(sessionId, SessionStatus.TERMINATED);

      console.log(`Terminated session: ${sessionId}, success: ${cleanupResult.success}`);
      return cleanupResult;

    } catch (error) {
      console.error('Error terminating session:', error);
      throw error;
    }
  }

  /**
   * Execute print job (shopkeeper action)
   * Requirements: 6.4 - Shopkeeper print button execution
   */
  async executePrintJob(sessionId: SessionId, jobId: JobId): Promise<void> {
    try {
      console.log(`Shopkeeper executing print job ${jobId} for session ${sessionId}`);

      const result = await this.printJobService.executePrintJob(sessionId, jobId);

      if (!result.success) {
        throw new Error(result.error || 'Print job execution failed');
      }

      console.log(`Print job ${jobId} executed successfully`);

    } catch (error) {
      console.error('Error executing print job:', error);
      throw error;
    }
  }

  /**
   * Get print job status
   */
  getPrintJobStatus(jobId: JobId): any {
    return this.printJobService.getPrintJobStatus(jobId);
  }

  /**
   * Retry failed print job
   * Requirements: 6.5 - Print failure retry mechanisms
   */
  async retryPrintJob(sessionId: SessionId, jobId: JobId): Promise<void> {
    try {
      console.log(`Retrying print job ${jobId} for session ${sessionId}`);

      const result = await this.printJobService.retryPrintJob(sessionId, jobId);

      if (!result.success) {
        throw new Error(result.error || 'Print job retry failed');
      }

      console.log(`Print job ${jobId} retry initiated successfully`);

    } catch (error) {
      console.error('Error retrying print job:', error);
      throw error;
    }
  }

  /**
   * Cancel print job
   */
  async cancelPrintJob(sessionId: SessionId, jobId: JobId): Promise<void> {
    try {
      const result = await this.printJobService.cancelPrintJob(sessionId, jobId);

      if (!result.success) {
        throw new Error(result.error || 'Print job cancellation failed');
      }

      console.log(`Print job ${jobId} cancelled successfully`);

    } catch (error) {
      console.error('Error cancelling print job:', error);
      throw error;
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): any[] {
    return this.sessionManager.getActiveSessions().map(session => ({
      ...session,
      qrCodeData: this.sessionManager.getSessionQRCode(session.id),
      printJobs: this.printJobService.getSessionPrintJobs(session.id)
    }));
  }

  /**
   * Get printer status and information
   */
  getPrinterStatus(): {
    status: PrinterStatus;
    defaultPrinter: any;
    availablePrinters: any[];
    queueStatus: any;
  } {
    return {
      status: this.printManager.getPrinterStatus(),
      defaultPrinter: this.printManager.getDefaultPrinter(),
      availablePrinters: this.printManager.getAvailablePrinters(),
      queueStatus: this.printManager.getQueueStatus()
    };
  }

  /**
   * Refresh printer status
   */
  async refreshPrinterStatus(): Promise<void> {
    await this.printManager.refreshPrinterStatus();
    
    // Send updated status to Customer System
    const printerStatus = this.getPrinterStatus();
    this.webSocketService.sendPrinterStatusUpdate(printerStatus);
  }

  /**
   * Set default printer
   */
  async setDefaultPrinter(printerName: string): Promise<boolean> {
    const success = await this.printManager.setDefaultPrinter(printerName);
    
    if (success) {
      // Send updated status to Customer System
      const printerStatus = this.getPrinterStatus();
      this.webSocketService.sendPrinterStatusUpdate(printerStatus);
    }

    return success;
  }

  /**
   * Get system status for monitoring with comprehensive error handling status
   * Requirements: 9.1, 9.2, 9.3 - Network, printer, and resource monitoring
   */
  getSystemStatus(): {
    initialized: boolean;
    webSocketConnected: boolean;
    activeSessionCount: number;
    printerStatus: PrinterStatus;
    printQueueStatus: any;
    errorHandlingStatus: {
      isHealthy: boolean;
      activeErrors: number;
      networkStatus: any;
      resourceStatus: any;
      lastIntegrityCheck: any;
    };
  } {
    const errorSystemStatus = this.errorHandler.getSystemStatus();
    const resourceStatus = this.resourceMonitor.getResourceStatus();
    const recoveryStatus = this.systemRecoveryService.getRecoveryStatus();

    return {
      initialized: this.isInitialized,
      webSocketConnected: this.webSocketService.isConnected(),
      activeSessionCount: this.sessionManager.getActiveSessionCount(),
      printerStatus: this.printManager.getPrinterStatus(),
      printQueueStatus: this.printManager.getQueueStatus(),
      errorHandlingStatus: {
        isHealthy: errorSystemStatus.isHealthy,
        activeErrors: errorSystemStatus.activeErrors.length,
        networkStatus: errorSystemStatus.networkStatus,
        resourceStatus: resourceStatus,
        lastIntegrityCheck: recoveryStatus.lastCheck
      }
    };
  }

  /**
   * Get comprehensive system status including cleanup statistics and error handling
   */
  async getDetailedSystemStatus(): Promise<{
    initialized: boolean;
    webSocketConnected: boolean;
    activeSessionCount: number;
    printerStatus: PrinterStatus;
    printQueueStatus: any;
    cleanupStatistics: any;
    systemHealth: any;
    errorHandling: {
      systemStatus: any;
      resourceMetrics: any;
      integrityCheck: any;
      errorHistory: any[];
      networkServiceStatus: any;
    };
  }> {
    const basicStatus = this.getSystemStatus();
    const cleanupStats = await this.cleanupOrchestrator.getCleanupStatistics();
    const systemHealth = await this.cleanupOrchestrator.performSystemCleanupCheck();

    // Get comprehensive error handling status
    const errorSystemStatus = this.errorHandler.getSystemStatus();
    const currentResourceMetrics = this.resourceMonitor.getCurrentMetrics();
    const lastIntegrityCheck = this.systemRecoveryService.getLastIntegrityCheck();
    const errorHistory = this.errorHandler.getErrorHistory();
    const networkServiceStatus = this.networkRetryService.getStatus();

    return {
      ...basicStatus,
      cleanupStatistics: cleanupStats,
      systemHealth,
      errorHandling: {
        systemStatus: errorSystemStatus,
        resourceMetrics: currentResourceMetrics,
        integrityCheck: lastIntegrityCheck,
        errorHistory: errorHistory.slice(-10), // Last 10 errors
        networkServiceStatus
      }
    };
  }

  /**
   * Perform manual cleanup of orphaned sessions
   * Requirements: 7.2 - Crash recovery and orphaned data detection
   */
  async performManualCleanup(): Promise<{
    success: boolean;
    orphanedSessions: any[];
    cleanupResults: CleanupResult[];
    totalRecovered: number;
    errors: string[];
  }> {
    try {
      console.log('Performing manual cleanup of orphaned sessions...');
      const result = await this.cleanupOrchestrator.performCrashRecovery();
      console.log(`Manual cleanup completed: ${result.totalRecovered} sessions recovered`);
      return result;
    } catch (error) {
      console.error('Manual cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup audit events for monitoring
   */
  async getCleanupAuditEvents(limit: number = 50): Promise<any[]> {
    return await this.cleanupOrchestrator.getRecentAuditEvents(limit);
  }

  /**
   * Clear old audit events to free memory
   */
  clearOldAuditEvents(olderThanHours: number = 24): number {
    // Note: AuditLogger handles cleanup automatically during rotation
    // This method is kept for compatibility but doesn't perform direct cleanup
    console.log(`Audit log cleanup requested for events older than ${olderThanHours} hours`);
    return 0;
  }

  /**
   * Start periodic status monitoring with enhanced error detection
   * Requirements: 9.2 - Printer status monitoring and error reporting
   */
  private startStatusMonitoring(): void {
    // Monitor printer status every 30 seconds with error handling
    setInterval(async () => {
      try {
        await this.refreshPrinterStatus();
      } catch (error) {
        await this.errorHandler.handleError(
          ErrorCategory.PRINTER,
          ErrorSeverity.MEDIUM,
          'Printer status monitoring failed',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }, 30000);

    // Monitor WebSocket connection every 10 seconds with retry logic
    setInterval(async () => {
      if (!this.webSocketService.isConnected()) {
        console.warn('WebSocket disconnected, attempting to reconnect...');
        
        try {
          await this.webSocketService.connect();
        } catch (error) {
          await this.errorHandler.handleError(
            ErrorCategory.NETWORK,
            ErrorSeverity.MEDIUM,
            'WebSocket reconnection failed',
            { error: error instanceof Error ? error.message : String(error) }
          );
        }
      }
    }, 10000);

    // Monitor system health every 2 minutes
    setInterval(async () => {
      try {
        const resourceStatus = this.resourceMonitor.getResourceStatus();
        
        if (resourceStatus.isConstrained) {
          await this.errorHandler.handleError(
            ErrorCategory.RESOURCE,
            ErrorSeverity.HIGH,
            'System resource constraints detected during monitoring',
            resourceStatus
          );
        }
      } catch (error) {
        console.error('Error during system health monitoring:', error);
      }
    }, 120000);
  }

  /**
   * Force system integrity check
   * Requirements: 9.5 - System recovery and integrity checks
   */
  async performIntegrityCheck(): Promise<any> {
    try {
      return await this.systemRecoveryService.forceIntegrityCheck();
    } catch (error) {
      await this.errorHandler.handleError(
        ErrorCategory.SYSTEM,
        ErrorSeverity.HIGH,
        'Manual integrity check failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      throw error;
    }
  }

  /**
   * Get current resource metrics
   * Requirements: 9.3 - Resource monitoring
   */
  getCurrentResourceMetrics(): any {
    return this.resourceMonitor.getCurrentMetrics();
  }

  /**
   * Get error handling status and history
   */
  getErrorHandlingStatus(): {
    systemStatus: any;
    errorHistory: any[];
    resourceStatus: any;
    networkStatus: any;
  } {
    return {
      systemStatus: this.errorHandler.getSystemStatus(),
      errorHistory: this.errorHandler.getErrorHistory(),
      resourceStatus: this.resourceMonitor.getResourceStatus(),
      networkStatus: this.networkRetryService.getStatus()
    };
  }

  /**
   * Test network connectivity
   * Requirements: 9.1 - Network error detection
   */
  async testNetworkConnectivity(): Promise<boolean> {
    try {
      return await this.networkRetryService.checkConnectivity();
    } catch (error) {
      await this.errorHandler.handleError(
        ErrorCategory.NETWORK,
        ErrorSeverity.MEDIUM,
        'Network connectivity test failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return false;
    }
  }

  /**
   * Handle system errors and recovery (enhanced version)
   * Requirements: 9.4 - Fail-closed error handling
   */
  async handleSystemError(error: Error, sessionId?: SessionId): Promise<void> {
    console.error('System error occurred:', error);

    // Determine error severity and category
    const severity = this.determineErrorSeverity(error);
    const category = this.determineErrorCategory(error);

    // Handle through the error handler system
    await this.errorHandler.handleError(
      category,
      severity,
      error.message,
      { 
        stack: error.stack,
        sessionId,
        timestamp: new Date().toISOString()
      },
      sessionId
    );

    // Additional handling for session-specific errors
    if (sessionId) {
      try {
        await this.terminateSession(sessionId, 'system_error');
      } catch (terminationError) {
        console.error(`Failed to terminate session ${sessionId} after system error:`, terminationError);
      }
    }
  }

  /**
   * Determines error severity based on error characteristics
   */
  private determineErrorSeverity(error: Error): ErrorSeverity {
    const criticalPatterns = [
      /security/i,
      /authentication/i,
      /authorization/i,
      /corruption/i,
      /integrity/i,
      /memory.*exhausted/i,
      /disk.*full/i,
      /cannot.*allocate/i
    ];

    const highPatterns = [
      /printer.*offline/i,
      /network.*unreachable/i,
      /connection.*refused/i,
      /timeout/i,
      /resource.*unavailable/i
    ];

    const mediumPatterns = [
      /retry/i,
      /temporary/i,
      /warning/i
    ];

    if (criticalPatterns.some(pattern => pattern.test(error.message))) {
      return ErrorSeverity.CRITICAL;
    } else if (highPatterns.some(pattern => pattern.test(error.message))) {
      return ErrorSeverity.HIGH;
    } else if (mediumPatterns.some(pattern => pattern.test(error.message))) {
      return ErrorSeverity.MEDIUM;
    } else {
      return ErrorSeverity.LOW;
    }
  }

  /**
   * Determines error category based on error characteristics
   */
  private determineErrorCategory(error: Error): ErrorCategory {
    if (/network|connection|socket|fetch/i.test(error.message)) {
      return ErrorCategory.NETWORK;
    } else if (/printer|print|spool/i.test(error.message)) {
      return ErrorCategory.PRINTER;
    } else if (/memory|disk|cpu|resource/i.test(error.message)) {
      return ErrorCategory.RESOURCE;
    } else if (/session|workspace|cleanup/i.test(error.message)) {
      return ErrorCategory.SESSION;
    } else if (/file|directory|path|permission/i.test(error.message)) {
      return ErrorCategory.FILE_SYSTEM;
    } else if (/config|setting|parameter/i.test(error.message)) {
      return ErrorCategory.CONFIGURATION;
    } else {
      return ErrorCategory.SYSTEM;
    }
  }

  /**
   * Shutdown the Local Agent and all services including error handling
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('Shutting down Local Agent Orchestrator...');

    try {
      // Terminate all active sessions
      const activeSessions = this.getActiveSessions();
      for (const session of activeSessions) {
        try {
          await this.terminateSession(session.id, 'system_shutdown');
        } catch (error) {
          console.error(`Failed to terminate session ${session.id} during shutdown:`, error);
        }
      }

      // Shutdown services in reverse order
      console.log('Shutting down core services...');
      await this.webSocketService.shutdown();
      await this.printJobService.shutdown();
      await this.printManager.shutdown();
      await this.sessionManager.shutdown();

      // Shutdown workflow services
      console.log('Shutting down workflow services...');
      this.workflowMonitoring.shutdown();

      // Shutdown error handling and monitoring services
      console.log('Shutting down error handling services...');
      await this.systemRecoveryService.shutdown();
      await this.resourceMonitor.shutdown();
      await this.networkRetryService.shutdown();
      await this.errorHandler.shutdown();

      // Final audit log
      await this.auditLogger.logSystemEvent('SYSTEM_SHUTDOWN_COMPLETED', {
        terminatedSessions: activeSessions.length,
        timestamp: new Date().toISOString()
      });

      this.isInitialized = false;
      console.log('Local Agent Orchestrator shutdown complete');

    } catch (error) {
      console.error('Error during shutdown:', error);
      
      // Try to log the shutdown error
      try {
        await this.auditLogger.logSystemEvent('SHUTDOWN_ERROR', {
          error: error instanceof Error ? error.message : String(error)
        });
      } catch (logError) {
        console.error('Failed to log shutdown error:', logError);
      }
      
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }
}