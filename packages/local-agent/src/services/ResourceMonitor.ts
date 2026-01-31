import { EventEmitter } from 'events';
import * as os from 'os';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';

/**
 * Resource thresholds for monitoring
 */
export interface ResourceThresholds {
  memoryWarningPercent: number;
  memoryCriticalPercent: number;
  diskWarningGB: number;
  diskCriticalGB: number;
  cpuWarningPercent: number;
  cpuCriticalPercent: number;
}

/**
 * Detailed resource metrics
 */
export interface ResourceMetrics {
  memory: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usagePercent: number;
    processUsageGB: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usagePercent: number;
  };
  cpu: {
    usagePercent: number;
    loadAverage: number[];
    coreCount: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
  };
  timestamp: Date;
}

/**
 * Resource alert information
 */
export interface ResourceAlert {
  type: 'memory' | 'disk' | 'cpu';
  level: 'warning' | 'critical';
  message: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
}

/**
 * Resource monitor configuration
 */
export interface ResourceMonitorConfig {
  monitoringIntervalMs?: number;
  thresholds?: Partial<ResourceThresholds>;
  enableAlerts?: boolean;
  historyRetentionMs?: number;
}

/**
 * Resource monitoring service for system resource tracking
 * Requirements: 9.3 - Resource monitoring and session prevention
 */
export class ResourceMonitor extends EventEmitter {
  private config: Required<ResourceMonitorConfig>;
  private thresholds: ResourceThresholds;
  private monitoringInterval?: NodeJS.Timeout;
  private metricsHistory: ResourceMetrics[] = [];
  private activeAlerts: Map<string, ResourceAlert> = new Map();
  private isMonitoring = false;
  
  // CPU usage tracking
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();

  constructor(config: ResourceMonitorConfig = {}) {
    super();
    
    this.config = {
      monitoringIntervalMs: 30000, // 30 seconds
      enableAlerts: true,
      historyRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
      thresholds: {},
      ...config
    };
    
    this.thresholds = {
      memoryWarningPercent: 75,
      memoryCriticalPercent: 90,
      diskWarningGB: 2,
      diskCriticalGB: 0.5,
      cpuWarningPercent: 80,
      cpuCriticalPercent: 95,
      ...config.thresholds
    };
  }

  /**
   * Starts resource monitoring
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = true;
    
    // Initial metrics collection
    this.collectMetrics();
    
    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.monitoringIntervalMs);
    
    console.log(`Resource monitoring started with ${this.config.monitoringIntervalMs}ms interval`);
  }

  /**
   * Stops resource monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    console.log('Resource monitoring stopped');
  }

  /**
   * Collects current resource metrics
   */
  async collectMetrics(): Promise<ResourceMetrics> {
    try {
      const metrics: ResourceMetrics = {
        memory: await this.getMemoryMetrics(),
        disk: await this.getDiskMetrics(),
        cpu: await this.getCpuMetrics(),
        network: await this.getNetworkMetrics(),
        timestamp: new Date()
      };
      
      // Add to history
      this.metricsHistory.push(metrics);
      this.cleanupHistory();
      
      // Check for alerts
      if (this.config.enableAlerts) {
        this.checkResourceAlerts(metrics);
      }
      
      this.emit('metricsCollected', metrics);
      
      return metrics;
      
    } catch (error) {
      console.error('Failed to collect resource metrics:', error);
      throw error;
    }
  }

  /**
   * Gets memory usage metrics
   */
  private async getMemoryMetrics(): Promise<ResourceMetrics['memory']> {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    const processMemory = process.memoryUsage();
    
    return {
      totalGB: totalMemory / (1024 * 1024 * 1024),
      usedGB: usedMemory / (1024 * 1024 * 1024),
      freeGB: freeMemory / (1024 * 1024 * 1024),
      usagePercent: (usedMemory / totalMemory) * 100,
      processUsageGB: processMemory.rss / (1024 * 1024 * 1024)
    };
  }

  /**
   * Gets disk usage metrics
   */
  private async getDiskMetrics(): Promise<ResourceMetrics['disk']> {
    try {
      // Windows-specific disk space check
      if (process.platform === 'win32') {
        const output = execSync('wmic logicaldisk where caption="C:" get size,freespace /value', { 
          encoding: 'utf8',
          timeout: 5000
        });
        
        let totalBytes = 0;
        let freeBytes = 0;
        
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('FreeSpace=')) {
            freeBytes = parseInt(line.split('=')[1]) || 0;
          } else if (line.startsWith('Size=')) {
            totalBytes = parseInt(line.split('=')[1]) || 0;
          }
        }
        
        const usedBytes = totalBytes - freeBytes;
        
        return {
          totalGB: totalBytes / (1024 * 1024 * 1024),
          usedGB: usedBytes / (1024 * 1024 * 1024),
          freeGB: freeBytes / (1024 * 1024 * 1024),
          usagePercent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0
        };
      } else {
        // Unix-like systems
        const output = execSync('df -h /', { encoding: 'utf8', timeout: 5000 });
        const lines = output.split('\n');
        
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/);
          const totalStr = parts[1];
          const usedStr = parts[2];
          const availStr = parts[3];
          
          // Parse sizes (assuming they're in human-readable format like 100G)
          const parseSize = (sizeStr: string): number => {
            const match = sizeStr.match(/^(\d+(?:\.\d+)?)([KMGT]?)$/);
            if (!match) return 0;
            
            const value = parseFloat(match[1]);
            const unit = match[2];
            
            switch (unit) {
              case 'T': return value * 1024;
              case 'G': return value;
              case 'M': return value / 1024;
              case 'K': return value / (1024 * 1024);
              default: return value / (1024 * 1024 * 1024);
            }
          };
          
          const totalGB = parseSize(totalStr);
          const usedGB = parseSize(usedStr);
          const freeGB = parseSize(availStr);
          
          return {
            totalGB,
            usedGB,
            freeGB,
            usagePercent: totalGB > 0 ? (usedGB / totalGB) * 100 : 0
          };
        }
      }
      
      // Fallback values if commands fail
      return {
        totalGB: 100,
        usedGB: 50,
        freeGB: 50,
        usagePercent: 50
      };
      
    } catch (error) {
      console.warn('Failed to get disk metrics, using defaults:', error);
      
      // Return safe defaults
      return {
        totalGB: 100,
        usedGB: 50,
        freeGB: 50,
        usagePercent: 50
      };
    }
  }

  /**
   * Gets CPU usage metrics
   */
  private async getCpuMetrics(): Promise<ResourceMetrics['cpu']> {
    try {
      // Calculate CPU usage based on process CPU time
      const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
      const currentTime = Date.now();
      const timeDiff = currentTime - this.lastCpuTime;
      
      // Convert microseconds to milliseconds and calculate percentage
      const cpuPercent = ((currentCpuUsage.user + currentCpuUsage.system) / 1000) / timeDiff * 100;
      
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuTime = currentTime;
      
      const loadAverage = os.loadavg();
      const coreCount = os.cpus().length;
      
      return {
        usagePercent: Math.min(100, Math.max(0, cpuPercent)),
        loadAverage,
        coreCount
      };
      
    } catch (error) {
      console.warn('Failed to get CPU metrics:', error);
      
      return {
        usagePercent: 0,
        loadAverage: [0, 0, 0],
        coreCount: os.cpus().length
      };
    }
  }

  /**
   * Gets network usage metrics (simplified)
   */
  private async getNetworkMetrics(): Promise<ResourceMetrics['network']> {
    // This is a simplified implementation
    // In a real system, you'd track network interface statistics
    return {
      bytesReceived: 0,
      bytesSent: 0
    };
  }

  /**
   * Checks for resource alerts based on thresholds
   */
  private checkResourceAlerts(metrics: ResourceMetrics): void {
    // Memory alerts
    this.checkAlert(
      'memory',
      metrics.memory.usagePercent,
      this.thresholds.memoryWarningPercent,
      this.thresholds.memoryCriticalPercent,
      `Memory usage at ${metrics.memory.usagePercent.toFixed(1)}%`
    );
    
    // Disk alerts
    this.checkAlert(
      'disk',
      metrics.disk.freeGB,
      this.thresholds.diskWarningGB,
      this.thresholds.diskCriticalGB,
      `Free disk space: ${metrics.disk.freeGB.toFixed(1)}GB`,
      true // Reverse logic for disk (low values are bad)
    );
    
    // CPU alerts
    this.checkAlert(
      'cpu',
      metrics.cpu.usagePercent,
      this.thresholds.cpuWarningPercent,
      this.thresholds.cpuCriticalPercent,
      `CPU usage at ${metrics.cpu.usagePercent.toFixed(1)}%`
    );
  }

  /**
   * Checks and manages alerts for a specific resource type
   */
  private checkAlert(
    type: 'memory' | 'disk' | 'cpu',
    currentValue: number,
    warningThreshold: number,
    criticalThreshold: number,
    message: string,
    reverseLogic: boolean = false
  ): void {
    const alertKey = type;
    const existingAlert = this.activeAlerts.get(alertKey);
    
    let shouldAlert = false;
    let alertLevel: 'warning' | 'critical' | null = null;
    let threshold = 0;
    
    if (reverseLogic) {
      // For disk space, lower values are worse
      if (currentValue <= criticalThreshold) {
        shouldAlert = true;
        alertLevel = 'critical';
        threshold = criticalThreshold;
      } else if (currentValue <= warningThreshold) {
        shouldAlert = true;
        alertLevel = 'warning';
        threshold = warningThreshold;
      }
    } else {
      // For memory and CPU, higher values are worse
      if (currentValue >= criticalThreshold) {
        shouldAlert = true;
        alertLevel = 'critical';
        threshold = criticalThreshold;
      } else if (currentValue >= warningThreshold) {
        shouldAlert = true;
        alertLevel = 'warning';
        threshold = warningThreshold;
      }
    }
    
    if (shouldAlert && alertLevel) {
      // Create or update alert
      const alert: ResourceAlert = {
        type,
        level: alertLevel,
        message,
        currentValue,
        threshold,
        timestamp: new Date()
      };
      
      // Only emit if this is a new alert or severity increased
      if (!existingAlert || existingAlert.level !== alertLevel) {
        this.activeAlerts.set(alertKey, alert);
        this.emit('resourceAlert', alert);
        
        console.warn(`Resource alert [${alertLevel.toUpperCase()}]: ${message}`);
      }
    } else if (existingAlert) {
      // Clear resolved alert
      this.activeAlerts.delete(alertKey);
      this.emit('resourceAlertResolved', { type, previousAlert: existingAlert });
      
      console.log(`Resource alert resolved: ${type}`);
    }
  }

  /**
   * Cleans up old metrics from history
   */
  private cleanupHistory(): void {
    const cutoffTime = new Date(Date.now() - this.config.historyRetentionMs);
    
    this.metricsHistory = this.metricsHistory.filter(
      metrics => metrics.timestamp > cutoffTime
    );
  }

  /**
   * Gets current resource status
   */
  getCurrentMetrics(): ResourceMetrics | null {
    return this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1]
      : null;
  }

  /**
   * Gets metrics history
   */
  getMetricsHistory(limitCount?: number): ResourceMetrics[] {
    const history = [...this.metricsHistory];
    
    if (limitCount && limitCount > 0) {
      return history.slice(-limitCount);
    }
    
    return history;
  }

  /**
   * Gets active alerts
   */
  getActiveAlerts(): ResourceAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Checks if system is resource constrained
   */
  isResourceConstrained(): boolean {
    const currentMetrics = this.getCurrentMetrics();
    if (!currentMetrics) {
      return false;
    }
    
    return (
      currentMetrics.memory.usagePercent >= this.thresholds.memoryCriticalPercent ||
      currentMetrics.disk.freeGB <= this.thresholds.diskCriticalGB ||
      currentMetrics.cpu.usagePercent >= this.thresholds.cpuCriticalPercent
    );
  }

  /**
   * Checks if new sessions should be prevented due to resource constraints
   */
  shouldPreventNewSessions(): boolean {
    const currentMetrics = this.getCurrentMetrics();
    if (!currentMetrics) {
      return false;
    }
    
    // Prevent new sessions if any resource is at warning level or above
    return (
      currentMetrics.memory.usagePercent >= this.thresholds.memoryWarningPercent ||
      currentMetrics.disk.freeGB <= this.thresholds.diskWarningGB ||
      currentMetrics.cpu.usagePercent >= this.thresholds.cpuWarningPercent
    );
  }

  /**
   * Gets resource status summary
   */
  getResourceStatus(): {
    isHealthy: boolean;
    isConstrained: boolean;
    shouldPreventNewSessions: boolean;
    activeAlerts: ResourceAlert[];
    currentMetrics: ResourceMetrics | null;
  } {
    const currentMetrics = this.getCurrentMetrics();
    const activeAlerts = this.getActiveAlerts();
    const isConstrained = this.isResourceConstrained();
    const shouldPreventNewSessions = this.shouldPreventNewSessions();
    
    return {
      isHealthy: activeAlerts.length === 0,
      isConstrained,
      shouldPreventNewSessions,
      activeAlerts,
      currentMetrics
    };
  }

  /**
   * Updates resource thresholds
   */
  updateThresholds(newThresholds: Partial<ResourceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds
    };
    
    console.log('Resource thresholds updated:', this.thresholds);
  }

  /**
   * Forces a metrics collection
   */
  async forceCollection(): Promise<ResourceMetrics> {
    return this.collectMetrics();
  }

  /**
   * Shutdown the resource monitor
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down ResourceMonitor...');
    
    this.stopMonitoring();
    this.removeAllListeners();
    this.metricsHistory.length = 0;
    this.activeAlerts.clear();
    
    console.log('ResourceMonitor shutdown complete');
  }
}