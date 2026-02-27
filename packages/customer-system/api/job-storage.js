// Shared file-based storage for print jobs
// Uses /tmp directory which is shared across function invocations in the same region
const fs = require('fs');
const path = require('path');

const JOBS_FILE = '/tmp/print-jobs.json';

// Ensure jobs file exists
function ensureJobsFile() {
  try {
    if (!fs.existsSync(JOBS_FILE)) {
      fs.writeFileSync(JOBS_FILE, JSON.stringify([]), 'utf8');
    }
  } catch (err) {
    console.error('Error ensuring jobs file:', err);
  }
}

// Read jobs from file
function readJobs() {
  try {
    ensureJobsFile();
    const data = fs.readFileSync(JOBS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading jobs:', err);
    return [];
  }
}

// Write jobs to file
function writeJobs(jobs) {
  try {
    fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing jobs:', err);
  }
}

module.exports = {
  // Get all jobs
  getAllJobs() {
    return readJobs();
  },

  // Get pending jobs only
  getPendingJobs() {
    const jobs = readJobs();
    return jobs.filter(job => job.status === 'pending');
  },

  // Add a new job
  addJob(job) {
    const jobs = readJobs();
    jobs.push(job);
    
    // Keep only last 100 jobs
    const trimmedJobs = jobs.length > 100 ? jobs.slice(-100) : jobs;
    writeJobs(trimmedJobs);
    
    console.log(`Job added: ${job.id}, Total jobs: ${trimmedJobs.length}`);
    return job;
  },

  // Remove jobs by session ID
  removeJobsBySession(sessionId) {
    const jobs = readJobs();
    const initialLength = jobs.length;
    const filteredJobs = jobs.filter(job => job.sessionId !== sessionId);
    writeJobs(filteredJobs);
    
    const removed = initialLength - filteredJobs.length;
    console.log(`Removed ${removed} jobs for session: ${sessionId}`);
    return removed;
  },

  // Update job status
  updateJobStatus(jobId, status) {
    const jobs = readJobs();
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      writeJobs(jobs);
      console.log(`Job ${jobId} status updated to: ${status}`);
      return job;
    }
    return null;
  },

  // Remove a specific job
  removeJob(jobId) {
    const jobs = readJobs();
    const initialLength = jobs.length;
    const filteredJobs = jobs.filter(job => job.id !== jobId);
    writeJobs(filteredJobs);
    
    const removed = initialLength > filteredJobs.length;
    if (removed) {
      console.log(`Job removed: ${jobId}`);
    }
    return removed;
  }
};
