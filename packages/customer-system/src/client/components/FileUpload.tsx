import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FileMetadata, UploadResult, ApiResponse, PrintOptions } from '@sps/shared-types';

interface FileUploadProps {
  sessionId: string;
  onFilesUploaded: (files: FileMetadata[]) => void;
  onError: (error: string) => void;
  maxFiles?: number;
  maxFileSize?: number;
}

interface FileWithOptions {
  file: File;
  id: string;
  printOptions: PrintOptions;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
  metadata?: FileMetadata;
}

const SUPPORTED_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/jpeg': '.jpg',
  'image/png': '.png'
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB to match mobile UI

export default function FileUpload({ 
  sessionId, 
  onFilesUploaded, 
  onError,
  maxFiles = 10,
  maxFileSize = MAX_FILE_SIZE 
}: FileUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileWithOptions[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Expose file input trigger to parent component
  useEffect(() => {
    const handleUploadAreaClick = () => {
      fileInputRef.current?.click();
    };

    const uploadArea = document.querySelector('.upload-area');
    const importBtn = document.querySelector('.import-btn');
    
    if (uploadArea) {
      uploadArea.addEventListener('click', handleUploadAreaClick);
    }
    if (importBtn) {
      importBtn.addEventListener('click', handleUploadAreaClick);
    }

    return () => {
      if (uploadArea) {
        uploadArea.removeEventListener('click', handleUploadAreaClick);
      }
      if (importBtn) {
        importBtn.removeEventListener('click', handleUploadAreaClick);
      }
    };
  }, []);

  const validateFile = (file: File): string | null => {
    if (!Object.keys(SUPPORTED_TYPES).includes(file.type)) {
      return `Unsupported file type: ${file.type}. Supported formats: PDF, DOC, DOCX, JPG, PNG`;
    }
    
    if (file.size > maxFileSize) {
      return `File size exceeds ${Math.round(maxFileSize / (1024 * 1024))}MB limit`;
    }
    
    if (selectedFiles.length >= maxFiles) {
      return `Maximum ${maxFiles} files allowed per session`;
    }
    
    return null;
  };

  const addFiles = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    const validFiles: FileWithOptions[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        // Check for duplicates
        const isDuplicate = selectedFiles.some(f => 
          f.file.name === file.name && f.file.size === file.size
        );
        
        if (!isDuplicate) {
          const fileWithOptions: FileWithOptions = {
            file,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            printOptions: {
              copies: 1,
              colorMode: 'bw',
              duplex: false,
              paperSize: 'A4'
            },
            status: 'pending',
            progress: 0
          };
          validFiles.push(fileWithOptions);
        }
      }
    }

    if (errors.length > 0) {
      onError(errors.join('\n'));
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
      // Auto-upload files immediately after selection
      setTimeout(() => uploadFiles(validFiles), 100);
    }
  }, [selectedFiles, maxFiles, maxFileSize, onError]);

  const uploadFiles = async (filesToUpload: FileWithOptions[]) => {
    setIsUploading(true);
    const uploadedMetadata: FileMetadata[] = [];

    for (const fileWithOptions of filesToUpload) {
      try {
        // Update status to uploading
        setSelectedFiles(prev => 
          prev.map(f => 
            f.id === fileWithOptions.id 
              ? { ...f, status: 'uploading', progress: 0 }
              : f
          )
        );

        // Mock upload for demo - no API calls
        await new Promise<void>((resolve) => {
          // Simulate upload progress
          let progress = 0;
          const interval = setInterval(() => {
            progress += 20;
            setSelectedFiles(prev => 
              prev.map(f => 
                f.id === fileWithOptions.id ? { ...f, progress } : f
              )
            );
            
            if (progress >= 100) {
              clearInterval(interval);
              
              // Create mock metadata
              const metadata: FileMetadata = {
                id: fileWithOptions.id,
                originalName: fileWithOptions.file.name,
                mimeType: fileWithOptions.file.type,
                size: fileWithOptions.file.size,
                uploadedAt: new Date(),
                localPath: `/tmp/sessions/${sessionId}/${fileWithOptions.file.name}`,
                pageCount: fileWithOptions.file.type === 'application/pdf' ? Math.floor(Math.random() * 10) + 1 : 1
              };
              
              setSelectedFiles(prev => 
                prev.map(f => 
                  f.id === fileWithOptions.id 
                    ? { ...f, status: 'completed', progress: 100, metadata }
                    : f
                )
              );
              uploadedMetadata.push(metadata);
              resolve();
            }
          }, 200);
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setSelectedFiles(prev => 
          prev.map(f => 
            f.id === fileWithOptions.id 
              ? { ...f, status: 'error', error: errorMessage }
              : f
          )
        );
        onError(`Failed to upload ${fileWithOptions.file.name}: ${errorMessage}`);
      }
    }

    setIsUploading(false);
    
    if (uploadedMetadata.length > 0) {
      onFilesUploaded(uploadedMetadata);
    }
  };

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
  }, [addFiles]);

  // Return hidden file input - the mobile UI handles the visual presentation
  return (
    <div className="file-upload-container" style={{ display: 'none' }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}