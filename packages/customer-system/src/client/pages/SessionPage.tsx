import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SessionInfo, FileMetadata, PrintOptions, PriceBreakdown, PaymentRequest, PaymentStatus, SessionStatus, JobStatus } from '@sps/shared-types';
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

    fetchSessionInfo();
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

  const fetchSessionInfo = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json();

      if (data.success) {
        setSessionInfo(data.data);
        if (data.data.session.files) {
          setUploadedFiles(data.data.session.files);
          if (data.data.session.files.length > 0) {
            setCurrentStep('config');
          }
        }
        if (data.data.session.paymentStatus === PaymentStatus.COMPLETED) {
          setCurrentStep('print');
        }
      } else {
        setError(data.error || 'Failed to load session');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

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

  if (!sessionInfo?.isValid) {
    return (
      <div className="mobile-app error-state">
        <div className="error-content">
          <h2>Invalid Session</h2>
          <p>This session has expired or is not valid.</p>
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
                <div className="section-label">PENDING QUEUE</div>
                {uploadedFiles.map((file, index) => (
                  <div key={file.id} className="file-item">
                    <div className="file-info">
                      <div className="file-icon">📄</div>
                      <div className="file-details">
                        <div className="file-name">{file.originalName}</div>
                        <div className="file-meta">{formatFileSize(file.size)} • Ready</div>
                      </div>
                    </div>
                    <button className="remove-file">×</button>
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
              review before payment.
            </p>

            <PrintOptionsComponent
              files={uploadedFiles}
              onOptionsChange={handleOptionsChange}
              onError={handleError}
            />

            {pricing && (
              <div className="pricing-summary">
                <div className="price-row">
                  <span>Pages:</span>
                  <span>{pricing.totalPages}</span>
                </div>
                <div className="price-row">
                  <span>Copies:</span>
                  <span>{printOptions?.copies || 1}</span>
                </div>
                <div className="price-row total">
                  <span>Total:</span>
                  <span>₹{((pricing.totalAmount || 0) / 100).toFixed(2)}</span>
                </div>
              </div>
            )}

            <PaymentInterface
              sessionId={sessionId!}
              pricing={pricing!}
              onPaymentComplete={handlePaymentComplete}
              onError={handleError}
              enabled={uploadedFiles.length > 0}
            />
          </div>
        )}

        {currentStep === 'print' && (
          <div className="print-step">
            <h1 className="step-title">PRINT JOB<br />CONFIRMED</h1>

            <div className="qr-frame">
              <div className="qr-container">
                <div className="qr-placeholder">
                  <div className="qr-code">
                    {/* QR Code placeholder - would be actual QR in real implementation */}
                    <div className="qr-pattern"></div>
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

            {printProgress && (
              <div className="print-status">
                {printProgress.status === JobStatus.PRINTING && (
                  <div className="printing-indicator">
                    <div className="spinner"></div>
                    <span>Printing...</span>
                  </div>
                )}
                {printProgress.status === JobStatus.COMPLETED && (
                  <div className="completion-message">
                    <div className="success-icon">✅</div>
                    <span>Print completed!</span>
                  </div>
                )}
              </div>
            )}

            <button className="confirm-print-btn">
              <span className="print-icon">🖨</span>
              <span>CONFIRM & PRINT</span>
            </button>
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