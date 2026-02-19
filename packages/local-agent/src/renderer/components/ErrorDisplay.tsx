import React, { useState, useEffect } from 'react';
import './ErrorDisplay.css';

interface SystemError {
  id: string;
  type: 'session' | 'printer' | 'system' | 'network';
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ErrorDisplayProps {
  errors: SystemError[];
  onDismiss: (errorId: string) => void;
}

/**
 * Floating error display component for immediate error notifications
 * Requirements: 6.2 - System status and error displays
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  errors,
  onDismiss
}) => {
  const [visibleErrors, setVisibleErrors] = useState<SystemError[]>([]);
  const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(new Set());

  // Show only the most recent critical and high severity errors
  useEffect(() => {
    const criticalAndHighErrors = errors
      .filter(error => 
        (error.severity === 'critical' || error.severity === 'high') &&
        !dismissedErrors.has(error.id)
      )
      .slice(0, 3) // Show max 3 errors at once
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setVisibleErrors(criticalAndHighErrors);
  }, [errors, dismissedErrors]);

  // Auto-dismiss low and medium severity errors after 10 seconds
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    visibleErrors.forEach(error => {
      if (error.severity === 'medium') {
        const timer = setTimeout(() => {
          handleDismiss(error.id);
        }, 10000);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [visibleErrors]);

  const handleDismiss = (errorId: string) => {
    setDismissedErrors(prev => new Set([...prev, errorId]));
    onDismiss(errorId);
  };

  const getErrorIcon = (type: string): string => {
    switch (type) {
      case 'session':
        return '🔒';
      case 'printer':
        return '🖨️';
      case 'system':
        return '⚙️';
      case 'network':
        return '🌐';
      default:
        return '❗';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'error-critical';
      case 'high':
        return 'error-high';
      case 'medium':
        return 'error-medium';
      case 'low':
        return 'error-low';
      default:
        return 'error-unknown';
    }
  };

  const getSeverityText = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'CRITICAL';
      case 'high':
        return 'HIGH';
      case 'medium':
        return 'MEDIUM';
      case 'low':
        return 'LOW';
      default:
        return 'UNKNOWN';
    }
  };

  const formatTimeAgo = (timestamp: Date): string => {
    const now = new Date();
    const diff = now.getTime() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor(diff / 1000);

    if (minutes > 0) {
      return `${minutes}m ago`;
    } else if (seconds > 0) {
      return `${seconds}s ago`;
    } else {
      return 'Just now';
    }
  };

  if (visibleErrors.length === 0) {
    return null;
  }

  return (
    <div className="error-display">
      <div className="error-notifications">
        {visibleErrors.map((error, index) => (
          <div 
            key={error.id} 
            className={`error-notification ${getSeverityColor(error.severity)}`}
            style={{ 
              animationDelay: `${index * 100}ms`,
              zIndex: 1000 - index 
            }}
          >
            <div className="error-content">
              <div className="error-header">
                <div className="error-icon-wrapper">
                  <span className="error-icon">{getErrorIcon(error.type)}</span>
                </div>
                
                <div className="error-info">
                  <div className="error-title">
                    <span className="error-type">{error.type.toUpperCase()}</span>
                    <span className="error-severity">{getSeverityText(error.severity)}</span>
                  </div>
                  <div className="error-message">{error.message}</div>
                  <div className="error-timestamp">{formatTimeAgo(error.timestamp)}</div>
                </div>
              </div>
            </div>

            <div className="error-actions">
              <button
                onClick={() => handleDismiss(error.id)}
                className="dismiss-error-btn"
                title="Dismiss error"
              >
                ✕
              </button>
            </div>

            {/* Progress bar for auto-dismiss */}
            {error.severity === 'medium' && (
              <div className="auto-dismiss-progress">
                <div className="progress-bar"></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Error summary for multiple errors */}
      {errors.length > visibleErrors.length && (
        <div className="error-summary-notification">
          <div className="summary-content">
            <span className="summary-icon">📋</span>
            <span className="summary-text">
              +{errors.length - visibleErrors.length} more errors in System Status
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorDisplay;