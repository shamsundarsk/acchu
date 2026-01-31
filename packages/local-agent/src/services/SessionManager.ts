import { v4 as uuidv4 } from 'uuid';
import { 
  Session, 
  SessionId, 
  SessionStatus, 
  PaymentStatus,
  SessionValidator,
  SessionSerializer,
  ValidationResult,
  AuditEventType
} from '@sps/shared-types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { QRCodeService, QRCodeConfig, QRCodeData } from './QRCodeService';
import { AuditLogger } from './AuditLogger';

export interface SessionManagerConfig {
  shopId: string;
  sessionTimeoutMinutes?: number;
  tempDirectory?: string;
  qrCodeConfig?: QRCodeConfig;
  auditLogger?: AuditLogger;
}

export class SessionManager {
  private sessions: Map<SessionId, Session> = new Map();
  private sessionTimeouts: Map<SessionId, NodeJS.Timeout> = new Map();
  private sessionQRCodes: Map<SessionId, QRCodeData> = new Map();
  private readonly sessionTimeout: number;
  private readonly tempDir: string;
  private readonly shopId: string;
  private readonly qrCodeService: QRCodeService;
  private readonly auditLogger?: AuditLogger;

  constructor(config: SessionManagerConfig) {
    this.shopId = config.shopId;
    this.sessionTimeout = (config.sessionTimeoutMinutes || 30) * 60 * 1000; // Convert to milliseconds
    this.tempDir = config.tempDirectory || path.join(os.tmpdir(), 'acchu-sessions');
    this.auditLogger = config.auditLogger;
    
    // Initialize QR code service
    const qrConfig: QRCodeConfig = config.qrCodeConfig || {
      customerSystemBaseUrl: 'https://customer.acchu.com',
      shopId: this.shopId
    };
    this.qrCodeService = new QRCodeService(qrConfig);
    
    this.ensureTempDirectory();
    this.cleanupOrphanedSessions();
  }

  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
      throw new Error('Failed to initialize session storage');
    }
  }

  /**
   * Creates a new session with unique identifier and isolated workspace
   * Requirements: 1.1 - Generate unique session identifier and create isolated workspace
   */
  async createSession(): Promise<SessionId> {
    const sessionId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTimeout);

    const session: Session = {
      id: sessionId,
      shopId: this.shopId,
      status: SessionStatus.ACTIVE,
      createdAt: now,
      expiresAt,
      files: [],
      paymentStatus: PaymentStatus.PENDING,
    };

    // Validate session before storing
    const validation = SessionValidator.validateSession(session);
    if (!validation.isValid) {
      throw new Error(`Invalid session data: ${validation.errors.join(', ')}`);
    }

    this.sessions.set(sessionId, session);

    // Create session workspace directory structure
    await this.createSessionWorkspace(sessionId);

    // Persist session metadata
    await this.persistSessionMetadata(session);

    // Generate QR code for session access
    const qrCodeData = await this.qrCodeService.generateQRCode(sessionId, expiresAt);
    this.sessionQRCodes.set(sessionId, qrCodeData);

    // Set up automatic cleanup timer
    this.scheduleSessionCleanup(sessionId);

    // Log session creation
    if (this.auditLogger) {
      await this.auditLogger.logSessionEvent(sessionId, AuditEventType.SESSION_CREATED, {
        shopId: this.shopId,
        expiresAt: expiresAt.toISOString(),
        sessionTimeout: this.sessionTimeout
      });
    }

    console.log(`Created session ${sessionId} for shop ${this.shopId}, expires at ${expiresAt.toISOString()}`);
    return sessionId;
  }

  /**
   * Creates isolated workspace directory for session
   * Requirements: 1.1 - Create isolated workspace
   */
  private async createSessionWorkspace(sessionId: SessionId): Promise<void> {
    const sessionDir = this.getSessionDirectory(sessionId);
    const filesDir = path.join(sessionDir, 'files');
    
    try {
      await fs.mkdir(sessionDir, { recursive: true });
      await fs.mkdir(filesDir, { recursive: true });
      
      // Create metadata file placeholder
      const metadataPath = path.join(sessionDir, 'metadata.json');
      await fs.writeFile(metadataPath, '{}', 'utf8');
      
    } catch (error) {
      console.error(`Failed to create workspace for session ${sessionId}:`, error);
      throw new Error('Failed to create session workspace');
    }
  }

  /**
   * Gets session status and information
   * Requirements: 1.2 - Display session status
   */
  getSessionStatus(sessionId: SessionId): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Check if session has expired
    if (this.isSessionExpired(session)) {
      this.terminateSession(sessionId);
      return null;
    }

    return { ...session }; // Return copy to prevent external modification
  }

  /**
   * Updates session status
   * Requirements: 1.1 - Session status tracking and updates
   */
  async updateSessionStatus(sessionId: SessionId, status: SessionStatus): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (this.isSessionExpired(session)) {
      this.terminateSession(sessionId);
      return false;
    }

    session.status = status;
    await this.persistSessionMetadata(session);
    
    console.log(`Updated session ${sessionId} status to ${status}`);
    return true;
  }

  /**
   * Checks if session has expired
   * Requirements: 1.3 - Session expiration handling
   */
  private isSessionExpired(session: Session): boolean {
    return new Date() > session.expiresAt;
  }

  /**
   * Schedules automatic session cleanup
   * Requirements: 1.3 - Session timeout handling
   */
  private scheduleSessionCleanup(sessionId: SessionId): void {
    // Clear any existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule new timeout
    const timeout = setTimeout(() => {
      console.log(`Session ${sessionId} timed out, initiating cleanup`);
      this.terminateSession(sessionId);
    }, this.sessionTimeout);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  /**
   * Manually terminates a session and destroys all data
   * Requirements: 1.4 - Manual session termination with immediate data destruction
   */
  async terminateSession(sessionId: SessionId): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    console.log(`Terminating session ${sessionId}`);

    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    // Update session status
    session.status = SessionStatus.TERMINATED;

    // Perform secure cleanup of session data
    await this.secureCleanupSession(sessionId);

    // Invalidate QR code token and remove QR code data
    this.qrCodeService.invalidateSessionToken(sessionId);
    this.sessionQRCodes.delete(sessionId);

    // Remove from memory
    this.sessions.delete(sessionId);

    console.log(`Session ${sessionId} terminated and cleaned up`);
  }

  /**
   * Performs secure cleanup of session files and metadata
   * Requirements: 1.4 - Destroy all associated files and metadata
   */
  private async secureCleanupSession(sessionId: SessionId): Promise<void> {
    const sessionDir = this.getSessionDirectory(sessionId);
    
    try {
      // Check if directory exists
      await fs.access(sessionDir);
      
      // Recursively remove all files and directories
      await fs.rm(sessionDir, { recursive: true, force: true });
      
      console.log(`Securely cleaned up session directory: ${sessionDir}`);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        console.error(`Failed to clean up session directory ${sessionId}:`, error);
        throw new Error(`Failed to clean up session ${sessionId}`);
      }
    }
  }

  /**
   * Cleans up orphaned session data from previous runs
   * Requirements: 1.5 - Invalidate sessions on restart and cleanup orphaned data
   */
  async cleanupOrphanedSessions(): Promise<void> {
    try {
      console.log('Scanning for orphaned session data...');
      
      // Check if temp directory exists
      try {
        await fs.access(this.tempDir);
      } catch {
        // Directory doesn't exist, nothing to clean up
        return;
      }

      const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
      let cleanedCount = 0;
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionId = entry.name;
          
          // All sessions are considered orphaned on startup since we don't persist active sessions
          const sessionDir = path.join(this.tempDir, sessionId);
          try {
            await fs.rm(sessionDir, { recursive: true, force: true });
            cleanedCount++;
            console.log(`Cleaned up orphaned session: ${sessionId}`);
          } catch (error) {
            console.error(`Failed to clean up orphaned session ${sessionId}:`, error);
          }
        }
      }
      
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} orphaned sessions`);
      } else {
        console.log('No orphaned sessions found');
      }
    } catch (error) {
      console.error('Failed to cleanup orphaned sessions:', error);
    }
  }

  /**
   * Gets the directory path for a session
   */
  getSessionDirectory(sessionId: SessionId): string {
    return path.join(this.tempDir, sessionId);
  }

  /**
   * Gets the files directory path for a session
   */
  getSessionFilesDirectory(sessionId: SessionId): string {
    return path.join(this.getSessionDirectory(sessionId), 'files');
  }

  /**
   * Persists session metadata to disk
   */
  private async persistSessionMetadata(session: Session): Promise<void> {
    const sessionDir = this.getSessionDirectory(session.id);
    const metadataPath = path.join(sessionDir, 'metadata.json');
    
    try {
      const serializedSession = SessionSerializer.serializeSession(session);
      await fs.writeFile(metadataPath, serializedSession, 'utf8');
    } catch (error) {
      console.error(`Failed to persist session metadata for ${session.id}:`, error);
    }
  }

  /**
   * Gets all active sessions (for monitoring/debugging)
   */
  getActiveSessions(): Session[] {
    const activeSessions: Session[] = [];
    
    for (const session of this.sessions.values()) {
      if (!this.isSessionExpired(session)) {
        activeSessions.push({ ...session });
      }
    }
    
    return activeSessions;
  }

  /**
   * Gets session count for monitoring
   */
  getActiveSessionCount(): number {
    return this.getActiveSessions().length;
  }

  /**
   * Validates if a session exists and is active
   */
  isSessionValid(sessionId: SessionId): boolean {
    const session = this.getSessionStatus(sessionId);
    return session !== null && session.status === SessionStatus.ACTIVE;
  }

  /**
   * Extends session expiration time (resets timeout)
   */
  async extendSession(sessionId: SessionId): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session)) {
      return false;
    }

    // Extend expiration time
    session.expiresAt = new Date(Date.now() + this.sessionTimeout);
    
    // Reschedule cleanup
    this.scheduleSessionCleanup(sessionId);
    
    // Persist updated metadata
    await this.persistSessionMetadata(session);
    
    console.log(`Extended session ${sessionId} until ${session.expiresAt.toISOString()}`);
    return true;
  }

  /**
   * Gets QR code data for a session
   * Requirements: 2.1 - QR code display for session access
   */
  getSessionQRCode(sessionId: SessionId): QRCodeData | null {
    const session = this.getSessionStatus(sessionId);
    if (!session) {
      return null;
    }

    return this.sessionQRCodes.get(sessionId) || null;
  }

  /**
   * Regenerates QR code for a session
   * Requirements: 2.1 - QR code refresh and regeneration functionality
   */
  async regenerateSessionQRCode(sessionId: SessionId): Promise<QRCodeData | null> {
    const session = this.getSessionStatus(sessionId);
    if (!session) {
      return null;
    }

    try {
      const qrCodeData = await this.qrCodeService.regenerateQRCode(sessionId, session.expiresAt);
      this.sessionQRCodes.set(sessionId, qrCodeData);
      
      console.log(`Regenerated QR code for session ${sessionId}`);
      return qrCodeData;
    } catch (error) {
      console.error(`Failed to regenerate QR code for session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Validates session access token
   * Requirements: 2.5 - Session-specific URL validation
   */
  validateSessionAccess(sessionId: SessionId, token: string): boolean {
    const session = this.getSessionStatus(sessionId);
    if (!session) {
      return false;
    }

    return this.qrCodeService.validateSessionToken(sessionId, token);
  }

  /**
   * Gets session URL for external access
   * Requirements: 2.1 - Session URL generation
   */
  getSessionURL(sessionId: SessionId): string | null {
    const qrCodeData = this.sessionQRCodes.get(sessionId);
    return qrCodeData?.url || null;
  }
  async shutdown(): Promise<void> {
    console.log('Shutting down SessionManager...');
    
    // Clear all timeouts
    for (const timeout of this.sessionTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.sessionTimeouts.clear();

    // Clear QR code service tokens
    this.qrCodeService.clearAllTokens();
    this.sessionQRCodes.clear();

    // Terminate all active sessions
    const activeSessionIds = Array.from(this.sessions.keys());
    for (const sessionId of activeSessionIds) {
      await this.terminateSession(sessionId);
    }

    console.log('SessionManager shutdown complete');
  }
}