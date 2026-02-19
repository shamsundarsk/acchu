import React from 'react';
import { PrintJob, JobStatus } from '../../types';
import './PrintQueue.css';

interface PrinterStatus {
  name: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  isDefault: boolean;
  jobCount: number;
}

interface PrintQueueProps {
  printJobs: PrintJob[];
  printerStatus: PrinterStatus | null;
  onExecuteJob: (jobId: string) => void;
  onRefresh: () => void;
}

/**
 * Print queue and job management interface
 * Requirements: 6.2 - Print queue and job management interface
 */
export const PrintQueue: React.FC<PrintQueueProps> = ({
  printJobs,
  printerStatus,
  onExecuteJob,
  onRefresh
}) => {
  const getJobStatusColor = (status: JobStatus): string => {
    switch (status) {
      case JobStatus.QUEUED:
        return 'status-queued';
      case JobStatus.PRINTING:
        return 'status-printing';
      case JobStatus.COMPLETED:
        return 'status-completed';
      case JobStatus.FAILED:
        return 'status-failed';
      default:
        return 'status-unknown';
    }
  };

  const getJobStatusText = (status: JobStatus): string => {
    switch (status) {
      case JobStatus.QUEUED:
        return 'Queued';
      case JobStatus.PRINTING:
        return 'Printing';
      case JobStatus.COMPLETED:
        return 'Completed';
      case JobStatus.FAILED:
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const getPrinterStatusColor = (status: string): string => {
    switch (status) {
      case 'online':
        return 'printer-online';
      case 'offline':
        return 'printer-offline';
      case 'busy':
        return 'printer-busy';
      case 'error':
        return 'printer-error';
      default:
        return 'printer-unknown';
    }
  };

  const formatPrice = (priceInPaise: number): string => {
    return `₹${(priceInPaise / 100).toFixed(2)}`;
  };

  const formatDateTime = (date: Date): string => {
    return new Date(date).toLocaleString();
  };

  const canExecuteJob = (job: PrintJob): boolean => {
    return job.status === JobStatus.QUEUED && 
           printerStatus?.status === 'online';
  };

  return (
    <div className="print-queue">
      {/* Printer Status Panel */}
      <div className="printer-status-panel">
        <div className="panel-header">
          <h2>Printer Status</h2>
          <button 
            onClick={onRefresh}
            className="refresh-btn"
            title="Refresh printer status"
          >
            🔄
          </button>
        </div>
        
        {printerStatus ? (
          <div className="printer-info">
            <div className="printer-main-info">
              <div className="printer-name">
                <h3>{printerStatus.name}</h3>
                {printerStatus.isDefault && (
                  <span className="default-badge">Default</span>
                )}
              </div>
              
              <div className={`printer-status ${getPrinterStatusColor(printerStatus.status)}`}>
                <span className="status-indicator"></span>
                <span className="status-text">
                  {printerStatus.status.charAt(0).toUpperCase() + printerStatus.status.slice(1)}
                </span>
              </div>
            </div>
            
            <div className="printer-stats">
              <div className="stat-item">
                <label>Jobs in Queue</label>
                <span>{printerStatus.jobCount}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-printer">
            <div className="no-printer-icon">🖨️</div>
            <p>No printer detected</p>
            <button className="btn-secondary detect-printer-btn">
              Detect Printers
            </button>
          </div>
        )}
      </div>

      {/* Print Jobs Panel */}
      <div className="print-jobs-panel">
        <div className="panel-header">
          <h2>Print Jobs</h2>
          <div className="job-stats">
            <span className="stat">
              Total: {printJobs.length}
            </span>
            <span className="stat">
              Queued: {printJobs.filter(job => job.status === JobStatus.QUEUED).length}
            </span>
            <span className="stat">
              Printing: {printJobs.filter(job => job.status === JobStatus.PRINTING).length}
            </span>
          </div>
        </div>

        <div className="jobs-container">
          {printJobs.length === 0 ? (
            <div className="no-jobs">
              <div className="no-jobs-icon">📄</div>
              <h3>No Print Jobs</h3>
              <p>Print jobs will appear here when customers submit files for printing</p>
            </div>
          ) : (
            <div className="jobs-list">
              {printJobs.map((job) => (
                <div key={job.id} className={`job-item ${getJobStatusColor(job.status)}`}>
                  <div className="job-header">
                    <div className="job-info">
                      <div className="job-id">
                        Job #{job.id.substring(0, 8)}
                      </div>
                      <div className={`job-status ${getJobStatusColor(job.status)}`}>
                        <span className="status-indicator"></span>
                        <span className="status-text">
                          {getJobStatusText(job.status)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="job-actions">
                      {canExecuteJob(job) && (
                        <button
                          onClick={() => onExecuteJob(job.id)}
                          className="btn-primary execute-btn"
                        >
                          Print Now
                        </button>
                      )}
                      
                      {job.status === JobStatus.FAILED && (
                        <button
                          onClick={() => onExecuteJob(job.id)}
                          className="btn-secondary retry-btn"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="job-details">
                    <div className="job-meta">
                      <div className="meta-item">
                        <label>Session</label>
                        <span>{job.sessionId.substring(0, 8)}...</span>
                      </div>
                      
                      <div className="meta-item">
                        <label>Created</label>
                        <span>{formatDateTime(job.createdAt)}</span>
                      </div>
                      
                      {job.executedAt && (
                        <div className="meta-item">
                          <label>Executed</label>
                          <span>{formatDateTime(job.executedAt)}</span>
                        </div>
                      )}
                    </div>

                    <div className="job-files">
                      <label>Files ({job.files.length})</label>
                      <div className="files-preview">
                        {job.files.slice(0, 3).map((fileId, index) => (
                          <div key={fileId} className="file-preview">
                            📄 File {index + 1}
                          </div>
                        ))}
                        {job.files.length > 3 && (
                          <div className="more-files">
                            +{job.files.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="job-options">
                      <div className="option-group">
                        <label>Print Options</label>
                        <div className="options-list">
                          <span className="option">
                            {job.options.copies} {job.options.copies === 1 ? 'copy' : 'copies'}
                          </span>
                          <span className="option">
                            {job.options.colorMode === 'color' ? 'Color' : 'Black & White'}
                          </span>
                          {job.options.duplex && (
                            <span className="option">Duplex</span>
                          )}
                          <span className="option">
                            {job.options.paperSize}
                          </span>
                        </div>
                      </div>

                      <div className="pricing-info">
                        <div className="pricing-details">
                          <div className="price-item">
                            <span>Pages: {job.pricing.totalPages}</span>
                          </div>
                          {job.pricing.colorPages > 0 && (
                            <div className="price-item">
                              <span>Color: {job.pricing.colorPages}</span>
                            </div>
                          )}
                          {job.pricing.bwPages > 0 && (
                            <div className="price-item">
                              <span>B&W: {job.pricing.bwPages}</span>
                            </div>
                          )}
                        </div>
                        <div className="total-price">
                          <strong>{formatPrice(job.pricing.totalPrice)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {job.status === JobStatus.PRINTING && (
                    <div className="job-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: '45%' }} // This would be dynamic based on actual progress
                        ></div>
                      </div>
                      <span className="progress-text">Printing... 45%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintQueue;