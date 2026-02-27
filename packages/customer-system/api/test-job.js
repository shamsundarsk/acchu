// Test endpoint to manually add a job
const jobStorage = require('./simple-db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    // Add a test job
    const testJob = {
      id: `test_${Date.now()}`,
      sessionId: 'test-session',
      fileName: 'test-document.pdf',
      fileId: 'test-file-1',
      filePath: '/tmp/test.pdf',
      fileMetadata: {
        originalName: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        pageCount: 1
      },
      printOptions: {
        copies: 1,
        colorMode: 'bw',
        duplex: false,
        paperSize: 'A4'
      },
      pricing: {
        totalPages: 1,
        totalAmount: 100
      },
      paymentStatus: 'completed',
      status: 'pending',
      timestamp: new Date().toISOString()
    };
    
    jobStorage.addJob(testJob);
    jobStorage.forceSync();
    
    const allJobs = jobStorage.getAllJobs();
    
    res.status(200).json({
      success: true,
      message: 'Test job added',
      testJob,
      totalJobs: allJobs.length,
      allJobs
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
