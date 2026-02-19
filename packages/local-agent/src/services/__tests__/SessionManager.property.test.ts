import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { SessionManager } from '../SessionManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Property-Based Tests for SessionManager
 * Feature: secureprint-session
 */
describe('SessionManager Property Tests', () => {
  let sessionManager: SessionManager;
  let testTempDir: string;

  beforeEach(() => {
    // Create unique temp directory for each test
    testTempDir = path.join(os.tmpdir(), `test-acchu-sessions-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    
    sessionManager = new SessionManager({
      shopId: 'test-shop',
      sessionTimeoutMinutes: 30,
      tempDirectory: testTempDir
    });
  });

  afterEach(async () => {
    // Clean up any created sessions
    if (sessionManager) {
      await sessionManager.shutdown();
    }
    
    // Clean up test temp directory
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  /**
   * Property 1: Session Uniqueness and Isolation
   * Validates: Requirements 1.1
   * 
   * For any number of concurrent session creation requests, each session should receive 
   * a unique identifier and isolated workspace directory with no shared resources between sessions.
   */
  it('Property 1: Session Uniqueness and Isolation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate between 1 and 20 concurrent session creation requests
        fc.integer({ min: 1, max: 20 }),
        async (sessionCount) => {
          const sessionIds: string[] = [];
          const sessionDirectories: string[] = [];
          
          // Create multiple sessions concurrently
          const sessionPromises = Array.from({ length: sessionCount }, () => 
            sessionManager.createSession()
          );
          
          const createdSessionIds = await Promise.all(sessionPromises);
          sessionIds.push(...createdSessionIds);
          
          // Collect session directories
          for (const sessionId of sessionIds) {
            const sessionDir = sessionManager.getSessionDirectory(sessionId);
            sessionDirectories.push(sessionDir);
          }
          
          // Property 1.1: All session IDs must be unique
          const uniqueSessionIds = new Set(sessionIds);
          expect(uniqueSessionIds.size).toBe(sessionIds.length);
          
          // Property 1.2: All session directories must be unique
          const uniqueDirectories = new Set(sessionDirectories);
          expect(uniqueDirectories.size).toBe(sessionDirectories.length);
          
          // Property 1.3: Each session must have its own isolated workspace
          for (const sessionId of sessionIds) {
            const session = sessionManager.getSessionStatus(sessionId);
            expect(session).toBeDefined();
            expect(session?.id).toBe(sessionId);
            
            // Verify session directory exists and is isolated
            const sessionDir = sessionManager.getSessionDirectory(sessionId);
            const filesDir = sessionManager.getSessionFilesDirectory(sessionId);
            
            // Check directory structure exists
            await expect(fs.access(sessionDir)).resolves.toBeUndefined();
            await expect(fs.access(filesDir)).resolves.toBeUndefined();
            
            // Verify metadata file exists
            const metadataPath = path.join(sessionDir, 'metadata.json');
            await expect(fs.access(metadataPath)).resolves.toBeUndefined();
          }
          
          // Property 1.4: No shared resources between sessions
          // Verify that each session directory is completely separate
          for (let i = 0; i < sessionDirectories.length; i++) {
            for (let j = i + 1; j < sessionDirectories.length; j++) {
              const dir1 = sessionDirectories[i];
              const dir2 = sessionDirectories[j];
              
              // Directories should not be nested within each other
              expect(dir1.startsWith(dir2 + path.sep)).toBe(false);
              expect(dir2.startsWith(dir1 + path.sep)).toBe(false);
              
              // Directories should be completely separate paths
              expect(path.relative(dir1, dir2)).not.toBe('');
            }
          }
          
          // Property 1.5: Session isolation in memory
          // Each session should have independent state
          const activeSessions = sessionManager.getActiveSessions();
          expect(activeSessions.length).toBe(sessionIds.length);
          
          // Verify each session has independent metadata
          for (const sessionId of sessionIds) {
            const session = sessionManager.getSessionStatus(sessionId);
            expect(session?.files).toEqual([]); // Should start with empty files array
            expect(session?.shopId).toBe('test-shop');
            
            // Verify session has unique creation time (within reasonable bounds)
            expect(session?.createdAt).toBeInstanceOf(Date);
            expect(session?.expiresAt).toBeInstanceOf(Date);
          }
        }
      ),
      { 
        numRuns: 100, // Run 100 iterations to test various concurrent scenarios
        timeout: 30000 // 30 second timeout for async operations
      }
    );
  });
});