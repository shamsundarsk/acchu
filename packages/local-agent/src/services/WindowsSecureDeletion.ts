import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

/**
 * Windows-specific secure file deletion utilities
 * Uses Windows APIs and tools for enhanced security
 */
export class WindowsSecureDeletion {
  
  /**
   * Attempts to use Windows SDelete utility if available
   * Falls back to multi-pass overwriting if SDelete is not available
   */
  static async secureDeleteFile(filePath: string): Promise<void> {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Try to use SDelete first (if available)
      const sdeleteSuccess = await this.trySDelete(filePath);
      if (sdeleteSuccess) {
        return;
      }
    }
    
    // Fallback to multi-pass overwriting
    await this.multiPassOverwrite(filePath);
    
    // Delete the file
    await fs.unlink(filePath);
  }

  /**
   * Securely deletes a directory and all its contents
   */
  static async secureDeleteDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Process all files and subdirectories
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isFile()) {
          await this.secureDeleteFile(fullPath);
        } else if (entry.isDirectory()) {
          await this.secureDeleteDirectory(fullPath);
        }
      }
      
      // Remove the empty directory
      await fs.rmdir(dirPath);
    } catch (error) {
      console.error(`Failed to securely delete directory ${dirPath}:`, error);
      throw error;
    }
  }

  /**
   * Attempts to use Windows SDelete utility for secure deletion
   */
  private static async trySDelete(filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Try to run sdelete with secure deletion parameters
      // -p 3: 3 passes, -s: recurse subdirectories, -z: zero free space
      const sdelete = spawn('sdelete', ['-p', '3', '-s', '-z', '-accepteula', filePath], {
        stdio: 'pipe'
      });

      let success = false;

      sdelete.on('close', (code) => {
        success = code === 0;
        resolve(success);
      });

      sdelete.on('error', (error) => {
        console.warn('SDelete not available, falling back to manual overwrite:', error.message);
        resolve(false);
      });

      // Set a timeout to avoid hanging
      setTimeout(() => {
        sdelete.kill();
        resolve(false);
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Multi-pass overwriting with different patterns for enhanced security
   */
  private static async multiPassOverwrite(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      // Define overwrite patterns (DoD 5220.22-M standard)
      const patterns = [
        // Pass 1: All zeros
        () => Buffer.alloc(fileSize, 0x00),
        // Pass 2: All ones
        () => Buffer.alloc(fileSize, 0xFF),
        // Pass 3: Random data
        () => {
          const randomData = Buffer.alloc(fileSize);
          for (let i = 0; i < fileSize; i++) {
            randomData[i] = Math.floor(Math.random() * 256);
          }
          return randomData;
        },
        // Pass 4: Complement of random data
        () => {
          const randomData = Buffer.alloc(fileSize);
          for (let i = 0; i < fileSize; i++) {
            const randomByte = Math.floor(Math.random() * 256);
            randomData[i] = ~randomByte & 0xFF; // Bitwise complement
          }
          return randomData;
        },
        // Pass 5: Final random pass
        () => {
          const randomData = Buffer.alloc(fileSize);
          for (let i = 0; i < fileSize; i++) {
            randomData[i] = Math.floor(Math.random() * 256);
          }
          return randomData;
        }
      ];

      // Perform multiple overwrite passes
      for (let pass = 0; pass < patterns.length; pass++) {
        const data = patterns[pass]();
        await fs.writeFile(filePath, data);
        
        // Force sync to ensure data is written to disk
        const fd = await fs.open(filePath, 'r+');
        await fd.sync();
        await fd.close();
        
        console.log(`Completed overwrite pass ${pass + 1}/${patterns.length} for ${filePath}`);
      }
      
    } catch (error) {
      console.error(`Failed to perform multi-pass overwrite on ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Attempts to use Windows cipher command to wipe free space
   * This helps ensure deleted data cannot be recovered from free disk space
   */
  static async wipeFreeSpace(driveLetter: string = 'C'): Promise<boolean> {
    if (process.platform !== 'win32') {
      console.warn('Free space wiping is only available on Windows');
      return false;
    }

    return new Promise((resolve) => {
      // Use Windows cipher command to wipe free space
      const cipher = spawn('cipher', ['/w:' + driveLetter + ':\\'], {
        stdio: 'pipe'
      });

      let success = false;

      cipher.on('close', (code) => {
        success = code === 0;
        console.log(`Free space wipe ${success ? 'completed' : 'failed'} for drive ${driveLetter}:`);
        resolve(success);
      });

      cipher.on('error', (error) => {
        console.warn('Cipher command failed:', error.message);
        resolve(false);
      });

      // Set a longer timeout for free space wiping (can take a while)
      setTimeout(() => {
        cipher.kill();
        console.warn('Free space wipe timed out');
        resolve(false);
      }, 300000); // 5 minute timeout
    });
  }

  /**
   * Verifies that a file has been successfully deleted
   */
  static async verifyDeletion(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      // If we can still access the file, deletion failed
      return false;
    } catch (error) {
      // If access fails with ENOENT, the file was successfully deleted
      return (error as any)?.code === 'ENOENT';
    }
  }

  /**
   * Gets information about available secure deletion methods
   */
  static async getAvailableMethods(): Promise<{
    sdelete: boolean;
    cipher: boolean;
    multiPass: boolean;
    platform: string;
  }> {
    const platform = process.platform;
    const isWindows = platform === 'win32';
    
    let sdeleteAvailable = false;
    let cipherAvailable = false;

    if (isWindows) {
      // Test if sdelete is available
      sdeleteAvailable = await new Promise((resolve) => {
        const test = spawn('sdelete', ['-?'], { stdio: 'pipe' });
        test.on('close', () => resolve(true));
        test.on('error', () => resolve(false));
        setTimeout(() => {
          test.kill();
          resolve(false);
        }, 5000);
      });

      // Test if cipher is available
      cipherAvailable = await new Promise((resolve) => {
        const test = spawn('cipher', ['/?'], { stdio: 'pipe' });
        test.on('close', () => resolve(true));
        test.on('error', () => resolve(false));
        setTimeout(() => {
          test.kill();
          resolve(false);
        }, 5000);
      });
    }

    return {
      sdelete: sdeleteAvailable,
      cipher: cipherAvailable,
      multiPass: true, // Always available
      platform
    };
  }
}