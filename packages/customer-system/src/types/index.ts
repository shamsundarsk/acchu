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