import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { sessionRoutes } from './routes/sessions';
import { fileRoutes } from './routes/files';
import { paymentRoutes } from './routes/payments';
import { printJobRoutes, setWebSocketServer } from './routes/printJobs';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { CustomerWorkflowService } from './services/CustomerWorkflowService';

// Extend WebSocket interface to include sessionId
interface ExtendedWebSocket extends WebSocket {
  sessionId?: string;
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize workflow service
const workflowService = new CustomerWorkflowService();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('dist/client'));

// Set WebSocket server for print job routes
setWebSocketServer(wss);

// Routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/print-jobs', printJobRoutes);

// WebSocket handling
wss.on('connection', (ws: ExtendedWebSocket, request) => {
  console.log('New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log('Received WebSocket message:', data);
      
      // Handle different message types
      switch (data.type) {
        case 'join-session':
          // Join session room for updates
          ws.sessionId = data.sessionId;
          console.log(`Client joined session: ${data.sessionId}`);
          break;
          
        case 'local-agent-connected':
          // Local Agent connected
          console.log('Local Agent connected:', data.data);
          workflowService.setLocalAgentConnection(true);
          break;
          
        case 'print-job-status-update':
          // Forward print job status updates to session clients
          broadcastToSession(data.sessionId, {
            type: 'print-status-update',
            jobId: data.jobId,
            data: {
              status: data.data.status,
              progress: data.data.progress,
              message: data.data.message,
              error: data.data.error
            },
            timestamp: data.timestamp
          });
          break;
          
        case 'print-job-created':
          // Forward print job creation confirmation to session clients
          broadcastToSession(data.sessionId, {
            type: 'print-job-created',
            jobId: data.jobId,
            data: data.data,
            timestamp: data.timestamp
          });
          break;
          
        case 'session-status':
          // Forward session status updates
          broadcastToSession(data.sessionId, {
            type: 'session-status-update',
            status: data.data.status,
            timestamp: data.timestamp
          });
          break;
          
        case 'printer-status':
          // Broadcast printer status to all connected clients
          broadcastToAll({
            type: 'printer-status-update',
            status: data.data,
            timestamp: data.timestamp
          });
          break;
          
        case 'error':
          // Forward error messages
          if (data.sessionId) {
            broadcastToSession(data.sessionId, {
              type: 'error',
              error: data.data.error,
              timestamp: data.timestamp
            });
          }
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

// Helper function to broadcast to all clients in a session
function broadcastToSession(sessionId: string, message: any) {
  wss.clients.forEach((client: ExtendedWebSocket) => {
    if (client.sessionId === sessionId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Helper function to broadcast to all clients
function broadcastToAll(message: any) {
  wss.clients.forEach((client: ExtendedWebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Workflow monitoring endpoints
app.get('/api/workflows/metrics', (req, res) => {
  try {
    const metrics = workflowService.getWorkflowStatistics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get workflow metrics'
    });
  }
});

app.get('/api/workflows/active', (req, res) => {
  try {
    const activeWorkflows = workflowService.getActiveWorkflows();
    res.json({
      success: true,
      data: activeWorkflows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get active workflows'
    });
  }
});

app.get('/api/workflows/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = workflowService.getWorkflowHistory(limit);
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get workflow history'
    });
  }
});

// Catch-all handler for client-side routing
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'dist/client' });
});

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Customer System server running on port ${PORT}`);
});

// Export WebSocket server for use in routes
export { wss };