import { runSubscriptionSync } from '../jobs/syncSubscriptions.js';
import { processWebhookQueue } from '../jobs/processWebhookQueue.js';
import logger from '../lib/logger.js';

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
  logger.info('Registered scheduled job', { name, schedule: `daily at ${hourUTC}:00 UTC` });
}

export function scheduleInterval(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number
): void {
  fn().catch((err) => logger.error('Scheduler job initial run failed', { name, error: (err as Error).message }));

  const id = setInterval(() => {
    fn().catch((err) => logger.error('Scheduler job failed', { name, error: (err as Error).message }));
  }, intervalMs);

  intervalJobs.push({ name, id });
  logger.info('Registered interval job', { name, intervalSeconds: intervalMs / 1000 });
}

async function executeJob(job: ScheduledJob): Promise<void> {
  try {
    logger.info('Executing job', { name: job.name });
    const startTime = Date.now();

    await job.fn();

    const duration = Date.now() - startTime;
    logger.info('Job completed', { name: job.name, durationMs: duration });
  } catch (error) {
    logger.error('Job failed', { name: job.name, error: (error as Error).message });
  }
}

export function startScheduler(): void {
  if (schedulerRunning) {
    logger.warn('Scheduler is already running');
    return;
  }

  schedulerRunning = true;
  logger.info('Scheduler started');

  scheduleInterval('webhook-retry', processWebhookQueue, 5 * 60 * 1000);

  schedulerIntervalId = setInterval(async () => {
    const now = new Date();

    for (const job of jobs) {
      if (now >= job.nextRunTime) {
        await executeJob(job);

        job.nextRunTime = new Date(job.nextRunTime.getTime() + job.intervalMs);
        logger.info('Scheduled next job run', { name: job.name, nextRunTime: job.nextRunTime.toUTCString() });
      }
    }
  }, 60 * 1000);

  const now = new Date();
  for (const job of jobs) {
    if (now >= job.nextRunTime) {
      executeJob(job).catch((err) => logger.error('Job execution failed', { error: (err as Error).message }));
      job.nextRunTime = new Date(job.nextRunTime.getTime() + job.intervalMs);
    }
  }
}

export function stopScheduler(): void {
  if (!schedulerRunning) {
    logger.info('Scheduler is not running');
    return;
  }

  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
  }

  for (const job of intervalJobs) {
    clearInterval(job.id);
    logger.info('Stopped interval job', { name: job.name });
  }
  intervalJobs.length = 0;

  schedulerRunning = false;
  logger.info('Scheduler stopped');
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
