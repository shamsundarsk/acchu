import React, { useState, useEffect } from 'react';
import { SessionId } from '@sps/shared-types';

export interface QRCodeDisplayProps {
  sessionId: SessionId;
  qrCodeDataURL: string;
  sessionURL: string;
  expiresAt: Date;
  onRefresh?: () => void;
  onSessionEnd?: () => void;
}

/**
 * QR Code display component for Local Agent UI
 * Requirements: 2.1 - QR code display component for Local Agent UI
 */
export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  sessionId,
  qrCodeDataURL,
  sessionURL,
  expiresAt,
  onRefresh,
  onSessionEnd
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Update countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = expiresAt.getTime();
      const remaining = Math.max(0, expiry - now);
      
      setTimeRemaining(remaining);
      setIsExpired(remaining === 0);
    };

    // Update immediately
    updateTimer();

    // Update every second
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTimeRemaining = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sessionURL);
      // Could add a toast notification here
      console.log('Session URL copied to clipboard');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  return (
    <div className="qr-code-display">
      <div className="qr-code-header">
        <h3>Customer Session</h3>
        <div className="session-info">
          <span className="session-id">Session: {sessionId.substring(0, 8)}...</span>
          <span className={`timer ${isExpired ? 'expired' : ''}`}>
            {isExpired ? 'EXPIRED' : formatTimeRemaining(timeRemaining)}
          </span>
        </div>
      </div>

      <div className="qr-code-container">
        {!isExpired ? (
          <>
            <div className="qr-code-image">
              <img 
                src={qrCodeDataURL} 
                alt="Session QR Code"
                className="qr-code"
              />
            </div>
            
            <div className="qr-code-instructions">
              <p>Customer should scan this QR code to access the printing interface</p>
            </div>

            <div className="session-url">
              <label>Session URL:</label>
              <div className="url-container">
                <input 
                  type="text" 
                  value={sessionURL} 
                  readOnly 
                  className="url-input"
                />
                <button 
                  onClick={copyToClipboard}
                  className="copy-button"
                  title="Copy URL to clipboard"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="qr-code-actions">
              {onRefresh && (
                <button 
                  onClick={onRefresh}
                  className="refresh-button"
                  title="Generate new QR code"
                >
                  Refresh QR Code
                </button>
              )}
              
              {onSessionEnd && (
                <button 
                  onClick={onSessionEnd}
                  className="end-session-button"
                  title="End session and cleanup"
                >
                  End Session
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="expired-session">
            <div className="expired-message">
              <h4>Session Expired</h4>
              <p>This session has expired. Please start a new session.</p>
            </div>
            
            {onSessionEnd && (
              <button 
                onClick={onSessionEnd}
                className="cleanup-button"
              >
                Cleanup Session
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QRCodeDisplay;