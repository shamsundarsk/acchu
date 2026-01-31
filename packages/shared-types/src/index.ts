// Core type definitions
export type SessionId = string;
export type FileId = string;
export type JobId = string;

// Session Management Types
export enum SessionStatus {
  ACTIVE = 'active',
  PRINTING = 'printing',
  COMPLETED = 'completed',
  TERMINATED = 'terminated'
}

export interface Session {
  id: SessionId;
  shopId: string;
  status: SessionStatus;
  createdAt: Date;
  expiresAt: Date;
  files: FileMetadata[];
  printJob?: PrintJob;
  paymentStatus: PaymentStatus;
}

// File Management Types
export interface FileMetadata {
  id: FileId;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  localPath: string;
  pageCount?: number;
}

export interface FileData {
  buffer: Buffer;
  metadata: FileMetadata;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Print Job Types
export enum JobStatus {
  QUEUED = 'queued',
  PRINTING = 'printing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface PrintOptions {
  copies: number;
  colorMode: 'color' | 'bw';
  duplex: boolean;
  paperSize: 'A4' | 'Letter';
}

export interface PriceBreakdown {
  totalPages: number;
  colorPages: number;
  bwPages: number;
  basePrice: number;
  totalPrice: number;
}

export interface PrintJob {
  id: JobId;
  sessionId: SessionId;
  files: FileId[];
  options: PrintOptions;
  pricing: PriceBreakdown;
  status: JobStatus;
  createdAt: Date;
  executedAt?: Date;
}

// Payment Types
export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface PaymentRequest {
  sessionId: SessionId;
  amount: number;
  upiId: string;
  transactionId: string;
  status: PaymentStatus;
  createdAt: Date;
  completedAt?: Date;
}

export interface UPIRequest {
  qrCode: string;
  paymentUrl: string;
  amount: number;
  transactionId: string;
}

// Configuration Types
export interface ShopConfiguration {
  shopId: string;
  pricing: {
    colorPerPage: number;
    bwPerPage: number;
    duplexDiscount: number;
  };
  limits: {
    maxFileSize: number;
    maxFilesPerSession: number;
    sessionTimeout: number;
  };
  printer: {
    defaultPrinter: string;
    supportedFormats: string[];
  };
}

// Audit Logging Types
export enum AuditEventType {
  SESSION_CREATED = 'session_created',
  FILE_UPLOADED = 'file_uploaded',
  PAYMENT_COMPLETED = 'payment_completed',
  PRINT_EXECUTED = 'print_executed',
  SESSION_TERMINATED = 'session_terminated',
  DATA_DESTROYED = 'data_destroyed',
  // Configuration events
  CONFIGURATION_INITIALIZED = 'configuration_initialized',
  CONFIGURATION_UPDATED = 'configuration_updated',
  CONFIGURATION_DEFAULTS_APPLIED = 'configuration_defaults_applied',
  CONFIGURATION_RESET_TO_DEFAULTS = 'configuration_reset_to_defaults',
  // Error handling events
  ERROR_OCCURRED = 'error_occurred',
  ERROR_RESOLVED = 'error_resolved',
  FAIL_CLOSED_TRIGGERED = 'fail_closed_triggered',
  FAIL_CLOSED_FAILED = 'fail_closed_failed',
  FAIL_CLOSED_EXECUTED = 'fail_closed_executed',
  // System events
  SYSTEM_INITIALIZED = 'system_initialized',
  SYSTEM_SHUTDOWN_COMPLETED = 'system_shutdown_completed',
  SHUTDOWN_ERROR = 'shutdown_error',
  INTEGRITY_CHECK_COMPLETED = 'integrity_check_completed',
  INITIALIZATION_INTEGRITY_ISSUES = 'initialization_integrity_issues',
  CRITICAL_ERROR_RESPONSE = 'critical_error_response',
  CRITICAL_ERROR_HANDLING_FAILED = 'critical_error_handling_failed',
  HEALTH_CHECK = 'health_check',
  SYSTEM_RECOVERY_COMPLETED = 'system_recovery_completed',
  // Workflow events
  WORKFLOW_COMPLETED = 'workflow_completed',
  WORKFLOW_FAILED = 'workflow_failed',
  WORKFLOW_CANCELLED = 'workflow_cancelled',
  WORKFLOW_ERROR_HANDLED = 'workflow_error_handled',
  SESSION_CLEANUP_WORKFLOW_COMPLETED = 'session_cleanup_workflow_completed',
  CLEANUP_WORKFLOW_FAILED = 'cleanup_workflow_failed',
  ERROR_RECOVERY_WORKFLOW_COMPLETED = 'error_recovery_workflow_completed',
  ERROR_RECOVERY_WORKFLOW_FAILED = 'error_recovery_workflow_failed',
  // Monitoring events
  WORKFLOW_MONITORING_STARTED = 'workflow_monitoring_started',
  WORKFLOW_MONITORING_COMPLETED = 'workflow_monitoring_completed',
  WORKFLOW_MONITORING_FAILED = 'workflow_monitoring_failed',
  WORKFLOW_MONITORING_SHUTDOWN = 'workflow_monitoring_shutdown',
  PERFORMANCE_ALERT_CREATED = 'performance_alert_created'
}

export interface AuditEvent {
  id: string;
  sessionId: SessionId;
  eventType: AuditEventType;
  timestamp: Date;
  metadata: Record<string, any>;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SessionInfo {
  session: Session;
  isValid: boolean;
  timeRemaining: number;
}

export interface UploadResult {
  fileId: FileId;
  metadata: FileMetadata;
}

export interface PriceQuote {
  pricing: PriceBreakdown;
  paymentRequest: PaymentRequest;
}

export interface PrintResult {
  success: boolean;
  jobId?: JobId;
  error?: string;
}

// Printer Status Types
export enum PrinterStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
  BUSY = 'busy'
}

// WebSocket Event Types
export interface WebSocketEvent {
  type: string;
  sessionId: SessionId;
  data: any;
  timestamp: Date;
}

// Session Validation and Serialization
export class SessionValidator {
  static validateSession(session: Partial<Session>): ValidationResult {
    const errors: string[] = [];

    if (!session.id || typeof session.id !== 'string') {
      errors.push('Session ID is required and must be a string');
    }

    if (!session.shopId || typeof session.shopId !== 'string') {
      errors.push('Shop ID is required and must be a string');
    }

    if (!session.status || !Object.values(SessionStatus).includes(session.status as SessionStatus)) {
      errors.push('Valid session status is required');
    }

    if (!session.createdAt || !(session.createdAt instanceof Date)) {
      errors.push('Created date is required and must be a Date');
    }

    if (!session.expiresAt || !(session.expiresAt instanceof Date)) {
      errors.push('Expiration date is required and must be a Date');
    }

    if (session.createdAt && session.expiresAt && session.expiresAt <= session.createdAt) {
      errors.push('Expiration date must be after creation date');
    }

    if (!session.paymentStatus || !Object.values(PaymentStatus).includes(session.paymentStatus as PaymentStatus)) {
      errors.push('Valid payment status is required');
    }

    if (!Array.isArray(session.files)) {
      errors.push('Files must be an array');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateFileMetadata(file: Partial<FileMetadata>): ValidationResult {
    const errors: string[] = [];

    if (!file.id || typeof file.id !== 'string') {
      errors.push('File ID is required and must be a string');
    }

    if (!file.originalName || typeof file.originalName !== 'string') {
      errors.push('Original file name is required and must be a string');
    }

    if (!file.mimeType || typeof file.mimeType !== 'string') {
      errors.push('MIME type is required and must be a string');
    }

    if (typeof file.size !== 'number' || file.size <= 0) {
      errors.push('File size must be a positive number');
    }

    if (!file.uploadedAt || !(file.uploadedAt instanceof Date)) {
      errors.push('Upload date is required and must be a Date');
    }

    if (!file.localPath || typeof file.localPath !== 'string') {
      errors.push('Local path is required and must be a string');
    }

    // Validate supported file formats
    const supportedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];

    if (file.mimeType && !supportedMimeTypes.includes(file.mimeType)) {
      errors.push('Unsupported file format');
    }

    // Validate file size limit (100MB)
    const maxFileSize = 100 * 1024 * 1024; // 100MB in bytes
    if (typeof file.size === 'number' && file.size > maxFileSize) {
      errors.push('File size exceeds 100MB limit');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validatePrintJob(printJob: Partial<PrintJob>): ValidationResult {
    const errors: string[] = [];

    if (!printJob.id || typeof printJob.id !== 'string') {
      errors.push('Print job ID is required and must be a string');
    }

    if (!printJob.sessionId || typeof printJob.sessionId !== 'string') {
      errors.push('Session ID is required and must be a string');
    }

    if (!Array.isArray(printJob.files) || printJob.files.length === 0) {
      errors.push('Files array is required and must not be empty');
    }

    if (!printJob.options) {
      errors.push('Print options are required');
    } else {
      const optionsValidation = SessionValidator.validatePrintOptions(printJob.options);
      if (!optionsValidation.isValid) {
        errors.push(...optionsValidation.errors);
      }
    }

    if (!printJob.status || !Object.values(JobStatus).includes(printJob.status as JobStatus)) {
      errors.push('Valid job status is required');
    }

    if (!printJob.createdAt || !(printJob.createdAt instanceof Date)) {
      errors.push('Created date is required and must be a Date');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validatePrintOptions(options: Partial<PrintOptions>): ValidationResult {
    const errors: string[] = [];

    if (typeof options.copies !== 'number' || options.copies < 1 || options.copies > 10) {
      errors.push('Copies must be a number between 1 and 10');
    }

    if (!options.colorMode || !['color', 'bw'].includes(options.colorMode)) {
      errors.push('Color mode must be either "color" or "bw"');
    }

    if (typeof options.duplex !== 'boolean') {
      errors.push('Duplex must be a boolean value');
    }

    if (!options.paperSize || !['A4', 'Letter'].includes(options.paperSize)) {
      errors.push('Paper size must be either "A4" or "Letter"');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validatePaymentRequest(payment: Partial<PaymentRequest>): ValidationResult {
    const errors: string[] = [];

    if (!payment.sessionId || typeof payment.sessionId !== 'string') {
      errors.push('Session ID is required and must be a string');
    }

    if (typeof payment.amount !== 'number' || payment.amount <= 0) {
      errors.push('Amount must be a positive number');
    }

    if (!payment.upiId || typeof payment.upiId !== 'string') {
      errors.push('UPI ID is required and must be a string');
    }

    if (!payment.transactionId || typeof payment.transactionId !== 'string') {
      errors.push('Transaction ID is required and must be a string');
    }

    if (!payment.status || !Object.values(PaymentStatus).includes(payment.status as PaymentStatus)) {
      errors.push('Valid payment status is required');
    }

    if (!payment.createdAt || !(payment.createdAt instanceof Date)) {
      errors.push('Created date is required and must be a Date');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export class SessionSerializer {
  static serializeSession(session: Session): string {
    const serializable = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      files: session.files.map(file => ({
        ...file,
        uploadedAt: file.uploadedAt.toISOString()
      })),
      printJob: session.printJob ? {
        ...session.printJob,
        createdAt: session.printJob.createdAt.toISOString(),
        executedAt: session.printJob.executedAt?.toISOString()
      } : undefined
    };

    return JSON.stringify(serializable);
  }

  static deserializeSession(data: string): Session {
    const parsed = JSON.parse(data);
    
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      expiresAt: new Date(parsed.expiresAt),
      files: parsed.files.map((file: any) => ({
        ...file,
        uploadedAt: new Date(file.uploadedAt)
      })),
      printJob: parsed.printJob ? {
        ...parsed.printJob,
        createdAt: new Date(parsed.printJob.createdAt),
        executedAt: parsed.printJob.executedAt ? new Date(parsed.printJob.executedAt) : undefined
      } : undefined
    };
  }

  static serializeFileMetadata(file: FileMetadata): string {
    const serializable = {
      ...file,
      uploadedAt: file.uploadedAt.toISOString()
    };

    return JSON.stringify(serializable);
  }

  static deserializeFileMetadata(data: string): FileMetadata {
    const parsed = JSON.parse(data);
    
    return {
      ...parsed,
      uploadedAt: new Date(parsed.uploadedAt)
    };
  }

  static serializePrintJob(printJob: PrintJob): string {
    const serializable = {
      ...printJob,
      createdAt: printJob.createdAt.toISOString(),
      executedAt: printJob.executedAt?.toISOString()
    };

    return JSON.stringify(serializable);
  }

  static deserializePrintJob(data: string): PrintJob {
    const parsed = JSON.parse(data);
    
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      executedAt: parsed.executedAt ? new Date(parsed.executedAt) : undefined
    };
  }

  static serializePaymentRequest(payment: PaymentRequest): string {
    const serializable = {
      ...payment,
      createdAt: payment.createdAt.toISOString(),
      completedAt: payment.completedAt?.toISOString()
    };

    return JSON.stringify(serializable);
  }

  static deserializePaymentRequest(data: string): PaymentRequest {
    const parsed = JSON.parse(data);
    
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined
    };
  }
}