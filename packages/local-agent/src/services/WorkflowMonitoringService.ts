import { EventEmitter } from 'events';
import { 
  SessionId, 
  JobId, 
  SessionStatus, 
  JobStatus,
  AuditEventType
} from '../types';
import { AuditLogger } from './AuditLogger';

export interface WorkflowMetrics {
  totalWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  averageCompletionTime: number;
  successRate: number;
  currentActiveWorkflows: number;
  peakConcurrentWorkflows: number;
  errorsByCategory: Record<string, number>;
  performanceMetrics: {
    averageFileUploadTime: number;
    averagePrintTime: number;
    averagePaymentTime: number;
    averageCleanupTime: number;
  };
}

export interface WorkflowEvent {
  id: string;
  type: 'workflow_started' | 'workflow_completed' | 'workflow_failed' | 'step_completed' | 'step_failed' | 'error_occurred';
  workflowId: string;
  sessionId: SessionId;
  timestamp: Date;
  data: any;
  duration?: number;
  errorCategory?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface PerformanceAlert {
  id: string;
  type: 'slow_workflow' | 'high_error_rate' | 'resource_constraint' | 'system_degradation';
  message: string;
  severity: 'warning' | 'critical';
  timestamp: Date;
  data: any;
  acknowledged: boolean;
}

/**
 * WorkflowMonitoringService provides comprehensive monitoring and analytics for all workflows
 * Requirements: 15.1 - Comprehensive logging and monitoring for workflow integration
 */
export class WorkflowMonitoringService extends EventEmitter {
  private auditLogger: AuditLogger;
  private workflowEvents: WorkflowEvent[] = [];
  private performanceAlerts: PerformanceAlert[] = [];
  private metrics: WorkflowMetrics;
  private activeWorkflows = new Set<string>();
  private workflowStartTimes = new Map<string, Date>();
  private maxEventHistory = 1000;
  private maxAlertHistory = 100;
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  // Performance thresholds
  private readonly thresholds = {
    slowWorkflowMs: 300000, // 5 minutes
    highErrorRatePercent: 20, // 20% error rate
    maxConcurrentWorkflows: 50,
    alertCooldownMs: 300000 // 5 minutes between similar alerts
  };

  constructor(auditLogger: AuditLogger) {
    super();
    this.auditLogger = auditLogger;
    this.metrics = this.initializeMetrics();
    this.startPeriodicMonitoring();
  }

  /**
   * Initialize metrics structure
   */
  private initializeMetrics(): WorkflowMetrics {
    return {
      totalWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      averageCompletionTime: 0,
      successRate: 0,
      currentActiveWorkflows: 0,
      peakConcurrentWorkflows: 0,
      errorsByCategory: {},
      performanceMetrics: {
        averageFileUploadTime: 0,
        averagePrintTime: 0,
        averagePaymentTime: 0,
        averageCleanupTime: 0
      }
    };
  }

  /**
   * Record workflow started event
   */
  recordWorkflowStarted(workflowId: string, sessionId: SessionId, workflowType: string, metadata?: any): void {
    const event: WorkflowEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'workflow_started',
      workflowId,
      sessionId,
      timestamp: new Date(),
      data: {
        workflowType,
        metadata
      }
    };

    this.addEvent(event);
    this.activeWorkflows.add(workflowId);
    this.workflowStartTimes.set(workflowId, new Date());
    
    // Update metrics
    this.metrics.totalWorkflows++;
    this.metrics.currentActiveWorkflows = this.activeWorkflows.size;
    this.metrics.peakConcurrentWorkflows = Math.max(
      this.metrics.peakConcurrentWorkflows,
      this.activeWorkflows.size
    );

    // Check for resource constraints
    if (this.activeWorkflows.size > this.thresholds.maxConcurrentWorkflows) {
      this.createAlert(
        'resource_constraint',
        `High concurrent workflow count: ${this.activeWorkflows.size}`,
        'critical',
        { activeWorkflows: this.activeWorkflows.size }
      );
    }

    this.emit('workflowStarted', event);
    this.auditLogger.logSystemEvent('WORKFLOW_MONITORING_STARTED', {
      workflowId,
      sessionId,
      workflowType,
      activeWorkflows: this.activeWorkflows.size
    });
  }

  /**
   * Record workflow completed event
   */
  recordWorkflowCompleted(workflowId: string, sessionId: SessionId, workflowType: string, result?: any): void {
    const startTime = this.workflowStartTimes.get(workflowId);
    const duration = startTime ? Date.now() - startTime.getTime() : 0;

    const event: WorkflowEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'workflow_completed',
      workflowId,
      sessionId,
      timestamp: new Date(),
      duration,
      data: {
        workflowType,
        result,
        completionTime: duration
      }
    };

    this.addEvent(event);
    this.activeWorkflows.delete(workflowId);
    this.workflowStartTimes.delete(workflowId);

    // Update metrics
    this.metrics.completedWorkflows++;
    this.metrics.currentActiveWorkflows = this.activeWorkflows.size;
    this.updateAverageCompletionTime(duration);
    this.updateSuccessRate();

    // Check for slow workflows
    if (duration > this.thresholds.slowWorkflowMs) {
      this.createAlert(
        'slow_workflow',
        `Workflow ${workflowId} took ${Math.round(duration / 1000)}s to complete`,
        'warning',
        { workflowId, duration, workflowType }
      );
    }

    this.emit('workflowCompleted', event);
    this.auditLogger.logSystemEvent('WORKFLOW_MONITORING_COMPLETED', {
      workflowId,
      sessionId,
      workflowType,
      duration,
      activeWorkflows: this.activeWorkflows.size
    });
  }

  /**
   * Record workflow failed event
   */
  recordWorkflowFailed(
    workflowId: string, 
    sessionId: SessionId, 
    workflowType: string, 
    error: Error | string,
    errorCategory?: string
  ): void {
    const startTime = this.workflowStartTimes.get(workflowId);
    const duration = startTime ? Date.now() - startTime.getTime() : 0;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const category = errorCategory || this.categorizeError(errorMessage);

    const event: WorkflowEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'workflow_failed',
      workflowId,
      sessionId,
      timestamp: new Date(),
      duration,
      errorCategory: category,
      severity: this.determineErrorSeverity(errorMessage),
      data: {
        workflowType,
        error: errorMessage,
        errorCategory: category,
        failureTime: duration
      }
    };

    this.addEvent(event);
    this.activeWorkflows.delete(workflowId);
    this.workflowStartTimes.delete(workflowId);

    // Update metrics
    this.metrics.failedWorkflows++;
    this.metrics.currentActiveWorkflows = this.activeWorkflows.size;
    this.metrics.errorsByCategory[category] = (this.metrics.errorsByCategory[category] || 0) + 1;
    this.updateSuccessRate();

    // Check error rate
    this.checkErrorRate();

    this.emit('workflowFailed', event);
    this.auditLogger.logSystemEvent('WORKFLOW_MONITORING_FAILED', {
      workflowId,
      sessionId,
      workflowType,
      error: errorMessage,
      errorCategory: category,
      duration,
      activeWorkflows: this.activeWorkflows.size
    });
  }

  /**
   * Record workflow step completion
   */
  recordStepCompleted(
    workflowId: string, 
    sessionId: SessionId, 
    stepId: string, 
    stepType: string,
    duration: number,
    result?: any
  ): void {
    const event: WorkflowEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'step_completed',
      workflowId,
      sessionId,
      timestamp: new Date(),
      duration,
      data: {
        stepId,
        stepType,
        duration,
        result
      }
    };

    this.addEvent(event);
    this.updatePerformanceMetrics(stepType, duration);

    this.emit('stepCompleted', event);
  }

  /**
   * Record workflow step failure
   */
  recordStepFailed(
    workflowId: string, 
    sessionId: SessionId, 
    stepId: string, 
    stepType: string,
    error: Error | string,
    duration?: number
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const category = this.categorizeError(errorMessage);

    const event: WorkflowEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'step_failed',
      workflowId,
      sessionId,
      timestamp: new Date(),
      duration,
      errorCategory: category,
      severity: this.determineErrorSeverity(errorMessage),
      data: {
        stepId,
        stepType,
        error: errorMessage,
        errorCategory: category,
        duration
      }
    };

    this.addEvent(event);
    this.metrics.errorsByCategory[category] = (this.metrics.errorsByCategory[category] || 0) + 1;

    this.emit('stepFailed', event);
  }

  /**
   * Record general error event
   */
  recordError(
    sessionId: SessionId, 
    error: Error | string, 
    context?: any,
    workflowId?: string
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const category = this.categorizeError(errorMessage);

    const event: WorkflowEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'error_occurred',
      workflowId: workflowId || 'system',
      sessionId,
      timestamp: new Date(),
      errorCategory: category,
      severity: this.determineErrorSeverity(errorMessage),
      data: {
        error: errorMessage,
        errorCategory: category,
        context
      }
    };

    this.addEvent(event);
    this.metrics.errorsByCategory[category] = (this.metrics.errorsByCategory[category] || 0) + 1;

    this.emit('errorOccurred', event);
  }

  /**
   * Get current workflow metrics
   */
  getMetrics(): WorkflowMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent workflow events
   */
  getRecentEvents(limit: number = 100, type?: string): WorkflowEvent[] {
    let events = this.workflowEvents;
    
    if (type) {
      events = events.filter(e => e.type === type);
    }
    
    return events.slice(0, limit);
  }

  /**
   * Get performance alerts
   */
  getAlerts(includeAcknowledged: boolean = false): PerformanceAlert[] {
    if (includeAcknowledged) {
      return [...this.performanceAlerts];
    }
    return this.performanceAlerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.performanceAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Get workflow statistics for a specific time period
   */
  getStatisticsForPeriod(startTime: Date, endTime: Date): {
    totalWorkflows: number;
    completedWorkflows: number;
    failedWorkflows: number;
    averageCompletionTime: number;
    successRate: number;
    errorsByCategory: Record<string, number>;
  } {
    const periodEvents = this.workflowEvents.filter(
      e => e.timestamp >= startTime && e.timestamp <= endTime
    );

    const workflowStarted = periodEvents.filter(e => e.type === 'workflow_started').length;
    const workflowCompleted = periodEvents.filter(e => e.type === 'workflow_completed').length;
    const workflowFailed = periodEvents.filter(e => e.type === 'workflow_failed').length;

    const completedEvents = periodEvents.filter(e => e.type === 'workflow_completed' && e.duration);
    const averageCompletionTime = completedEvents.length > 0
      ? completedEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / completedEvents.length
      : 0;

    const successRate = (workflowCompleted + workflowFailed) > 0
      ? (workflowCompleted / (workflowCompleted + workflowFailed)) * 100
      : 0;

    const errorsByCategory: Record<string, number> = {};
    periodEvents
      .filter(e => e.errorCategory)
      .forEach(e => {
        errorsByCategory[e.errorCategory!] = (errorsByCategory[e.errorCategory!] || 0) + 1;
      });

    return {
      totalWorkflows: workflowStarted,
      completedWorkflows: workflowCompleted,
      failedWorkflows: workflowFailed,
      averageCompletionTime,
      successRate,
      errorsByCategory
    };
  }

  /**
   * Get system health status based on metrics
   */
  getSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check success rate
    if (this.metrics.successRate < 80) {
      issues.push(`Low success rate: ${this.metrics.successRate.toFixed(1)}%`);
      recommendations.push('Investigate common failure patterns');
      score -= 20;
    } else if (this.metrics.successRate < 95) {
      issues.push(`Moderate success rate: ${this.metrics.successRate.toFixed(1)}%`);
      score -= 10;
    }

    // Check active workflows
    if (this.metrics.currentActiveWorkflows > this.thresholds.maxConcurrentWorkflows * 0.8) {
      issues.push(`High concurrent workflow load: ${this.metrics.currentActiveWorkflows}`);
      recommendations.push('Consider load balancing or resource scaling');
      score -= 15;
    }

    // Check unacknowledged alerts
    const unacknowledgedAlerts = this.getAlerts(false);
    if (unacknowledgedAlerts.length > 0) {
      const criticalAlerts = unacknowledgedAlerts.filter(a => a.severity === 'critical').length;
      if (criticalAlerts > 0) {
        issues.push(`${criticalAlerts} critical alerts pending`);
        score -= 25;
      }
      if (unacknowledgedAlerts.length > criticalAlerts) {
        issues.push(`${unacknowledgedAlerts.length - criticalAlerts} warning alerts pending`);
        score -= 10;
      }
    }

    // Check average completion time
    if (this.metrics.averageCompletionTime > this.thresholds.slowWorkflowMs) {
      issues.push(`Slow average completion time: ${Math.round(this.metrics.averageCompletionTime / 1000)}s`);
      recommendations.push('Optimize workflow performance');
      score -= 15;
    }

    // Determine status
    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 90) {
      status = 'healthy';
    } else if (score >= 70) {
      status = 'warning';
    } else {
      status = 'critical';
    }

    return {
      status,
      score: Math.max(0, score),
      issues,
      recommendations
    };
  }

  /**
   * Export metrics and events for analysis
   */
  exportData(format: 'json' | 'csv' = 'json'): string {
    const data = {
      metrics: this.metrics,
      events: this.workflowEvents,
      alerts: this.performanceAlerts,
      exportTime: new Date(),
      systemHealth: this.getSystemHealth()
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Simple CSV export for events
      const csvHeaders = 'timestamp,type,workflowId,sessionId,duration,errorCategory,severity\n';
      const csvRows = this.workflowEvents.map(e => 
        `${e.timestamp.toISOString()},${e.type},${e.workflowId},${e.sessionId},${e.duration || ''},${e.errorCategory || ''},${e.severity || ''}`
      ).join('\n');
      return csvHeaders + csvRows;
    }
  }

  // Private helper methods

  private addEvent(event: WorkflowEvent): void {
    this.workflowEvents.unshift(event);
    
    // Maintain event history size
    if (this.workflowEvents.length > this.maxEventHistory) {
      this.workflowEvents = this.workflowEvents.slice(0, this.maxEventHistory);
    }
  }

  private createAlert(
    type: PerformanceAlert['type'],
    message: string,
    severity: PerformanceAlert['severity'],
    data: any
  ): void {
    // Check for recent similar alerts to avoid spam
    const recentSimilar = this.performanceAlerts.find(
      a => a.type === type && 
           (Date.now() - a.timestamp.getTime()) < this.thresholds.alertCooldownMs
    );

    if (recentSimilar) {
      return; // Skip duplicate alert
    }

    const alert: PerformanceAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      severity,
      timestamp: new Date(),
      data,
      acknowledged: false
    };

    this.performanceAlerts.unshift(alert);
    
    // Maintain alert history size
    if (this.performanceAlerts.length > this.maxAlertHistory) {
      this.performanceAlerts = this.performanceAlerts.slice(0, this.maxAlertHistory);
    }

    this.emit('alertCreated', alert);
    this.auditLogger.logSystemEvent('PERFORMANCE_ALERT_CREATED', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message
    });
  }

  private updateAverageCompletionTime(newDuration: number): void {
    const totalCompleted = this.metrics.completedWorkflows;
    const currentAverage = this.metrics.averageCompletionTime;
    
    // Calculate running average
    this.metrics.averageCompletionTime = 
      ((currentAverage * (totalCompleted - 1)) + newDuration) / totalCompleted;
  }

  private updateSuccessRate(): void {
    const total = this.metrics.completedWorkflows + this.metrics.failedWorkflows;
    this.metrics.successRate = total > 0 
      ? (this.metrics.completedWorkflows / total) * 100 
      : 0;
  }

  private updatePerformanceMetrics(stepType: string, duration: number): void {
    const metrics = this.metrics.performanceMetrics;
    
    switch (stepType) {
      case 'file_upload':
      case 'transfer_to_local_agent':
        metrics.averageFileUploadTime = this.updateRunningAverage(
          metrics.averageFileUploadTime, 
          duration
        );
        break;
      case 'execute_print':
      case 'monitor_progress':
        metrics.averagePrintTime = this.updateRunningAverage(
          metrics.averagePrintTime, 
          duration
        );
        break;
      case 'verify_payment':
      case 'process_payment':
        metrics.averagePaymentTime = this.updateRunningAverage(
          metrics.averagePaymentTime, 
          duration
        );
        break;
      case 'cleanup_files':
      case 'session_cleanup':
        metrics.averageCleanupTime = this.updateRunningAverage(
          metrics.averageCleanupTime, 
          duration
        );
        break;
    }
  }

  private updateRunningAverage(currentAverage: number, newValue: number): number {
    // Simple running average with decay factor
    const decayFactor = 0.1;
    return currentAverage === 0 ? newValue : (currentAverage * (1 - decayFactor)) + (newValue * decayFactor);
  }

  private checkErrorRate(): void {
    const recentPeriod = 3600000; // 1 hour
    const cutoffTime = new Date(Date.now() - recentPeriod);
    
    const recentEvents = this.workflowEvents.filter(e => e.timestamp >= cutoffTime);
    const recentCompleted = recentEvents.filter(e => e.type === 'workflow_completed').length;
    const recentFailed = recentEvents.filter(e => e.type === 'workflow_failed').length;
    const total = recentCompleted + recentFailed;
    
    if (total >= 10) { // Only check if we have sufficient data
      const errorRate = (recentFailed / total) * 100;
      
      if (errorRate > this.thresholds.highErrorRatePercent) {
        this.createAlert(
          'high_error_rate',
          `High error rate in last hour: ${errorRate.toFixed(1)}% (${recentFailed}/${total})`,
          'critical',
          { errorRate, recentFailed, total, period: '1 hour' }
        );
      }
    }
  }

  private categorizeError(errorMessage: string): string {
    const categories = {
      'network': /network|connection|timeout|unreachable/i,
      'payment': /payment|transaction|upi|gateway/i,
      'printer': /printer|print|spool|offline/i,
      'file': /file|upload|download|format|size/i,
      'session': /session|expired|invalid|terminated/i,
      'validation': /validation|invalid|format|required/i,
      'resource': /memory|disk|cpu|resource|limit/i,
      'security': /security|authentication|authorization|permission/i,
      'system': /system|internal|unexpected/i
    };

    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(errorMessage)) {
        return category;
      }
    }

    return 'unknown';
  }

  private determineErrorSeverity(errorMessage: string): 'low' | 'medium' | 'high' | 'critical' {
    const criticalPatterns = /security|corruption|integrity|critical|fatal/i;
    const highPatterns = /failed|error|exception|timeout|offline/i;
    const mediumPatterns = /warning|retry|temporary/i;

    if (criticalPatterns.test(errorMessage)) {
      return 'critical';
    } else if (highPatterns.test(errorMessage)) {
      return 'high';
    } else if (mediumPatterns.test(errorMessage)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private startPeriodicMonitoring(): void {
    // Run monitoring checks every 5 minutes
    this.monitoringInterval = setInterval(() => {
      this.performPeriodicChecks();
    }, 300000);
  }

  private performPeriodicChecks(): void {
    // Check for stale workflows (running too long)
    const staleThreshold = Date.now() - (2 * this.thresholds.slowWorkflowMs);
    
    for (const [workflowId, startTime] of this.workflowStartTimes.entries()) {
      if (startTime.getTime() < staleThreshold) {
        this.createAlert(
          'slow_workflow',
          `Workflow ${workflowId} has been running for over ${Math.round((Date.now() - startTime.getTime()) / 60000)} minutes`,
          'warning',
          { workflowId, runningTime: Date.now() - startTime.getTime() }
        );
      }
    }

    // Emit periodic metrics update
    this.emit('metricsUpdated', this.metrics);
  }

  /**
   * Shutdown monitoring service
   */
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.auditLogger.logSystemEvent('WORKFLOW_MONITORING_SHUTDOWN', {
      totalWorkflows: this.metrics.totalWorkflows,
      activeWorkflows: this.activeWorkflows.size,
      pendingAlerts: this.getAlerts(false).length
    });
  }
}