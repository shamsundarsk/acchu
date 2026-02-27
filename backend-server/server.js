const express = require('express');
const cors = require('cors');
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: [
    'https://customer-system-mu.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests for all routes
app.options('*', cors());

app.use(express.json({ limit: '50mb' }));

// In-memory storage (persists as long as server runs)
let printJobs = [];
let uploadedFiles = {}; // Store file data in memory instead of disk

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    totalJobs: printJobs.length,
    pendingJobs: printJobs.filter(j => j.status === 'pending').length
  });
});

// Create session
app.post('/api/sessions', (req, res) => {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const token = Math.random().toString(36).substr(2);
  
  console.log(`✓ Session created: ${sessionId}`);
  
  res.status(201).json({
    success: true,
    data: {
      sessionId,
      token
    }
  });
});

// Upload file
app.post('/api/upload-file', (req, res) => {
  const busboy = Busboy({ 
    headers: req.headers,
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB
    }
  });

  const fields = {};
  let fileData = null;
  let fileName = null;
  let mimeType = null;

  busboy.on('field', (fieldname, value) => {
    fields[fieldname] = value;
  });

  busboy.on('file', (fieldname, file, info) => {
    fileName = info.filename;
    mimeType = info.mimeType;
    
    const chunks = [];
    
    file.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    file.on('end', () => {
      fileData = Buffer.concat(chunks);
    });
  });

  busboy.on('finish', () => {
    if (!fileData) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const sessionId = fields.sessionId;
    const fileId = fields.fileId;

    if (!sessionId || !fileId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and File ID are required'
      });
    }

    // Get page count for PDFs
    let pageCount = 1;
    if (mimeType === 'application/pdf') {
      try {
        const sample = fileData.slice(0, Math.min(fileData.length, 100000));
        const text = sample.toString('latin1');
        const matches = text.match(/\/Type[\s]*\/Page[^s]/g);
        pageCount = matches ? matches.length : 1;
      } catch (err) {
        pageCount = 1;
      }
    }

    // Store file metadata AND data in memory (no disk writes for Vercel)
    uploadedFiles[fileId] = {
      id: fileId,
      originalName: fileName,
      mimeType: mimeType,
      size: fileData.length,
      uploadedAt: new Date().toISOString(),
      serverPath: `/memory/${fileId}`, // Virtual path
      pageCount: pageCount,
      sessionId: sessionId,
      fileBuffer: fileData // Store actual file data in memory
    };

    console.log(`✓ File uploaded: ${fileName} (${(fileData.length / 1024).toFixed(1)}KB, ${pageCount} pages)`);

    res.status(201).json({
      success: true,
      data: uploadedFiles[fileId]
    });
  });

  busboy.on('error', (err) => {
    console.error('Upload error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  });

  req.pipe(busboy);
});

// Get pending jobs
app.get('/api/print-jobs/pending', (req, res) => {
  const pendingJobs = printJobs.filter(job => job.status === 'pending');
  
  console.log(`📋 GET pending jobs: ${pendingJobs.length} jobs`);
  
  res.json({
    success: true,
    jobs: pendingJobs,
    message: 'Pending jobs retrieved'
  });
});

// Create print job
app.post('/api/print-jobs/pending', (req, res) => {
  const { sessionId, file, printOptions, pricing, payment } = req.body;

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const job = {
    id: jobId,
    sessionId,
    fileName: file?.originalName || 'document.pdf',
    fileId: file?.id || jobId,
    filePath: file?.serverPath || null,
    fileMetadata: {
      originalName: file?.originalName || 'document.pdf',
      mimeType: file?.mimeType || 'application/pdf',
      size: file?.size || 0,
      pageCount: file?.pageCount || 1
    },
    printOptions: {
      copies: printOptions?.copies || 1,
      colorMode: printOptions?.colorMode || 'bw',
      duplex: printOptions?.duplex || false,
      paperSize: printOptions?.paperSize || 'A4'
    },
    pricing: {
      totalPages: pricing?.totalPages || 1,
      totalAmount: pricing?.totalAmount || 0
    },
    paymentStatus: 'completed',
    status: 'pending',
    timestamp: new Date().toISOString()
  };

  printJobs.push(job);

  // Keep only last 100 jobs
  if (printJobs.length > 100) {
    printJobs = printJobs.slice(-100);
  }

  console.log(`✓ Job created: ${job.id} - ${job.fileName} (Total: ${printJobs.length})`);

  res.status(201).json({
    success: true,
    data: {
      jobId: job.id,
      message: 'Print job created successfully'
    }
  });
});

// Cancel job
app.post('/api/print-jobs/:sessionId/cancel', (req, res) => {
  const { sessionId } = req.params;
  
  const initialLength = printJobs.length;
  printJobs = printJobs.filter(job => job.sessionId !== sessionId);
  const removed = initialLength - printJobs.length;

  console.log(`✓ Canceled ${removed} jobs for session: ${sessionId}`);

  res.json({
    success: true,
    message: `Print job canceled successfully (${removed} jobs removed)`,
    sessionId
  });
});

// Download file
app.get('/api/download-file', (req, res) => {
  const { sessionId, fileId } = req.query;

  if (!sessionId || !fileId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID and File ID are required'
    });
  }

  const fileMetadata = uploadedFiles[fileId];
  
  if (!fileMetadata || !fileMetadata.fileBuffer) {
    return res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }

  console.log(`📥 Downloading file: ${fileMetadata.originalName}`);

  res.setHeader('Content-Type', fileMetadata.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileMetadata.originalName}"`);
  res.send(fileMetadata.fileBuffer);
});

// Delete files
app.post('/api/delete-files', (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      error: 'Session ID is required'
    });
  }

  // Remove from uploadedFiles memory
  let deletedCount = 0;
  Object.keys(uploadedFiles).forEach(fileId => {
    if (uploadedFiles[fileId].sessionId === sessionId) {
      delete uploadedFiles[fileId];
      deletedCount++;
    }
  });

  console.log(`✓ Deleted ${deletedCount} files for session: ${sessionId}`);

  res.json({
    success: true,
    message: 'Files deleted successfully'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🖨️  ACCHU Print Queue Backend Server               ║
║                                                       ║
║   Status: RUNNING                                     ║
║   Port: ${PORT}                                        ║
║   Environment: ${process.env.NODE_ENV || 'development'}                              ║
║                                                       ║
║   Endpoints:                                          ║
║   - GET  /health                                      ║
║   - POST /api/sessions                                ║
║   - POST /api/upload-file                             ║
║   - GET  /api/print-jobs/pending                      ║
║   - POST /api/print-jobs/pending                      ║
║   - POST /api/print-jobs/:sessionId/cancel            ║
║   - GET  /api/download-file                           ║
║   - POST /api/delete-files                            ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});
