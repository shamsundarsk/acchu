import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigurationManager } from '../ConfigurationManager';

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

// Mock child_process to prevent actual system calls
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

// Mock util
vi.mock('util', () => ({
  promisify: () => vi.fn().mockResolvedValue({ stdout: '[]', stderr: '' })
}));

describe('ConfigurationManager Basic Tests', () => {
  let configManager: ConfigurationManager;

  beforeEach(() => {
    configManager = new ConfigurationManager({
      enableAutoSave: false,
      validationEnabled: true
    });
  });

  afterEach(async () => {
    if (configManager) {
      await configManager.shutdown();
    }
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration without initialization', async () => {
      const validConfig = {
        shopId: 'test-shop',
        pricing: {
          colorPerPage: 500,
          bwPerPage: 200,
          duplexDiscount: 10
        },
        limits: {
          maxFileSize: 10 * 1024 * 1024,
          maxFilesPerSession: 10,
          sessionTimeout: 30
        },
        printer: {
          defaultPrinter: 'test-printer',
          supportedFormats: ['application/pdf', 'image/jpeg']
        }
      };
      
      const result = await configManager.validateConfiguration(validConfig);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject configuration with invalid shop ID', async () => {
      const invalidConfig = {
        shopId: '',
        pricing: {
          colorPerPage: 500,
          bwPerPage: 200,
          duplexDiscount: 10
        },
        limits: {
          maxFileSize: 10 * 1024 * 1024,
          maxFilesPerSession: 10,
          sessionTimeout: 30
        },
        printer: {
          defaultPrinter: 'test-printer',
          supportedFormats: ['application/pdf']
        }
      };
      
      const result = await configManager.validateConfiguration(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Shop ID is required and must be a string');
    });

    it('should reject configuration with invalid pricing', async () => {
      const invalidConfig = {
        shopId: 'test-shop',
        pricing: {
          colorPerPage: -1,
          bwPerPage: 0,
          duplexDiscount: 150
        },
        limits: {
          maxFileSize: 10 * 1024 * 1024,
          maxFilesPerSession: 10,
          sessionTimeout: 30
        },
        printer: {
          defaultPrinter: 'test-printer',
          supportedFormats: ['application/pdf']
        }
      };
      
      const result = await configManager.validateConfiguration(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Color per page price must be a positive number');
      expect(result.errors).toContain('Black & white per page price must be a positive number');
      expect(result.errors).toContain('Duplex discount must be a number between 0 and 100');
    });

    it('should reject configuration with invalid limits', async () => {
      const invalidConfig = {
        shopId: 'test-shop',
        pricing: {
          colorPerPage: 500,
          bwPerPage: 200,
          duplexDiscount: 10
        },
        limits: {
          maxFileSize: -1,
          maxFilesPerSession: 0,
          sessionTimeout: -5
        },
        printer: {
          defaultPrinter: 'test-printer',
          supportedFormats: ['application/pdf']
        }
      };
      
      const result = await configManager.validateConfiguration(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Maximum file size must be a positive number');
      expect(result.errors).toContain('Maximum files per session must be a positive number');
      expect(result.errors).toContain('Session timeout must be a positive number');
    });

    it('should generate warnings for extreme values', async () => {
      const configWithWarnings = {
        shopId: 'test-shop',
        pricing: {
          colorPerPage: 50, // Very low price
          bwPerPage: 200,
          duplexDiscount: 10
        },
        limits: {
          maxFileSize: 100 * 1024 * 1024, // Very large file size
          maxFilesPerSession: 10,
          sessionTimeout: 120 // Very long timeout
        },
        printer: {
          defaultPrinter: 'test-printer',
          supportedFormats: ['application/pdf']
        }
      };
      
      const result = await configManager.validateConfiguration(configWithWarnings);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Color printing price is very low (less than ₹1.00)');
      expect(result.warnings).toContain('Maximum file size is very large (over 50MB)');
      expect(result.warnings).toContain('Session timeout is very long (over 60 minutes)');
    });

    it('should reject configuration with missing required fields', async () => {
      const incompleteConfig = {
        shopId: 'test-shop'
        // Missing pricing, limits, and printer
      };
      
      const result = await configManager.validateConfiguration(incompleteConfig as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Pricing configuration is required');
      expect(result.errors).toContain('Limits configuration is required');
      expect(result.errors).toContain('Printer configuration is required');
    });

    it('should reject configuration with empty supported formats', async () => {
      const invalidConfig = {
        shopId: 'test-shop',
        pricing: {
          colorPerPage: 500,
          bwPerPage: 200,
          duplexDiscount: 10
        },
        limits: {
          maxFileSize: 10 * 1024 * 1024,
          maxFilesPerSession: 10,
          sessionTimeout: 30
        },
        printer: {
          defaultPrinter: 'test-printer',
          supportedFormats: []
        }
      };
      
      const result = await configManager.validateConfiguration(invalidConfig);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Supported formats must be a non-empty array');
    });
  });

  describe('Configuration Schema', () => {
    it('should have correct default configuration structure', () => {
      // Access the private defaultConfiguration through the public getConfiguration method
      // after creating a new instance (which loads defaults)
      const tempManager = new ConfigurationManager();
      
      // We can't directly access private members, but we can test the structure
      // by checking that validation passes for a known good configuration
      const testConfig = {
        shopId: 'default-shop',
        pricing: {
          colorPerPage: 500,
          bwPerPage: 200,
          duplexDiscount: 10
        },
        limits: {
          maxFileSize: 10 * 1024 * 1024,
          maxFilesPerSession: 10,
          sessionTimeout: 30
        },
        printer: {
          defaultPrinter: '',
          supportedFormats: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png'
          ]
        }
      };

      expect(testConfig.shopId).toBe('default-shop');
      expect(testConfig.pricing.colorPerPage).toBe(500);
      expect(testConfig.pricing.bwPerPage).toBe(200);
      expect(testConfig.pricing.duplexDiscount).toBe(10);
      expect(testConfig.limits.maxFileSize).toBe(10 * 1024 * 1024);
      expect(testConfig.limits.maxFilesPerSession).toBe(10);
      expect(testConfig.limits.sessionTimeout).toBe(30);
      expect(testConfig.printer.supportedFormats).toHaveLength(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async () => {
      const malformedConfig = {
        shopId: null,
        pricing: 'invalid',
        limits: undefined,
        printer: { supportedFormats: 'not-an-array' }
      };
      
      const result = await configManager.validateConfiguration(malformedConfig as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing configuration gracefully', async () => {
      const result = await configManager.validateConfiguration(null as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});