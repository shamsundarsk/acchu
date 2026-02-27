// Local type definitions for client-side code

export enum SessionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  COMPLETED = 'completed'
}

export enum JobStatus {
  QUEUED = 'queued',
  PRINTING = 'printing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface FileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  localPath: string;
  pageCount?: number;
}

export interface PrintOptions {
  copies: number;
  isColor: boolean;
  isDuplex: boolean;
  quality: 'draft' | 'standard' | 'high';
  colorMode?: 'color' | 'bw';
  duplex?: boolean;
  paperSize?: 'A4' | 'Letter';
}

export interface PriceBreakdown {
  basePrice: number;
  colorSurcharge?: number;
  duplexDiscount?: number;
  totalPages: number;
  totalAmount: number;
}

export interface PaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
}

export interface UPIRequest {
  vpa: string;
  amount: number;
  note?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SessionInfo {
  session: {
    id: string;
    shopId: string;
    status: SessionStatus;
    createdAt: Date;
    expiresAt: Date;
    files: FileMetadata[];
    paymentStatus: PaymentStatus;
  };
  isValid: boolean;
  timeRemaining: number;
}
