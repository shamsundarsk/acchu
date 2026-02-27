export type SessionId = string;
export type FileId = string;
export type JobId = string;
export declare enum SessionStatus {
    ACTIVE = "active",
    PRINTING = "printing",
    COMPLETED = "completed",
    TERMINATED = "terminated"
}
export interface Session {
    id: SessionId;
    shopId: string;
    status: SessionStatus;
    createdAt: Date;
    expiresAt: Date;
    files: FileMetadata[];
    printJob?: PrintJob;
    printJobs?: PrintJob[];
    paymentStatus: PaymentStatus;
}
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
export declare enum JobStatus {
    QUEUED = "queued",
    PRINTING = "printing",
    COMPLETED = "completed",
    FAILED = "failed"
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
export declare enum PaymentStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
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
export declare enum AuditEventType {
    SESSION_CREATED = "session_created",
    FILE_UPLOADED = "file_uploaded",
    PAYMENT_COMPLETED = "payment_completed",
    PRINT_EXECUTED = "print_executed",
    SESSION_TERMINATED = "session_terminated",
    DATA_DESTROYED = "data_destroyed",
    CONFIGURATION_INITIALIZED = "configuration_initialized",
    CONFIGURATION_UPDATED = "configuration_updated",
    CONFIGURATION_DEFAULTS_APPLIED = "configuration_defaults_applied",
    CONFIGURATION_RESET_TO_DEFAULTS = "configuration_reset_to_defaults",
    ERROR_OCCURRED = "error_occurred",
    ERROR_RESOLVED = "error_resolved",
    FAIL_CLOSED_TRIGGERED = "fail_closed_triggered",
    FAIL_CLOSED_FAILED = "fail_closed_failed",
    FAIL_CLOSED_EXECUTED = "fail_closed_executed",
    SYSTEM_INITIALIZED = "system_initialized",
    SYSTEM_SHUTDOWN_COMPLETED = "system_shutdown_completed",
    SHUTDOWN_ERROR = "shutdown_error",
    INTEGRITY_CHECK_COMPLETED = "integrity_check_completed",
    INITIALIZATION_INTEGRITY_ISSUES = "initialization_integrity_issues",
    CRITICAL_ERROR_RESPONSE = "critical_error_response",
    CRITICAL_ERROR_HANDLING_FAILED = "critical_error_handling_failed",
    HEALTH_CHECK = "health_check",
    SYSTEM_RECOVERY_COMPLETED = "system_recovery_completed",
    WORKFLOW_COMPLETED = "workflow_completed",
    WORKFLOW_FAILED = "workflow_failed",
    WORKFLOW_CANCELLED = "workflow_cancelled",
    WORKFLOW_ERROR_HANDLED = "workflow_error_handled",
    SESSION_CLEANUP_WORKFLOW_COMPLETED = "session_cleanup_workflow_completed",
    CLEANUP_WORKFLOW_FAILED = "cleanup_workflow_failed",
    ERROR_RECOVERY_WORKFLOW_COMPLETED = "error_recovery_workflow_completed",
    ERROR_RECOVERY_WORKFLOW_FAILED = "error_recovery_workflow_failed",
    WORKFLOW_MONITORING_STARTED = "workflow_monitoring_started",
    WORKFLOW_MONITORING_COMPLETED = "workflow_monitoring_completed",
    WORKFLOW_MONITORING_FAILED = "workflow_monitoring_failed",
    WORKFLOW_MONITORING_SHUTDOWN = "workflow_monitoring_shutdown",
    PERFORMANCE_ALERT_CREATED = "performance_alert_created"
}
export interface AuditEvent {
    id: string;
    sessionId: SessionId;
    eventType: AuditEventType;
    timestamp: Date;
    metadata: Record<string, any>;
}
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
export declare enum PrinterStatus {
    ONLINE = "online",
    OFFLINE = "offline",
    ERROR = "error",
    BUSY = "busy"
}
export interface WebSocketEvent {
    type: string;
    sessionId: SessionId;
    data: any;
    timestamp: Date;
}
export declare class SessionValidator {
    static validateSession(session: Partial<Session>): ValidationResult;
    static validateFileMetadata(file: Partial<FileMetadata>): ValidationResult;
    static validatePrintJob(printJob: Partial<PrintJob>): ValidationResult;
    static validatePrintOptions(options: Partial<PrintOptions>): ValidationResult;
    static validatePaymentRequest(payment: Partial<PaymentRequest>): ValidationResult;
}
export declare class SessionSerializer {
    static serializeSession(session: Session): string;
    static deserializeSession(data: string): Session;
    static serializeFileMetadata(file: FileMetadata): string;
    static deserializeFileMetadata(data: string): FileMetadata;
    static serializePrintJob(printJob: PrintJob): string;
    static deserializePrintJob(data: string): PrintJob;
    static serializePaymentRequest(payment: PaymentRequest): string;
    static deserializePaymentRequest(data: string): PaymentRequest;
}
//# sourceMappingURL=shared-types.d.ts.map