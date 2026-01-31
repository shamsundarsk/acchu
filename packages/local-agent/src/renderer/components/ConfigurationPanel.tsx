import React, { useState, useEffect } from 'react';
import { ShopConfiguration } from '../../types';
import './ConfigurationPanel.css';

interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
  description?: string;
  location?: string;
}

interface ConfigurationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ConfigurationPanelProps {
  onClose: () => void;
}

/**
 * Configuration Panel UI Component
 * Requirements: 10.3 - Configuration UI for pricing and settings
 * Requirements: 10.4 - Printer detection and selection interface
 */
export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({ onClose }) => {
  const [configuration, setConfiguration] = useState<ShopConfiguration | null>(null);
  const [availablePrinters, setAvailablePrinters] = useState<PrinterInfo[]>([]);
  const [validationResult, setValidationResult] = useState<ConfigurationValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'pricing' | 'limits' | 'printer'>('general');

  // Form state
  const [formData, setFormData] = useState<ShopConfiguration | null>(null);

  useEffect(() => {
    loadConfiguration();
    loadPrinters();
  }, []);

  const loadConfiguration = async () => {
    try {
      // In a real implementation, this would call the main process via IPC
      const config = await window.electronAPI?.getConfiguration();
      setConfiguration(config);
      setFormData({ ...config });
    } catch (error) {
      console.error('Failed to load configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrinters = async () => {
    try {
      const printers = await window.electronAPI?.getAvailablePrinters();
      setAvailablePrinters(printers || []);
    } catch (error) {
      console.error('Failed to load printers:', error);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!formData) return;

    setSaving(true);
    try {
      const result = await window.electronAPI?.updateConfiguration(formData);
      setValidationResult(result);
      
      if (result.isValid) {
        setConfiguration({ ...formData });
        // Show success message
        setTimeout(() => setValidationResult(null), 3000);
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setValidationResult({
        isValid: false,
        errors: ['Failed to save configuration'],
        warnings: []
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
      try {
        await window.electronAPI?.resetConfigurationToDefaults();
        await loadConfiguration();
        setValidationResult({
          isValid: true,
          errors: [],
          warnings: ['Configuration reset to defaults']
        });
      } catch (error) {
        console.error('Failed to reset configuration:', error);
      }
    }
  };

  const handleDetectPrinters = async () => {
    try {
      const printers = await window.electronAPI?.detectPrinters();
      setAvailablePrinters(printers || []);
    } catch (error) {
      console.error('Failed to detect printers:', error);
    }
  };

  const handleSetDefaultPrinter = async (printerName: string) => {
    try {
      const success = await window.electronAPI?.setDefaultPrinter(printerName);
      if (success) {
        await loadPrinters();
        if (formData) {
          setFormData({
            ...formData,
            printer: {
              ...formData.printer,
              defaultPrinter: printerName
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to set default printer:', error);
    }
  };

  const updateFormData = (updates: Partial<ShopConfiguration>) => {
    if (formData) {
      setFormData({ ...formData, ...updates });
    }
  };

  const updatePricing = (updates: Partial<ShopConfiguration['pricing']>) => {
    if (formData) {
      setFormData({
        ...formData,
        pricing: { ...formData.pricing, ...updates }
      });
    }
  };

  const updateLimits = (updates: Partial<ShopConfiguration['limits']>) => {
    if (formData) {
      setFormData({
        ...formData,
        limits: { ...formData.limits, ...updates }
      });
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="configuration-panel">
        <div className="loading">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="configuration-panel">
      <div className="configuration-header">
        <h2>Configuration Settings</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </div>

      <div className="configuration-tabs">
        <button 
          className={`tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button 
          className={`tab ${activeTab === 'pricing' ? 'active' : ''}`}
          onClick={() => setActiveTab('pricing')}
        >
          Pricing
        </button>
        <button 
          className={`tab ${activeTab === 'limits' ? 'active' : ''}`}
          onClick={() => setActiveTab('limits')}
        >
          Limits
        </button>
        <button 
          className={`tab ${activeTab === 'printer' ? 'active' : ''}`}
          onClick={() => setActiveTab('printer')}
        >
          Printer
        </button>
      </div>

      <div className="configuration-content">
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="tab-content">
            <h3>General Settings</h3>
            <div className="form-group">
              <label htmlFor="shopId">Shop ID:</label>
              <input
                id="shopId"
                type="text"
                value={formData.shopId}
                onChange={(e) => updateFormData({ shopId: e.target.value })}
                placeholder="Enter shop identifier"
              />
            </div>
          </div>
        )}

        {/* Pricing Tab */}
        {activeTab === 'pricing' && (
          <div className="tab-content">
            <h3>Pricing Configuration</h3>
            <div className="form-group">
              <label htmlFor="colorPerPage">Color Printing (₹ per page):</label>
              <input
                id="colorPerPage"
                type="number"
                step="0.01"
                min="0.01"
                value={(formData.pricing.colorPerPage / 100).toFixed(2)}
                onChange={(e) => updatePricing({ 
                  colorPerPage: Math.round(parseFloat(e.target.value) * 100) 
                })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="bwPerPage">Black & White Printing (₹ per page):</label>
              <input
                id="bwPerPage"
                type="number"
                step="0.01"
                min="0.01"
                value={(formData.pricing.bwPerPage / 100).toFixed(2)}
                onChange={(e) => updatePricing({ 
                  bwPerPage: Math.round(parseFloat(e.target.value) * 100) 
                })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="duplexDiscount">Duplex Discount (%):</label>
              <input
                id="duplexDiscount"
                type="number"
                min="0"
                max="100"
                value={formData.pricing.duplexDiscount}
                onChange={(e) => updatePricing({ 
                  duplexDiscount: parseInt(e.target.value) 
                })}
              />
            </div>
            <div className="pricing-preview">
              <h4>Pricing Preview:</h4>
              <p>Color: ₹{(formData.pricing.colorPerPage / 100).toFixed(2)} per page</p>
              <p>B&W: ₹{(formData.pricing.bwPerPage / 100).toFixed(2)} per page</p>
              <p>Duplex discount: {formData.pricing.duplexDiscount}%</p>
            </div>
          </div>
        )}

        {/* Limits Tab */}
        {activeTab === 'limits' && (
          <div className="tab-content">
            <h3>System Limits</h3>
            <div className="form-group">
              <label htmlFor="maxFileSize">Maximum File Size (MB):</label>
              <input
                id="maxFileSize"
                type="number"
                min="1"
                max="100"
                value={Math.round(formData.limits.maxFileSize / (1024 * 1024))}
                onChange={(e) => updateLimits({ 
                  maxFileSize: parseInt(e.target.value) * 1024 * 1024 
                })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="maxFilesPerSession">Maximum Files per Session:</label>
              <input
                id="maxFilesPerSession"
                type="number"
                min="1"
                max="50"
                value={formData.limits.maxFilesPerSession}
                onChange={(e) => updateLimits({ 
                  maxFilesPerSession: parseInt(e.target.value) 
                })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="sessionTimeout">Session Timeout (minutes):</label>
              <input
                id="sessionTimeout"
                type="number"
                min="5"
                max="120"
                value={formData.limits.sessionTimeout}
                onChange={(e) => updateLimits({ 
                  sessionTimeout: parseInt(e.target.value) 
                })}
              />
            </div>
          </div>
        )}

        {/* Printer Tab */}
        {activeTab === 'printer' && (
          <div className="tab-content">
            <h3>Printer Configuration</h3>
            <div className="printer-actions">
              <button onClick={handleDetectPrinters} className="detect-button">
                Detect Printers
              </button>
            </div>
            
            <div className="printer-list">
              <h4>Available Printers:</h4>
              {availablePrinters.length === 0 ? (
                <p className="no-printers">No printers detected. Click "Detect Printers" to scan for available printers.</p>
              ) : (
                <div className="printers">
                  {availablePrinters.map((printer) => (
                    <div key={printer.name} className={`printer-item ${printer.isDefault ? 'default' : ''}`}>
                      <div className="printer-info">
                        <div className="printer-name">
                          {printer.name}
                          {printer.isDefault && <span className="default-badge">Default</span>}
                        </div>
                        <div className="printer-details">
                          <span className={`status ${printer.status.toLowerCase()}`}>
                            {printer.status}
                          </span>
                          {printer.description && (
                            <span className="description">{printer.description}</span>
                          )}
                          {printer.location && (
                            <span className="location">{printer.location}</span>
                          )}
                        </div>
                      </div>
                      {!printer.isDefault && (
                        <button 
                          onClick={() => handleSetDefaultPrinter(printer.name)}
                          className="set-default-button"
                        >
                          Set as Default
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="supported-formats">
              <h4>Supported File Formats:</h4>
              <div className="format-list">
                {formData.printer.supportedFormats.map((format) => (
                  <span key={format} className="format-tag">
                    {format.split('/')[1]?.toUpperCase() || format}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {validationResult && (
        <div className={`validation-messages ${validationResult.isValid ? 'success' : 'error'}`}>
          {validationResult.isValid ? (
            <div className="success-message">Configuration saved successfully!</div>
          ) : (
            <div className="error-messages">
              <h4>Configuration Errors:</h4>
              <ul>
                {validationResult.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          {validationResult.warnings.length > 0 && (
            <div className="warning-messages">
              <h4>Warnings:</h4>
              <ul>
                {validationResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="configuration-actions">
        <button 
          onClick={handleSaveConfiguration} 
          disabled={isSaving}
          className="save-button"
        >
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>
        <button 
          onClick={handleResetToDefaults}
          className="reset-button"
        >
          Reset to Defaults
        </button>
        <button onClick={onClose} className="cancel-button">
          Cancel
        </button>
      </div>
    </div>
  );
};