import { 
  JobId, 
  SessionId, 
  PrintOptions, 
  PrintResult, 
  PrinterStatus, 
  PrintJob,
  JobStatus,
  FileMetadata,
  PriceBreakdown,
  SessionValidator
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: PrinterStatus;
  location?: string;
  comment?: string;
}

export interface PrintManagerConfig {
  defaultPrinter?: string;
  maxConcurrentJobs?: number;
  printTimeout?: number; // milliseconds
  retryAttempts?: number;
}

export interface PrintProgress {
  jobId: JobId;
  status: JobStatus;
  progress: number; // 0-100
  message?: string;
  error?: string;
}

/**
 * PrintManager handles print job execution, printer detection, and Windows Print Spooler integration
 * Requirements: 6.2, 6.3, 10.4
 */
export class PrintManager {
  private printQueue: Map<JobId, PrintJob> = new Map();
  private printProgress: Map<JobId, PrintProgress> = new Map();
  private activePrintJobs: Set<JobId> = new Set();
  private config: PrintManagerConfig;
  private availablePrinters: Map<string, PrinterInfo> = new Map();
  private defaultPrinter: string | null = null;

  constructor(config: PrintManagerConfig = {}) {
    this.config = {
      maxConcurrentJobs: 3,
      printTimeout: 300000, // 5 minutes
      retryAttempts: 2,
      ...config
    };

    // Initialize printer detection
    this.detectPrinters();
  }

  /**
   * Detects available printers and their status
   * Requirements: 10.4 - Add printer detection and configuration
   */
  async detectPrinters(): Promise<PrinterInfo[]> {
    try {
      console.log('Detecting available printers...');
      
      // Use PowerShell to get printer information on Windows
      const command = `Get-Printer | Select-Object Name, PrinterStatus, Location, Comment, @{Name="IsDefault";Expression={$_.Name -eq (Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Default=$true").Name}} | ConvertTo-Json`;
      
      const { stdout } = await execAsync(`powershell -Command "${command}"`);
      const printers = JSON.parse(stdout);
      
      this.availablePrinters.clear();
      
      const printerList: any[] = Array.isArray(printers) ? printers : [printers];
      
      for (const printer of printerList) {
        const printerInfo: PrinterInfo = {
          name: printer.Name || printer.name,
          isDefault: printer.IsDefault || printer.isDefault || false,
          status: this.mapPrinterStatus(printer.PrinterStatus || printer.status),
          location: printer.Location || printer.location,
          comment: printer.Comment || printer.comment
        };
        
        this.availablePrinters.set(printerInfo.name, printerInfo);
        
        if (printerInfo.isDefault) {
          this.defaultPrinter = printerInfo.name;
        }
      }
      
      // If no default printer found but we have printers, use the first one
      if (!this.defaultPrinter && printerList.length > 0) {
        this.defaultPrinter = printerList[0].Name || printerList[0].name;
      }
      
      // Use configured default printer if specified
      if (this.config.defaultPrinter && this.availablePrinters.has(this.config.defaultPrinter)) {
        this.defaultPrinter = this.config.defaultPrinter;
      }
      
      console.log(`Detected ${printerList.length} printers, default: ${this.defaultPrinter}`);
      return printerList;
      
    } catch (error) {
      console.error('Failed to detect printers:', error);
      return [];
    }
  }

  /**
   * Maps Windows printer status to our PrinterStatus enum
   */
  private mapPrinterStatus(windowsStatus: number): PrinterStatus {
    // Windows printer status codes
    switch (windowsStatus) {
      case 0: // Ready
        return PrinterStatus.ONLINE;
      case 1: // Paused
      case 2: // Error
      case 3: // Pending Deletion
      case 4: // Paper Jam
      case 5: // Paper Out
      case 6: // Manual Feed
      case 7: // Paper Problem
        return PrinterStatus.ERROR;
      case 8: // Offline
        return PrinterStatus.OFFLINE;
      case 9: // I/O Active
      case 10: // Busy
        return PrinterStatus.BUSY;
      default:
        return PrinterStatus.OFFLINE;
    }
  }

  /**
   * Queues a print job for execution
   * Requirements: 6.2 - Create print job queuing and status tracking
   */
  async queuePrintJob(
    sessionId: SessionId, 
    files: FileMetadata[], 
    options: PrintOptions, 
    pricing: PriceBreakdown
  ): Promise<JobId> {
    // Validate print options
    const validation = SessionValidator.validatePrintOptions(options);
    if (!validation.isValid) {
      throw new Error(`Invalid print options: ${validation.errors.join(', ')}`);
    }

    // Check if we have available printers
    if (this.availablePrinters.size === 0) {
      await this.detectPrinters();
      if (this.availablePrinters.size === 0) {
        throw new Error('No printers available');
      }
    }

    // Check printer status
    const printerStatus = this.getPrinterStatus();
    if (printerStatus === PrinterStatus.OFFLINE || printerStatus === PrinterStatus.ERROR) {
      throw new Error(`Printer is ${printerStatus.toLowerCase()}`);
    }

    const jobId = uuidv4();
    const fileIds = files.map(f => f.id);
    
    const printJob: PrintJob = {
      id: jobId,
      sessionId,
      files: fileIds,
      options,
      pricing,
      status: JobStatus.QUEUED,
      createdAt: new Date()
    };

    // Validate the print job
    const jobValidation = SessionValidator.validatePrintJob(printJob);
    if (!jobValidation.isValid) {
      throw new Error(`Invalid print job: ${jobValidation.errors.join(', ')}`);
    }

    this.printQueue.set(jobId, printJob);
    
    // Initialize progress tracking
    this.printProgress.set(jobId, {
      jobId,
      status: JobStatus.QUEUED,
      progress: 0,
      message: 'Print job queued'
    });

    console.log(`Queued print job ${jobId} for session ${sessionId} with ${files.length} files`);
    return jobId;
  }

  /**
   * Executes a print job using Windows Print Spooler
   * Requirements: 6.2 - Send job to printer immediately, 6.3 - Print progress monitoring
   */
  async executePrintJob(jobId: JobId, sessionFilesDirectory: string): Promise<PrintResult> {
    const job = this.printQueue.get(jobId);
    if (!job) {
      return {
        success: false,
        error: 'Print job not found'
      };
    }

    // Check if already executing
    if (this.activePrintJobs.has(jobId)) {
      return {
        success: false,
        jobId,
        error: 'Print job already executing'
      };
    }

    // Check concurrent job limit
    if (this.activePrintJobs.size >= this.config.maxConcurrentJobs!) {
      return {
        success: false,
        jobId,
        error: 'Maximum concurrent print jobs reached'
      };
    }

    // Check printer status
    const printerStatus = this.getPrinterStatus();
    if (printerStatus !== PrinterStatus.ONLINE) {
      return {
        success: false,
        jobId,
        error: `Printer is ${printerStatus.toLowerCase()}`
      };
    }

    this.activePrintJobs.add(jobId);
    
    try {
      // Update job status
      job.status = JobStatus.PRINTING;
      job.executedAt = new Date();
      
      this.updateProgress(jobId, JobStatus.PRINTING, 10, 'Starting print job...');

      // Get file paths for printing
      const filePaths: string[] = [];
      for (const fileId of job.files) {
        const filePath = path.join(sessionFilesDirectory, `${fileId}.*`);
        
        // Find the actual file (since we don't know the extension)
        try {
          const files = await fs.readdir(sessionFilesDirectory);
          const matchingFile = files.find(f => f.startsWith(fileId));
          if (matchingFile) {
            filePaths.push(path.join(sessionFilesDirectory, matchingFile));
          } else {
            throw new Error(`File ${fileId} not found in session directory`);
          }
        } catch (error) {
          throw new Error(`Failed to locate file ${fileId}: ${error}`);
        }
      }

      this.updateProgress(jobId, JobStatus.PRINTING, 30, 'Preparing files for printing...');

      // Execute print for each file
      let completedFiles = 0;
      for (const filePath of filePaths) {
        await this.printFile(filePath, job.options);
        completedFiles++;
        
        const progress = 30 + (completedFiles / filePaths.length) * 60;
        this.updateProgress(jobId, JobStatus.PRINTING, progress, `Printed ${completedFiles}/${filePaths.length} files`);
      }

      // Mark job as completed
      job.status = JobStatus.COMPLETED;
      this.updateProgress(jobId, JobStatus.COMPLETED, 100, 'Print job completed successfully');

      console.log(`Print job ${jobId} completed successfully`);
      
      return {
        success: true,
        jobId
      };

    } catch (error) {
      // Mark job as failed
      job.status = JobStatus.FAILED;
      const errorMessage = error instanceof Error ? error.message : 'Unknown print error';
      
      this.updateProgress(jobId, JobStatus.FAILED, 0, `Print failed: ${errorMessage}`, errorMessage);
      
      console.error(`Print job ${jobId} failed:`, error);
      
      return {
        success: false,
        jobId,
        error: errorMessage
      };
    } finally {
      this.activePrintJobs.delete(jobId);
    }
  }

  /**
   * Prints a single file using Windows Print Spooler
   */
  private async printFile(filePath: string, options: PrintOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build print command based on file type
      const ext = path.extname(filePath).toLowerCase();
      let printCommand: string;

      if (ext === '.pdf') {
        // Use SumatraPDF for PDF printing (commonly available)
        printCommand = `SumatraPDF.exe -print-to "${this.defaultPrinter}" -print-settings "${options.copies}x,${options.duplex ? 'duplex' : 'simplex'}" "${filePath}"`;
      } else if (ext === '.doc' || ext === '.docx') {
        // Use Microsoft Word for document printing
        printCommand = `powershell -Command "& {$word = New-Object -ComObject Word.Application; $doc = $word.Documents.Open('${filePath}'); $doc.PrintOut([ref]${options.copies}, [ref]$false, [ref]0, [ref]'${this.defaultPrinter}'); $doc.Close(); $word.Quit()}"`;
      } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') {
        // Use Windows Photo Viewer or default image viewer
        printCommand = `rundll32.exe shimgvw.dll,ImageView_PrintTo "${filePath}" "${this.defaultPrinter}"`;
      } else {
        // Fallback: use default Windows print command
        printCommand = `powershell -Command "Start-Process -FilePath '${filePath}' -Verb Print -WindowStyle Hidden"`;
      }

      console.log(`Executing print command: ${printCommand}`);

      const printProcess = exec(printCommand, { timeout: this.config.printTimeout });

      printProcess.on('exit', (code) => {
        if (code === 0) {
          console.log(`Successfully printed file: ${filePath}`);
          resolve();
        } else {
          reject(new Error(`Print command failed with exit code ${code}`));
        }
      });

      printProcess.on('error', (error) => {
        console.error(`Print process error for ${filePath}:`, error);
        reject(error);
      });

      // Set timeout
      setTimeout(() => {
        printProcess.kill();
        reject(new Error('Print operation timed out'));
      }, this.config.printTimeout!);
    });
  }

  /**
   * Updates print progress for a job
   */
  private updateProgress(
    jobId: JobId, 
    status: JobStatus, 
    progress: number, 
    message?: string, 
    error?: string
  ): void {
    this.printProgress.set(jobId, {
      jobId,
      status,
      progress: Math.min(100, Math.max(0, progress)),
      message,
      error
    });
  }

  /**
   * Gets print progress for a job
   * Requirements: 6.3 - Print progress monitoring and reporting
   */
  getPrintProgress(jobId: JobId): PrintProgress | null {
    return this.printProgress.get(jobId) || null;
  }

  /**
   * Gets all print jobs for a session
   */
  getSessionPrintJobs(sessionId: SessionId): PrintJob[] {
    const jobs: PrintJob[] = [];
    for (const job of this.printQueue.values()) {
      if (job.sessionId === sessionId) {
        jobs.push({ ...job }); // Return copy
      }
    }
    return jobs;
  }

  /**
   * Gets current printer status
   * Requirements: 6.3 - Printer detection and configuration
   */
  getPrinterStatus(): PrinterStatus {
    if (!this.defaultPrinter || !this.availablePrinters.has(this.defaultPrinter)) {
      return PrinterStatus.OFFLINE;
    }

    const printerInfo = this.availablePrinters.get(this.defaultPrinter);
    return printerInfo?.status || PrinterStatus.OFFLINE;
  }

  /**
   * Gets information about the current default printer
   */
  getDefaultPrinter(): PrinterInfo | null {
    if (!this.defaultPrinter) {
      return null;
    }
    return this.availablePrinters.get(this.defaultPrinter) || null;
  }

  /**
   * Gets all available printers
   */
  getAvailablePrinters(): PrinterInfo[] {
    return Array.from(this.availablePrinters.values());
  }

  /**
   * Sets the default printer
   */
  async setDefaultPrinter(printerName: string): Promise<boolean> {
    if (!this.availablePrinters.has(printerName)) {
      return false;
    }

    try {
      // Set as Windows default printer
      await execAsync(`powershell -Command "(Get-WmiObject -ComputerName . -Class Win32_Printer -Filter 'Name=\\"${printerName}\\"').SetDefaultPrinter()"`);
      
      this.defaultPrinter = printerName;
      console.log(`Set default printer to: ${printerName}`);
      return true;
    } catch (error) {
      console.error(`Failed to set default printer to ${printerName}:`, error);
      return false;
    }
  }

  /**
   * Retries a failed print job
   * Requirements: 6.5 - Handle print failures with retry mechanisms
   */
  async retryPrintJob(jobId: JobId, sessionFilesDirectory: string): Promise<PrintResult> {
    const job = this.printQueue.get(jobId);
    if (!job) {
      return {
        success: false,
        error: 'Print job not found'
      };
    }

    if (job.status !== JobStatus.FAILED) {
      return {
        success: false,
        jobId,
        error: 'Only failed jobs can be retried'
      };
    }

    // Reset job status
    job.status = JobStatus.QUEUED;
    this.updateProgress(jobId, JobStatus.QUEUED, 0, 'Retrying print job...');

    console.log(`Retrying print job ${jobId}`);
    return this.executePrintJob(jobId, sessionFilesDirectory);
  }

  /**
   * Cancels a print job
   */
  async cancelPrintJob(jobId: JobId): Promise<boolean> {
    const job = this.printQueue.get(jobId);
    if (!job) {
      return false;
    }

    if (job.status === JobStatus.COMPLETED) {
      return false; // Cannot cancel completed jobs
    }

    if (this.activePrintJobs.has(jobId)) {
      // Job is currently printing, attempt to cancel
      try {
        // This is a simplified cancellation - in a real implementation,
        // you would need to track the actual print process and kill it
        this.activePrintJobs.delete(jobId);
      } catch (error) {
        console.error(`Failed to cancel active print job ${jobId}:`, error);
        return false;
      }
    }

    job.status = JobStatus.FAILED;
    this.updateProgress(jobId, JobStatus.FAILED, 0, 'Print job cancelled', 'Cancelled by user');
    
    console.log(`Cancelled print job ${jobId}`);
    return true;
  }

  /**
   * Cleans up completed and failed print jobs for a session
   */
  cleanupSessionJobs(sessionId: SessionId): void {
    const jobsToRemove: JobId[] = [];
    
    for (const [jobId, job] of this.printQueue.entries()) {
      if (job.sessionId === sessionId && 
          (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED)) {
        jobsToRemove.push(jobId);
      }
    }

    for (const jobId of jobsToRemove) {
      this.printQueue.delete(jobId);
      this.printProgress.delete(jobId);
    }

    if (jobsToRemove.length > 0) {
      console.log(`Cleaned up ${jobsToRemove.length} print jobs for session ${sessionId}`);
    }
  }

  /**
   * Gets print queue status
   */
  getQueueStatus(): {
    totalJobs: number;
    queuedJobs: number;
    printingJobs: number;
    completedJobs: number;
    failedJobs: number;
  } {
    let queued = 0, printing = 0, completed = 0, failed = 0;
    
    for (const job of this.printQueue.values()) {
      switch (job.status) {
        case JobStatus.QUEUED:
          queued++;
          break;
        case JobStatus.PRINTING:
          printing++;
          break;
        case JobStatus.COMPLETED:
          completed++;
          break;
        case JobStatus.FAILED:
          failed++;
          break;
      }
    }

    return {
      totalJobs: this.printQueue.size,
      queuedJobs: queued,
      printingJobs: printing,
      completedJobs: completed,
      failedJobs: failed
    };
  }

  /**
   * Refreshes printer status
   */
  async refreshPrinterStatus(): Promise<void> {
    await this.detectPrinters();
  }

  /**
   * Shuts down the print manager
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down PrintManager...');
    
    // Cancel all active print jobs
    for (const jobId of this.activePrintJobs) {
      await this.cancelPrintJob(jobId);
    }

    // Clear all data
    this.printQueue.clear();
    this.printProgress.clear();
    this.activePrintJobs.clear();
    this.availablePrinters.clear();

    console.log('PrintManager shutdown complete');
  }
}