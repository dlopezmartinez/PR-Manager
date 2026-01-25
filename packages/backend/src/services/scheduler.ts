import { runSubscriptionSync } from '../jobs/syncSubscriptions.js';
import { processWebhookQueue } from '../jobs/processWebhookQueue.js';

interface ScheduledJob {
  name: string;
  fn: () => Promise<void>;
  intervalMs: number;
  nextRunTime: Date;
}

interface IntervalJob {
  name: string;
  id: NodeJS.Timeout;
}

const jobs: ScheduledJob[] = [];
const intervalJobs: IntervalJob[] = [];
let schedulerRunning = false;
let schedulerIntervalId: NodeJS.Timeout | null = null;

function getNextRunTimeForHour(hourUTC: number): Date {
  const now = new Date();
  const next = new Date(now);

  next.setUTCHours(hourUTC, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export function scheduleDaily(
  name: string,
  fn: () => Promise<void>,
  hourUTC: number
): void {
  const job: ScheduledJob = {
    name,
    fn,
    intervalMs: 24 * 60 * 60 * 1000,
    nextRunTime: getNextRunTimeForHour(hourUTC),
  };

  jobs.push(job);
  console.log(`[Scheduler] Registered job: ${name} (daily at ${hourUTC}:00 UTC)`);
}

export function scheduleInterval(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number
): void {
  fn().catch((err) => console.error(`[Scheduler] ${name} initial run failed:`, err));

  const id = setInterval(() => {
    fn().catch((err) => console.error(`[Scheduler] ${name} failed:`, err));
  }, intervalMs);

  intervalJobs.push({ name, id });
  console.log(`[Scheduler] Registered interval job: ${name} (every ${intervalMs / 1000}s)`);
}

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

export function startScheduler(): void {
  if (schedulerRunning) {
    console.warn('[Scheduler] Scheduler is already running');
    return;
  }

  schedulerRunning = true;
  console.log('[Scheduler] Scheduler started');

  scheduleInterval('webhook-retry', processWebhookQueue, 5 * 60 * 1000);

  schedulerIntervalId = setInterval(async () => {
    const now = new Date();

    for (const job of jobs) {
      if (now >= job.nextRunTime) {
        await executeJob(job);

        job.nextRunTime = new Date(job.nextRunTime.getTime() + job.intervalMs);
        console.log(`[Scheduler] Next run for ${job.name}: ${job.nextRunTime.toUTCString()}`);
      }
    }
  }, 60 * 1000);

  const now = new Date();
  for (const job of jobs) {
    if (now >= job.nextRunTime) {
      executeJob(job).catch(console.error);
      job.nextRunTime = new Date(job.nextRunTime.getTime() + job.intervalMs);
    }
  }
}

export function stopScheduler(): void {
  if (!schedulerRunning) {
    console.log('[Scheduler] Scheduler is not running');
    return;
  }

  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }

  for (const job of intervalJobs) {
    clearInterval(job.id);
    console.log(`[Scheduler] Stopped interval job: ${job.name}`);
  }
  intervalJobs.length = 0;

  schedulerRunning = false;
  console.log('[Scheduler] Scheduler stopped');
}

export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    jobs: jobs.map(job => ({
      name: job.name,
      nextRunTime: job.nextRunTime.toISOString(),
    })),
    intervalJobs: intervalJobs.map(job => ({
      name: job.name,
    })),
  };
}
