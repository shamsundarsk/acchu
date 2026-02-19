import { Router } from 'express';
import multer from 'multer';
import { ApiResponse, UploadResult } from '../types';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// Proxy route to AcchuSandboxEngine for file uploads
router.post('/upload-proxy', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files provided'
      });
    }

    // Create FormData to forward to AcchuSandboxEngine
    const FormData = require('form-data');
    const formData = new FormData();

    // Add files
    files.forEach(file => {
      formData.append('files', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
    });

    // Add form fields from request body
    Object.keys(req.body).forEach(key => {
      formData.append(key, req.body[key]);
    });

    console.log('Proxying upload to AcchuSandboxEngine:', {
      sessionId: req.body.sessionId,
      fileCount: files.length,
      files: files.map(f => ({ name: f.originalname, size: f.size }))
    });

    // Forward to AcchuSandboxEngine
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:8080/api/integration/customer/upload', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.json();
    
    // Forward the response back to the client
    res.status(response.status).json(result);

  } catch (error) {
    console.error('Proxy upload error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload proxy failed'
    });
  }
});

// Upload files to session
router.post('/:sessionId/upload', upload.single('file'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const file = req.file as Express.Multer.File;

    if (!file) {
      const response: ApiResponse = {
        success: false,
        error: 'No file provided',
      };
      return res.status(400).json(response);
    }

    // Mock successful upload (in real system, this would go to Local Agent)
    console.log(`Mock upload: ${file.originalname} (${file.size} bytes) for session ${sessionId}`);
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const uploadResult: UploadResult = {
      fileId: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedAt: new Date(),
        localPath: `/tmp/sessions/${sessionId}/${file.originalname}`, // Mock path
        pageCount: file.mimetype === 'application/pdf' ? Math.floor(Math.random() * 10) + 1 : undefined
      },
    };

    const response: ApiResponse<UploadResult> = {
      success: true,
      data: uploadResult,
      message: 'File uploaded successfully (mock)'
    };

    res.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'File upload failed',
    };
    res.status(500).json(response);
  }
});

// Get files for session
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // TODO: Get files from Local Agent
    const response: ApiResponse<any[]> = {
      success: true,
      data: [], // Mock empty files list
    };

    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get files',
    };
    res.status(500).json(response);
  }
});

export { router as fileRoutes };