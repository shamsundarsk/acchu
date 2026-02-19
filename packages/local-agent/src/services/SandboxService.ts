import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { 
  SessionId, 
  JobId, 
  FileMetadata,
  PrintOptions,
  JobStatus
} from '../types';
import { AuditLogger } from './AuditLogger';

export interface SandboxConfig {
  sandboxEngineExecutable: string;
  sandboxBaseDirectory: string;
  maxConcurrentSandboxes: number;
  sandboxTimeoutMs: number;
  enableLogging: boolean;
}

export interface SandboxInstance {
  id: string;
  sessionId: SessionId;
  jobId: JobId;
  process: ChildProcess;
  status: 'creating' | 'active' | 'printing' | 'completed' | 'failed' | 'terminated';
  createdAt: Date;
  sandboxDirectory: string;
  files: FileMetadata[];
  printOptions: PrintOptions;
}

export interface SandboxResult {
  success: boolean;
  sandboxId?: string;
  error?: string;
  printResult?: {
    jobId: JobId;
    status: JobStatus;
    message?: string;
  };
}

/**
 * SandboxService manages isolated sandbox environments for secure print job execution
 * Requirements: 7.1 - Sandbox isolation for print jobs
 * Requirements: 7.2 - Secure file handling in isolated environment
 */
export class SandboxService extends EventEmitter {
  private config: SandboxConfig;
  private auditLogger?: AuditLogger;
  private activeSandboxes = new Map<string, SandboxInstance>();
  private sandboxCounter = 0;

  constructor(config: SandboxConfig, auditLogger?: AuditLogger) {
    super();
    this.config = config;
    this.auditLogger = auditLogger;
  }

  /**
   * Create and initialize a new sandbox for a print job
   */
  async createSandbox(
    sessionId: SessionId, 
    jobId: JobId, 
    files: FileMetadata[], 
    printOptions: PrintOptions
  ): Promise<SandboxResult> {
    try {
      // Check concurrent sandbox limit
      if (this.activeSandboxes.size >= this.config.maxConcurrentSandboxes) {
        return {
          success: false,
          error: 'Maximum concurrent sandboxes reached'
        };
      }

      const sandboxId = `sandbox-${++this.sandboxCounter}-${Date.now()}`;
      const sandboxDirectory = path.join(this.config.sandboxBaseDirectory, sandboxId);

      console.log(`Creating sandbox ${sandboxId} for session ${sessionId}, job ${jobId}`);

      // Create sandbox directory
      await fs.mkdir(sandboxDirectory, { recursive: true });

      // Copy files to sandbox directory
      const sandboxFiles: FileMetadata[] = [];
      for (const file of files) {
        const sandboxFilePath = path.join(sandboxDirectory, file.originalName);
        await fs.copyFile(file.localPath, sandboxFilePath);
        
        sandboxFiles.push({
          ...file,
          localPath: sandboxFilePath
        });
      }

      // Create sandbox configuration
      const sandboxConfig = {
        sessionId,
        jobId,
        files: sandboxFiles.map(f => ({
          name: f.originalName,
          path: f.localPath,
          size: f.size,
          type: f.mimeType
        })),
        printOptions,
        outputDirectory: sandboxDirectory,
        logFile: path.join(sandboxDirectory, 'sandbox.log')
      };

      const configPath = path.join(sandboxDirectory, 'sandbox-config.json');
      await fs.writeFile(configPath, JSON.stringify(sandboxConfig, null, 2));

      // Start AcchuSandboxEngine process
      const sandboxProcess = spawn(this.config.sandboxEngineExecutable, [
        '--session-id', sessionId,
        '--job-id', jobId,
        '--config', configPath,
        '--sandbox-dir', sandboxDirectory
      ], {
        cwd: sandboxDirectory,
        stdio: this.config.enableLogging ? ['pipe', 'pipe', 'pipe'] : 'ignore'
      });

      const sandbox: SandboxInstance = {
        id: sandboxId,
        sessionId,
        jobId,
        process: sandboxProcess,
        status: 'creating',
        createdAt: new Date(),
        sandboxDirectory,
        files: sandboxFiles,
        printOptions
      };

      this.activeSandboxes.set(sandboxId, sandbox);

      // Set up process event handlers
      this.setupSandboxProcessHandlers(sandbox);

      // Set timeout for sandbox creation
      setTimeout(() => {
        if (sandbox.status === 'creating') {
          this.terminateSandbox(sandboxId, 'Sandbox creation timeout');
        }
      }, this.config.sandboxTimeoutMs);

      // Log audit event
      if (this.auditLogger) {
        await this.auditLogger.logSessionEvent(sessionId, 'SANDBOX_CREATED' as any, {
          sandboxId,
          jobId,
          fileCount: files.length,
          sandboxDirectory
        });
      }

      this.emit('sandboxCreated', { sandboxId, sessionId, jobId });

      return {
        success: true,
        sandboxId
      };

    } catch (error) {
      console.error('Error creating sandbox:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create sandbox'
      };
    }
  }

  /**
   * Execute print job in sandbox
   */
  async executePrintInSandbox(sandboxId: string): Promise<SandboxResult> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        error: 'Sandbox not found'
      };
    }

    if (sandbox.status !== 'active') {
      return {
        success: false,
        error: `Sandbox is not active (status: ${sandbox.status})`
      };
    }

    try {
      console.log(`Executing print job in sandbox ${sandboxId}`);
      
      sandbox.status = 'printing';
      this.emit('sandboxPrinting', { sandboxId, sessionId: sandbox.sessionId, jobId: sandbox.jobId });

      // Send print command to sandbox process
      if (sandbox.process.stdin) {
        const printCommand = {
          action: 'print',
          files: sandbox.files.map(f => f.localPath),
          options: sandbox.printOptions
        };
        
        sandbox.process.stdin.write(JSON.stringify(printCommand) + '\n');
      }

      // Log audit event
      if (this.auditLogger) {
        await this.auditLogger.logSessionEvent(sandbox.sessionId, 'PRINT_EXECUTED' as any, {
          sandboxId,
          jobId: sandbox.jobId,
          fileCount: sandbox.files.length
        });
      }

      return {
        success: true,
        sandboxId,
        printResult: {
          jobId: sandbox.jobId,
          status: JobStatus.PRINTING,
          message: 'Print job started in sandbox'
        }
      };

    } catch (error) {
      console.error('Error executing print in sandbox:', error);
      sandbox.status = 'failed';
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute print in sandbox'
      };
    }
  }

  /**
   * Get sandbox status
   */
  getSandboxStatus(sandboxId: string): SandboxInstance | null {
    return this.activeSandboxes.get(sandboxId) || null;
  }

  /**
   * Get all active sandboxes
   */
  getActiveSandboxes(): SandboxInstance[] {
    return Array.from(this.activeSandboxes.values());
  }

  /**
   * Terminate a sandbox
   */
  async terminateSandbox(sandboxId: string, reason?: string): Promise<boolean> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      return false;
    }

    try {
      console.log(`Terminating sandbox ${sandboxId}${reason ? `: ${reason}` : ''}`);
      
      sandbox.status = 'terminated';
      
      // Kill the sandbox process
      if (sandbox.process && !sandbox.process.killed) {
        sandbox.process.kill('SIGTERM');
        
        // Force kill after 5 seconds if still running
        setTimeout(() => {
          if (!sandbox.process.killed) {
            sandbox.process.kill('SIGKILL');
          }
        }, 5000);
      }

      // Clean up sandbox directory after a delay
      setTimeout(async () => {
        try {
          await fs.rm(sandbox.sandboxDirectory, { recursive: true, force: true });
          console.log(`Cleaned up sandbox directory: ${sandbox.sandboxDirectory}`);
        } catch (error) {
          console.error('Error cleaning up sandbox directory:', error);
        }
      }, 10000); // 10 second delay to allow for any final operations

      // Log audit event
      if (this.auditLogger) {
        await this.auditLogger.logSessionEvent(sandbox.sessionId, 'SANDBOX_TERMINATED' as any, {
          sandboxId,
          jobId: sandbox.jobId,
          reason: reason || 'Manual termination',
          duration: Date.now() - sandbox.createdAt.getTime()
        });
      }

      this.activeSandboxes.delete(sandboxId);
      this.emit('sandboxTerminated', { sandboxId, sessionId: sandbox.sessionId, jobId: sandbox.jobId, reason });

      return true;

    } catch (error) {
      console.error('Error terminating sandbox:', error);
      return false;
    }
  }

  /**
   * Set up event handlers for sandbox process
   */
  private setupSandboxProcessHandlers(sandbox: SandboxInstance): void {
    const { process: sandboxProcess, id: sandboxId } = sandbox;

    sandboxProcess.on('spawn', () => {
      console.log(`Sandbox process spawned for ${sandboxId}`);
      sandbox.status = 'active';
      this.emit('sandboxActive', { sandboxId, sessionId: sandbox.sessionId, jobId: sandbox.jobId });
    });

    sandboxProcess.on('error', (error) => {
      console.error(`Sandbox process error for ${sandboxId}:`, error);
      sandbox.status = 'failed';
      this.emit('sandboxError', { sandboxId, sessionId: sandbox.sessionId, jobId: sandbox.jobId, error: error.message });
    });

    sandboxProcess.on('exit', (code, signal) => {
      console.log(`Sandbox process exited for ${sandboxId} with code ${code}, signal ${signal}`);
      
      if (code === 0) {
        sandbox.status = 'completed';
        this.emit('sandboxCompleted', { sandboxId, sessionId: sandbox.sessionId, jobId: sandbox.jobId });
      } else {
        sandbox.status = 'failed';
        this.emit('sandboxFailed', { sandboxId, sessionId: sandbox.sessionId, jobId: sandbox.jobId, code, signal });
      }

      // Clean up after a delay
      setTimeout(() => {
        this.terminateSandbox(sandboxId, `Process exited with code ${code}`);
      }, 5000);
    });

    // Handle stdout/stderr if logging is enabled
    if (this.config.enableLogging) {
      sandboxProcess.stdout?.on('data', (data) => {
        console.log(`[Sandbox ${sandboxId}] ${data.toString().trim()}`);
        this.emit('sandboxOutput', { sandboxId, type: 'stdout', data: data.toString() });
      });

      sandboxProcess.stderr?.on('data', (data) => {
        console.error(`[Sandbox ${sandboxId}] ${data.toString().trim()}`);
        this.emit('sandboxOutput', { sandboxId, type: 'stderr', data: data.toString() });
      });
    }
  }

  /**
   * Cleanup all active sandboxes (called on shutdown)
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up all active sandboxes...');
    
    const cleanupPromises = Array.from(this.activeSandboxes.keys()).map(sandboxId => 
      this.terminateSandbox(sandboxId, 'Service shutdown')
    );

    await Promise.all(cleanupPromises);
    console.log('All sandboxes cleaned up');
  }
}