"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileRoutes = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
exports.fileRoutes = router;
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
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
        }
        else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    },
});
// Upload files to session
router.post('/:sessionId/upload', upload.array('files', 10), async (req, res) => {
    try {
        const { sessionId } = req.params;
        const files = req.files;
        if (!files || files.length === 0) {
            const response = {
                success: false,
                error: 'No files provided',
            };
            return res.status(400).json(response);
        }
        const uploadResults = [];
        for (const file of files) {
            // TODO: Send file to Local Agent for processing
            const uploadResult = {
                fileId: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                metadata: {
                    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    uploadedAt: new Date(),
                    localPath: '', // Will be set by Local Agent
                },
            };
            uploadResults.push(uploadResult);
        }
        const response = {
            success: true,
            data: uploadResults,
        };
        res.json(response);
    }
    catch (error) {
        const response = {
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
        const response = {
            success: true,
            data: [], // Mock empty files list
        };
        res.json(response);
    }
    catch (error) {
        const response = {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get files',
        };
        res.status(500).json(response);
    }
});
//# sourceMappingURL=files.js.map