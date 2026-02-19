import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../ConfigurationManager';
import { AuditLogger } from '../AuditLogger';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock electron-store
vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private data: any = {};
      
      constructor(options: any) {
        this.data = { ...options.defaults };
      }
      
      get store() {
        return this.data;
      }
      
      set store(value: any) {
        this.data = value;
      }
      
      set(key: string, value: any) {
        this.data[key] = value;
      }
      
      get(key: string) {
        return this.data[key];
      }
      
      clear() {
        this.data = {};
      }
      
      get path() {
        return '/mock/config/path.json';
      }
    }
  };
});

// Mock child_process
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: mockExec
}));

// Mock util
vi.mock('util', () => ({
  promisify: (fn: any) => {
    if (fn === mockExec) {
      return vi.fn().mockResolvedValue({ stdout: '[]', stderr: '' });
    }
    return fn;
  }
}));

describe('ConfigurationManager', () => {
  let configManager: ConfigurationManager;
  let mockAuditLogger: AuditLogger;

  beforeEach(async () => {
    // Create mock audit logger
    mockAuditLogger = {
      logSystemEvent: vi.fn().mockResolvedValue(undefined)
    } as any;

    configManager = new ConfigurationManager({
      auditLogger: mockAuditLogger,
      enableAutoSave: false, // Disable for testing
      validationEnabled: true
    });
  });

  afterEach(async () => {
    if (configManager) {
      await configManager.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      await configManager.initialize();
      
      const config = configManager.getConfiguration();
      
      expect(config.shopId).toBe('default-shop');
      expect(config.pricing.colorPerPage).toBe(500);
      expect(config.pricing.bwPerPage).toBe(200);
      expect(config.pricing.duplexDiscount).toBe(10);
      expect(config.limits.maxFileSize).toBe(10 * 1024 * 1024);
      expect(config.limits.maxFilesPerSession).toBe(10);
      expect(config.limits.sessionTimeout).toBe(30);
    });

    it('should log initialization event', async () => {
      await configManager.initialize();
      
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'CONFIGURATION_INITIALIZED',
        expect.objectContaining({
          configValid: true,
          errorsCount: 0
        })
      );
    });
  });

  describe('Configuration Validation', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should validate valid configuration', async () => {
      const config = configManager.getConfiguration();
      const result = await configManager.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject configuration with invalid shop ID', async () => {
      const config = configManager.getConfiguration();
      config.shopId = '';
      
      const result = await configManager.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Shop ID is required and must be a string');
    });

    it('should reject configuration with invalid pricing', async () => {
      const config = configManager.getConfiguration();
      config.pricing.colorPerPage = -1;
      config.pricing.bwPerPage = 0;
      config.pricing.duplexDiscount = 150;
      
      const result = await configManager.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Color per page price must be a positive number');
      expect(result.errors).toContain('Black & white per page price must be a positive number');
      expect(result.errors).toContain('Duplex discount must be a number between 0 and 100');
    });

    it('should reject configuration with invalid limits', async () => {
      const config = configManager.getConfiguration();
      config.limits.maxFileSize = -1;
      config.limits.maxFilesPerSession = 0;
      config.limits.sessionTimeout = -5;
      
      const result = await configManager.validateConfiguration(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Maximum file size must be a positive number');
      expect(result.errors).toContain('Maximum files per session must be a positive number');
      expect(result.errors).toContain('Session timeout must be a positive number');
    });

    it('should generate warnings for extreme values', async () => {
      const config = configManager.getConfiguration();
      config.pricing.colorPerPage = 50; // Very low price
      config.limits.maxFileSize = 100 * 1024 * 1024; // Very large file size
      config.limits.sessionTimeout = 120; // Very long timeout
      
      const result = await configManager.validateConfiguration(config);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Color printing price is very low (less than ₹1.00)');
      expect(result.warnings).toContain('Maximum file size is very large (over 50MB)');
      expect(result.warnings).toContain('Session timeout is very long (over 60 minutes)');
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should update valid configuration', async () => {
      const updates = {
        shopId: 'test-shop',
        pricing: {
          colorPerPage: 600,
          bwPerPage: 300,
          duplexDiscount: 15
        }
      };
      
      const result = await configManager.updateConfiguration(updates);
      
      expect(result.isValid).toBe(true);
      
      const config = configManager.getConfiguration();
      expect(config.shopId).toBe('test-shop');
      expect(config.pricing.colorPerPage).toBe(600);
      expect(config.pricing.bwPerPage).toBe(300);
      expect(config.pricing.duplexDiscount).toBe(15);
    });

    it('should reject invalid configuration updates', async () => {
      const updates = {
        pricing: {
          colorPerPage: -100
        }
      };
      
      const result = await configManager.updateConfiguration(updates);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Color per page price must be a positive number');
      
      // Original configuration should remain unchanged
      const config = configManager.getConfiguration();
      expect(config.pricing.colorPerPage).toBe(500); // Original value
    });

    it('should log configuration updates', async () => {
      const updates = { shopId: 'updated-shop' };
      
      await configManager.updateConfiguration(updates);
      
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'CONFIGURATION_UPDATED',
        expect.objectContaining({
          updatedFields: ['shopId']
        })
      );
    });
  });

  describe('Pricing Configuration', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get pricing configuration', () => {
      const pricing = configManager.getPricingConfiguration();
      
      expect(pricing.colorPerPage).toBe(500);
      expect(pricing.bwPerPage).toBe(200);
      expect(pricing.duplexDiscount).toBe(10);
    });

    it('should update pricing configuration', async () => {
      const newPricing = {
        colorPerPage: 700,
        bwPerPage: 350
      };
      
      const result = await configManager.updatePricingConfiguration(newPricing);
      
      expect(result.isValid).toBe(true);
      
      const pricing = configManager.getPricingConfiguration();
      expect(pricing.colorPerPage).toBe(700);
      expect(pricing.bwPerPage).toBe(350);
      expect(pricing.duplexDiscount).toBe(10); // Should remain unchanged
    });
  });

  describe('Limits Configuration', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get limits configuration', () => {
      const limits = configManager.getLimitsConfiguration();
      
      expect(limits.maxFileSize).toBe(10 * 1024 * 1024);
      expect(limits.maxFilesPerSession).toBe(10);
      expect(limits.sessionTimeout).toBe(30);
    });

    it('should update limits configuration', async () => {
      const newLimits = {
        maxFileSize: 20 * 1024 * 1024,
        sessionTimeout: 45
      };
      
      const result = await configManager.updateLimitsConfiguration(newLimits);
      
      expect(result.isValid).toBe(true);
      
      const limits = configManager.getLimitsConfiguration();
      expect(limits.maxFileSize).toBe(20 * 1024 * 1024);
      expect(limits.sessionTimeout).toBe(45);
      expect(limits.maxFilesPerSession).toBe(10); // Should remain unchanged
    });
  });

  describe('Reset to Defaults', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should reset configuration to defaults', async () => {
      // First, modify the configuration
      await configManager.updateConfiguration({
        shopId: 'modified-shop',
        pricing: { colorPerPage: 999 }
      });
      
      // Reset to defaults
      await configManager.resetToDefaults();
      
      const config = configManager.getConfiguration();
      expect(config.shopId).toBe('default-shop');
      expect(config.pricing.colorPerPage).toBe(500);
    });

    it('should log reset event', async () => {
      await configManager.resetToDefaults();
      
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'CONFIGURATION_RESET_TO_DEFAULTS',
        expect.objectContaining({
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('Safe Defaults Application', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should apply safe defaults when configuration is invalid', async () => {
      const errors = ['Invalid configuration detected'];
      
      await configManager.applyDefaults(errors);
      
      const config = configManager.getConfiguration();
      expect(config.shopId).toBe('default-shop');
      expect(config.pricing.colorPerPage).toBe(500);
      
      expect(mockAuditLogger.logSystemEvent).toHaveBeenCalledWith(
        'CONFIGURATION_DEFAULTS_APPLIED',
        expect.objectContaining({
          errors: errors
        })
      );
    });
  });

  describe('Configuration File Operations', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should get configuration file path', () => {
      const path = configManager.getConfigurationFilePath();
      expect(path).toBe('/mock/config/path.json');
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it('should emit configuration change events', async () => {
      const changeHandler = vi.fn();
      configManager.on('configurationChanged', changeHandler);
      
      const updates = { shopId: 'event-test-shop' };
      await configManager.updateConfiguration(updates);
      
      expect(changeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          updates: updates,
          current: expect.objectContaining({ shopId: 'event-test-shop' })
        })
      );
    });

    it('should emit reset events', async () => {
      const resetHandler = vi.fn();
      configManager.on('configurationReset', resetHandler);
      
      await configManager.resetToDefaults();
      
      expect(resetHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          shopId: 'default-shop'
        })
      );
    });
  });
});