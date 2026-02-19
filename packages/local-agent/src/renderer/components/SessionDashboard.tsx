import React from 'react';
import { Session, SessionStatus } from '../../types';
import './SessionDashboard.css';

interface SessionDashboardProps {
  session?: Session;
  onCreateSession?: () => void;
  onTerminateSession?: () => void;
  isLoading?: boolean;
}

/**
 * Session management dashboard component
 * Requirements: 1.2 - Display session status and QR code prominently
 */
export const SessionDashboard: React.FC<SessionDashboardProps> = ({
  session,
  onCreateSession,
  onTerminateSession,
  isLoading = false
}) => {
  const formatTimeRemaining = (expiresAt: Date): string => {
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    const remaining = Math.max(0, expiry - now);
    
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    if (remaining === 0) return 'EXPIRED';
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: SessionStatus): string => {
    switch (status) {
      case SessionStatus.ACTIVE:
        return 'status-active';
      case SessionStatus.PRINTING:
        return 'status-printing';
      case SessionStatus.COMPLETED:
        return 'status-completed';
      case SessionStatus.TERMINATED:
        return 'status-terminated';
      default:
        return 'status-unknown';
    }
  };

  const getStatusText = (status: SessionStatus): string => {
    switch (status) {
      case SessionStatus.ACTIVE:
        return 'Active - Waiting for customer';
      case SessionStatus.PRINTING:
        return 'Printing in progress';
      case SessionStatus.COMPLETED:
        return 'Session completed';
      case SessionStatus.TERMINATED:
        return 'Session terminated';
      default:
        return 'Unknown status';
    }
  };

  if (!session) {
    return (
      <div className="session-dashboard no-session">
        <div className="no-session-content">
          <div className="no-session-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          
          <h2>No Active Session</h2>
          <p>Create a new session to start secure printing service</p>
          
          <div className="session-benefits">
            <ul>
              <li>Secure, isolated printing environment</li>
              <li>Automatic data destruction after 30 minutes</li>
              <li>QR code access for customers</li>
              <li>Real-time print job monitoring</li>
            </ul>
          </div>
          
          {onCreateSession && (
            <button 
              onClick={onCreateSession} 
              disabled={isLoading}
              className="btn-primary create-session-btn"
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Creating Session...
                </>
              ) : (
                'Create New Session'
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  const timeRemaining = formatTimeRemaining(session.expiresAt);
  const isExpired = timeRemaining === 'EXPIRED';

  return (
    <div className="session-dashboard active-session">
      <div className="session-header">
        <h2>Active Session</h2>
        <div className={`session-status ${getStatusColor(session.status)}`}>
          <span className="status-indicator"></span>
          <span className="status-text">{getStatusText(session.status)}</span>
        </div>
      </div>

      <div className="session-details">
        <div className="session-info-grid">
          <div className="info-item">
            <label>Session ID</label>
            <div className="session-id">
              <code>{session.id}</code>
              <button 
                className="copy-btn"
                onClick={() => navigator.clipboard.writeText(session.id)}
                title="Copy session ID"
              >
                📋
              </button>
            </div>
          </div>

          <div className="info-item">
            <label>Created</label>
            <span>{new Date(session.createdAt).toLocaleString()}</span>
          </div>

          <div className="info-item">
            <label>Expires</label>
            <span>{new Date(session.expiresAt).toLocaleString()}</span>
          </div>

          <div className="info-item">
            <label>Time Remaining</label>
            <span className={`time-remaining ${isExpired ? 'expired' : ''}`}>
              {timeRemaining}
            </span>
          </div>

          <div className="info-item">
            <label>Files Uploaded</label>
            <span>{session.files?.length || 0} files</span>
          </div>

          <div className="info-item">
            <label>Payment Status</label>
            <span className={`payment-status ${session.paymentStatus?.toLowerCase()}`}>
              {session.paymentStatus || 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {session.files && session.files.length > 0 && (
        <div className="session-files">
          <h3>Uploaded Files</h3>
          <div className="files-list">
            {session.files.map((file, index) => (
              <div key={file.id || index} className="file-item">
                <div className="file-icon">
                  📄
                </div>
                <div className="file-info">
                  <div className="file-name">{file.originalName}</div>
                  <div className="file-details">
                    {file.size ? `${Math.round(file.size / 1024)} KB` : 'Unknown size'}
                    {file.pageCount && ` • ${file.pageCount} pages`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="session-actions">
        {session.status === SessionStatus.ACTIVE && !isExpired && (
          <div className="action-buttons">
            <button className="btn-secondary extend-btn">
              Extend Session
            </button>
            
            {onTerminateSession && (
              <button 
                onClick={onTerminateSession}
                disabled={isLoading}
                className="btn-danger terminate-btn"
              >
                {isLoading ? (
                  <>
                    <span className="loading-spinner"></span>
                    Terminating...
                  </>
                ) : (
                  'End Session'
                )}
              </button>
            )}
          </div>
        )}

        {(isExpired || session.status === SessionStatus.TERMINATED) && onTerminateSession && (
          <button 
            onClick={onTerminateSession}
            disabled={isLoading}
            className="btn-secondary cleanup-btn"
          >
            {isLoading ? 'Cleaning up...' : 'Cleanup Session'}
          </button>
        )}
      </div>

      {isExpired && (
        <div className="session-warning">
          <div className="warning-icon">⚠️</div>
          <div className="warning-text">
            <strong>Session Expired</strong>
            <p>This session has expired and should be cleaned up.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionDashboard;