// Serverless function to delete files after printing
const fs = require('fs');
const path = require('path');

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
    const { sessionId } = req.body;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    // Delete entire session directory
    const UPLOAD_DIR = '/tmp/acchu-uploads';
    const sessionDir = path.join(UPLOAD_DIR, sessionId);

    if (fs.existsSync(sessionDir)) {
      // Delete all files in session directory
      const files = fs.readdirSync(sessionDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(sessionDir, file);
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`Deleted file: ${filePath}`);
        } catch (err) {
          console.error(`Failed to delete file ${filePath}:`, err);
        }
      }

      // Delete session directory
      try {
        fs.rmdirSync(sessionDir);
        console.log(`Deleted session directory: ${sessionDir}`);
      } catch (err) {
        console.error(`Failed to delete directory ${sessionDir}:`, err);
      }

      res.status(200).json({
        success: true,
        message: `Deleted ${deletedCount} files for session ${sessionId}`
      });
    } else {
      res.status(200).json({
        success: true,
        message: 'Session directory not found (already deleted)'
      });
    }

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete files'
    });
  }
};
