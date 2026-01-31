import { EventEmitter } from 'events';

/**
 * Network request configuration
 */
export interface NetworkRequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  exponentialBackoff?: boolean;
}

/**
 * Network request result
 */
export interface NetworkRequestResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  attempt: number;
  totalAttempts: number;
}

/**
 * Network retry service configuration
 */
export interface NetworkRetryConfig {
  defaultTimeout?: number;
  defaultRetryAttempts?: number;
  defaultRetryDelayMs?: number;
  maxConcurrentRequests?: number;
  exponentialBackoff?: boolean;
}

/**
 * Network retry service for handling network errors with retry mechanisms
 * Requirements: 9.1 - Network error detection and retry mechanisms
 */
export class NetworkRetryService extends EventEmitter {
  private config: Required<NetworkRetryConfig>;
  private activeRequests: Set<string> = new Set();
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  constructor(config: NetworkRetryConfig = {}) {
    super();
    
    this.config = {
      defaultTimeout: 10000,
      defaultRetryAttempts: 3,
      defaultRetryDelayMs: 1000,
      maxConcurrentRequests: 5,
      exponentialBackoff: true,
      ...config
    };
  }

  /**
   * Makes a network request with retry logic
   */
  async makeRequest<T = any>(requestConfig: NetworkRequestConfig): Promise<NetworkRequestResult<T>> {
    const config: Required<NetworkRequestConfig> = {
      method: 'GET',
      headers: {},
      timeout: this.config.defaultTimeout,
      retryAttempts: this.config.defaultRetryAttempts,
      retryDelayMs: this.config.defaultRetryDelayMs,
      exponentialBackoff: this.config.exponentialBackoff,
      ...requestConfig
    };

    const requestId = this.generateRequestId();
    
    // Check if we're at max concurrent requests
    if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
      return new Promise((resolve) => {
        this.requestQueue.push(async () => {
          const result = await this.executeRequest<T>(requestId, config);
          resolve(result);
        });
        this.processQueue();
      });
    }

    return this.executeRequest<T>(requestId, config);
  }

  /**
   * Executes a network request with retry logic
   */
  private async executeRequest<T>(
    requestId: string, 
    config: NetworkRequestConfig
  ): Promise<NetworkRequestResult<T>> {
    this.activeRequests.add(requestId);
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        console.log(`Network request ${requestId} attempt ${attempt}/${config.retryAttempts}: ${config.method} ${config.url}`);
        
        const result = await this.performSingleRequest<T>(config);
        
        this.activeRequests.delete(requestId);
        this.processQueue();
        
        this.emit('requestSuccess', {
          requestId,
          url: config.url,
          attempt,
          totalAttempts: config.retryAttempts
        });
        
        return {
          success: true,
          data: result.data,
          statusCode: result.statusCode,
          attempt,
          totalAttempts: config.retryAttempts
        };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.warn(`Network request ${requestId} attempt ${attempt} failed:`, lastError.message);
        
        this.emit('requestAttemptFailed', {
          requestId,
          url: config.url,
          attempt,
          totalAttempts: config.retryAttempts,
          error: lastError.message
        });
        
        // Don't retry on the last attempt
        if (attempt < config.retryAttempts) {
          const delay = config.exponentialBackoff 
            ? config.retryDelayMs * Math.pow(2, attempt - 1)
            : config.retryDelayMs;
          
          console.log(`Retrying request ${requestId} in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    // All attempts failed
    this.activeRequests.delete(requestId);
    this.processQueue();
    
    this.emit('requestFailed', {
      requestId,
      url: config.url,
      totalAttempts: config.retryAttempts,
      error: lastError?.message || 'Unknown error'
    });
    
    return {
      success: false,
      error: lastError?.message || 'Network request failed after all retry attempts',
      attempt: config.retryAttempts,
      totalAttempts: config.retryAttempts
    };
  }

  /**
   * Performs a single network request
   */
  private async performSingleRequest<T>(config: Required<NetworkRequestConfig>): Promise<{
    data: T;
    statusCode: number;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);
    
    try {
      const fetchConfig: RequestInit = {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        signal: controller.signal
      };
      
      if (config.body && (config.method === 'POST' || config.method === 'PUT' || config.method === 'PATCH')) {
        fetchConfig.body = typeof config.body === 'string' 
          ? config.body 
          : JSON.stringify(config.body);
      }
      
      const response = await fetch(config.url, fetchConfig);
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      let data: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text() as unknown as T;
      }
      
      return {
        data,
        statusCode: response.status
      };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${config.timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Processes the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    if (this.activeRequests.size >= this.config.maxConcurrentRequests) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0 && this.activeRequests.size < this.config.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      if (request) {
        // Execute request without awaiting to allow concurrent processing
        request().catch(error => {
          console.error('Queued request failed:', error);
        });
      }
    }
    
    this.isProcessingQueue = false;
  }

  /**
   * Checks network connectivity by making a simple request
   */
  async checkConnectivity(testUrl: string = 'https://www.google.com'): Promise<boolean> {
    try {
      const result = await this.makeRequest({
        url: testUrl,
        method: 'HEAD',
        timeout: 5000,
        retryAttempts: 1
      });
      
      return result.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Measures network latency
   */
  async measureLatency(testUrl: string = 'https://www.google.com'): Promise<number | null> {
    const startTime = Date.now();
    
    try {
      const result = await this.makeRequest({
        url: testUrl,
        method: 'HEAD',
        timeout: 5000,
        retryAttempts: 1
      });
      
      if (result.success) {
        return Date.now() - startTime;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cancels all pending requests
   */
  cancelAllRequests(): void {
    console.log(`Cancelling ${this.activeRequests.size} active requests and ${this.requestQueue.length} queued requests`);
    
    this.activeRequests.clear();
    this.requestQueue.length = 0;
    
    this.emit('allRequestsCancelled');
  }

  /**
   * Gets current network service status
   */
  getStatus(): {
    activeRequests: number;
    queuedRequests: number;
    maxConcurrentRequests: number;
  } {
    return {
      activeRequests: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
      maxConcurrentRequests: this.config.maxConcurrentRequests
    };
  }

  /**
   * Utility methods
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down NetworkRetryService...');
    
    this.cancelAllRequests();
    this.removeAllListeners();
    
    console.log('NetworkRetryService shutdown complete');
  }
}