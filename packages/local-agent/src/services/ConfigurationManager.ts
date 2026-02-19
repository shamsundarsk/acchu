import Store from 'electron-store';
import { ShopConfiguration, PrinterStatus, AuditEventType } from '../types';
import { AuditLogger } from './AuditLogger';
import { EventEmitter } from 'events';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ConfigurationManagerConfig {
  auditLogger?: AuditLogger;
  configFilePath?: string;
  enableAutoSave?: boolean;
  validationEnabled?: boolean;
}

export interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: PrinterStatus;
  description?: string;
  location?: string;
}

/**
 * ConfigurationManager handles all configuration loading, validation, and updates
 * Requirements: 10.1, 10.2, 10.3, 10.5 - Configuration management system
 */
export class ConfigurationManager extends EventEmitter {
  private store: Store<ShopConfiguration>;
  private auditLogger?: AuditLogger;
  private config: ConfigurationManagerConfig;
  private isInitialized = false;
  private availablePrinters: Map<string, PrinterInfo> = new Map();
  private configWatcher?: NodeJS.Timeout;

  // Default configuration values
  private readonly defaultConfiguration: ShopConfiguration = {
    shopId: 'default-shop',
    pricing: {
      colorPerPage: 500, // ₹5.00 in paise
      bwPerPage: 200,    // ₹2.00 in paise
      duplexDiscount: 10 // 10% discount for duplex
    },
    limits: {
      maxFileSize: 10 * 1024 * 1024, // 10MB in bytes
      maxFilesPerSession: 10,
      sessionTimeout: 30 // minutes
    },
    printer: {
      defaultPrinter: '',
      supportedFormats: ['application/pdf', 'application/msword', 
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        'image/jpeg', 'image/png']
    }
  };

  constructor(config: ConfigurationManagerConfig = {}) {
    super();
    this.config = config;
    this.auditLogger = config.auditLogger;

    // Initialize electron-store with schema validation
    this.store = new Store<ShopConfiguration>({
      name: 'shop-configuration',
      fileExtension: 'json',
      cwd: config.configFilePath,
      defaults: this.defaultConfiguration,
      schema: this.getConfigurationSchema(),
      clearInvalidConfig: false // We'll handle validation manually
    });
  }

  /**
   * Initialize the configuration manager
   * Requirements: 10.1 - Load configuration from local settings file
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('Initializing Configuration Manager...');

      // Load and validate current configuration
      const validationResult = await this.validateConfiguration();
      
      if (!validationResult.isValid) {
        console.warn('Configuration validation failed, applying safe defaults');
        await this.applyDefaults(validationResult.errors);
      }

      if (validationResult.warnings.length > 0) {
        console.warn('Configuration warnings:', validationResult.warnings);
      }

      // Detect available printers
      await this.detectPrinters();

      // Set up configuration file watching for dynamic updates
      if (this.config.enableAutoSave !== false) {
        this.setupConfigurationWatcher();
      }

      this.isInitialized = true;

      // Log initialization
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent(AuditEventType.CONFIGURATION_INITIALIZED, {
          configValid: validationResult.isValid,
          errorsCount: validationResult.errors.length,
          warningsCount: validationResult.warnings.length,
          availablePrinters: this.availablePrinters.size
        });
      }

      console.log('Configuration Manager initialized successfully');

    } catch (error) {
      console.error('Failed to initialize Configuration Manager:', error);
      throw new Error(`Configuration initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get current configuration
   * Requirements: 10.1 - Configuration access
   */
  getConfiguration(): ShopConfiguration {
    return { ...this.store.store }; // Return deep copy to prevent external modification
  }

  /**
   * Update configuration with validation
   * Requirements: 10.2 - Dynamic configuration updates without restart
   */
  async updateConfiguration(updates: Partial<ShopConfiguration>): Promise<ConfigurationValidationResult> {
    try {
      // Create merged configuration for validation
      const currentConfig = this.getConfiguration();
      const newConfig: ShopConfiguration = {
        ...currentConfig,
        ...updates,
        // Handle nested objects properly
        pricing: { ...currentConfig.pricing, ...updates.pricing },
        limits: { ...currentConfig.limits, ...updates.limits },
        printer: { ...currentConfig.printer, ...updates.printer }
      };

      // Validate the new configuration
      const validationResult = await this.validateConfiguration(newConfig);

      if (!validationResult.isValid) {
        console.error('Configuration update validation failed:', validationResult.errors);
        return validationResult;
      }

      // Apply the updates
      this.store.store = newConfig;

      // Emit configuration change event
      this.emit('configurationChanged', {
        previous: currentConfig,
        current: newConfig,
        updates
      });

      // Log the update
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent(AuditEventType.CONFIGURATION_UPDATED, {
          updatedFields: Object.keys(updates),
          validationWarnings: validationResult.warnings.length
        });
      }

      console.log('Configuration updated successfully');
      return validationResult;

    } catch (error) {
      console.error('Failed to update configuration:', error);
      const errorResult: ConfigurationValidationResult = {
        isValid: false,
        errors: [`Configuration update failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
      return errorResult;
    }
  }

  /**
   * Validate configuration against schema and business rules
   * Requirements: 10.2 - Configuration validation
   */
  async validateConfiguration(config?: ShopConfiguration): Promise<ConfigurationValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Handle null or undefined configuration when explicitly passed
      if (config === null) {
        return {
          isValid: false,
          errors: ['Configuration is required'],
          warnings: []
        };
      }
      
      const configToValidate = config || this.getConfiguration();

      // Handle case where we still don't have a valid configuration
      if (!configToValidate) {
        return {
          isValid: false,
          errors: ['Configuration is required'],
          warnings: []
        };
      }

      // Basic structure validation
      if (!configToValidate.shopId || typeof configToValidate.shopId !== 'string') {
        errors.push('Shop ID is required and must be a string');
      }

      // Pricing validation
      if (!configToValidate.pricing) {
        errors.push('Pricing configuration is required');
      } else {
        if (typeof configToValidate.pricing.colorPerPage !== 'number' || configToValidate.pricing.colorPerPage <= 0) {
          errors.push('Color per page price must be a positive number');
        }
        if (typeof configToValidate.pricing.bwPerPage !== 'number' || configToValidate.pricing.bwPerPage <= 0) {
          errors.push('Black & white per page price must be a positive number');
        }
        if (typeof configToValidate.pricing.duplexDiscount !== 'number' || 
            configToValidate.pricing.duplexDiscount < 0 || configToValidate.pricing.duplexDiscount > 100) {
          errors.push('Duplex discount must be a number between 0 and 100');
        }

        // Pricing warnings
        if (configToValidate.pricing.colorPerPage < 100) {
          warnings.push('Color printing price is very low (less than ₹1.00)');
        }
        if (configToValidate.pricing.bwPerPage < 50) {
          warnings.push('Black & white printing price is very low (less than ₹0.50)');
        }
      }

      // Limits validation
      if (!configToValidate.limits) {
        errors.push('Limits configuration is required');
      } else {
        if (typeof configToValidate.limits.maxFileSize !== 'number' || configToValidate.limits.maxFileSize <= 0) {
          errors.push('Maximum file size must be a positive number');
        }
        if (typeof configToValidate.limits.maxFilesPerSession !== 'number' || configToValidate.limits.maxFilesPerSession <= 0) {
          errors.push('Maximum files per session must be a positive number');
        }
        if (typeof configToValidate.limits.sessionTimeout !== 'number' || configToValidate.limits.sessionTimeout <= 0) {
          errors.push('Session timeout must be a positive number');
        }

        // Limits warnings
        if (configToValidate.limits.maxFileSize > 50 * 1024 * 1024) {
          warnings.push('Maximum file size is very large (over 50MB)');
        }
        if (configToValidate.limits.sessionTimeout > 60) {
          warnings.push('Session timeout is very long (over 60 minutes)');
        }
      }

      // Printer validation
      if (!configToValidate.printer) {
        errors.push('Printer configuration is required');
      } else {
        if (!Array.isArray(configToValidate.printer.supportedFormats) || 
            configToValidate.printer.supportedFormats.length === 0) {
          errors.push('Supported formats must be a non-empty array');
        }

        // Validate default printer exists if specified
        if (configToValidate.printer.defaultPrinter) {
          const printerExists = this.availablePrinters.has(configToValidate.printer.defaultPrinter);
          if (!printerExists) {
            warnings.push(`Default printer '${configToValidate.printer.defaultPrinter}' is not available`);
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
        warnings
      };
    }
  }

  /**
   * Apply safe defaults for invalid configuration
   * Requirements: 10.5 - Safe defaults for invalid configurations
   */
  async applyDefaults(errors: string[]): Promise<void> {
    try {
      console.log('Applying safe defaults due to configuration errors:', errors);

      // Reset to default configuration
      this.store.store = { ...this.defaultConfiguration };

      // Try to preserve shop ID if it was valid
      const currentConfig = this.store.store;
      if (currentConfig.shopId && typeof currentConfig.shopId === 'string') {
        this.store.set('shopId', currentConfig.shopId);
      }

      // Log the defaults application
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent(AuditEventType.CONFIGURATION_DEFAULTS_APPLIED, {
          errors: errors,
          timestamp: new Date().toISOString()
        });
      }

      console.log('Safe defaults applied successfully');

    } catch (error) {
      console.error('Failed to apply safe defaults:', error);
      throw new Error(`Failed to apply safe defaults: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect available printers on the system
   * Requirements: 10.4 - Printer detection and selection interface
   */
  async detectPrinters(): Promise<PrinterInfo[]> {
    try {
      console.log('Detecting available printers...');
      this.availablePrinters.clear();

      if (os.platform() === 'win32') {
        // Windows printer detection using PowerShell
        const { stdout } = await execAsync(
          'powershell "Get-Printer | Select-Object Name, PrinterStatus, DriverName, Location | ConvertTo-Json"'
        );

        const printers = JSON.parse(stdout);
        const printerArray = Array.isArray(printers) ? printers : [printers];

        for (const printer of printerArray) {
          const printerInfo: PrinterInfo = {
            name: printer.Name,
            isDefault: false, // Will be determined separately
            status: this.mapPrinterStatus(printer.PrinterStatus),
            description: printer.DriverName,
            location: printer.Location
          };

          this.availablePrinters.set(printer.Name, printerInfo);
        }

        // Get default printer
        try {
          const { stdout: defaultPrinter } = await execAsync(
            'powershell "(Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Default=$true\\").Name"'
          );
          
          const defaultPrinterName = defaultPrinter.trim();
          if (defaultPrinterName && this.availablePrinters.has(defaultPrinterName)) {
            const printer = this.availablePrinters.get(defaultPrinterName)!;
            printer.isDefault = true;
            this.availablePrinters.set(defaultPrinterName, printer);
          }
        } catch (error) {
          console.warn('Failed to detect default printer:', error);
        }

      } else {
        // Linux/macOS printer detection using CUPS
        try {
          const { stdout } = await execAsync('lpstat -p');
          const lines = stdout.split('\n').filter(line => line.startsWith('printer'));
          
          for (const line of lines) {
            const match = line.match(/printer (\S+)/);
            if (match) {
              const printerName = match[1];
              const printerInfo: PrinterInfo = {
                name: printerName,
                isDefault: false,
                status: PrinterStatus.ONLINE, // Assume online for now
                description: 'CUPS Printer'
              };

              this.availablePrinters.set(printerName, printerInfo);
            }
          }

          // Get default printer
          try {
            const { stdout: defaultPrinter } = await execAsync('lpstat -d');
            const match = defaultPrinter.match(/system default destination: (\S+)/);
            if (match && this.availablePrinters.has(match[1])) {
              const printer = this.availablePrinters.get(match[1])!;
              printer.isDefault = true;
              this.availablePrinters.set(match[1], printer);
            }
          } catch (error) {
            console.warn('Failed to detect default printer:', error);
          }

        } catch (error) {
          console.warn('Failed to detect printers using CUPS:', error);
        }
      }

      const printerList = Array.from(this.availablePrinters.values());
      console.log(`Detected ${printerList.length} printers`);

      // Update configuration with detected default printer if none is set
      const currentConfig = this.getConfiguration();
      if (!currentConfig.printer.defaultPrinter) {
        const defaultPrinter = printerList.find(p => p.isDefault);
        if (defaultPrinter) {
          await this.updateConfiguration({
            printer: {
              ...currentConfig.printer,
              defaultPrinter: defaultPrinter.name
            }
          });
        }
      }

      // Emit printer detection event
      this.emit('printersDetected', printerList);

      return printerList;

    } catch (error) {
      console.error('Failed to detect printers:', error);
      return [];
    }
  }

  /**
   * Get available printers
   * Requirements: 10.4 - Printer detection interface
   */
  getAvailablePrinters(): PrinterInfo[] {
    return Array.from(this.availablePrinters.values());
  }

  /**
   * Set default printer
   * Requirements: 10.4 - Printer selection interface
   */
  async setDefaultPrinter(printerName: string): Promise<boolean> {
    try {
      if (!this.availablePrinters.has(printerName)) {
        console.error(`Printer '${printerName}' not found in available printers`);
        return false;
      }

      // Update configuration
      const currentConfig = this.getConfiguration();
      const updateResult = await this.updateConfiguration({
        printer: {
          ...currentConfig.printer,
          defaultPrinter: printerName
        }
      });

      if (!updateResult.isValid) {
        console.error('Failed to update default printer configuration:', updateResult.errors);
        return false;
      }

      // Update printer info
      this.availablePrinters.forEach((printer, name) => {
        printer.isDefault = (name === printerName);
      });

      // Emit printer change event
      this.emit('defaultPrinterChanged', printerName);

      console.log(`Default printer set to: ${printerName}`);
      return true;

    } catch (error) {
      console.error('Failed to set default printer:', error);
      return false;
    }
  }

  /**
   * Get pricing configuration
   */
  getPricingConfiguration(): ShopConfiguration['pricing'] {
    return { ...this.getConfiguration().pricing };
  }

  /**
   * Update pricing configuration
   * Requirements: 10.3 - Configuration of pricing
   */
  async updatePricingConfiguration(pricing: Partial<ShopConfiguration['pricing']>): Promise<ConfigurationValidationResult> {
    const currentConfig = this.getConfiguration();
    return await this.updateConfiguration({
      pricing: {
        ...currentConfig.pricing,
        ...pricing
      }
    });
  }

  /**
   * Get limits configuration
   */
  getLimitsConfiguration(): ShopConfiguration['limits'] {
    return { ...this.getConfiguration().limits };
  }

  /**
   * Update limits configuration
   */
  async updateLimitsConfiguration(limits: Partial<ShopConfiguration['limits']>): Promise<ConfigurationValidationResult> {
    const currentConfig = this.getConfiguration();
    return await this.updateConfiguration({
      limits: {
        ...currentConfig.limits,
        ...limits
      }
    });
  }

  /**
   * Reset configuration to defaults
   */
  async resetToDefaults(): Promise<void> {
    try {
      this.store.clear();
      this.store.store = { ...this.defaultConfiguration };

      // Re-detect printers and set default
      await this.detectPrinters();

      // Log the reset
      if (this.auditLogger) {
        await this.auditLogger.logSystemEvent(AuditEventType.CONFIGURATION_RESET_TO_DEFAULTS, {
          timestamp: new Date().toISOString()
        });
      }

      // Emit reset event
      this.emit('configurationReset', this.getConfiguration());

      console.log('Configuration reset to defaults');

    } catch (error) {
      console.error('Failed to reset configuration:', error);
      throw error;
    }
  }

  /**
   * Export configuration to file
   */
  async exportConfiguration(filePath: string): Promise<void> {
    try {
      const config = this.getConfiguration();
      const fs = await import('fs/promises');
      await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
      
      console.log(`Configuration exported to: ${filePath}`);
    } catch (error) {
      console.error('Failed to export configuration:', error);
      throw error;
    }
  }

  /**
   * Import configuration from file
   */
  async importConfiguration(filePath: string): Promise<ConfigurationValidationResult> {
    try {
      const fs = await import('fs/promises');
      const configData = await fs.readFile(filePath, 'utf8');
      const importedConfig: ShopConfiguration = JSON.parse(configData);

      return await this.updateConfiguration(importedConfig);
    } catch (error) {
      console.error('Failed to import configuration:', error);
      return {
        isValid: false,
        errors: [`Import failed: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Get configuration file path
   */
  getConfigurationFilePath(): string {
    return this.store.path;
  }

  /**
   * Setup configuration file watcher for dynamic updates
   * Requirements: 10.2 - Dynamic configuration updates without restart
   */
  private setupConfigurationWatcher(): void {
    // Poll for configuration changes every 5 seconds
    this.configWatcher = setInterval(async () => {
      try {
        // Check if the configuration file has been modified externally
        const currentConfig = this.getConfiguration();
        const fileConfig = this.store.store;

        // Simple comparison - in production, you might want more sophisticated change detection
        if (JSON.stringify(currentConfig) !== JSON.stringify(fileConfig)) {
          console.log('External configuration change detected, validating...');
          
          const validationResult = await this.validateConfiguration(fileConfig);
          
          if (validationResult.isValid) {
            this.emit('configurationChanged', {
              previous: currentConfig,
              current: fileConfig,
              external: true
            });
            console.log('External configuration change applied');
          } else {
            console.warn('External configuration change rejected due to validation errors:', validationResult.errors);
            // Revert to current valid configuration
            this.store.store = currentConfig;
          }
        }
      } catch (error) {
        console.error('Error in configuration watcher:', error);
      }
    }, 5000);
  }

  /**
   * Map system printer status to our enum
   */
  private mapPrinterStatus(systemStatus: any): PrinterStatus {
    if (typeof systemStatus === 'string') {
      const status = systemStatus.toLowerCase();
      if (status.includes('offline') || status.includes('error')) {
        return PrinterStatus.OFFLINE;
      } else if (status.includes('busy') || status.includes('printing')) {
        return PrinterStatus.BUSY;
      }
    }
    return PrinterStatus.ONLINE;
  }

  /**
   * Get configuration schema for validation
   */
  private getConfigurationSchema(): any {
    return {
      shopId: {
        type: 'string',
        minLength: 1
      },
      pricing: {
        type: 'object',
        properties: {
          colorPerPage: {
            type: 'number',
            minimum: 1
          },
          bwPerPage: {
            type: 'number',
            minimum: 1
          },
          duplexDiscount: {
            type: 'number',
            minimum: 0,
            maximum: 100
          }
        },
        required: ['colorPerPage', 'bwPerPage', 'duplexDiscount']
      },
      limits: {
        type: 'object',
        properties: {
          maxFileSize: {
            type: 'number',
            minimum: 1024 // At least 1KB
          },
          maxFilesPerSession: {
            type: 'number',
            minimum: 1
          },
          sessionTimeout: {
            type: 'number',
            minimum: 1
          }
        },
        required: ['maxFileSize', 'maxFilesPerSession', 'sessionTimeout']
      },
      printer: {
        type: 'object',
        properties: {
          defaultPrinter: {
            type: 'string'
          },
          supportedFormats: {
            type: 'array',
            items: {
              type: 'string'
            },
            minItems: 1
          }
        },
        required: ['supportedFormats']
      }
    };
  }

  /**
   * Shutdown the configuration manager
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Configuration Manager...');

    // Clear configuration watcher
    if (this.configWatcher) {
      clearInterval(this.configWatcher);
      this.configWatcher = undefined;
    }

    // Remove all event listeners
    this.removeAllListeners();

    this.isInitialized = false;
    console.log('Configuration Manager shutdown complete');
  }
}