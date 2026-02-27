import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SessionInfo, FileMetadata, PrintOptions, PriceBreakdown, PaymentRequest, PaymentStatus, SessionStatus, JobStatus } from '../types';
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
  const [loading, setLoading] = useState(false); // Changed to false - no need to load anything
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileMetadata[]>([]);
  const [printOptions, setPrintOptions] = useState<PrintOptions | null>(null);
  const [pricing, setPricing] = useState<PriceBreakdown | null>(null);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  
  // Debug logging
  useEffect(() => {
    console.log('Current step:', currentStep);
    console.log('Uploaded files:', uploadedFiles.length);
    console.log('Print options:', printOptions);
    console.log('Pricing:', pricing);
    console.log('Payment request:', paymentRequest);
  }, [currentStep, uploadedFiles, printOptions, pricing, paymentRequest]);
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

    // For demo purposes, if sessionId contains 'demo', skip to print step
    if (sessionId.includes('demo')) {
      setUploadedFiles([
        {
          id: 'demo-file-1',
          originalName: 'test-document.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          uploadedAt: new Date(),
          localPath: '/tmp/demo-file.pdf',
          pageCount: 5
        }
      ]);
      setPrintOptions({
        copies: 2,
        isColor: true,
        isDuplex: false,
        quality: 'high'
      });
      setPricing({
        basePrice: 500,
        colorSurcharge: 200,
        duplexDiscount: 0,
        totalPages: 10,
        totalAmount: 1400
      });
      setCurrentStep('print');
      setLoading(false);
      return;
    }

    fetchSessionInfo();
  }, [sessionId]);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    if (sessionId && isConnected) {
      // Send join session message to get updates for this session
      const joinMessage = {
        type: 'join-session',
        sessionId: sessionId
      };
      
      // Send via WebSocket if available
      if (window.WebSocket) {
        console.log('Joining session for WebSocket updates:', sessionId);
      }
    }
  }, [sessionId, isConnected]);

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
      // Skip API call for demo - just set loading to false
      setLoading(false);
    } catch (err) {
      setError('Network error occurred');
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

  const handlePaymentComplete = async (payment: PaymentRequest) => {
    setPaymentRequest(payment);
    setCurrentStep('print');
    
    // Automatically send print job to shopkeeper's queue after payment confirmation
    await sendPrintJobToQueue(payment);
  };

  const sendPrintJobToQueue = async (payment: PaymentRequest) => {
    try {
      setPrintProgress({
        status: JobStatus.QUEUED,
        message: 'Sending to shopkeeper...'
      });

      // Send job to backend
      const response = await fetch('/api/print-jobs/pending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          files: uploadedFiles,
          printOptions,
          pricing,
          payment
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create print job');
      }

      const result = await response.json();

      if (result.success) {
        setPrintProgress({
          status: JobStatus.QUEUED,
          message: 'Print job sent to shopkeeper queue successfully!'
        });
      } else {
        throw new Error(result.error || 'Failed to create print job');
      }

    } catch (error) {
      console.error('Error sending print job to queue:', error);
      setPrintProgress({
        status: JobStatus.FAILED,
        error: 'Failed to send print job to queue. Please try again.'
      });
    }
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

  // For demo, always show as valid session

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

            {pricing && printOptions && (
              <>
                <div className="pricing-summary">
                  <div className="price-row">
                    <span>Pages:</span>
                    <span>{pricing.totalPages}</span>
                  </div>
                  <div className="price-row">
                    <span>Copies:</span>
                    <span>{printOptions.copies || 1}</span>
                  </div>
                  <div className="price-row total">
                    <span>Total:</span>
                    <span>₹{((pricing.totalAmount || 0) / 100).toFixed(2)}</span>
                  </div>
                </div>

                <PaymentInterface
                  sessionId={sessionId!}
                  pricing={pricing}
                  onPaymentComplete={handlePaymentComplete}
                  onError={handleError}
                  enabled={true}
                />
              </>
            )}
          </div>
        )}

        {currentStep === 'print' && (
          <div className="print-step">
            <h1 className="step-title">PRINT JOB<br />QUEUED</h1>

            <div className="queue-status-frame">
              <div className="queue-container">
                <div className="queue-icon">
                  <div className="printer-icon">🖨️</div>
                  <div className="queue-indicator">
                    <div className="queue-dots">
                      <div className="dot active"></div>
                      <div className="dot active"></div>
                      <div className="dot"></div>
                    </div>
                  </div>
                </div>
                <div className="queue-label">IN QUEUE</div>
              </div>
            </div>

            <div className="queue-instruction">
              <div className="status-icon">✅</div>
              <div className="status-text">SENT TO SHOPKEEPER</div>
              <p className="status-subtitle">
                Your print job has been sent to the<br />
                shopkeeper's queue. They will print it shortly.
              </p>
            </div>

            {printProgress && (
              <div className="print-progress">
                <div className="progress-header">
                  <span className="progress-label">Status:</span>
                  <span className={`progress-status ${printProgress.status.toLowerCase()}`}>
                    {printProgress.status}
                  </span>
                </div>
                
                {printProgress.progress !== undefined && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${printProgress.progress}%` }}
                    ></div>
                  </div>
                )}
                
                {printProgress.message && (
                  <div className="progress-message">{printProgress.message}</div>
                )}
                
                {printProgress.error && (
                  <div className="progress-error">{printProgress.error}</div>
                )}
              </div>
            )}

            {/* Customer Information Display */}
            <div className="customer-info-section">
              <div className="customer-header">
                <div className="customer-icon">👤</div>
                <div className="customer-name">Aneesh Nikam</div>
              </div>
              
              <div className="order-summary">
                <div className="summary-row">
                  <span>Files:</span>
                  <span>{uploadedFiles.length}</span>
                </div>
                <div className="summary-row">
                  <span>Pages:</span>
                  <span>{pricing?.totalPages || 0}</span>
                </div>
                <div className="summary-row">
                  <span>Copies:</span>
                  <span>{printOptions?.copies || 1}</span>
                </div>
                <div className="summary-row total">
                  <span>Total Paid:</span>
                  <span>₹{((pricing?.totalAmount || 0) / 100).toFixed(2)}</span>
                </div>
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