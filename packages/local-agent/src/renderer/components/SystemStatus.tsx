import React, { useState, useEffect } from 'react';
import './SystemStatus.css';

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

interface SystemStatusProps {
  printerStatus: PrinterStatus | null;
  systemHealth: 'healthy' | 'warning' | 'error';
  errors: SystemError[];
  onDismissError: (errorId: string) => void;
}

interface SystemMetrics {
  uptime: string;
  memoryUsage: number;
  diskSpace: number;
  sessionCount: number;
  totalPrintJobs: number;
}

/**
 * System status and error displays component
 * Requirements: 6.2 - System status and error displays
 */
export const SystemStatus: React.FC<SystemStatusProps> = ({
  printerStatus,
  systemHealth,
  errors,
  onDismissError
}) => {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    uptime: '0h 0m',
    memoryUsage: 0,
    diskSpace: 0,
    sessionCount: 0,
    totalPrintJobs: 0
  });

  // Mock system metrics - in real implementation, these would come from the main process
  useEffect(() => {
    const updateMetrics = () => {
      setSystemMetrics({
        uptime: '2h 34m',
        memoryUsage: 45,
        diskSpace: 78,
        sessionCount: 1,
        totalPrintJobs: 12
      });
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const getHealthStatusColor = (health: string): string => {
    switch (health) {
      case 'healthy':
        return 'health-good';
      case 'warning':
        return 'health-warning';
      case 'error':
        return 'health-error';
      default:
        return 'health-unknown';
    }
  };

  const getHealthStatusText = (health: string): string => {
    switch (health) {
      case 'healthy':
        return 'System Operating Normally';
      case 'warning':
        return 'System Warnings Detected';
      case 'error':
        return 'System Errors Detected';
      default:
        return 'System Status Unknown';
    }
  };

  const getErrorTypeIcon = (type: string): string => {
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

  const getErrorSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'low':
        return 'severity-low';
      case 'medium':
        return 'severity-medium';
      case 'high':
        return 'severity-high';
      case 'critical':
        return 'severity-critical';
      default:
        return 'severity-unknown';
    }
  };

  const formatTimestamp = (timestamp: Date): string => {
    return new Date(timestamp).toLocaleString();
  };

  const getMetricColor = (value: number, type: 'usage' | 'count'): string => {
    if (type === 'usage') {
      if (value < 50) return 'metric-good';
      if (value < 80) return 'metric-warning';
      return 'metric-critical';
    } else {
      return 'metric-info';
    }
  };

  return (
    <div className="system-status">
      {/* System Health Overview */}
      <div className="health-overview">
        <div className="panel-header">
          <h2>System Health</h2>
          <div className={`health-indicator ${getHealthStatusColor(systemHealth)}`}>
            <span className="health-dot"></span>
            <span className="health-text">{getHealthStatusText(systemHealth)}</span>
          </div>
        </div>

        <div className="health-content">
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-icon">⏱️</span>
                <span className="metric-label">Uptime</span>
              </div>
              <div className="metric-value">{systemMetrics.uptime}</div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-icon">💾</span>
                <span className="metric-label">Memory Usage</span>
              </div>
              <div className="metric-value">
                <span className={getMetricColor(systemMetrics.memoryUsage, 'usage')}>
                  {systemMetrics.memoryUsage}%
                </span>
              </div>
              <div className="metric-bar">
                <div 
                  className={`metric-fill ${getMetricColor(systemMetrics.memoryUsage, 'usage')}`}
                  style={{ width: `${systemMetrics.memoryUsage}%` }}
                ></div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-icon">💿</span>
                <span className="metric-label">Disk Space</span>
              </div>
              <div className="metric-value">
                <span className={getMetricColor(systemMetrics.diskSpace, 'usage')}>
                  {systemMetrics.diskSpace}%
                </span>
              </div>
              <div className="metric-bar">
                <div 
                  className={`metric-fill ${getMetricColor(systemMetrics.diskSpace, 'usage')}`}
                  style={{ width: `${systemMetrics.diskSpace}%` }}
                ></div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-icon">🔒</span>
                <span className="metric-label">Active Sessions</span>
              </div>
              <div className="metric-value">
                <span className={getMetricColor(systemMetrics.sessionCount, 'count')}>
                  {systemMetrics.sessionCount}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-header">
                <span className="metric-icon">📄</span>
                <span className="metric-label">Total Print Jobs</span>
              </div>
              <div className="metric-value">
                <span className={getMetricColor(systemMetrics.totalPrintJobs, 'count')}>
                  {systemMetrics.totalPrintJobs}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Printer Status Details */}
      <div className="printer-details">
        <div className="panel-header">
          <h2>Printer Details</h2>
        </div>

        <div className="printer-content">
          {printerStatus ? (
            <div className="printer-info-detailed">
              <div className="printer-main">
                <div className="printer-identity">
                  <h3>{printerStatus.name}</h3>
                  {printerStatus.isDefault && (
                    <span className="default-badge">Default Printer</span>
                  )}
                </div>
                
                <div className={`printer-status-detailed ${printerStatus.status}`}>
                  <span className="status-dot"></span>
                  <span className="status-label">
                    {printerStatus.status.charAt(0).toUpperCase() + printerStatus.status.slice(1)}
                  </span>
                </div>
              </div>

              <div className="printer-stats-detailed">
                <div className="stat-item">
                  <label>Queue Status</label>
                  <span>{printerStatus.jobCount} jobs pending</span>
                </div>
                
                <div className="stat-item">
                  <label>Connection</label>
                  <span>{printerStatus.status === 'online' ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>

              <div className="printer-actions">
                <button className="btn-secondary test-print-btn">
                  Test Print
                </button>
                <button className="btn-secondary printer-settings-btn">
                  Printer Settings
                </button>
              </div>
            </div>
          ) : (
            <div className="no-printer-detailed">
              <div className="no-printer-icon">🖨️</div>
              <h3>No Printer Configured</h3>
              <p>Configure a printer to enable printing functionality</p>
              <button className="btn-primary setup-printer-btn">
                Setup Printer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* System Errors and Alerts */}
      <div className="system-errors">
        <div className="panel-header">
          <h2>System Alerts</h2>
          <div className="error-summary">
            {errors.length > 0 ? (
              <span className="error-count">{errors.length} active alerts</span>
            ) : (
              <span className="no-errors">No active alerts</span>
            )}
          </div>
        </div>

        <div className="errors-content">
          {errors.length === 0 ? (
            <div className="no-errors-state">
              <div className="no-errors-icon">✅</div>
              <h3>All Systems Normal</h3>
              <p>No errors or warnings to display</p>
            </div>
          ) : (
            <div className="errors-list">
              {errors.map((error) => (
                <div key={error.id} className={`error-item ${getErrorSeverityColor(error.severity)}`}>
                  <div className="error-header">
                    <div className="error-info">
                      <span className="error-icon">{getErrorTypeIcon(error.type)}</span>
                      <div className="error-details">
                        <div className="error-message">{error.message}</div>
                        <div className="error-meta">
                          <span className="error-type">{error.type.toUpperCase()}</span>
                          <span className="error-time">{formatTimestamp(error.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="error-actions">
                      <span className={`severity-badge ${getErrorSeverityColor(error.severity)}`}>
                        {error.severity.toUpperCase()}
                      </span>
                      <button
                        onClick={() => onDismissError(error.id)}
                        className="dismiss-btn"
                        title="Dismiss error"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* System Actions */}
      <div className="system-actions">
        <div className="panel-header">
          <h2>System Actions</h2>
        </div>

        <div className="actions-content">
          <div className="action-buttons">
            <button className="btn-secondary action-btn">
              <span className="action-icon">🔄</span>
              <div className="action-text">
                <div className="action-title">Restart Services</div>
                <div className="action-desc">Restart all system services</div>
              </div>
            </button>

            <button className="btn-secondary action-btn">
              <span className="action-icon">🧹</span>
              <div className="action-text">
                <div className="action-title">Cleanup Temp Files</div>
                <div className="action-desc">Remove temporary session files</div>
              </div>
            </button>

            <button className="btn-secondary action-btn">
              <span className="action-icon">📊</span>
              <div className="action-text">
                <div className="action-title">Export Logs</div>
                <div className="action-desc">Export system logs for analysis</div>
              </div>
            </button>

            <button className="btn-secondary action-btn">
              <span className="action-icon">🔧</span>
              <div className="action-text">
                <div className="action-title">System Diagnostics</div>
                <div className="action-desc">Run comprehensive system check</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatus;