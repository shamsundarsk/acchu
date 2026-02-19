import { FileData, FileId, SessionId, ValidationResult, FileMetadata, AuditEventType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PDFDocument } from 'pdf-lib';
import { WindowsSecureDeletion } from './WindowsSecureDeletion';
import { AuditLogger } from './AuditLogger';

export class FileHandler {
  private readonly tempDir = path.join(os.tmpdir(), 'acchu-sessions');
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly supportedFormats = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ];
  private readonly auditLogger?: AuditLogger;

  constructor(auditLogger?: AuditLogger) {
    this.auditLogger = auditLogger;
    // Ensure base temp directory exists
    this.ensureBaseTempDirectory();
  }

  private async ensureBaseTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create base temp directory:', error);
      throw new Error('Failed to initialize file handler');
    }
  }

  /**
   * Creates session-specific directory structure
   */
  async createSessionDirectory(sessionId: SessionId): Promise<string> {
    const sessionDir = path.join(this.tempDir, sessionId);
    const filesDir = path.join(sessionDir, 'files');
    
    try {
      await fs.mkdir(filesDir, { recursive: true });
      
      // Create metadata file for the session
      const metadataPath = path.join(sessionDir, 'metadata.json');
      const initialMetadata = {
        sessionId,
        createdAt: new Date().toISOString(),
        files: []
      };
      await fs.writeFile(metadataPath, JSON.stringify(initialMetadata, null, 2));
      
      return sessionDir;
    } catch (error) {
      console.error(`Failed to create session directory for ${sessionId}:`, error);
      throw new Error(`Failed to create session directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async receiveFile(sessionId: SessionId, fileData: FileData): Promise<FileId> {
    // Validate file first
    const validation = this.validateFile(fileData);
    if (!validation.isValid) {
      throw new Error(`File validation failed: ${validation.errors.join(', ')}`);
    }

    const fileId = uuidv4();
    const sessionDir = path.join(this.tempDir, sessionId);
    const filesDir = path.join(sessionDir, 'files');
    
    // Ensure session directory exists
    await fs.mkdir(filesDir, { recursive: true });

    // Determine file extension
    const ext = this.getFileExtension(fileData.metadata.mimeType);
    const filePath = path.join(filesDir, `${fileId}${ext}`);

    try {
      // Write file to disk
      await fs.writeFile(filePath, fileData.buffer);

      // Extract metadata (page count for documents, dimensions for images)
      const extractedMetadata = await this.extractFileMetadata(filePath, fileData.metadata);

      // Update metadata with local path and extracted info
      const updatedMetadata: FileMetadata = {
        ...fileData.metadata,
        id: fileId,
        localPath: filePath,
        uploadedAt: new Date(),
        ...extractedMetadata
      };

      // Store metadata in session metadata file
      await this.updateSessionMetadata(sessionId, updatedMetadata);

      // Log file upload event
      if (this.auditLogger) {
        await this.auditLogger.logSessionEvent(sessionId, AuditEventType.FILE_UPLOADED, {
          fileId,
          fileSize: fileData.metadata.size,
          mimeType: fileData.metadata.mimeType,
          pageCount: extractedMetadata.pageCount || 1
        });
      }

      return fileId;
    } catch (error) {
      // Clean up file if metadata storage fails
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error('Failed to cleanup file after error:', cleanupError);
      }
      
      console.error(`Failed to receive file for session ${sessionId}:`, error);
      throw new Error(`Failed to store file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  validateFile(fileData: FileData): ValidationResult {
    const errors: string[] = [];

    // Check if file data exists
    if (!fileData) {
      errors.push('File data is required');
      return { isValid: false, errors };
    }

    // Check if metadata exists
    if (!fileData.metadata) {
      errors.push('File metadata is required');
      return { isValid: false, errors };
    }

    // Check file size
    if (fileData.metadata.size > this.maxFileSize) {
      errors.push(`File size ${fileData.metadata.size} exceeds maximum ${this.maxFileSize} bytes (10MB)`);
    }

    if (fileData.metadata.size <= 0) {
      errors.push('File size must be greater than 0');
    }

    // Check MIME type
    if (!fileData.metadata.mimeType) {
      errors.push('File MIME type is required');
    } else if (!this.supportedFormats.includes(fileData.metadata.mimeType)) {
      errors.push(`Unsupported file format: ${fileData.metadata.mimeType}. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    // Check original file name
    if (!fileData.metadata.originalName || fileData.metadata.originalName.trim() === '') {
      errors.push('Original file name is required');
    }

    // Check for potentially dangerous file names
    if (fileData.metadata.originalName) {
      const dangerousChars = /[<>:"\|?*\x00-\x1f]/;
      if (dangerousChars.test(fileData.metadata.originalName)) {
        errors.push('File name contains invalid characters');
      }
    }

    // Check if buffer exists and has content
    if (!fileData.buffer || fileData.buffer.length === 0) {
      errors.push('File buffer is empty');
    }

    // Verify buffer size matches metadata
    if (fileData.buffer && fileData.buffer.length !== fileData.metadata.size) {
      errors.push(`File buffer size (${fileData.buffer.length}) does not match metadata size (${fileData.metadata.size})`);
    }

    // Validate file format by checking magic bytes
    if (fileData.buffer && fileData.buffer.length > 0) {
      const formatValidation = this.validateFileFormat(fileData.buffer, fileData.metadata.mimeType);
      if (!formatValidation.isValid) {
        errors.push(...formatValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates file format by checking magic bytes/file signatures
   */
  private validateFileFormat(buffer: Buffer, mimeType: string): ValidationResult {
    const errors: string[] = [];

    if (buffer.length < 4) {
      errors.push('File too small to validate format');
      return { isValid: false, errors };
    }

    const header = buffer.subarray(0, 8);

    switch (mimeType) {
      case 'application/pdf':
        if (!header.subarray(0, 4).equals(Buffer.from('%PDF'))) {
          errors.push('File does not appear to be a valid PDF');
        }
        break;
      
      case 'image/jpeg':
        if (!(header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF)) {
          errors.push('File does not appear to be a valid JPEG');
        }
        break;
      
      case 'image/png':
        const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        if (!header.equals(pngSignature)) {
          errors.push('File does not appear to be a valid PNG');
        }
        break;
      
      case 'application/msword':
        // DOC files start with D0CF11E0A1B11AE1 (OLE compound document)
        const docSignature = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
        if (!header.equals(docSignature)) {
          errors.push('File does not appear to be a valid DOC file');
        }
        break;
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        // DOCX files are ZIP archives, check for ZIP signature
        if (!(header[0] === 0x50 && header[1] === 0x4B && (header[2] === 0x03 || header[2] === 0x05 || header[2] === 0x07))) {
          errors.push('File does not appear to be a valid DOCX file');
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Extracts metadata from files (page count, dimensions, etc.)
   */
  private async extractFileMetadata(filePath: string, originalMetadata: FileMetadata): Promise<Partial<FileMetadata>> {
    const extractedData: Partial<FileMetadata> = {};

    try {
      switch (originalMetadata.mimeType) {
        case 'application/pdf':
          extractedData.pageCount = await this.extractPDFPageCount(filePath);
          break;
        
        case 'image/jpeg':
        case 'image/png':
          // For images, we could extract dimensions but it's not required for printing
          // Just set page count to 1 for images
          extractedData.pageCount = 1;
          break;
        
        case 'application/msword':
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          // For DOC/DOCX files, page count extraction is complex and would require additional libraries
          // For now, we'll estimate or set a default
          extractedData.pageCount = 1; // Default, could be enhanced later
          break;
      }
    } catch (error) {
      console.warn(`Failed to extract metadata for ${filePath}:`, error);
      // Set default page count if extraction fails
      extractedData.pageCount = 1;
    }

    return extractedData;
  }

  /**
   * Extracts page count from PDF files
   */
  private async extractPDFPageCount(filePath: string): Promise<number> {
    try {
      const pdfBuffer = await fs.readFile(filePath);
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      return pdfDoc.getPageCount();
    } catch (error) {
      console.warn(`Failed to extract PDF page count from ${filePath}:`, error);
      return 1; // Default to 1 page if extraction fails
    }
  }

  /**
   * Updates session metadata file with new file information
   */
  private async updateSessionMetadata(sessionId: SessionId, fileMetadata: FileMetadata): Promise<void> {
    const sessionDir = path.join(this.tempDir, sessionId);
    const metadataPath = path.join(sessionDir, 'metadata.json');

    try {
      let metadata: any = { sessionId, createdAt: new Date().toISOString(), files: [] };
      
      // Try to read existing metadata
      try {
        const existingData = await fs.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(existingData);
      } catch (readError) {
        // File doesn't exist or is corrupted, use default metadata
        console.warn(`Could not read existing metadata for session ${sessionId}, creating new:`, readError);
      }

      // Ensure files array exists
      if (!Array.isArray(metadata.files)) {
        metadata.files = [];
      }

      // Add or update file metadata
      const existingIndex = metadata.files.findIndex((f: any) => f.id === fileMetadata.id);
      if (existingIndex >= 0) {
        metadata.files[existingIndex] = fileMetadata;
      } else {
        metadata.files.push(fileMetadata);
      }

      // Write updated metadata
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error(`Failed to update session metadata for ${sessionId}:`, error);
      throw new Error(`Failed to update session metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retrieves file metadata for a session
   */
  async getSessionFiles(sessionId: SessionId): Promise<FileMetadata[]> {
    const sessionDir = path.join(this.tempDir, sessionId);
    const metadataPath = path.join(sessionDir, 'metadata.json');

    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);
      return metadata.files || [];
    } catch (error) {
      console.error(`Failed to get session files for ${sessionId}:`, error);
      return [];
    }
  }

  /**
   * Checks if a session directory exists
   */
  async sessionExists(sessionId: SessionId): Promise<boolean> {
    const sessionDir = path.join(this.tempDir, sessionId);
    try {
      const stats = await fs.stat(sessionDir);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  async secureDelete(sessionId: SessionId): Promise<void> {
    const sessionDir = path.join(this.tempDir, sessionId);
    
    try {
      // Check if session directory exists
      if (!(await this.sessionExists(sessionId))) {
        console.warn(`Session directory ${sessionId} does not exist, nothing to delete`);
        return;
      }

      // Use Windows-specific secure deletion if available
      await WindowsSecureDeletion.secureDeleteDirectory(sessionDir);
      
      // Verify deletion
      const stillExists = await this.sessionExists(sessionId);
      if (stillExists) {
        throw new Error(`Failed to completely remove session directory ${sessionId}`);
      }
      
      console.log(`Successfully deleted session ${sessionId}`);
    } catch (error) {
      console.error(`Failed to securely delete session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Detects and cleans up orphaned session data on startup
   */
  async cleanupOrphanedSessions(): Promise<string[]> {
    const cleanedSessions: string[] = [];
    
    try {
      // Check if base temp directory exists
      try {
        await fs.access(this.tempDir);
      } catch (error) {
        // Directory doesn't exist, nothing to clean up
        console.log('No temp directory found, nothing to clean up');
        return cleanedSessions;
      }

      console.log('Starting orphaned session cleanup...');
      const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sessionId = entry.name;
          const sessionDir = path.join(this.tempDir, sessionId);
          
          try {
            // Check if this looks like a valid session directory
            const metadataPath = path.join(sessionDir, 'metadata.json');
            
            try {
              await fs.access(metadataPath);
              // Session directory exists with metadata, consider it orphaned and clean it up
              console.log(`Found orphaned session with metadata: ${sessionId}`);
              await this.secureDelete(sessionId);
              cleanedSessions.push(sessionId);
              console.log(`Cleaned up orphaned session: ${sessionId}`);
            } catch (metadataError) {
              // No metadata file, might be a corrupted session directory
              console.warn(`Found directory without metadata, cleaning up: ${sessionId}`);
              await WindowsSecureDeletion.secureDeleteDirectory(sessionDir);
              cleanedSessions.push(sessionId);
            }
          } catch (error) {
            console.error(`Failed to cleanup orphaned session ${sessionId}:`, error);
            // Try basic deletion as fallback
            try {
              await fs.rm(sessionDir, { recursive: true, force: true });
              cleanedSessions.push(sessionId);
              console.log(`Fallback cleanup successful for ${sessionId}`);
            } catch (fallbackError) {
              console.error(`Fallback cleanup also failed for ${sessionId}:`, fallbackError);
            }
          }
        }
      }
      
      console.log(`Orphaned session cleanup completed. Cleaned ${cleanedSessions.length} sessions.`);
    } catch (error) {
      console.error('Failed to cleanup orphaned sessions:', error);
    }
    
    return cleanedSessions;
  }

  /**
   * Gets information about available secure deletion methods
   */
  async getSecureDeletionInfo(): Promise<{
    methods: any;
    tempDirStats: { totalSessions: number; totalSize: number };
  }> {
    const methods = await WindowsSecureDeletion.getAvailableMethods();
    const tempDirStats = await this.getTempDirectoryStats();
    
    return {
      methods,
      tempDirStats
    };
  }

  /**
   * Performs a test of secure deletion capabilities
   */
  async testSecureDeletion(): Promise<{ success: boolean; details: string[] }> {
    const details: string[] = [];
    let success = true;

    try {
      // Create a test file
      const testDir = path.join(this.tempDir, 'test-deletion');
      const testFile = path.join(testDir, 'test.txt');
      const testContent = 'This is a test file for secure deletion verification';

      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(testFile, testContent);
      details.push('Created test file');

      // Test secure deletion
      await WindowsSecureDeletion.secureDeleteFile(testFile);
      details.push('Performed secure deletion');

      // Verify deletion
      const deleted = await WindowsSecureDeletion.verifyDeletion(testFile);
      if (deleted) {
        details.push('Deletion verification successful');
      } else {
        success = false;
        details.push('Deletion verification failed - file still exists');
      }

      // Clean up test directory
      try {
        await fs.rmdir(testDir);
        details.push('Cleaned up test directory');
      } catch (error) {
        details.push(`Warning: Could not clean up test directory: ${error instanceof Error ? error.message : String(error)}`);
      }

    } catch (error) {
      success = false;
      details.push(`Test failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { success, details };
  }

  /**
   * Multi-pass overwrite for secure file deletion
   */
  private async multiPassOverwrite(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          await this.secureOverwriteFile(fullPath);
        } else if (entry.isDirectory()) {
          // Recursively handle subdirectories
          await this.multiPassOverwrite(fullPath);
        }
      }
    } catch (error) {
      console.error('Multi-pass overwrite failed:', error);
      throw error;
    }
  }

  /**
   * Securely overwrites a single file with multiple passes
   */
  private async secureOverwriteFile(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      // Perform 3 passes of overwriting with different patterns
      const patterns = [
        () => Buffer.alloc(fileSize, 0x00), // All zeros
        () => Buffer.alloc(fileSize, 0xFF), // All ones
        () => {
          // Random data
          const randomData = Buffer.alloc(fileSize);
          for (let i = 0; i < fileSize; i++) {
            randomData[i] = Math.floor(Math.random() * 256);
          }
          return randomData;
        }
      ];

      for (let pass = 0; pass < patterns.length; pass++) {
        const data = patterns[pass]();
        await fs.writeFile(filePath, data);
        // Force sync to ensure data is written to disk
        const fd = await fs.open(filePath, 'r+');
        await fd.sync();
        await fd.close();
      }
      
      console.log(`Securely overwritten file: ${filePath}`);
    } catch (error) {
      console.error(`Failed to securely overwrite file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Verifies that secure deletion was successful
   */
  async verifyDeletion(sessionId: SessionId): Promise<boolean> {
    try {
      const sessionDir = path.join(this.tempDir, sessionId);
      await fs.access(sessionDir);
      // If we can still access it, deletion failed
      return false;
    } catch (error) {
      // If access fails, the directory was successfully deleted
      return true;
    }
  }

  /**
   * Gets statistics about temporary directory usage
   */
  async getTempDirectoryStats(): Promise<{ totalSessions: number; totalSize: number }> {
    let totalSessions = 0;
    let totalSize = 0;

    try {
      const entries = await fs.readdir(this.tempDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          totalSessions++;
          const sessionDir = path.join(this.tempDir, entry.name);
          totalSize += await this.getDirectorySize(sessionDir);
        }
      }
    } catch (error) {
      console.error('Failed to get temp directory stats:', error);
    }

    return { totalSessions, totalSize };
  }

  /**
   * Calculates the total size of a directory
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        }
      }
    } catch (error) {
      console.error(`Failed to calculate directory size for ${dirPath}:`, error);
    }

    return totalSize;
  }

  private getFileExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'image/jpeg': '.jpg',
      'image/png': '.png'
    };

    return extensions[mimeType] || '';
  }
}