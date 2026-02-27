// Serverless function for canceling print jobs
// Import shared job storage
const jobStorage = require('./simple-db');

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
    // Extract sessionId from URL path
    const urlParts = req.url.split('/');
    const sessionId = urlParts[3]; // /api/print-jobs/{sessionId}/cancel
    
    console.log(`Canceling print job for session: ${sessionId}`);
    
    // Remove all jobs for this session
    const removedCount = jobStorage.removeJobsBySession(sessionId);
    
    // Force sync
    jobStorage.forceSync();
    
    res.status(200).json({
      success: true,
      message: `Print job canceled successfully (${removedCount} jobs removed)`,
      sessionId
    });
  } catch (error) {
    console.error('Cancel job error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel print job',
    });
  }
};
