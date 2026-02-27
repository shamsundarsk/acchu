import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FileMetadata, ApiResponse, PrintOptions } from '../types';

interface UploadResult {
  success: boolean;
  file?: FileMetadata;
  error?: string;
}

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
    if (!sessionId) {
      onError('Session ID is missing. Please refresh the page.');
      return;
    }
    
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

        // REAL FILE UPLOAD - Create FormData
        const formData = new FormData();
        formData.append('file', fileWithOptions.file);
        formData.append('sessionId', sessionId);
        formData.append('fileId', fileWithOptions.id);

        // Upload to backend
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setSelectedFiles(prev => 
              prev.map(f => 
                f.id === fileWithOptions.id ? { ...f, progress } : f
              )
            );
          }
        });

        // Handle upload completion
        const uploadPromise = new Promise<FileMetadata>((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status === 200 || xhr.status === 201) {
              try {
                const response = JSON.parse(xhr.responseText);
                if (response.success && response.data) {
                  resolve(response.data);
                } else {
                  reject(new Error(response.error || 'Upload failed'));
                }
              } catch (err) {
                reject(new Error('Invalid response from server'));
              }
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
          });

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload aborted'));
          });
        });

        // Send the request
        xhr.open('POST', 'https://backend-server-iota-sand.vercel.app/api/upload-file');
        xhr.send(formData);

        // Wait for upload to complete
        const metadata = await uploadPromise;
        
        setSelectedFiles(prev => 
          prev.map(f => 
            f.id === fileWithOptions.id 
              ? { ...f, status: 'completed', progress: 100, metadata }
              : f
          )
        );
        
        uploadedMetadata.push(metadata);

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