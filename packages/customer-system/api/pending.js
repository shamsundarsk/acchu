// Serverless function for Vercel to handle /api/print-jobs/pending
// This bypasses the TypeScript build issues

// Use shared job storage with better persistence
const jobStorage = require('./simple-db');

// Helper to parse JSON body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle POST - add new job
  if (req.method === 'POST') {
    try {
      // Parse request body
      const body = await parseBody(req);
      const { sessionId, file, printOptions, pricing, payment } = body;

      console.log('=== CREATE JOB REQUEST ===');
      console.log('SessionId:', sessionId);
      console.log('File:', file?.originalName);
      console.log('Print Options:', printOptions);

      // Create unique job ID
      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const job = {
        id: jobId,
        sessionId,
        fileName: file?.originalName || 'document.pdf',
        fileId: file?.id || jobId,
        filePath: file?.serverPath || null, // ACTUAL FILE PATH on server
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

      jobStorage.addJob(job);
      
      // Force immediate sync
      jobStorage.forceSync();
      
      // Verify job was added
      const allJobs = jobStorage.getAllJobs();
      console.log(`✓ Job created: ${job.id}`);
      console.log(`✓ Total jobs in storage: ${allJobs.length}`);
      console.log(`✓ File path: ${job.filePath}`);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Print job created successfully'
        }
      });
      return;
    } catch (error) {
      console.error('CREATE JOB ERROR:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create print job'
      });
      return;
    }
  }

  // Handle GET - return pending jobs
  if (req.method === 'GET') {
    try {
      const pendingJobs = jobStorage.getPendingJobs();
      const allJobs = jobStorage.getAllJobs();
      
      console.log('=== GET JOBS REQUEST ===');
      console.log(`Total jobs: ${allJobs.length}`);
      console.log(`Pending jobs: ${pendingJobs.length}`);
      if (pendingJobs.length > 0) {
        console.log('Jobs:', pendingJobs.map(j => `${j.id} - ${j.fileName}`).join(', '));
      }
      
      // Return all pending jobs
      const response = {
        success: true,
        jobs: pendingJobs,
        message: 'Pending jobs retrieved'
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('GET JOBS ERROR:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get pending jobs'
      });
    }
    return;
  }

  // Method not allowed
  res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
};
