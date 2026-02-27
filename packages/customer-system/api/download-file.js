// Serverless function for file download
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
    return;
  }

  try {
    // Get file path from query parameter
    const { filePath } = req.query;

    if (!filePath) {
      throw new Error('File path is required');
    }

    // Security: Ensure file path is within upload directory
    const UPLOAD_DIR = '/tmp/acchu-uploads';
    const normalizedPath = path.normalize(filePath);
    
    if (!normalizedPath.startsWith(UPLOAD_DIR)) {
      throw new Error('Invalid file path');
    }

    // Check if file exists
    if (!fs.existsSync(normalizedPath)) {
      throw new Error('File not found');
    }

    // Read file
    const fileBuffer = fs.readFileSync(normalizedPath);
    const fileName = path.basename(normalizedPath);
    
    // Get file stats for content type
    const stats = fs.statSync(normalizedPath);
    const ext = path.extname(normalizedPath).toLowerCase();
    
    // Set content type based on extension
    let contentType = 'application/octet-stream';
    if (ext === '.pdf') contentType = 'application/pdf';
    else if (ext === '.doc') contentType = 'application/msword';
    else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';

    // Set headers for file download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // Send file
    res.status(200).send(fileBuffer);

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download file'
    });
  }
};
