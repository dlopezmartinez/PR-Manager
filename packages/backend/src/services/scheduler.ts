/**
 * Job Scheduler
 * Manages scheduled jobs that run on intervals or at specific times
 */

import { runSubscriptionSync } from '../jobs/syncSubscriptions.js';

interface ScheduledJob {
  name: string;
  fn: () => Promise<void>;
  intervalMs: number;
  nextRunTime: Date;
}

const jobs: ScheduledJob[] = [];
let schedulerRunning = false;
let schedulerIntervalId: NodeJS.Timeout | null = null;

/**
 * Calculate the next run time for a daily job at a specific hour (UTC)
 */
function getNextRunTimeForHour(hourUTC: number): Date {
  const now = new Date();
  const next = new Date(now);

  // Set to target hour on today
  next.setUTCHours(hourUTC, 0, 0, 0);

  // If that time has already passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Register a scheduled job that runs at a specific hour (UTC) every day
 */
export function scheduleDaily(
  name: string,
  fn: () => Promise<void>,
  hourUTC: number
): void {
  const job: ScheduledJob = {
    name,
    fn,
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    nextRunTime: getNextRunTimeForHour(hourUTC),
  };

  jobs.push(job);
  console.log(`[Scheduler] Registered job: ${name} (daily at ${hourUTC}:00 UTC)`);
}

/**
 * Execute a job and handle errors
 */
async function executeJob(job: ScheduledJob): Promise<void> {
  try {
    console.log(`[Scheduler] Executing job: ${job.name}`);
    const startTime = Date.now();

    await job.fn();

    const duration = Date.now() - startTime;
    console.log(`[Scheduler] Job completed: ${job.name} (${duration}ms)`);
  } catch (error) {
    console.error(`[Scheduler] Job failed: ${job.name}`, error);
  }
}

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  if (schedulerRunning) {
    console.warn('[Scheduler] Scheduler is already running');
    return;
  }

  schedulerRunning = true;
  console.log('[Scheduler] Scheduler started');

  // Run scheduler tick every minute
  schedulerIntervalId = setInterval(async () => {
    const now = new Date();

    for (const job of jobs) {
      // Check if job should run
      if (now >= job.nextRunTime) {
        // Execute job
        await executeJob(job);

        // Schedule next run
        job.nextRunTime = new Date(job.nextRunTime.getTime() + job.intervalMs);
        console.log(`[Scheduler] Next run for ${job.name}: ${job.nextRunTime.toUTCString()}`);
      }
    }
  }, 60 * 1000); // Check every minute

  // Also check immediately for any jobs that should run
  const now = new Date();
  for (const job of jobs) {
    if (now >= job.nextRunTime) {
      executeJob(job).catch(console.error);
      job.nextRunTime = new Date(job.nextRunTime.getTime() + job.intervalMs);
    }
  }
}

/**
 * Stop the scheduler gracefully
 */
export function stopScheduler(): void {
  if (!schedulerRunning) {
    console.log('[Scheduler] Scheduler is not running');
    return;
  }

  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }

  schedulerRunning = false;
  console.log('[Scheduler] Scheduler stopped');
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    jobs: jobs.map(job => ({
      name: job.name,
      nextRunTime: job.nextRunTime.toISOString(),
    })),
  };
}
