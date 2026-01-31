import React, { useState, useEffect } from 'react';
import { SessionStatus, JobStatus, Session, PrintJob } from '../types';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { QRCodeDisplay } from './components/QRCodeDisplay';
import { SessionDashboard } from './components/SessionDashboard';
import { PrintQueue } from './components/PrintQueue';
import { SystemStatus } from './components/SystemStatus';
import { ErrorDisplay } from './components/ErrorDisplay';

interface QRCodeData {
  sessionId: string;
  url: string;
  token: string;
  qrCodeDataURL: string;
  expiresAt: Date;
}

interface PrinterStatus {
  name: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  isDefault: boolean;
  jobCount: number;
}

interface SystemError {
  id: string;
  type: 'session' | 'printer' | 'system' | 'network';
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

function App() {
  // Session state
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [qrCodeData, setQRCodeData] = useState<QRCodeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // UI state
  const [showConfiguration, setShowConfiguration] = useState(false);
  const [activeTab, setActiveTab] = useState<'session' | 'queue' | 'system'>('session');
  
  // Print queue state
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([]);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  
  // System state
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);
  const [systemHealth, setSystemHealth] = useState<'healthy' | 'warning' | 'error'>('healthy');

  // Auto-refresh session status
  useEffect(() => {
    if (currentSession) {
      const interval = setInterval(async () => {
        try {
          const sessionData = await window.electronAPI.getSessionStatus(currentSession.id);
          if (sessionData) {
            setCurrentSession(sessionData);
          } else {
            // Session expired or terminated
            setCurrentSession(null);
            setQRCodeData(null);
          }
        } catch (error) {
          console.error('Failed to refresh session status:', error);
        }
      }, 5000); // Refresh every 5 seconds

      return () => clearInterval(interval);
    }
  }, [currentSession]);

  // Auto-refresh printer status
  useEffect(() => {
    const refreshPrinterStatus = async () => {
      try {
        const status = await window.electronAPI.getPrinterStatus();
        setPrinterStatus(status);
      } catch (error) {
        console.error('Failed to get printer status:', error);
        addSystemError('printer', 'Failed to get printer status', 'medium');
      }
    };

    refreshPrinterStatus();
    const interval = setInterval(refreshPrinterStatus, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, []);

  const createNewSession = async () => {
    setIsLoading(true);
    try {
      const sessionId = await window.electronAPI.createSession();
      const sessionData = await window.electronAPI.getSessionStatus(sessionId);
      
      if (sessionData) {
        setCurrentSession(sessionData);
        
        // Get QR code data from the session manager
        try {
          const qrData = await window.electronAPI.getSessionQRCode(sessionData.id);
          if (qrData) {
            setQRCodeData(qrData);
          }
        } catch (error) {
          console.error('Failed to get QR code data:', error);
          addSystemError('session', 'Failed to generate QR code', 'medium');
        }
        
        // Switch to session tab
        setActiveTab('session');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      addSystemError('session', 'Failed to create new session', 'high');
    } finally {
      setIsLoading(false);
    }
  };

  const terminateSession = async () => {
    if (!currentSession) return;
    
    setIsLoading(true);
    try {
      await window.electronAPI.terminateSession(currentSession.id);
      setCurrentSession(null);
      setQRCodeData(null);
      setPrintJobs([]);
    } catch (error) {
      console.error('Failed to terminate session:', error);
      addSystemError('session', 'Failed to terminate session', 'high');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshQRCode = async () => {
    if (!currentSession) return;
    
    try {
      const newQRData = await window.electronAPI.regenerateSessionQRCode(currentSession.id);
      if (newQRData) {
        setQRCodeData(newQRData);
      }
    } catch (error) {
      console.error('Failed to refresh QR code:', error);
      addSystemError('session', 'Failed to refresh QR code', 'medium');
    }
  };

  const executePrintJob = async (jobId: string) => {
    if (!currentSession) return;
    
    try {
      const result = await window.electronAPI.executePrintJob(jobId);
      if (result.success) {
        // Refresh print jobs
        refreshPrintJobs();
      } else {
        addSystemError('printer', `Print job failed: ${result.error}`, 'high');
      }
    } catch (error) {
      console.error('Failed to execute print job:', error);
      addSystemError('printer', 'Failed to execute print job', 'high');
    }
  };

  const refreshPrintJobs = async () => {
    if (!currentSession) return;
    
    try {
      // This would get print jobs for the current session
      // For now, we'll use mock data
      const mockJobs: PrintJob[] = [];
      setPrintJobs(mockJobs);
    } catch (error) {
      console.error('Failed to refresh print jobs:', error);
    }
  };

  const addSystemError = (type: SystemError['type'], message: string, severity: SystemError['severity']) => {
    const error: SystemError = {
      id: `error-${Date.now()}`,
      type,
      message,
      timestamp: new Date(),
      severity
    };
    
    setSystemErrors(prev => [error, ...prev.slice(0, 9)]); // Keep last 10 errors
    
    // Update system health based on error severity
    if (severity === 'critical') {
      setSystemHealth('error');
    } else if (severity === 'high' && systemHealth === 'healthy') {
      setSystemHealth('warning');
    }
  };

  const dismissError = (errorId: string) => {
    setSystemErrors(prev => prev.filter(error => error.id !== errorId));
    
    // Recalculate system health
    const remainingErrors = systemErrors.filter(error => error.id !== errorId);
    if (remainingErrors.length === 0) {
      setSystemHealth('healthy');
    } else {
      const hasCritical = remainingErrors.some(error => error.severity === 'critical');
      const hasHigh = remainingErrors.some(error => error.severity === 'high');
      
      if (hasCritical) {
        setSystemHealth('error');
      } else if (hasHigh) {
        setSystemHealth('warning');
      } else {
        setSystemHealth('healthy');
      }
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>ACCHU Local Agent</h1>
            <p>Secure Print Session Management</p>
          </div>
          
          <div className="header-status">
            <div className={`system-health ${systemHealth}`}>
              <span className="status-indicator"></span>
              <span className="status-text">
                {systemHealth === 'healthy' ? 'System Healthy' : 
                 systemHealth === 'warning' ? 'System Warning' : 'System Error'}
              </span>
            </div>
          </div>
          
          <div className="header-actions">
            <button 
              onClick={() => setShowConfiguration(true)}
              className="btn-secondary"
            >
              Settings
            </button>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <nav className="app-nav">
          <button 
            className={`nav-tab ${activeTab === 'session' ? 'active' : ''}`}
            onClick={() => setActiveTab('session')}
          >
            Session Management
          </button>
          <button 
            className={`nav-tab ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Print Queue
          </button>
          <button 
            className={`nav-tab ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            System Status
          </button>
        </nav>
      </header>

      <main className="app-main">
        {/* Session Management Tab */}
        {activeTab === 'session' && (
          <div className="tab-content">
            {!currentSession ? (
              <SessionDashboard
                onCreateSession={createNewSession}
                isLoading={isLoading}
              />
            ) : (
              <div className="active-session-layout">
                <div className="session-info-panel">
                  <SessionDashboard
                    session={currentSession}
                    onTerminateSession={terminateSession}
                    isLoading={isLoading}
                  />
                </div>
                
                {qrCodeData && (
                  <div className="qr-code-panel">
                    <QRCodeDisplay
                      sessionId={qrCodeData.sessionId}
                      qrCodeDataURL={qrCodeData.qrCodeDataURL}
                      sessionURL={qrCodeData.url}
                      expiresAt={qrCodeData.expiresAt}
                      onRefresh={refreshQRCode}
                      onSessionEnd={terminateSession}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Print Queue Tab */}
        {activeTab === 'queue' && (
          <div className="tab-content">
            <PrintQueue
              printJobs={printJobs}
              printerStatus={printerStatus}
              onExecuteJob={executePrintJob}
              onRefresh={refreshPrintJobs}
            />
          </div>
        )}

        {/* System Status Tab */}
        {activeTab === 'system' && (
          <div className="tab-content">
            <SystemStatus
              printerStatus={printerStatus}
              systemHealth={systemHealth}
              errors={systemErrors}
              onDismissError={dismissError}
            />
          </div>
        )}
      </main>

      {/* Error Display */}
      {systemErrors.length > 0 && (
        <ErrorDisplay
          errors={systemErrors}
          onDismiss={dismissError}
        />
      )}

      {/* Configuration Panel */}
      {showConfiguration && (
        <ConfigurationPanel onClose={() => setShowConfiguration(false)} />
      )}
    </div>
  );
}

export default App;