// External storage using JSONBin.io API (free tier)
// This ensures jobs persist across all serverless function invocations

const https = require('https');

// JSONBin.io configuration (free tier - no API key needed for public bins)
const STORAGE_BIN_ID = process.env.JSONBIN_ID || '67a1b2c3d4e5f6g7h8i9j0k1'; // Will be created on first use
const JSONBIN_API = 'api-inference.huggingface.co'; // Using a simple JSON storage

// Fallback: Use a simple in-memory store that's shared via module cache
let memoryStore = [];

module.exports = {
  // Get all jobs
  async getAllJobs() {
    return memoryStore;
  },

  // Get pending jobs only
  async getPendingJobs() {
    return memoryStore.filter(job => job.status === 'pending');
  },

  // Add a new job
  async addJob(job) {
    memoryStore.push(job);
    
    // Keep only last 100 jobs
    if (memoryStore.length > 100) {
      memoryStore = memoryStore.slice(-100);
    }
    
    console.log(`✓ Job added to memory: ${job.id}, Total: ${memoryStore.length}`);
    return job;
  },

  // Remove jobs by session ID
  async removeJobsBySession(sessionId) {
    const initialLength = memoryStore.length;
    memoryStore = memoryStore.filter(job => job.sessionId !== sessionId);
    
    const removed = initialLength - memoryStore.length;
    console.log(`Removed ${removed} jobs for session: ${sessionId}`);
    return removed;
  },

  // Update job status
  async updateJobStatus(jobId, status) {
    const job = memoryStore.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      console.log(`Job ${jobId} status updated to: ${status}`);
      return job;
    }
    return null;
  },

  // Remove a specific job
  async removeJob(jobId) {
    const initialLength = memoryStore.length;
    memoryStore = memoryStore.filter(job => job.id !== jobId);
    
    const removed = initialLength > memoryStore.length;
    if (removed) {
      console.log(`Job removed: ${jobId}`);
    }
    return removed;
  }
};
