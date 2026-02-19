import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResourceMonitor } from '../ResourceMonitor';
import * as os from 'os';

// Mock os module
vi.mock('os');

describe('ResourceMonitor', () => {
  let resourceMonitor: ResourceMonitor;
  const mockOs = vi.mocked(os);

  beforeEach(() => {
    // Mock os functions
    mockOs.totalmem.mockReturnValue(8 * 1024 * 1024 * 1024); // 8GB
    mockOs.freemem.mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB free
    mockOs.loadavg.mockReturnValue([1.0, 1.5, 2.0]);
    mockOs.cpus.mockReturnValue(new Array(4).fill({ model: 'Test CPU' }) as any);

    resourceMonitor = new ResourceMonitor({
      monitoringIntervalMs: 100, // Fast interval for testing
      enableAlerts: true,
      thresholds: {
        memoryWarningPercent: 70,
        memoryCriticalPercent: 90,
        diskWarningGB: 2,
        diskCriticalGB: 0.5,
        cpuWarningPercent: 80,
        cpuCriticalPercent: 95
      }
    });
  });

  afterEach(async () => {
    await resourceMonitor.shutdown();
  });

  describe('Metrics Collection', () => {
    it('should collect memory metrics', async () => {
      const metrics = await resourceMonitor.collectMetrics();
      
      expect(metrics.memory).toHaveProperty('totalGB');
      expect(metrics.memory).toHaveProperty('usedGB');
      expect(metrics.memory).toHaveProperty('freeGB');
      expect(metrics.memory).toHaveProperty('usagePercent');
      expect(metrics.memory).toHaveProperty('processUsageGB');
      
      expect(metrics.memory.totalGB).toBeCloseTo(8, 1);
      expect(metrics.memory.freeGB).toBeCloseTo(4, 1);
      expect(metrics.memory.usagePercent).toBeCloseTo(50, 5);
    });

    it('should collect CPU metrics', async () => {
      const metrics = await resourceMonitor.collectMetrics();
      
      expect(metrics.cpu).toHaveProperty('usagePercent');
      expect(metrics.cpu).toHaveProperty('loadAverage');
      expect(metrics.cpu).toHaveProperty('coreCount');
      
      expect(metrics.cpu.coreCount).toBe(4);
      expect(metrics.cpu.loadAverage).toEqual([1.0, 1.5, 2.0]);
      expect(typeof metrics.cpu.usagePercent).toBe('number');
    });

    it('should collect disk metrics', async () => {
      const metrics = await resourceMonitor.collectMetrics();
      
      expect(metrics.disk).toHaveProperty('totalGB');
      expect(metrics.disk).toHaveProperty('usedGB');
      expect(metrics.disk).toHaveProperty('freeGB');
      expect(metrics.disk).toHaveProperty('usagePercent');
      
      expect(typeof metrics.disk.totalGB).toBe('number');
      expect(typeof metrics.disk.freeGB).toBe('number');
    });

    it('should include timestamp in metrics', async () => {
      const beforeTime = new Date();
      const metrics = await resourceMonitor.collectMetrics();
      const afterTime = new Date();
      
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(metrics.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('Resource Alerts', () => {
    it('should emit memory warning alert', async () => {
      const alertSpy = vi.fn();
      resourceMonitor.on('resourceAlert', alertSpy);

      // Mock high memory usage
      mockOs.freemem.mockReturnValue(1 * 1024 * 1024 * 1024); // 1GB free (87.5% used)

      await resourceMonitor.collectMetrics();

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory',
          level: 'warning',
          currentValue: expect.any(Number),
          threshold: 70
        })
      );
    });

    it('should emit memory critical alert', async () => {
      const alertSpy = vi.fn();
      resourceMonitor.on('resourceAlert', alertSpy);

      // Mock very high memory usage
      mockOs.freemem.mockReturnValue(0.5 * 1024 * 1024 * 1024); // 0.5GB free (93.75% used)

      await resourceMonitor.collectMetrics();

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory',
          level: 'critical',
          currentValue: expect.any(Number),
          threshold: 90
        })
      );
    });

    it('should resolve alerts when conditions improve', async () => {
      const alertSpy = vi.fn();
      const resolvedSpy = vi.fn();
      resourceMonitor.on('resourceAlert', alertSpy);
      resourceMonitor.on('resourceAlertResolved', resolvedSpy);

      // First, trigger an alert
      mockOs.freemem.mockReturnValue(1 * 1024 * 1024 * 1024); // High usage
      await resourceMonitor.collectMetrics();
      expect(alertSpy).toHaveBeenCalled();

      // Then, improve conditions
      mockOs.freemem.mockReturnValue(4 * 1024 * 1024 * 1024); // Normal usage
      await resourceMonitor.collectMetrics();
      expect(resolvedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory'
        })
      );
    });
  });

  describe('Resource Status', () => {
    it('should report healthy status under normal conditions', async () => {
      await resourceMonitor.collectMetrics();
      
      const status = resourceMonitor.getResourceStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.isConstrained).toBe(false);
      expect(status.shouldPreventNewSessions).toBe(false);
    });

    it('should report constrained status under high resource usage', async () => {
      // Mock critical resource usage
      mockOs.freemem.mockReturnValue(0.3 * 1024 * 1024 * 1024); // Very low free memory

      await resourceMonitor.collectMetrics();
      
      const status = resourceMonitor.getResourceStatus();
      expect(status.isConstrained).toBe(true);
      expect(status.shouldPreventNewSessions).toBe(true);
    });

    it('should include current metrics in status', async () => {
      await resourceMonitor.collectMetrics();
      
      const status = resourceMonitor.getResourceStatus();
      expect(status.currentMetrics).toBeDefined();
      expect(status.currentMetrics?.memory).toBeDefined();
      expect(status.currentMetrics?.cpu).toBeDefined();
      expect(status.currentMetrics?.disk).toBeDefined();
    });
  });

  describe('Monitoring Control', () => {
    it('should start and stop monitoring', () => {
      expect(resourceMonitor['isMonitoring']).toBe(false);
      
      resourceMonitor.startMonitoring();
      expect(resourceMonitor['isMonitoring']).toBe(true);
      expect(resourceMonitor['monitoringInterval']).toBeDefined();
      
      resourceMonitor.stopMonitoring();
      expect(resourceMonitor['isMonitoring']).toBe(false);
      expect(resourceMonitor['monitoringInterval']).toBeUndefined();
    });

    it('should not start monitoring if already running', () => {
      resourceMonitor.startMonitoring();
      const firstInterval = resourceMonitor['monitoringInterval'];
      
      resourceMonitor.startMonitoring(); // Try to start again
      const secondInterval = resourceMonitor['monitoringInterval'];
      
      expect(firstInterval).toBe(secondInterval);
    });

    it('should collect metrics automatically when monitoring', async () => {
      const collectSpy = vi.spyOn(resourceMonitor, 'collectMetrics');
      
      resourceMonitor.startMonitoring();
      
      // Wait for at least one automatic collection
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(collectSpy).toHaveBeenCalled();
    });
  });

  describe('Metrics History', () => {
    it('should maintain metrics history', async () => {
      await resourceMonitor.collectMetrics();
      await resourceMonitor.collectMetrics();
      
      const history = resourceMonitor.getMetricsHistory();
      expect(history).toHaveLength(2);
      expect(history[0].timestamp).toBeInstanceOf(Date);
      expect(history[1].timestamp).toBeInstanceOf(Date);
    });

    it('should limit history when requested', async () => {
      await resourceMonitor.collectMetrics();
      await resourceMonitor.collectMetrics();
      await resourceMonitor.collectMetrics();
      
      const limitedHistory = resourceMonitor.getMetricsHistory(2);
      expect(limitedHistory).toHaveLength(2);
      
      // Should return the most recent entries
      const fullHistory = resourceMonitor.getMetricsHistory();
      expect(limitedHistory[0]).toBe(fullHistory[1]);
      expect(limitedHistory[1]).toBe(fullHistory[2]);
    });

    it('should clean up old history entries', async () => {
      // Create resource monitor with very short retention
      const shortRetentionMonitor = new ResourceMonitor({
        historyRetentionMs: 10 // 10ms retention
      });

      await shortRetentionMonitor.collectMetrics();
      
      // Wait for retention period to pass
      await new Promise(resolve => setTimeout(resolve, 20));
      
      await shortRetentionMonitor.collectMetrics();
      
      const history = shortRetentionMonitor.getMetricsHistory();
      expect(history).toHaveLength(1); // Only the recent entry should remain
      
      await shortRetentionMonitor.shutdown();
    });
  });

  describe('Threshold Management', () => {
    it('should update thresholds', () => {
      const newThresholds = {
        memoryWarningPercent: 80,
        memoryCriticalPercent: 95
      };
      
      resourceMonitor.updateThresholds(newThresholds);
      
      // Verify thresholds were updated (accessing private property for testing)
      expect(resourceMonitor['thresholds'].memoryWarningPercent).toBe(80);
      expect(resourceMonitor['thresholds'].memoryCriticalPercent).toBe(95);
    });

    it('should use updated thresholds for alerts', async () => {
      const alertSpy = vi.fn();
      resourceMonitor.on('resourceAlert', alertSpy);

      // Set very low threshold
      resourceMonitor.updateThresholds({
        memoryWarningPercent: 10
      });

      // Normal memory usage should now trigger alert
      await resourceMonitor.collectMetrics();

      expect(alertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'memory',
          level: 'warning',
          threshold: 10
        })
      );
    });
  });

  describe('Force Collection', () => {
    it('should force immediate metrics collection', async () => {
      const metrics = await resourceMonitor.forceCollection();
      
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('disk');
      expect(metrics).toHaveProperty('timestamp');
    });
  });

  describe('Active Alerts', () => {
    it('should track active alerts', async () => {
      // Trigger an alert
      mockOs.freemem.mockReturnValue(1 * 1024 * 1024 * 1024); // High usage
      await resourceMonitor.collectMetrics();
      
      const activeAlerts = resourceMonitor.getActiveAlerts();
      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0].type).toBe('memory');
    });

    it('should clear resolved alerts from active list', async () => {
      // Trigger an alert
      mockOs.freemem.mockReturnValue(1 * 1024 * 1024 * 1024); // High usage
      await resourceMonitor.collectMetrics();
      expect(resourceMonitor.getActiveAlerts()).toHaveLength(1);

      // Resolve the alert
      mockOs.freemem.mockReturnValue(4 * 1024 * 1024 * 1024); // Normal usage
      await resourceMonitor.collectMetrics();
      expect(resourceMonitor.getActiveAlerts()).toHaveLength(0);
    });
  });
});