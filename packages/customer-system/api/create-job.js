// Serverless function to create print jobs
// Store jobs in memory (in production, use a database)

// In-memory storage (will reset on each deployment)
let printJobs = [];

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    const { sessionId, files, printOptions, pricing, payment } = req.body;

    // Create job
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      fileName: files && files.length > 0 ? files[0].originalName : 'document.pdf',
      fileUrl: null, // No actual file for demo
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

    // Add to jobs array
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
  } catch (error) {
    console.error('Error creating print job:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create print job'
    });
  }
};

// Export jobs for the pending endpoint to access
module.exports.printJobs = printJobs;
