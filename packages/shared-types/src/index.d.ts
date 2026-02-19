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
    DATA_DESTROYED = "data_destroyed"
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
//# sourceMappingURL=index.d.ts.map