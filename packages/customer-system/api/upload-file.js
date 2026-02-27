// Serverless function for file upload - FAST VERSION with busboy
const Busboy = require('busboy');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const mkdir = promisify(fs.mkdir);

// Vercel has /tmp directory for temporary storage
const UPLOAD_DIR = '/tmp/acchu-uploads';

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

// Get page count for PDF files (quick estimation)
function getPDFPageCount(buffer) {
  try {
    // Quick estimation - only check first 100KB
    const sample = buffer.slice(0, Math.min(buffer.length, 100000));
    const text = sample.toString('latin1');
    const matches = text.match(/\/Type[\s]*\/Page[^s]/g);
    return matches ? matches.length : 1;
  } catch (err) {
    return 1;
  }
}

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

  const startTime = Date.now();

  try {
    await ensureUploadDir();

    const busboy = Busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
        files: 1
      }
    });

    const fields = {};
    let fileData = null;
    let fileName = null;
    let mimeType = null;
    let uploadError = null;

    // Handle form fields
    busboy.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    // Handle file upload
    busboy.on('file', (fieldname, file, info) => {
      fileName = info.filename;
      mimeType = info.mimeType;
      
      const chunks = [];
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      file.on('end', () => {
        fileData = Buffer.concat(chunks);
        console.log(`File received: ${fileName} (${(fileData.length / 1024).toFixed(1)}KB)`);
      });
      
      file.on('error', (err) => {
        uploadError = err;
      });
    });

    // Handle completion
    await new Promise((resolve, reject) => {
      busboy.on('finish', resolve);
      busboy.on('error', reject);
      req.pipe(busboy);
    });

    if (uploadError) {
      throw uploadError;
    }

    if (!fileData) {
      throw new Error('No file uploaded');
    }

    const sessionId = fields.sessionId;
    const fileId = fields.fileId;

    if (!sessionId) {
      throw new Error('Session ID is required');
    }

    if (!fileId) {
      throw new Error('File ID is required');
    }

    // Create session directory
    const sessionDir = path.join(UPLOAD_DIR, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Generate unique filename
    const ext = path.extname(fileName);
    const safeFileName = `${fileId}${ext}`;
    const finalPath = path.join(sessionDir, safeFileName);

    // Write file to disk synchronously (faster for small files)
    fs.writeFileSync(finalPath, fileData);

    // Get page count for PDFs (quick estimation)
    let pageCount = 1;
    if (mimeType === 'application/pdf') {
      pageCount = getPDFPageCount(fileData);
    }

    // Create file metadata
    const metadata = {
      id: fileId,
      originalName: fileName,
      mimeType: mimeType,
      size: fileData.length,
      uploadedAt: new Date().toISOString(),
      serverPath: finalPath,
      pageCount: pageCount
    };

    const uploadTime = Date.now() - startTime;
    console.log(`✓ Upload complete: ${fileName} (${(fileData.length / 1024).toFixed(1)}KB, ${pageCount} pages) in ${uploadTime}ms`);

    res.status(201).json({
      success: true,
      data: metadata,
      message: 'File uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload file'
    });
  }
};
