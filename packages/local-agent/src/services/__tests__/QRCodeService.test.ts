import { describe, it, expect, beforeEach } from 'vitest';
import { QRCodeService, QRCodeConfig } from '../QRCodeService';

describe('QRCodeService', () => {
  let qrCodeService: QRCodeService;
  let config: QRCodeConfig;

  beforeEach(() => {
    config = {
      customerSystemBaseUrl: 'https://test.acchu.com',
      shopId: 'test-shop-123'
    };
    qrCodeService = new QRCodeService(config);
  });

  describe('generateSessionURL', () => {
    it('should generate a valid session URL with token', () => {
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const result = qrCodeService.generateSessionURL(sessionId, expiresAt);

      expect(result.url).toContain(config.customerSystemBaseUrl);
      expect(result.url).toContain(`/session/${sessionId}`);
      expect(result.url).toContain(`token=${result.token}`);
      expect(result.url).toContain(`shop=${config.shopId}`);
      expect(result.token).toBeTruthy();
      expect(result.expiresAt).toEqual(expiresAt);
    });

    it('should generate unique tokens for different sessions', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const result1 = qrCodeService.generateSessionURL(sessionId1, expiresAt);
      const result2 = qrCodeService.generateSessionURL(sessionId2, expiresAt);

      expect(result1.token).not.toEqual(result2.token);
    });
  });

  describe('generateQRCode', () => {
    it('should generate QR code data with valid data URL', async () => {
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const result = await qrCodeService.generateQRCode(sessionId, expiresAt);

      expect(result.sessionId).toBe(sessionId);
      expect(result.url).toContain(sessionId);
      expect(result.token).toBeTruthy();
      expect(result.qrCodeDataURL).toMatch(/^data:image\/png;base64,/);
      expect(result.expiresAt).toEqual(expiresAt);
    });
  });

  describe('validateSessionToken', () => {
    it('should validate correct token for session', () => {
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const sessionURL = qrCodeService.generateSessionURL(sessionId, expiresAt);
      const isValid = qrCodeService.validateSessionToken(sessionId, sessionURL.token);

      expect(isValid).toBe(true);
    });

    it('should reject invalid token for session', () => {
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      qrCodeService.generateSessionURL(sessionId, expiresAt);
      const isValid = qrCodeService.validateSessionToken(sessionId, 'invalid-token');

      expect(isValid).toBe(false);
    });

    it('should reject token for non-existent session', () => {
      const isValid = qrCodeService.validateSessionToken('non-existent', 'any-token');
      expect(isValid).toBe(false);
    });
  });

  describe('regenerateQRCode', () => {
    it('should generate new token when regenerating QR code', async () => {
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const original = await qrCodeService.generateQRCode(sessionId, expiresAt);
      const regenerated = await qrCodeService.regenerateQRCode(sessionId, expiresAt);

      expect(regenerated.token).not.toEqual(original.token);
      expect(regenerated.sessionId).toBe(sessionId);
      
      // Old token should no longer be valid
      expect(qrCodeService.validateSessionToken(sessionId, original.token)).toBe(false);
      // New token should be valid
      expect(qrCodeService.validateSessionToken(sessionId, regenerated.token)).toBe(true);
    });
  });

  describe('invalidateSessionToken', () => {
    it('should invalidate session token', () => {
      const sessionId = 'test-session-123';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const sessionURL = qrCodeService.generateSessionURL(sessionId, expiresAt);
      
      // Token should be valid initially
      expect(qrCodeService.validateSessionToken(sessionId, sessionURL.token)).toBe(true);
      
      // Invalidate token
      qrCodeService.invalidateSessionToken(sessionId);
      
      // Token should no longer be valid
      expect(qrCodeService.validateSessionToken(sessionId, sessionURL.token)).toBe(false);
    });
  });

  describe('clearAllTokens', () => {
    it('should clear all session tokens', () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const url1 = qrCodeService.generateSessionURL(sessionId1, expiresAt);
      const url2 = qrCodeService.generateSessionURL(sessionId2, expiresAt);

      expect(qrCodeService.getActiveTokenCount()).toBe(2);

      qrCodeService.clearAllTokens();

      expect(qrCodeService.getActiveTokenCount()).toBe(0);
      expect(qrCodeService.validateSessionToken(sessionId1, url1.token)).toBe(false);
      expect(qrCodeService.validateSessionToken(sessionId2, url2.token)).toBe(false);
    });
  });
});