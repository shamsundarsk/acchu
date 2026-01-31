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
      'image/png'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
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
  } catch (error) {
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