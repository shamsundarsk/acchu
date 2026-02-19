// Import and re-export types from shared-types package
import type {
  SessionId,
  FileId,
  JobId,
  Session,
  FileMetadata,
  FileData,
  ValidationResult,
  PrintOptions,
  PriceBreakdown,
  PrintJob,
  PaymentRequest,
  PrintResult,
  UPIRequest,
  ShopConfiguration,
  AuditEvent,
  ApiResponse,
  SessionInfo,
  UploadResult,
  PriceQuote,
  WebSocketEvent
} from '@sps/shared-types';

// Import enums and classes as values
import { 
  SessionStatus,
  JobStatus,
  PaymentStatus,
  PrinterStatus,
  AuditEventType,
  SessionValidator, 
  SessionSerializer 
} from '@sps/shared-types';

// Local-specific interfaces
export interface SessionManagerConfig {
  shopId: string;
  sessionTimeoutMinutes?: number;
  tempDirectory?: string;
}

// Re-export all imported types
export type {
  SessionId,
  FileId,
  JobId,
  Session,
  FileMetadata,
  FileData,
  ValidationResult,
  PrintOptions,
  PriceBreakdown,
  PrintJob,
  PaymentRequest,
  PrintResult,
  UPIRequest,
  ShopConfiguration,
  AuditEvent,
  ApiResponse,
  SessionInfo,
  UploadResult,
  PriceQuote,
  WebSocketEvent
};

// Re-export enums and classes
export { 
  SessionStatus,
  JobStatus,
  PaymentStatus,
  PrinterStatus,
  AuditEventType,
  SessionValidator, 
  SessionSerializer 
};