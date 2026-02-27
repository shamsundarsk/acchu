// Simple persistent storage using a JSON file approach
// Since Vercel serverless functions don't share /tmp across invocations,
// we'll use a global variable that persists within the same container
// and sync to a file for backup

const fs = require('fs');
const path = require('path');

// In-memory storage (persists within same container)
let jobsCache = null;
let lastSync = 0;

const JOBS_FILE = '/tmp/print-jobs-db.json';
const SYNC_INTERVAL = 1000; // Sync every 1 second

// Initialize storage
function initStorage() {
  if (jobsCache === null) {
    try {
      if (fs.existsSync(JOBS_FILE)) {
        const data = fs.readFileSync(JOBS_FILE, 'utf8');
        jobsCache = JSON.parse(data);
        console.log(`Loaded ${jobsCache.length} jobs from file`);
      } else {
        jobsCache = [];
        console.log('Initialized empty job storage');
      }
    } catch (err) {
      console.error('Error loading jobs:', err);
      jobsCache = [];
    }
  }
  return jobsCache;
}

// Sync to file (throttled)
function syncToFile() {
  const now = Date.now();
  if (now - lastSync < SYNC_INTERVAL) {
    return; // Don't sync too frequently
  }
  
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobsCache, null, 2), 'utf8');
    lastSync = now;
    console.log(`Synced ${jobsCache.length} jobs to file`);
  } catch (err) {
    console.error('Error syncing jobs:', err);
  }
}

module.exports = {
  // Get all jobs
  getAllJobs() {
    initStorage();
    return [...jobsCache]; // Return copy
  },

  // Get pending jobs only
  getPendingJobs() {
    initStorage();
    return jobsCache.filter(job => job.status === 'pending');
  },

  // Add a new job
  addJob(job) {
    initStorage();
    jobsCache.push(job);
    
    // Keep only last 100 jobs
    if (jobsCache.length > 100) {
      jobsCache = jobsCache.slice(-100);
    }
    
    syncToFile();
    console.log(`✓ Job added: ${job.id}, Total: ${jobsCache.length}`);
    return job;
  },

  // Remove jobs by session ID
  removeJobsBySession(sessionId) {
    initStorage();
    const initialLength = jobsCache.length;
    jobsCache = jobsCache.filter(job => job.sessionId !== sessionId);
    
    syncToFile();
    const removed = initialLength - jobsCache.length;
    console.log(`Removed ${removed} jobs for session: ${sessionId}`);
    return removed;
  },

  // Update job status
  updateJobStatus(jobId, status) {
    initStorage();
    const job = jobsCache.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      syncToFile();
      console.log(`Job ${jobId} status updated to: ${status}`);
      return job;
    }
    return null;
  },

  // Remove a specific job
  removeJob(jobId) {
    initStorage();
    const initialLength = jobsCache.length;
    jobsCache = jobsCache.filter(job => job.id !== jobId);
    
    syncToFile();
    const removed = initialLength > jobsCache.length;
    if (removed) {
      console.log(`Job removed: ${jobId}`);
    }
    return removed;
  },

  // Force sync (call this after important operations)
  forceSync() {
    lastSync = 0;
    syncToFile();
  }
};
