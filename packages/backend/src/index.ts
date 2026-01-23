import { createApp } from './app.js';
import { scheduleDaily, startScheduler, getSchedulerStatus } from './services/scheduler.js';
import { runSubscriptionSync } from './jobs/syncSubscriptions.js';
import { processWebhookQueue } from './jobs/processWebhookQueue.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

// Scheduler status endpoint (for monitoring)
app.get('/health/scheduler', (req, res) => {
  res.json(getSchedulerStatus());
});

// Start server
app.listen(PORT, () => {
  console.log(`PR Manager API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  if (process.env.NODE_ENV !== 'production') {
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Scheduler status: http://localhost:${PORT}/health/scheduler`);
  }

  // Register and start scheduled jobs
  // Sync subscriptions daily at 2:00 AM UTC
  scheduleDaily('syncSubscriptions', runSubscriptionSync, 2);

  // Process webhook queue daily at 1:00 AM UTC
  scheduleDaily('processWebhookQueue', processWebhookQueue, 1);

  // Start the scheduler
  startScheduler();
});

export default app;
