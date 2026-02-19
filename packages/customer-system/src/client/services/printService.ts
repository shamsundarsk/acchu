/**
 * Print Service for Mobile UI
 * Handles communication with the backend print system
 */

export interface PrintFile {
  fileName: string;
  filePath: string;
  copies: number;
  isColor: boolean;
  isDuplex: boolean;
  quality: 'standard' | 'high';
  pageRange?: string;
}

export interface PrintRequest {
  sessionId: string;
  printerName?: string;
  files: PrintFile[];
}

export interface PrintJobStatus {
  jobId: number;
  fileName: string;
  status: 'Queued' | 'Printing' | 'Completed' | 'Failed';
  progress: number;
  errorMessage?: string;
  submittedAt: string;
  completedAt?: string;
}

export interface PrintResponse {
  success: boolean;
  sessionId: string;
  results: Array<{
    fileName: string;
    success: boolean;
    jobId: number;
    status: string;
    error?: string;
  }>;
  message: string;
}

export interface PrintStatusResponse {
  success: boolean;
  sessionId: string;
  jobs: PrintJobStatus[];
}

class PrintService {
  private readonly baseUrl = 'http://localhost:3001/api';

  /**
   * Submit print jobs to the backend
   */
  async submitPrintJobs(request: PrintRequest): Promise<PrintResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/print-jobs/${request.sessionId}/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          printOptions: {
            copies: request.files[0]?.copies || 1,
            colorMode: request.files[0]?.isColor ? 'color' : 'bw',
            duplex: request.files[0]?.isDuplex || false,
            paperSize: 'A4'
          },
          transactionId: `txn-${Date.now()}`,
          files: request.files.map(file => ({
            fileName: file.fileName,
            filePath: file.filePath
          }))
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Transform response to match expected format
      return {
        success: data.success,
        sessionId: request.sessionId,
        results: [{
          fileName: request.files[0]?.fileName || 'document',
          success: data.success,
          jobId: data.jobId || Date.now(),
          status: data.success ? 'Queued' : 'Failed',
          error: data.error
        }],
        message: data.message || (data.success ? 'Print job submitted successfully' : 'Failed to submit print job')
      };
    } catch (error) {
      console.error('Error submitting print jobs:', error);
      throw error;
    }
  }

  /**
   * Get print job status for a session
   */
  async getPrintStatus(sessionId: string): Promise<PrintStatusResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/print-jobs/${sessionId}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        success: data.success,
        sessionId: sessionId,
        jobs: data.jobs || []
      };
    } catch (error) {
      console.error('Error getting print status:', error);
      throw error;
    }
  }

  /**
   * Poll print status with automatic updates
   */
  async pollPrintStatus(
    sessionId: string,
    onUpdate: (status: PrintStatusResponse) => void,
    intervalMs: number = 2000
  ): Promise<() => void> {
    let isPolling = true;

    const poll = async () => {
      while (isPolling) {
        try {
          const status = await this.getPrintStatus(sessionId);
          onUpdate(status);

          // Stop polling if all jobs are completed or failed
          const allJobsFinished = status.jobs.every(job => 
            job.status === 'Completed' || job.status === 'Failed'
          );

          if (allJobsFinished && status.jobs.length > 0) {
            console.log('All print jobs finished, stopping poll');
            break;
          }

          await new Promise(resolve => setTimeout(resolve, intervalMs));
        } catch (error) {
          console.error('Error polling print status:', error);
          await new Promise(resolve => setTimeout(resolve, intervalMs * 2)); // Back off on error
        }
      }
    };

    // Start polling
    poll();

    // Return stop function
    return () => {
      isPolling = false;
    };
  }

  /**
   * Create print files from uploaded files with configurations
   */
  createPrintFiles(uploadedFiles: any[]): PrintFile[] {
    return uploadedFiles.map(file => ({
      fileName: file.name,
      filePath: file.file ? URL.createObjectURL(file.file) : '', // For demo, use object URL
      copies: file.config.copies,
      isColor: file.config.color === 'color',
      isDuplex: false, // Could be added to config
      quality: file.config.quality,
      pageRange: file.config.pages === 'custom' ? file.config.customRange : undefined,
    }));
  }

  /**
   * Calculate estimated cost (client-side estimation)
   */
  calculateEstimatedCost(files: PrintFile[]): number {
    const BWPerPage = 2.0; // ₹2 per B&W page
    const ColorPerPage = 6.0; // ₹6 per color page
    
    let totalCost = 0;

    files.forEach(file => {
      const pagesPerCopy = this.estimatePageCount(file.pageRange);
      const totalPages = pagesPerCopy * file.copies;
      
      if (file.isColor) {
        totalCost += totalPages * ColorPerPage;
      } else {
        totalCost += totalPages * BWPerPage;
      }
    });

    return Math.round(totalCost * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Estimate page count from page range
   */
  private estimatePageCount(pageRange?: string): number {
    if (!pageRange || pageRange === 'all') {
      return 5; // Default estimate for "all pages"
    }

    // Parse custom range like "1-5,8,10-12"
    let pageCount = 0;
    const ranges = pageRange.split(',');

    ranges.forEach(range => {
      range = range.trim();
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          pageCount += Math.max(0, end - start + 1);
        }
      } else {
        const page = parseInt(range);
        if (!isNaN(page)) {
          pageCount += 1;
        }
      }
    });

    return Math.max(1, pageCount); // At least 1 page
  }
}

// Export singleton instance
export const printService = new PrintService();