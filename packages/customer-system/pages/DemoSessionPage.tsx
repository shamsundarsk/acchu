import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './SessionPage.css';

type WorkflowStep = 'upload' | 'config' | 'print';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  file: File;
  config: {
    quality: 'standard' | 'high';
    color: 'bw' | 'color';
    pages: 'all' | 'custom';
    customRange?: string;
    copies: number;
  };
}

interface PrintJobResponse {
  success: boolean;
  data?: {
    sessionId: string;
    uploadedFiles: Array<{
      fileId: string;
      originalName: string;
      generatedName: string;
      size: number;
    }>;
    message: string;
  };
  error?: string;
}

function DemoSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [isSubmittingPrint, setIsSubmittingPrint] = useState<boolean>(false);
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);

  // Determine step based on sessionId
  useEffect(() => {
    if (sessionId?.includes('upload')) {
      setCurrentStep('upload');
    } else if (sessionId?.includes('config')) {
      setCurrentStep('config');
    } else if (sessionId?.includes('print')) {
      setCurrentStep('print');
    }
  }, [sessionId]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newFiles: UploadedFile[] = Array.from(files).map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      file: file,
      config: {
        quality: 'standard',
        color: 'bw',
        pages: 'all',
        copies: 1
      }
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const updateFileConfig = (fileIndex: number, configUpdate: Partial<UploadedFile['config']>) => {
    setUploadedFiles(prev => prev.map((file, index) => 
      index === fileIndex 
        ? { ...file, config: { ...file.config, ...configUpdate } }
        : file
    ));
  };

  const calculateEstimatedCost = (): number => {
    let totalCost = 0;
    
    uploadedFiles.forEach(file => {
      const estimatedPages = Math.max(1, Math.floor(file.size / 100000)); // ~100KB per page
      const baseCost = file.config.color === 'color' ? 6 : 2; // Color vs BW
      const fileCost = baseCost * estimatedPages * file.config.copies;
      totalCost += fileCost;
    });
    
    return totalCost;
  };

  useEffect(() => {
    setEstimatedCost(calculateEstimatedCost());
  }, [uploadedFiles]);

  const handleContinueToConfig = () => {
    if (uploadedFiles.length > 0) {
      setCurrentStep('config');
      setSelectedFileIndex(0);
    }
  };

  const handlePrint = async () => {
    if (uploadedFiles.length === 0) return;

    setIsSubmittingPrint(true);
    setCurrentStep('print');

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('SessionId', sessionId || 'demo-session');
      
      // Add files to form data
      uploadedFiles.forEach((uploadedFile, index) => {
        formData.append('Files', uploadedFile.file);
      });

      // Add print preferences (use first file's config for now)
      const firstFileConfig = uploadedFiles[0].config;
      formData.append('Copies', firstFileConfig.copies.toString());
      formData.append('ColorMode', firstFileConfig.color);
      formData.append('Quality', firstFileConfig.quality);
      formData.append('Pages', firstFileConfig.pages);
      if (firstFileConfig.customRange) {
        formData.append('CustomRange', firstFileConfig.customRange);
      }

      // Submit to backend
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const response = await fetch(`${apiBaseUrl}/api/integration/customer/upload`, {
        method: 'POST',
        body: formData
      });

      const result: PrintJobResponse = await response.json();

      if (result.success) {
        setSubmitSuccess(true);
        console.log('Files uploaded successfully:', result.data);
      } else {
        throw new Error(result.error || 'Upload failed');
      }

    } catch (error) {
      console.error('Error submitting print job:', error);
      alert('Failed to submit print job. Please try again.');
      setCurrentStep('config');
    } finally {
      setIsSubmittingPrint(false);
    }
  };

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <span className="logo-text">ACCHU</span>
        </div>
        <button className="notification-btn">🔔</button>
      </header>

      {/* Step Progress */}
      <div className="step-progress">
        <div className={`step ${currentStep === 'upload' ? 'active' : uploadedFiles.length > 0 ? 'completed' : ''}`}>
          <span className="step-number">01</span>
          <span className="step-label">UPLOAD</span>
        </div>
        <div className={`step ${currentStep === 'config' ? 'active' : currentStep === 'print' ? 'completed' : ''}`}>
          <span className="step-number">02</span>
          <span className="step-label">CONFIG</span>
        </div>
        <div className={`step ${currentStep === 'print' ? 'active' : ''}`}>
          <span className="step-number">03</span>
          <span className="step-label">PRINT</span>
        </div>
      </div>

      <main className="mobile-main">
        {currentStep === 'upload' && (
          <div className="upload-step">
            <h1 className="step-title">SECURE UPLOAD</h1>
            <p className="step-subtitle">
              Select documents from your device.<br />
              Files are encrypted end-to-end.
            </p>

            <div className="upload-area" onClick={() => document.getElementById('file-input')?.click()}>
              <div className="upload-icon">☁</div>
              <div className="upload-text">Tap to select files</div>
              <div className="file-types">PDF, DOCX, JPG, PNG (Max 50MB)</div>
            </div>

            <input
              id="file-input"
              type="file"
              multiple
              accept=".pdf,.docx,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />

            {uploadedFiles.length > 0 && (
              <div className="pending-queue">
                <div className="section-label">UPLOADED FILES ({uploadedFiles.length})</div>
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="file-item">
                    <div className="file-info">
                      <div className="file-icon">📄</div>
                      <div className="file-details">
                        <div className="file-name">{file.name}</div>
                        <div className="file-meta">{formatFileSize(file.size)} • Ready</div>
                      </div>
                    </div>
                    <button className="remove-file" onClick={() => removeFile(file.id)}>×</button>
                  </div>
                ))}
                
                <button className="continue-btn" onClick={handleContinueToConfig}>
                  CONTINUE TO CONFIG →
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 'config' && uploadedFiles.length > 0 && (
          <div className="config-step">
            <h1 className="step-title">PRINT CONFIG</h1>
            <p className="step-subtitle">
              Configure print settings for each file.
            </p>

            {/* File Selector */}
            <div className="file-selector">
              <div className="section-label">SELECT FILE TO CONFIGURE</div>
              <div className="file-tabs">
                {uploadedFiles.map((file, index) => (
                  <button
                    key={file.id}
                    className={`file-tab ${selectedFileIndex === index ? 'active' : ''}`}
                    onClick={() => setSelectedFileIndex(index)}
                  >
                    <div className="file-tab-icon">📄</div>
                    <div className="file-tab-name">{file.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Config Options for Selected File */}
            <div className="print-options">
              <div className="section-label">SETTINGS FOR: {uploadedFiles[selectedFileIndex]?.name}</div>
              
              <div className="option-group">
                <label className="option-label">Print Quality</label>
                <div className="option-buttons">
                  <button 
                    className={`option-btn ${uploadedFiles[selectedFileIndex]?.config.quality === 'standard' ? 'active' : ''}`}
                    onClick={() => updateFileConfig(selectedFileIndex, { quality: 'standard' })}
                  >
                    Standard
                  </button>
                  <button 
                    className={`option-btn ${uploadedFiles[selectedFileIndex]?.config.quality === 'high' ? 'active' : ''}`}
                    onClick={() => updateFileConfig(selectedFileIndex, { quality: 'high' })}
                  >
                    High Quality
                  </button>
                </div>
              </div>

              <div className="option-group">
                <label className="option-label">Color Mode</label>
                <div className="option-buttons">
                  <button 
                    className={`option-btn ${uploadedFiles[selectedFileIndex]?.config.color === 'bw' ? 'active' : ''}`}
                    onClick={() => updateFileConfig(selectedFileIndex, { color: 'bw' })}
                  >
                    Black & White
                  </button>
                  <button 
                    className={`option-btn ${uploadedFiles[selectedFileIndex]?.config.color === 'color' ? 'active' : ''}`}
                    onClick={() => updateFileConfig(selectedFileIndex, { color: 'color' })}
                  >
                    Color
                  </button>
                </div>
              </div>

              <div className="option-group">
                <label className="option-label">Pages</label>
                <div className="option-buttons">
                  <button 
                    className={`option-btn ${uploadedFiles[selectedFileIndex]?.config.pages === 'all' ? 'active' : ''}`}
                    onClick={() => updateFileConfig(selectedFileIndex, { pages: 'all' })}
                  >
                    All Pages
                  </button>
                  <button 
                    className={`option-btn ${uploadedFiles[selectedFileIndex]?.config.pages === 'custom' ? 'active' : ''}`}
                    onClick={() => updateFileConfig(selectedFileIndex, { pages: 'custom' })}
                  >
                    Custom Range
                  </button>
                </div>
                {uploadedFiles[selectedFileIndex]?.config.pages === 'custom' && (
                  <input
                    type="text"
                    placeholder="e.g., 1-5, 8, 10-12"
                    className="custom-range-input"
                    value={uploadedFiles[selectedFileIndex]?.config.customRange || ''}
                    onChange={(e) => updateFileConfig(selectedFileIndex, { customRange: e.target.value })}
                  />
                )}
              </div>

              <div className="option-group">
                <label className="option-label">Copies</label>
                <div className="copy-controls">
                  <button 
                    className="copy-btn"
                    onClick={() => {
                      const currentCopies = uploadedFiles[selectedFileIndex]?.config.copies || 1;
                      if (currentCopies > 1) {
                        updateFileConfig(selectedFileIndex, { copies: currentCopies - 1 });
                      }
                    }}
                  >
                    -
                  </button>
                  <span className="copy-count">{uploadedFiles[selectedFileIndex]?.config.copies || 1}</span>
                  <button 
                    className="copy-btn"
                    onClick={() => {
                      const currentCopies = uploadedFiles[selectedFileIndex]?.config.copies || 1;
                      updateFileConfig(selectedFileIndex, { copies: currentCopies + 1 });
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <button className="print-btn" onClick={handlePrint} disabled={isSubmittingPrint}>
              {isSubmittingPrint ? 'SUBMITTING...' : 'PROCEED TO PRINT'} →
            </button>
          </div>
        )}

        {currentStep === 'print' && (
          <div className="print-step">
            <div className="step-header">
              <h2>🎉 Print Job Submitted!</h2>
              <p>Your files have been sent to the shopkeeper for printing</p>
            </div>

            {submitSuccess ? (
              <div className="success-message">
                <div className="success-icon">✅</div>
                <h3>Files Uploaded Successfully!</h3>
                <p>Your print job has been submitted to the shopkeeper.</p>
                <p>Please wait for the shopkeeper to print your documents.</p>
                
                <div className="job-summary">
                  <h4>Print Summary:</h4>
                  <ul>
                    {uploadedFiles.map((file, index) => (
                      <li key={index}>
                        <strong>{file.name}</strong> - {file.config.copies} copies, {file.config.color === 'color' ? 'Color' : 'Black & White'}
                      </li>
                    ))}
                  </ul>
                  <p><strong>Estimated Cost: ₹{estimatedCost.toFixed(2)}</strong></p>
                </div>

                <div className="next-steps">
                  <h4>Next Steps:</h4>
                  <ol>
                    <li>The shopkeeper will see your files on their dashboard</li>
                    <li>They will click the PRINT button to start printing</li>
                    <li>Your documents will be printed and ready for collection</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="loading-message">
                <div className="spinner"></div>
                <p>Uploading files to shopkeeper...</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default DemoSessionPage;