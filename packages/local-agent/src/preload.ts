import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Session management
  createSession: () => ipcRenderer.invoke('session:create'),
  getSessionStatus: (sessionId: string) => ipcRenderer.invoke('session:get-status', sessionId),
  terminateSession: (sessionId: string) => ipcRenderer.invoke('session:terminate', sessionId),

  // File handling
  receiveFile: (sessionId: string, fileData: any) => ipcRenderer.invoke('file:receive', sessionId, fileData),
  validateFile: (fileData: any) => ipcRenderer.invoke('file:validate', fileData),

  // QR Code management
  getSessionQRCode: (sessionId: string) => ipcRenderer.invoke('qr:generate', sessionId),
  regenerateSessionQRCode: (sessionId: string) => ipcRenderer.invoke('qr:regenerate', sessionId),

  // Print management
  queuePrintJob: (sessionId: string, options: any) => ipcRenderer.invoke('print:queue-job', sessionId, options),
  executePrintJob: (jobId: string) => ipcRenderer.invoke('print:execute-job', jobId),
  getPrinterStatus: () => ipcRenderer.invoke('print:get-status'),
  getAllPrintJobs: () => ipcRenderer.invoke('print:get-all-jobs'),
  getPrintProgress: (jobId: string) => ipcRenderer.invoke('print:get-progress', jobId),

  // Configuration management
  getConfiguration: () => ipcRenderer.invoke('config:get'),
  updateConfiguration: (updates: any) => ipcRenderer.invoke('config:update', updates),
  validateConfiguration: (config: any) => ipcRenderer.invoke('config:validate', config),
  resetConfigurationToDefaults: () => ipcRenderer.invoke('config:reset-defaults'),
  exportConfiguration: (filePath: string) => ipcRenderer.invoke('config:export', filePath),
  importConfiguration: (filePath: string) => ipcRenderer.invoke('config:import', filePath),

  // Printer management
  detectPrinters: () => ipcRenderer.invoke('printer:detect'),
  getAvailablePrinters: () => ipcRenderer.invoke('printer:get-available'),
  setDefaultPrinter: (printerName: string) => ipcRenderer.invoke('printer:set-default', printerName),

  // Pricing configuration
  getPricingConfiguration: () => ipcRenderer.invoke('config:get-pricing'),
  updatePricingConfiguration: (pricing: any) => ipcRenderer.invoke('config:update-pricing', pricing),

  // Limits configuration
  getLimitsConfiguration: () => ipcRenderer.invoke('config:get-limits'),
  updateLimitsConfiguration: (limits: any) => ipcRenderer.invoke('config:update-limits', limits),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      createSession: () => Promise<any>;
      getSessionStatus: (sessionId: string) => Promise<any>;
      terminateSession: (sessionId: string) => Promise<any>;
      receiveFile: (sessionId: string, fileData: any) => Promise<any>;
      validateFile: (fileData: any) => Promise<any>;
      
      // QR Code management
      getSessionQRCode: (sessionId: string) => Promise<any>;
      regenerateSessionQRCode: (sessionId: string) => Promise<any>;
      
      // Print management
      queuePrintJob: (sessionId: string, options: any) => Promise<any>;
      executePrintJob: (jobId: string) => Promise<any>;
      getPrinterStatus: () => Promise<any>;
      getAllPrintJobs: () => Promise<any>;
      getPrintProgress: (jobId: string) => Promise<any>;
      
      // Configuration management
      getConfiguration: () => Promise<any>;
      updateConfiguration: (updates: any) => Promise<any>;
      validateConfiguration: (config: any) => Promise<any>;
      resetConfigurationToDefaults: () => Promise<void>;
      exportConfiguration: (filePath: string) => Promise<void>;
      importConfiguration: (filePath: string) => Promise<any>;
      
      // Printer management
      detectPrinters: () => Promise<any[]>;
      getAvailablePrinters: () => Promise<any[]>;
      setDefaultPrinter: (printerName: string) => Promise<boolean>;
      
      // Pricing configuration
      getPricingConfiguration: () => Promise<any>;
      updatePricingConfiguration: (pricing: any) => Promise<any>;
      
      // Limits configuration
      getLimitsConfiguration: () => Promise<any>;
      updateLimitsConfiguration: (limits: any) => Promise<any>;
    };
  }
}