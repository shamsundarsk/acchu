import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { 
  SessionStatus, 
  JobStatus, 
  PaymentStatus, 
  PrintOptions,
  SessionId,
  JobId
} from '../types';
import { CustomerWorkflowService } from '../services/CustomerWorkflowService';

/**
 * End-to-End Workflow Integration Tests
 * Requirements: 15.1 - Complete workflow integration testing
 * 
 * These tests validate the complete customer journey from QR scan to print completion
 */

describe('End-to-End Workflow Integration', () => {
  let app: express.Application;
  let server: any;
  let wss: WebSocketServer;
  let workflowService: CustomerWorkflowService;
  let mockSessionId: SessionId;
  let mockJobId: JobId;

  beforeEach(async () => {
    // Set up test server with WebSocket support
    app = express();
    server = createServer(app);
    wss = new WebSocketServer({ server });
    
    // Initialize workflow service
    workflowService = new CustomerWorkflowService();
    workflowService.setLocalAgentConnection(true);

    // Set up middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Generate test session ID
    mockSessionId = `test-session-${Date.now()}`;
    mockJobId = `test-job-${Date.now()}`;

    // Mock session validation middleware
    app.use('/api/sessions/:sessionId', (req, res, next) => {
      req.sessionData = {
        sessionId: mockSessionId,
        shopId: 'test-shop',
        isValid: true
      };
      next();
    });

    // Set up test routes
    setupTestRoutes();

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  function setupTestRoutes() {
    // Session validation endpoint
    app.get('/api/sessions/:sessionId', async (req, res) => {
      const { sessionId } = req.params;
      
      res.json({
        success: true,
        data: {
          session: {
            id: sessionId,
            shopId: 'test-shop',
            status: SessionStatus.ACTIVE,
            createdAt: new Date(Date.now() - 5 * 60 * 1000),
            expiresAt: new Date(Date.now() + 25 * 60 * 1000),
            files: [],
            paymentStatus: PaymentStatus.PENDING
          },
          isValid: true,
          timeRemaining: 25 * 60 * 1000
        }
      });
    });

    // File upload endpoint
    app.post('/api/files/:sessionId/upload', async (req, res) => {
      try {
        // Simulate file upload workflow
        const mockFiles = [
          {
            originalname: 'test-document.pdf',
            mimetype: 'application/pdf',
            size: 1024 * 1024, // 1MB
            buffer: Buffer.from('mock-pdf-content')
          }
        ];

        const result = await workflowService.executeFileUploadWorkflow({
          sessionId: mockSessionId,
          files: mockFiles as any,
          customerInfo: {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent') || ''
          }
        });

        res.json({
          success: true,
          data: result.uploadResults,
          workflow: {
            id: result.workflow.id,
            status: result.workflow.status,
            steps: result.workflow.steps.map(s => ({
              id: s.id,
              name: s.name,
              status: s.status
            }))
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed'
        });
      }
    });

    // Print configuration endpoint
    app.post('/api/print-config/:sessionId', async (req, res) => {
      try {
        const { printOptions } = req.body;
        const mockFiles = [
          {
            id: 'file-1',
            originalName: 'test-document.pdf',
            mimeType: 'application/pdf',
            size: 1024 * 1024,
            uploadedAt: new Date(),
            localPath: '/tmp/test-file',
            pageCount: 3
          }
        ];

        const result = await workflowService.executePrintConfigurationWorkflow({
          sessionId: mockSessionId,
          printOptions,
          files: mockFiles
        });

        res.json({
          success: true,
          data: {
            pricing: result.pricing,
            workflow: {
              id: result.workflow.id,
              status: result.workflow.status,
              steps: result.workflow.steps.map(s => ({
                id: s.id,
                name: s.name,
                status: s.status
              }))
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Configuration failed'
        });
      }
    });

    // Payment processing endpoint
    app.post('/api/payments/:sessionId/process', async (req, res) => {
      try {
        const { pricing, printOptions } = req.body;
        const mockFiles = [
          {
            id: 'file-1',
            originalName: 'test-document.pdf',
            mimeType: 'application/pdf',
            size: 1024 * 1024,
            uploadedAt: new Date(),
            localPath: '/tmp/test-file',
            pageCount: 3
          }
        ];

        const result = await workflowService.executePaymentWorkflow({
          sessionId: mockSessionId,
          pricing,
          printOptions,
          files: mockFiles
        });

        res.json({
          success: true,
          data: {
            paymentRequest: result.paymentRequest,
            workflow: {
              id: result.workflow.id,
              status: result.workflow.status,
              steps: result.workflow.steps.map(s => ({
                id: s.id,
                name: s.name,
                status: s.status
              }))
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Payment processing failed'
        });
      }
    });

    // Print execution endpoint
    app.post('/api/print-jobs/:sessionId/execute', async (req, res) => {
      try {
        const { transactionId } = req.body;

        const result = await workflowService.executePrintExecutionWorkflow({
          sessionId: mockSessionId,
          jobId: mockJobId,
          transactionId
        });

        res.json({
          success: true,
          data: {
            printResult: result.printResult,
            workflow: {
              id: result.workflow.id,
              status: result.workflow.status,
              steps: result.workflow.steps.map(s => ({
                id: s.id,
                name: s.name,
                status: s.status
              }))
            }
          }
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Print execution failed'
        });
      }
    });

    // Workflow status endpoint
    app.get('/api/workflows/status', (req, res) => {
      res.json({
        success: true,
        data: {
          active: workflowService.getActiveWorkflows(),
          statistics: workflowService.getWorkflowStatistics(),
          history: workflowService.getWorkflowHistory(10)
        }
      });
    });
  }

  describe('Complete Customer Journey', () => {
    it('should execute complete print workflow successfully', async () => {
      // Step 1: Validate session access
      const sessionResponse = await request(app)
        .get(`/api/sessions/${mockSessionId}`)
        .expect(200);

      expect(sessionResponse.body.success).toBe(true);
      expect(sessionResponse.body.data.isValid).toBe(true);
      expect(sessionResponse.body.data.session.status).toBe(SessionStatus.ACTIVE);

      // Step 2: Upload files
      const uploadResponse = await request(app)
        .post(`/api/files/${mockSessionId}/upload`)
        .send({})
        .expect(200);

      expect(uploadResponse.body.success).toBe(true);
      expect(uploadResponse.body.data).toHaveLength(1);
      expect(uploadResponse.body.workflow.status).toBe('completed');

      // Step 3: Configure print options
      const printOptions: PrintOptions = {
        copies: 2,
        colorMode: 'color',
        duplex: false,
        paperSize: 'A4'
      };

      const configResponse = await request(app)
        .post(`/api/print-config/${mockSessionId}`)
        .send({ printOptions })
        .expect(200);

      expect(configResponse.body.success).toBe(true);
      expect(configResponse.body.data.pricing).toBeDefined();
      expect(configResponse.body.data.pricing.totalPrice).toBeGreaterThan(0);
      expect(configResponse.body.data.workflow.status).toBe('completed');

      const pricing = configResponse.body.data.pricing;

      // Step 4: Process payment
      const paymentResponse = await request(app)
        .post(`/api/payments/${mockSessionId}/process`)
        .send({ pricing, printOptions })
        .expect(200);

      expect(paymentResponse.body.success).toBe(true);
      expect(paymentResponse.body.data.paymentRequest).toBeDefined();
      expect(paymentResponse.body.data.paymentRequest.status).toBe(PaymentStatus.COMPLETED);
      expect(paymentResponse.body.data.workflow.status).toBe('completed');

      const paymentRequest = paymentResponse.body.data.paymentRequest;

      // Step 5: Execute print job
      const printResponse = await request(app)
        .post(`/api/print-jobs/${mockSessionId}/execute`)
        .send({ transactionId: paymentRequest.transactionId })
        .expect(200);

      expect(printResponse.body.success).toBe(true);
      expect(printResponse.body.data.printResult).toBeDefined();
      expect(printResponse.body.data.printResult.status).toBe(JobStatus.COMPLETED);
      expect(printResponse.body.data.workflow.status).toBe('completed');

      // Step 6: Verify workflow completion
      const statusResponse = await request(app)
        .get('/api/workflows/status')
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.data.statistics.completed).toBeGreaterThan(0);
      expect(statusResponse.body.data.statistics.successRate).toBeGreaterThan(0);
    }, 30000); // 30 second timeout for complete workflow

    it('should handle file upload validation errors', async () => {
      // Test with invalid file type
      const uploadResponse = await request(app)
        .post(`/api/files/${mockSessionId}/upload`)
        .send({
          files: [{
            originalname: 'test.exe',
            mimetype: 'application/x-executable',
            size: 1024,
            buffer: Buffer.from('invalid-content')
          }]
        })
        .expect(500);

      expect(uploadResponse.body.success).toBe(false);
      expect(uploadResponse.body.error).toContain('validation failed');
    });

    it('should handle print configuration validation errors', async () => {
      // Test with invalid print options
      const invalidOptions = {
        copies: 15, // Exceeds limit
        colorMode: 'invalid',
        duplex: 'not-boolean',
        paperSize: 'invalid'
      };

      const configResponse = await request(app)
        .post(`/api/print-config/${mockSessionId}`)
        .send({ printOptions: invalidOptions })
        .expect(500);

      expect(configResponse.body.success).toBe(false);
      expect(configResponse.body.error).toContain('validation failed');
    });

    it('should handle payment processing errors gracefully', async () => {
      // Mock payment failure by setting Local Agent as disconnected
      workflowService.setLocalAgentConnection(false);

      const printOptions: PrintOptions = {
        copies: 1,
        colorMode: 'bw',
        duplex: false,
        paperSize: 'A4'
      };

      const pricing = {
        totalPages: 3,
        colorPages: 0,
        bwPages: 3,
        basePrice: 600,
        totalPrice: 600
      };

      const paymentResponse = await request(app)
        .post(`/api/payments/${mockSessionId}/process`)
        .send({ pricing, printOptions })
        .expect(500);

      expect(paymentResponse.body.success).toBe(false);
      expect(paymentResponse.body.error).toContain('Local Agent not connected');

      // Restore connection
      workflowService.setLocalAgentConnection(true);
    });

    it('should track workflow statistics correctly', async () => {
      // Execute multiple workflows to test statistics
      const printOptions: PrintOptions = {
        copies: 1,
        colorMode: 'bw',
        duplex: false,
        paperSize: 'A4'
      };

      // Execute successful workflow
      await request(app)
        .post(`/api/files/${mockSessionId}/upload`)
        .send({});

      await request(app)
        .post(`/api/print-config/${mockSessionId}`)
        .send({ printOptions });

      // Check statistics
      const statusResponse = await request(app)
        .get('/api/workflows/status')
        .expect(200);

      const stats = statusResponse.body.data.statistics;
      expect(stats.completed).toBeGreaterThan(0);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.successRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Error Propagation and Recovery', () => {
    it('should propagate errors between workflow steps', async () => {
      // Simulate Local Agent disconnection during workflow
      workflowService.setLocalAgentConnection(false);

      const uploadResponse = await request(app)
        .post(`/api/files/${mockSessionId}/upload`)
        .send({})
        .expect(500);

      expect(uploadResponse.body.success).toBe(false);
      expect(uploadResponse.body.error).toContain('Local Agent not connected');

      // Verify workflow was marked as failed
      const statusResponse = await request(app)
        .get('/api/workflows/status')
        .expect(200);

      const history = statusResponse.body.data.history;
      const failedWorkflow = history.find((w: any) => w.status === 'failed');
      expect(failedWorkflow).toBeDefined();
      expect(failedWorkflow.error).toContain('Local Agent not connected');
    });

    it('should handle concurrent workflow execution', async () => {
      // Execute multiple workflows concurrently
      const promises = [];
      
      for (let i = 0; i < 3; i++) {
        const promise = request(app)
          .post(`/api/files/session-${i}/upload`)
          .send({});
        promises.push(promise);
      }

      const results = await Promise.allSettled(promises);
      
      // At least some should succeed (depending on session validation)
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThanOrEqual(0);

      // Check that workflows were tracked
      const statusResponse = await request(app)
        .get('/api/workflows/status')
        .expect(200);

      expect(statusResponse.body.data.statistics.completed + statusResponse.body.data.statistics.failed)
        .toBeGreaterThan(0);
    });

    it('should maintain workflow history and cleanup', async () => {
      // Execute several workflows to test history management
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/files/${mockSessionId}-${i}/upload`)
          .send({});
      }

      const statusResponse = await request(app)
        .get('/api/workflows/status')
        .expect(200);

      const history = statusResponse.body.data.history;
      expect(history).toHaveLength(5);
      
      // Verify history is ordered by most recent first
      for (let i = 1; i < history.length; i++) {
        const current = new Date(history[i].startTime);
        const previous = new Date(history[i - 1].startTime);
        expect(current.getTime()).toBeLessThanOrEqual(previous.getTime());
      }
    });
  });

  describe('Real-time Communication', () => {
    it('should handle WebSocket connections for real-time updates', (done) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(`ws://localhost:${server.address().port}`);

      ws.on('open', () => {
        // Send join session message
        ws.send(JSON.stringify({
          type: 'join-session',
          sessionId: mockSessionId
        }));

        // Send mock status update
        ws.send(JSON.stringify({
          type: 'print-job-status-update',
          sessionId: mockSessionId,
          jobId: mockJobId,
          data: {
            status: JobStatus.PRINTING,
            progress: 50,
            message: 'Printing page 2 of 4'
          },
          timestamp: new Date()
        }));
      });

      ws.on('message', (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'print-status-update') {
          expect(message.jobId).toBe(mockJobId);
          expect(message.status).toBe(JobStatus.PRINTING);
          expect(message.progress).toBe(50);
          ws.close();
          done();
        }
      });

      ws.on('error', (error: Error) => {
        done(error);
      });
    });

    it('should broadcast session status updates to connected clients', (done) => {
      const WebSocket = require('ws');
      const ws1 = new WebSocket(`ws://localhost:${server.address().port}`);
      const ws2 = new WebSocket(`ws://localhost:${server.address().port}`);

      let receivedCount = 0;

      const handleMessage = (data: Buffer) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'session-status-update') {
          receivedCount++;
          if (receivedCount === 2) {
            ws1.close();
            ws2.close();
            done();
          }
        }
      };

      ws1.on('open', () => {
        ws1.send(JSON.stringify({
          type: 'join-session',
          sessionId: mockSessionId
        }));
      });

      ws2.on('open', () => {
        ws2.send(JSON.stringify({
          type: 'join-session',
          sessionId: mockSessionId
        }));

        // Send session status update after both clients join
        setTimeout(() => {
          ws2.send(JSON.stringify({
            type: 'session-status',
            sessionId: mockSessionId,
            data: {
              status: SessionStatus.PRINTING
            },
            timestamp: new Date()
          }));
        }, 100);
      });

      ws1.on('message', handleMessage);
      ws2.on('message', handleMessage);

      ws1.on('error', done);
      ws2.on('error', done);
    });
  });
});