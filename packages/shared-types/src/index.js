"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionSerializer = exports.SessionValidator = exports.PrinterStatus = exports.AuditEventType = exports.PaymentStatus = exports.JobStatus = exports.SessionStatus = void 0;
// Session Management Types
var SessionStatus;
(function (SessionStatus) {
    SessionStatus["ACTIVE"] = "active";
    SessionStatus["PRINTING"] = "printing";
    SessionStatus["COMPLETED"] = "completed";
    SessionStatus["TERMINATED"] = "terminated";
})(SessionStatus || (exports.SessionStatus = SessionStatus = {}));
// Print Job Types
var JobStatus;
(function (JobStatus) {
    JobStatus["QUEUED"] = "queued";
    JobStatus["PRINTING"] = "printing";
    JobStatus["COMPLETED"] = "completed";
    JobStatus["FAILED"] = "failed";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
// Payment Types
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["COMPLETED"] = "completed";
    PaymentStatus["FAILED"] = "failed";
    PaymentStatus["CANCELLED"] = "cancelled";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
// Audit Logging Types
var AuditEventType;
(function (AuditEventType) {
    AuditEventType["SESSION_CREATED"] = "session_created";
    AuditEventType["FILE_UPLOADED"] = "file_uploaded";
    AuditEventType["PAYMENT_COMPLETED"] = "payment_completed";
    AuditEventType["PRINT_EXECUTED"] = "print_executed";
    AuditEventType["SESSION_TERMINATED"] = "session_terminated";
    AuditEventType["DATA_DESTROYED"] = "data_destroyed";
})(AuditEventType || (exports.AuditEventType = AuditEventType = {}));
// Printer Status Types
var PrinterStatus;
(function (PrinterStatus) {
    PrinterStatus["ONLINE"] = "online";
    PrinterStatus["OFFLINE"] = "offline";
    PrinterStatus["ERROR"] = "error";
    PrinterStatus["BUSY"] = "busy";
})(PrinterStatus || (exports.PrinterStatus = PrinterStatus = {}));
// Session Validation and Serialization
class SessionValidator {
    static validateSession(session) {
        const errors = [];
        if (!session.id || typeof session.id !== 'string') {
            errors.push('Session ID is required and must be a string');
        }
        if (!session.shopId || typeof session.shopId !== 'string') {
            errors.push('Shop ID is required and must be a string');
        }
        if (!session.status || !Object.values(SessionStatus).includes(session.status)) {
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
        if (!session.paymentStatus || !Object.values(PaymentStatus).includes(session.paymentStatus)) {
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
    static validateFileMetadata(file) {
        const errors = [];
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
        // Validate file size limit (10MB)
        const maxFileSize = 10 * 1024 * 1024; // 10MB in bytes
        if (typeof file.size === 'number' && file.size > maxFileSize) {
            errors.push('File size exceeds 10MB limit');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    static validatePrintJob(printJob) {
        const errors = [];
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
        }
        else {
            const optionsValidation = SessionValidator.validatePrintOptions(printJob.options);
            if (!optionsValidation.isValid) {
                errors.push(...optionsValidation.errors);
            }
        }
        if (!printJob.status || !Object.values(JobStatus).includes(printJob.status)) {
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
    static validatePrintOptions(options) {
        const errors = [];
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
    static validatePaymentRequest(payment) {
        const errors = [];
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
        if (!payment.status || !Object.values(PaymentStatus).includes(payment.status)) {
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
exports.SessionValidator = SessionValidator;
class SessionSerializer {
    static serializeSession(session) {
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
    static deserializeSession(data) {
        const parsed = JSON.parse(data);
        return {
            ...parsed,
            createdAt: new Date(parsed.createdAt),
            expiresAt: new Date(parsed.expiresAt),
            files: parsed.files.map((file) => ({
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
    static serializeFileMetadata(file) {
        const serializable = {
            ...file,
            uploadedAt: file.uploadedAt.toISOString()
        };
        return JSON.stringify(serializable);
    }
    static deserializeFileMetadata(data) {
        const parsed = JSON.parse(data);
        return {
            ...parsed,
            uploadedAt: new Date(parsed.uploadedAt)
        };
    }
    static serializePrintJob(printJob) {
        const serializable = {
            ...printJob,
            createdAt: printJob.createdAt.toISOString(),
            executedAt: printJob.executedAt?.toISOString()
        };
        return JSON.stringify(serializable);
    }
    static deserializePrintJob(data) {
        const parsed = JSON.parse(data);
        return {
            ...parsed,
            createdAt: new Date(parsed.createdAt),
            executedAt: parsed.executedAt ? new Date(parsed.executedAt) : undefined
        };
    }
    static serializePaymentRequest(payment) {
        const serializable = {
            ...payment,
            createdAt: payment.createdAt.toISOString(),
            completedAt: payment.completedAt?.toISOString()
        };
        return JSON.stringify(serializable);
    }
    static deserializePaymentRequest(data) {
        const parsed = JSON.parse(data);
        return {
            ...parsed,
            createdAt: new Date(parsed.createdAt),
            completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined
        };
    }
}
exports.SessionSerializer = SessionSerializer;
//# sourceMappingURL=index.js.map