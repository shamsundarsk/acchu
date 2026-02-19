import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { SessionManager } from './services/SessionManager';
import { FileHandler } from './services/FileHandler';
import { PrintManager } from './services/PrintManager';
import { ConfigurationManager } from './services/ConfigurationManager';
import { AuditLogger } from './services/AuditLogger';

class LocalAgentApp {
  private mainWindow: BrowserWindow | null = null;
  private sessionManager: SessionManager;
  private fileHandler: FileHandler;
  private printManager: PrintManager;
  private configurationManager: ConfigurationManager;
  private auditLogger: AuditLogger;

  constructor() {
    // Initialize audit logger first
    this.auditLogger = new AuditLogger({
      logDirectory: './logs',
      retentionDays: 30
    });

    // Initialize configuration manager
    this.configurationManager = new ConfigurationManager({
      auditLogger: this.auditLogger,
      enableAutoSave: true,
      validationEnabled: true
    });

    // Initialize other services (will be configured after config manager is ready)
    this.sessionManager = new SessionManager({
      shopId: 'default-shop', // Will be updated from configuration
      sessionTimeoutMinutes: 30,
      auditLogger: this.auditLogger
    });
    this.fileHandler = new FileHandler();
    this.printManager = new PrintManager({
      defaultPrinter: '',
      maxConcurrentJobs: 5,
      printTimeout: 30000
    });
  }

  async initialize() {
    await app.whenReady();

    // Initialize configuration manager first
    await this.configurationManager.initialize();

    // Update services with configuration
    await this.updateServicesWithConfiguration();

    // Set up configuration change listener
    this.configurationManager.on('configurationChanged', async (event) => {
      console.log('Configuration changed, updating services...');
      await this.updateServicesWithConfiguration();
    });

    this.createWindow();
    this.setupIpcHandlers();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Cleanup orphaned sessions on startup
    await this.sessionManager.cleanupOrphanedSessions();
  }

  private async updateServicesWithConfiguration() {
    const config = this.configurationManager.getConfiguration();
    
    // Update session manager configuration
    // Note: In a real implementation, you might need to recreate the session manager
    // or add methods to update its configuration dynamically
    
    // Update print manager with default printer
    if (config.printer.defaultPrinter) {
      await this.printManager.setDefaultPrinter(config.printer.defaultPrinter);
    }

    console.log('Services updated with new configuration');
  }

  private createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js'),
      },
      title: 'ACCHU Local Agent',
      icon: join(__dirname, '../assets/icon.png'),
    });

    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:5173');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(join(__dirname, 'renderer/index.html'));
    }
  }

  private setupIpcHandlers() {
    // Session management handlers
    ipcMain.handle('session:create', async () => {
      return this.sessionManager.createSession();
    });

    ipcMain.handle('session:get-status', async (_, sessionId: string) => {
      return this.sessionManager.getSessionStatus(sessionId);
    });

    ipcMain.handle('session:terminate', async (_, sessionId: string) => {
      return this.sessionManager.terminateSession(sessionId);
    });

    // File handling handlers
    ipcMain.handle('file:receive', async (_, sessionId: string, fileData: any) => {
      return this.fileHandler.receiveFile(sessionId, fileData);
    });

    ipcMain.handle('file:validate', async (_, fileData: any) => {
      return this.fileHandler.validateFile(fileData);
    });

    // Print management handlers
    ipcMain.handle('print:queue-job', async (_, sessionId: string, options: any) => {
      // This would need to be implemented properly with file metadata and pricing
      // For now, return a mock response
      return { success: true, jobId: 'mock-job-id' };
    });

    ipcMain.handle('print:execute-job', async (_, jobId: string) => {
      try {
        const sessionId = 'current-session'; // This should be tracked properly
        const sessionDir = this.sessionManager.getSessionDirectory(sessionId);
        if (!sessionDir) {
          return { success: false, error: 'Session directory not found' };
        }
        
        const result = await this.printManager.executePrintJob(jobId, sessionDir);
        return result;
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    });

    ipcMain.handle('print:get-status', async () => {
      return this.printManager.getPrinterStatus();
    });

    ipcMain.handle('print:get-all-jobs', async () => {
      return this.printManager.getAllPrintJobs();
    });

    ipcMain.handle('print:get-progress', async (_, jobId: string) => {
      return this.printManager.getPrintProgress(jobId);
    });

    // Configuration management handlers
    ipcMain.handle('config:get', async () => {
      return this.configurationManager.getConfiguration();
    });

    ipcMain.handle('config:update', async (_, updates: any) => {
      return this.configurationManager.updateConfiguration(updates);
    });

    ipcMain.handle('config:validate', async (_, config: any) => {
      return this.configurationManager.validateConfiguration(config);
    });

    ipcMain.handle('config:reset-defaults', async () => {
      return this.configurationManager.resetToDefaults();
    });

    ipcMain.handle('config:export', async (_, filePath: string) => {
      return this.configurationManager.exportConfiguration(filePath);
    });

    ipcMain.handle('config:import', async (_, filePath: string) => {
      return this.configurationManager.importConfiguration(filePath);
    });

    // QR Code handlers
    ipcMain.handle('qr:generate', async (_, sessionId: string) => {
      const qrCodeData = this.sessionManager.getSessionQRCode(sessionId);
      return qrCodeData;
    });

    ipcMain.handle('qr:regenerate', async (_, sessionId: string) => {
      return this.sessionManager.regenerateSessionQRCode(sessionId);
    });

    // Printer management handlers
    ipcMain.handle('printer:detect', async () => {
      return this.configurationManager.detectPrinters();
    });

    ipcMain.handle('printer:get-available', async () => {
      return this.configurationManager.getAvailablePrinters();
    });

    ipcMain.handle('printer:set-default', async (_, printerName: string) => {
      return this.configurationManager.setDefaultPrinter(printerName);
    });

    // Pricing configuration handlers
    ipcMain.handle('config:get-pricing', async () => {
      return this.configurationManager.getPricingConfiguration();
    });

    ipcMain.handle('config:update-pricing', async (_, pricing: any) => {
      return this.configurationManager.updatePricingConfiguration(pricing);
    });

    // Limits configuration handlers
    ipcMain.handle('config:get-limits', async () => {
      return this.configurationManager.getLimitsConfiguration();
    });

    ipcMain.handle('config:update-limits', async (_, limits: any) => {
      return this.configurationManager.updateLimitsConfiguration(limits);
    });
  }
}

// Initialize the application
const localAgent = new LocalAgentApp();
localAgent.initialize().catch(console.error);