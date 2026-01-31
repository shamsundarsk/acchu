import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { SessionId } from '@sps/shared-types';

export interface QRCodeConfig {
  customerSystemBaseUrl: string;
  shopId: string;
}

export interface SessionURL {
  url: string;
  token: string;
  expiresAt: Date;
}

export interface QRCodeData {
  sessionId: SessionId;
  url: string;
  token: string;
  qrCodeDataURL: string;
  expiresAt: Date;
}

/**
 * Service for generating QR codes and session URLs
 * Requirements: 2.1, 2.5 - QR code generation with session URLs and authentication tokens
 */
export class QRCodeService {
  private config: QRCodeConfig;
  private sessionTokens: Map<SessionId, string> = new Map();

  constructor(config: QRCodeConfig) {
    this.config = config;
  }

  /**
   * Generates a session-specific URL with authentication token
   * Requirements: 2.1 - Generate QR code containing session URL
   */
  generateSessionURL(sessionId: SessionId, expiresAt: Date): SessionURL {
    // Generate unique authentication token for this session
    const token = uuidv4();
    
    // Store token for validation
    this.sessionTokens.set(sessionId, token);

    // Construct session URL with authentication parameters
    const url = `${this.config.customerSystemBaseUrl}/session/${sessionId}?token=${token}&shop=${this.config.shopId}`;

    return {
      url,
      token,
      expiresAt
    };
  }

  /**
   * Generates QR code data URL for display
   * Requirements: 2.1 - Generate QR code for session access
   */
  async generateQRCode(sessionId: SessionId, expiresAt: Date): Promise<QRCodeData> {
    const sessionURL = this.generateSessionURL(sessionId, expiresAt);

    try {
      // Generate QR code as data URL for easy display
      const qrCodeDataURL = await QRCode.toDataURL(sessionURL.url, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });

      return {
        sessionId,
        url: sessionURL.url,
        token: sessionURL.token,
        qrCodeDataURL,
        expiresAt
      };
    } catch (error) {
      console.error(`Failed to generate QR code for session ${sessionId}:`, error);
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Validates authentication token for a session
   * Requirements: 2.5 - Session-specific URL validation
   */
  validateSessionToken(sessionId: SessionId, token: string): boolean {
    const storedToken = this.sessionTokens.get(sessionId);
    return storedToken === token;
  }

  /**
   * Regenerates QR code for an existing session
   * Requirements: 2.1 - QR code refresh and regeneration functionality
   */
  async regenerateQRCode(sessionId: SessionId, expiresAt: Date): Promise<QRCodeData> {
    // Remove old token
    this.sessionTokens.delete(sessionId);
    
    // Generate new QR code with new token
    return this.generateQRCode(sessionId, expiresAt);
  }

  /**
   * Invalidates session token (called when session ends)
   * Requirements: 2.5 - QR code becomes invalid when session ends
   */
  invalidateSessionToken(sessionId: SessionId): void {
    this.sessionTokens.delete(sessionId);
    console.log(`Invalidated token for session ${sessionId}`);
  }

  /**
   * Gets the authentication token for a session (for internal use)
   */
  getSessionToken(sessionId: SessionId): string | undefined {
    return this.sessionTokens.get(sessionId);
  }

  /**
   * Checks if a session has a valid token
   */
  hasValidToken(sessionId: SessionId): boolean {
    return this.sessionTokens.has(sessionId);
  }

  /**
   * Clears all session tokens (called on service shutdown)
   */
  clearAllTokens(): void {
    this.sessionTokens.clear();
    console.log('Cleared all session tokens');
  }

  /**
   * Gets count of active tokens (for monitoring)
   */
  getActiveTokenCount(): number {
    return this.sessionTokens.size;
  }

  /**
   * Updates configuration
   */
  updateConfig(config: Partial<QRCodeConfig>): void {
    this.config = { ...this.config, ...config };
  }
}