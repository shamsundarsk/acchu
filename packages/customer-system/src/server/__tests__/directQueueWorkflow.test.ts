import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { sessionRoutes } from '../routes/sessions';
import { printJobRoutes, setWebSocketServer } from '../routes/printJobs';

describe('Direct Queue Workflow Integration', () => {
  let app: express.Application;
  let server: any;
  let wss: WebSocketServer;
  let wsClient: any;

  beforeEach(async () => {
    // Set up test server with WebSocket
    app = express();
    app.use(express.json());
    
    server = createServer(app);
    wss = new WebSocketServer({ server });
    
    // Set up WebSocket server for print job routes
    setWebSocketServer(wss);
    
    // Set up routes
    app.use('/api/sessions', sessionRoutes);
    app.use('/api/print-jobs', printJobRoutes);
    
    // Start server
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (wsClient) {
      wsClient.close();
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it('should create print job and automatically send to queue', async () => {
    const sessionId = 'test-session-123';
    
    // Mock WebSocket client to simulate Local Agent
    const WebSocket = require('ws');
    const port = server.address().port;
    wsClient = new WebSocket(`ws://localhost:${port}`);
    
    let receivedMessages: any[] = [];
    
    wsClient.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      receivedMessages.push(message);
    });

    await new Promise<void>((resolve) => {
      wsClient.on('open', () => {
        // Simulate Local Agent connection
        wsClient.send(JSON.stringify({
          type: 'local-agent-connected',
          data: { shopId: 'test-shop' }
        }));
        resolve();
      });
    });

    // Wait a bit for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create print job with autoExecute flag
    const printJobData = {
      printOptions: {
        copies: 2,
        isColor: true,
        isDuplex: false,
        quality: 'high'
      },
      transactionId: 'test-transaction-123',
      files: ['test-document.pdf'],
      autoExecute: true
    };

    const response = await request(app)
      .post(`/api/print-jobs/${sessionId}/create`)
      .send(printJobData)
      .expect(200);

    // Verify API response
    expect(response.body.success).toBe(true);
    expect(response.body.data.message).toContain('sent to shopkeeper queue');

    // Wait for WebSocket message
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify WebSocket message was sent to Local Agent
    const createJobMessage = receivedMessages.find(msg => msg.type === 'create-print-job');
    expect(createJobMessage).toBeDefined();
    expect(createJobMessage.sessionId).toBe(sessionId);
    expect(createJobMessage.data.autoExecute).toBe(true);
    expect(createJobMessage.data.options).toEqual(printJobData.printOptions);
  });

  it('should handle print job status updates from Local Agent', async () => {
    const sessionId = 'test-session-456';
    const jobId = 'test-job-789';
    
    // Set up WebSocket client to simulate customer
    const WebSocket = require('ws');
    const port = server.address().port;
    wsClient = new WebSocket(`ws://localhost:${port}`);
    
    let customerMessages: any[] = [];
    
    wsClient.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      customerMessages.push(message);
    });

    await new Promise<void>((resolve) => {
      wsClient.on('open', () => {
        // Join session as customer
        wsClient.send(JSON.stringify({
          type: 'join-session',
          sessionId: sessionId
        }));
        resolve();
      });
    });

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate Local Agent sending status update
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify({
          type: 'print-job-status-update',
          sessionId: sessionId,
          jobId: jobId,
          data: {
            status: 'PRINTING',
            progress: 50,
            message: 'Print job in progress'
          },
          timestamp: new Date().toISOString()
        }));
      }
    });

    // Wait for message propagation
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify customer received the status update
    const statusUpdate = customerMessages.find(msg => msg.type === 'print-status-update');
    expect(statusUpdate).toBeDefined();
    expect(statusUpdate.jobId).toBe(jobId);
    expect(statusUpdate.data.status).toBe('PRINTING');
    expect(statusUpdate.data.progress).toBe(50);
  });

  it('should handle print job completion workflow', async () => {
    const sessionId = 'test-session-complete';
    const jobId = 'test-job-complete';
    
    // Set up WebSocket client
    const WebSocket = require('ws');
    const port = server.address().port;
    wsClient = new WebSocket(`ws://localhost:${port}`);
    
    let allMessages: any[] = [];
    
    wsClient.on('message', (data: Buffer) => {
      const message = JSON.parse(data.toString());
      allMessages.push(message);
    });

    await new Promise<void>((resolve) => {
      wsClient.on('open', () => {
        wsClient.send(JSON.stringify({
          type: 'join-session',
          sessionId: sessionId
        }));
        resolve();
      });
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Simulate complete workflow: QUEUED -> PRINTING -> COMPLETED
    const statusUpdates = [
      { status: 'QUEUED', progress: 0, message: 'Print job queued' },
      { status: 'PRINTING', progress: 25, message: 'Starting print job' },
      { status: 'PRINTING', progress: 75, message: 'Print job in progress' },
      { status: 'COMPLETED', progress: 100, message: 'Print job completed successfully' }
    ];

    for (const update of statusUpdates) {
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'print-job-status-update',
            sessionId: sessionId,
            jobId: jobId,
            data: update,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Verify all status updates were received
    const statusMessages = allMessages.filter(msg => msg.type === 'print-status-update');
    expect(statusMessages).toHaveLength(4);
    
    const completedMessage = statusMessages.find(msg => msg.data.status === 'COMPLETED');
    expect(completedMessage).toBeDefined();
    expect(completedMessage.data.progress).toBe(100);
    expect(completedMessage.data.message).toContain('completed successfully');
  });

  it('should handle error scenarios gracefully', async () => {
    const sessionId = 'test-session-error';
    
    // Test invalid print job creation
    const invalidPrintJobData = {
      // Missing required printOptions
      transactionId: 'test-transaction-error',
      files: ['test-document.pdf'],
      autoExecute: true
    };

    const response = await request(app)
      .post(`/api/print-jobs/${sessionId}/create`)
      .send(invalidPrintJobData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toContain('Print options are required');
  });
});