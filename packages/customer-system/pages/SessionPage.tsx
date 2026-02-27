import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SessionInfo, FileMetadata, PrintOptions, PriceBreakdown, PaymentRequest, PaymentStatus, SessionStatus, JobStatus } from '../types/shared-types';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import FileUpload from '../components/FileUpload';
import PrintOptionsComponent from '../components/PrintOptions';
import PaymentInterface from '../components/PaymentInterface';
import '../components/FileUpload.css';
import '../components/PrintOptions.css';
import '../components/PaymentInterface.css';
import './SessionPage.css';

type WorkflowStep = 'scan' | 'upload' | 'config' | 'print';

function SessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { 
    isConnected, 
    connectionState, 
    sessionStatus, 
    printStatus, 
    errorMessage: wsErrorMessage, 
    clearError 
  } = useWebSocketContext();
  
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileMetadata[]>([]);
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null);
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [printProgress, setPrintProgress] = useState<{
    status: JobStatus;
    progress?: number;
    message?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    // Skip fetching session info - work with client-side state only
    setLoading(false);
  }, [sessionId]);

  // Handle WebSocket session status updates
  useEffect(() => {
    if (sessionStatus) {
      console.log('Session status update:', sessionStatus);
      
      switch (sessionStatus.status) {
        case SessionStatus.TERMINATED:
          setError('Session has been terminated');
          break;
        case SessionStatus.PRINTING:
          setCurrentStep('print');
          break;
        case SessionStatus.COMPLETED:
          if (currentStep === 'print') {
            setPrintProgress({
              status: JobStatus.COMPLETED,
              message: 'Print job completed successfully!'
            });
          }
          break;
      }
    }
  }, [sessionStatus, currentStep]);

  // Handle WebSocket print status updates
  useEffect(() => {
    if (printStatus) {
      console.log('Print status update:', printStatus);
      
      setPrintProgress({
        status: printStatus.status,
        progress: printStatus.progress,
        message: printStatus.message,
        error: printStatus.error
      });

      switch (printStatus.status) {
        case JobStatus.PRINTING:
          setCurrentStep('print');
          break;
        case JobStatus.COMPLETED:
          setPrintProgress(prev => ({
            ...prev!,
            message: 'Print job completed successfully! You can collect your documents.'
          }));
          break;
        case JobStatus.FAILED:
          break;
      }
    }
  }, [printStatus]);

  // Handle WebSocket connection errors
  useEffect(() => {
    if (wsErrorMessage) {
      setError(wsErrorMessage);
      const timer = setTimeout(() => {
        clearError();
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [wsErrorMessage, clearError]);

  const handleFilesUploaded = (files: FileMetadata[]) => {
    setUploadedFiles(files);
    if (files.length > 0) {
      setCurrentStep('config');
    }
  };

  const handleOptionsChange = (options: PrintOptions, newPricing: PriceBreakdown) => {
    setPrintOptions(options);
    setPricing(newPricing);
  };

  const handlePaymentComplete = (payment: PaymentRequest) => {
    setPaymentRequest(payment);
    setCurrentStep('print');
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => setError(null), 5000);
  };

  const handleStartPrint = async () => {
    if (!sessionId || !paymentRequest || !printOptions) {
      handleError('Missing required information for print job');
      return;
    }

    try {
      setPrintProgress({
        status: JobStatus.PRINTING,
        progress: 0,
        message: 'Starting print job...'
      });

      // Submit print job to the backend
      const response = await fetch(`/api/print-jobs/${sessionId}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printOptions,
          transactionId: paymentRequest.transactionId,
          files: uploadedFiles.map(file => ({
            id: file.id,
            name: file.originalName,
            size: file.size,
            pageCount: file.pageCount || 1
          }))
        }),
      });

      const result = await response.json();

      if (result.success) {
        setPrintProgress({
          status: JobStatus.PRINTING,
          progress: 50,
          message: 'Print job submitted successfully'
        });

        // Simulate print completion for demo
        setTimeout(() => {
          setPrintProgress({
            status: JobStatus.COMPLETED,
            progress: 100,
            message: 'Print job completed successfully!'
          });
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to submit print job');
      }
    } catch (error) {
      console.error('Print job error:', error);
      setPrintProgress({
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : 'Failed to submit print job. Please try again.'
      });
    }
  };

  const handleDeleteFile = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      setUploadedFiles(prevFiles => prevFiles.filter(f => f.id !== fileId));
    }
  };

  const handleAddMoreFiles = () => {
    setCurrentStep('upload');
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="mobile-app loading-state">
        <div className="loading-content">Loading session...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mobile-app error-state">
        <div className="error-content">
          <h2>Session Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

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
        <div className={`step ${currentStep === 'config' ? 'active' : printOptions ? 'completed' : ''}`}>
          <span className="step-number">02</span>
          <span className="step-label">CONFIG</span>
        </div>
        <div className={`step ${currentStep === 'print' ? 'active' : printProgress?.status === JobStatus.COMPLETED ? 'completed' : ''}`}>
          <span className="step-number">03</span>
          <span className="step-label">PRINT</span>
        </div>
      </div>

      <main className="mobile-main">
        {currentStep === 'upload' && (
          <div className="upload-step">
            <h1 className="step-title">SECURE UPLOAD</h1>
            <p className="step-subtitle">
              Select documents from your device or<br />
              cloud storage. Files are encrypted<br />
              end-to-end.
            </p>

            <div className="upload-area">
              <div className="upload-icon">☁</div>
              <div className="upload-text">Tap to select files</div>
              <div className="file-types">PDF, DOCX, JPG, PNG (Max 50MB)</div>
            </div>

            <div className="import-section">
              <div className="section-label">OR IMPORT FROM</div>
              <button className="import-btn">
                <span className="import-icon">📁</span>
                <span>Files</span>
              </button>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="pending-queue">
                <div className="section-label">PENDING QUEUE ({uploadedFiles.length} files)</div>
                {uploadedFiles.map((file, index) => (
                  <div key={file.id} className="file-item" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '16px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '12px',
                    marginBottom: '12px',
                    background: 'white'
                  }}>
                    <div className="file-info" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="file-icon">📄</div>
                      <div className="file-details">
                        <div className="file-name">{file.originalName}</div>
                        <div className="file-meta">{formatFileSize(file.size)} • {file.pageCount || 1} pages</div>
                      </div>
                    </div>
                    <button 
                      className="remove-file"
                      onClick={() => handleDeleteFile(file.id)}
                      title="Delete file"
                      style={{
                        width: '44px',
                        height: '44px',
                        border: 'none',
                        background: '#ff4444',
                        borderRadius: '8px',
                        color: 'white',
                        fontSize: '22px',
                        cursor: 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#cc0000';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#ff4444';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                
                <button className="continue-btn" onClick={() => setCurrentStep('config')}>
                  CONTINUE TO CONFIG →
                </button>
              </div>
            )}

            <FileUpload
              sessionId={sessionId!}
              onFilesUploaded={handleFilesUploaded}
              onError={handleError}
            />
          </div>
        )}

        {currentStep === 'config' && (
          <div className="config-step">
            <h1 className="step-title">PRINT CONFIG</h1>
            <p className="step-subtitle">
              Configure your print settings and<br />
              review before proceeding.
            </p>

            {/* Show uploaded files list */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '16px',
              margin: '20px 0',
              border: '1px solid #e5e7eb'
            }}>
              <div className="section-label">UPLOADED FILES ({uploadedFiles.length})</div>
              {uploadedFiles.map((file) => (
                <div key={file.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flex: 1,
                    minWidth: 0
                  }}>
                    <span style={{ fontSize: '18px' }}>📄</span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#1f2937',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>{file.originalName}</span>
                    <span style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      background: '#e5e7eb',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 600
                    }}>{file.pageCount || 1}p</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteFile(file.id)}
                    title="Delete"
                    style={{
                      width: '40px',
                      height: '40px',
                      border: 'none',
                      background: '#ff4444',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '20px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#cc0000';
                      e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ff4444';
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
              <button onClick={handleAddMoreFiles} style={{
                width: '100%',
                padding: '12px',
                background: 'white',
                color: '#1a1a1a',
                border: '2px dashed #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '8px'
              }}>
                + Add More Files
              </button>
            </div>

            <PrintOptionsComponent
              files={uploadedFiles}
              onOptionsChange={handleOptionsChange}
              onError={handleError}
            />

            <button className="continue-btn" onClick={() => setCurrentStep('print')}>
              PROCEED TO PRINT →
            </button>
          </div>
        )}

        {currentStep === 'print' && (
          <div className="print-step">
            <h1 className="step-title">PRINT JOB<br />CONFIRMED</h1>

            <div className="qr-frame">
              <div className="qr-container">
                <div className="qr-placeholder">
                  <div className="qr-code">
                    {/* QR Code for kiosk scanning */}
                    <div className="qr-pattern">
                      <div className="qr-squares">
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                        <div className="qr-square"></div>
                      </div>
                    </div>
                  </div>
                  <div className="qr-label">PRINT JOB</div>
                </div>
              </div>
            </div>

            <div className="scan-instruction">
              <div className="scan-icon">📱</div>
              <div className="scan-text">READY TO SCAN</div>
              <p className="scan-subtitle">
                Present this code at the kiosk<br />
                scanner to release your document.
              </p>
            </div>

            {/* FILES LIST WITH DELETE OPTION */}
            <div style={{
              background: '#f9fafb',
              borderRadius: '12px',
              padding: '16px',
              margin: '20px 0'
            }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#6b7280',
                letterSpacing: '0.05em',
                marginBottom: '12px'
              }}>FILES ({uploadedFiles.length})</div>
              {uploadedFiles.map((file) => (
                <div key={file.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px',
                  background: 'white',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flex: 1,
                    minWidth: 0
                  }}>
                    <span style={{ fontSize: '18px' }}>📄</span>
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#1f2937',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>{file.originalName}</span>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm('Delete this file? This will cancel the print job and you\'ll need to start over.')) {
                        handleDeleteFile(file.id);
                        setCurrentStep('upload');
                      }
                    }}
                    title="Delete file"
                    style={{
                      width: '36px',
                      height: '36px',
                      border: 'none',
                      background: '#ff4444',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '18px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            {/* EDIT AND CANCEL BUTTONS */}
            <div style={{
              display: 'flex',
              gap: '12px',
              margin: '20px 0'
            }}>
              <button 
                onClick={() => {
                  if (confirm('Go back to edit print settings?')) {
                    setCurrentStep('config');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                ✏️ Edit Settings
              </button>
              <button 
                onClick={() => {
                  if (confirm('Cancel this print job? You\'ll return to the upload step.')) {
                    setUploadedFiles([]);
                    setPrintOptions(null);
                    setPricing(null);
                    setPaymentRequest(null);
                    setCurrentStep('upload');
                  }
                }}
                style={{
                  flex: 1,
                  padding: '14px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                ❌ Cancel Job
              </button>
            </div>

            {/* GPay UPI QR Code Section */}
            <div className="upi-payment-section">
              <div className="upi-header">
                <div className="upi-icon">📎</div>
                <div className="upi-name">Aneesh Nikam</div>
              </div>
              
              <div className="upi-qr-container">
                <div className="upi-qr-code">
                  {/* GPay UPI QR Code Pattern */}
                  <div className="upi-qr-pattern">
                    <div className="upi-qr-squares">
                      {Array.from({ length: 25 }, (_, i) => (
                        <div key={i} className="upi-qr-square"></div>
                      ))}
                    </div>
                    <div className="gpay-logo">
                      <div className="gpay-icon">💳</div>
                    </div>
                  </div>
                </div>
                
                <div className="upi-id">UPI ID: aneeshnikam014@okaxis</div>
                <div className="upi-instruction">Scan to pay with any UPI app</div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mobile-footer">
        <div className="system-status">
          <div className="status-dot green"></div>
          <span>SYSTEM OPERATIONAL</span>
        </div>
        <div className="session-id">ID: #{sessionId?.slice(-4)}</div>
        <div className="version">v2.4.0</div>
      </footer>
    </div>
  );
}

export default SessionPage;