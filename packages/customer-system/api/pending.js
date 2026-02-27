// Serverless function for Vercel to handle /api/print-jobs/pending
// This bypasses the TypeScript build issues

// In-memory storage shared across function calls
let printJobs = [];

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
      const { sessionId, files, printOptions, pricing, payment } = req.body;

      const job = {
        id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sessionId,
        fileName: files && files.length > 0 ? files[0].originalName : 'document.pdf',
        fileUrl: null,
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

      // Keep only last 50 jobs
      if (printJobs.length > 50) {
        printJobs = printJobs.slice(-50);
      }

      console.log('Print job created:', job.id);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          message: 'Print job created successfully'
        }
      });
      return;
    } catch (error) {
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
      // Return all pending jobs
      const response = {
        success: true,
        jobs: printJobs.filter(job => job.status === 'pending'),
        message: 'Pending jobs retrieved'
      };

      res.status(200).json(response);
    } catch (error) {
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
