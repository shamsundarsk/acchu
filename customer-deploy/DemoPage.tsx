import React, { useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import './index.css';

type DemoStep = 'upload' | 'config' | 'payment' | 'processing' | 'success';

interface UploadedFile {
  file: File;
  id: string;
}

function DemoPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [currentStep, setCurrentStep] = useState<DemoStep>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [printConfig, setPrintConfig] = useState({
    copies: 1,
    colorMode: 'bw',
    duplex: false
  });
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('upi');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const newFiles = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9)
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length > 0) {
      setCurrentStep('config');
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    const newFiles = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9)
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    if (newFiles.length > 0) {
      setCurrentStep('config');
    }
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
    if (uploadedFiles.length <= 1) {
      setCurrentStep('upload');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const calculateBill = () => {
    const estimatedPages = uploadedFiles.length * 2; // 2 pages per file average
    const totalPages = estimatedPages * printConfig.copies;
    const pricePerPage = printConfig.colorMode === 'color' ? 5 : 2;
    const baseAmount = totalPages * pricePerPage;
    const discount = printConfig.duplex ? Math.floor(baseAmount * 0.1) : 0;
    const totalAmount = baseAmount - discount;
    
    return {
      files: uploadedFiles.length,
      pages: estimatedPages,
      totalPages,
      baseAmount,
      discount,
      totalAmount
    };
  };

  const handlePayment = async () => {
    setCurrentStep('processing');
    setIsProcessing(true);

    try {
      // Validate sessionId
      if (!sessionId) {
        throw new Error('Session ID is missing. Please access this page through a valid session link.');
      }

      console.log('Starting payment process for session:', sessionId);

      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Prepare form data for upload
      const formData = new FormData();
      uploadedFiles.forEach(({ file }) => {
        formData.append('Files', file); // Use 'Files' to match the model property
      });

      // Add form fields (match model property names exactly)
      formData.append('SessionId', sessionId);
      formData.append('Copies', printConfig.copies.toString());
      formData.append('ColorMode', printConfig.colorMode);
      formData.append('Quality', 'standard');
      formData.append('Pages', 'all');

      console.log('Uploading files...', {
        sessionId,
        fileCount: uploadedFiles.length,
        printConfig,
        formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
          key,
          value: value instanceof File ? `File: ${value.name}` : value
        }))
      });

      // Upload to backend
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
      const response = await fetch(`${apiBaseUrl}/api/integration/customer/upload`, {
        method: 'POST',
        body: formData
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);

      if (result.success) {
        setCurrentStep('success');
      } else {
        throw new Error(result.error || result.message || 'Upload failed');
      }
    } catch (error) {
      console.error('Payment/Upload error:', error);
      
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      alert(`Payment failed: ${errorMessage}`);
      setCurrentStep('payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setUploadedFiles([]);
    setPrintConfig({ copies: 1, colorMode: 'bw', duplex: false });
    setCurrentStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const bill = calculateBill();

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <div className="logo">
          <div className="logo-icon">A</div>
          <span className="logo-text">ACCHU</span>
        </div>
        <div className="session-info">
          #{sessionId?.slice(-4) || 'NO-ID'}
          {!sessionId && <span style={{color: 'red', fontSize: '10px', display: 'block'}}>Missing Session</span>}
        </div>
      </header>

      {/* Step Progress */}
      <div className="step-progress">
        <div className={`step ${currentStep === 'upload' ? 'active' : uploadedFiles.length > 0 ? 'completed' : ''}`}>
          <span className="step-number">01</span>
          <span className="step-label">UPLOAD</span>
        </div>
        <div className={`step ${currentStep === 'config' ? 'active' : ['payment', 'processing', 'success'].includes(currentStep) ? 'completed' : ''}`}>
          <span className="step-number">02</span>
          <span className="step-label">CONFIG</span>
        </div>
        <div className={`step ${['payment', 'processing'].includes(currentStep) ? 'active' : currentStep === 'success' ? 'completed' : ''}`}>
          <span className="step-number">03</span>
          <span className="step-label">PAY</span>
        </div>
      </div>

      <main className="mobile-main">
        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="upload-step">
            <h1 className="step-title">UPLOAD FILES</h1>
            <p className="step-subtitle">Select or drag files to upload for printing</p>
            
            <div 
              className="upload-area"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="upload-icon">📁</div>
              <p>Click or drag files here</p>
              <p className="upload-hint">PDF, DOC, DOCX, JPG, PNG</p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            
            {uploadedFiles.length > 0 && (
              <div className="file-list">
                {uploadedFiles.map(({ file, id }) => (
                  <div key={id} className="file-item">
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{formatFileSize(file.size)}</div>
                    </div>
                    <button onClick={() => removeFile(id)} className="remove-file">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Config Step */}
        {currentStep === 'config' && (
          <div className="config-step">
            <h1 className="step-title">PRINT SETTINGS</h1>
            <p className="step-subtitle">Configure your print preferences</p>
            
            <div className="config-form">
              <div className="config-group">
                <label>Number of Copies</label>
                <select 
                  value={printConfig.copies} 
                  onChange={(e) => setPrintConfig(prev => ({ ...prev, copies: parseInt(e.target.value) }))}
                >
                  <option value={1}>1 Copy</option>
                  <option value={2}>2 Copies</option>
                  <option value={3}>3 Copies</option>
                  <option value={4}>4 Copies</option>
                  <option value={5}>5 Copies</option>
                </select>
              </div>
              
              <div className="config-group">
                <label>Color Mode</label>
                <select 
                  value={printConfig.colorMode} 
                  onChange={(e) => setPrintConfig(prev => ({ ...prev, colorMode: e.target.value }))}
                >
                  <option value="bw">Black & White (₹2/page)</option>
                  <option value="color">Color (₹5/page)</option>
                </select>
              </div>
              
              <div className="config-group">
                <label>Print Style</label>
                <select 
                  value={printConfig.duplex.toString()} 
                  onChange={(e) => setPrintConfig(prev => ({ ...prev, duplex: e.target.value === 'true' }))}
                >
                  <option value="false">Single-sided</option>
                  <option value="true">Double-sided (10% discount)</option>
                </select>
              </div>
            </div>
            
            <button className="continue-btn" onClick={() => setCurrentStep('payment')}>
              Continue to Payment
            </button>
          </div>
        )}

        {/* Payment Step */}
        {currentStep === 'payment' && (
          <div className="payment-step">
            <h1 className="step-title">PAYMENT</h1>
            <p className="step-subtitle">Review your order and complete payment</p>
            
            <div className="bill-summary">
              <div className="bill-header">
                <h3>Order Summary</h3>
              </div>
              
              <div className="bill-details">
                <div className="bill-row">
                  <span>Files:</span>
                  <span>{bill.files} files</span>
                </div>
                <div className="bill-row">
                  <span>Pages (estimated):</span>
                  <span>{bill.pages} pages</span>
                </div>
                <div className="bill-row">
                  <span>Copies:</span>
                  <span>{printConfig.copies}</span>
                </div>
                <div className="bill-row">
                  <span>Color mode:</span>
                  <span>{printConfig.colorMode === 'color' ? 'Color' : 'Black & White'}</span>
                </div>
                <div className="bill-row">
                  <span>Print style:</span>
                  <span>{printConfig.duplex ? 'Double-sided' : 'Single-sided'}</span>
                </div>
                
                <div className="bill-divider"></div>
                
                <div className="bill-row">
                  <span>Base amount:</span>
                  <span>₹{bill.baseAmount}</span>
                </div>
                {bill.discount > 0 && (
                  <div className="bill-row discount">
                    <span>Discount (duplex):</span>
                    <span>-₹{bill.discount}</span>
                  </div>
                )}
                <div className="bill-row total">
                  <span>Total Amount:</span>
                  <span>₹{bill.totalAmount}</span>
                </div>
              </div>
            </div>
            
            <button className="pay-btn" onClick={handlePayment} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <div className="spinner-small"></div>
                  Processing...
                </>
              ) : (
                <>
                  💳 Pay ₹{bill.totalAmount} & Print
                </>
              )}
            </button>
            
            <div className="payment-info">
              <p>✅ Secure payment processing</p>
              <p>🔒 Your files are encrypted and will be deleted after printing</p>
            </div>
          </div>
        )}

        {/* Processing Step */}
        {currentStep === 'processing' && (
          <div className="processing-step">
            <div className="loading-indicator">
              <div className="spinner"></div>
              <h2>Processing Payment</h2>
              <p>Please wait while we process your payment and send files to the print queue...</p>
            </div>
          </div>
        )}

        {/* Success Step */}
        {currentStep === 'success' && (
          <div className="success-step">
            <div className="success-icon">✅</div>
            <h1>Payment Successful!</h1>
            <p>Your print job has been sent to the shopkeeper for approval.</p>
            
            <div className="success-details">
              <div className="detail-row">
                <span>Session ID:</span>
                <span>{sessionId}</span>
              </div>
              <div className="detail-row">
                <span>Amount Paid:</span>
                <span>₹{bill.totalAmount}</span>
              </div>
              <div className="detail-row">
                <span>Files:</span>
                <span>{bill.files} files</span>
              </div>
            </div>
            
            <div className="next-steps">
              <h3>Next Steps:</h3>
              <ol>
                <li>Shopkeeper will review your files</li>
                <li>Print job will be approved</li>
                <li>Your documents will be printed</li>
                <li>Collect from the counter</li>
              </ol>
            </div>
            
            <button className="reset-btn" onClick={resetForm}>
              Print More Files
            </button>
          </div>
        )}
      </main>

      <footer className="mobile-footer">
        <div className="system-status">
          <div className="status-dot green"></div>
          <span>SYSTEM OPERATIONAL</span>
        </div>
      </footer>
    </div>
  );
}

export default DemoPage;