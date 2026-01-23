import { createApp } from './app.js';
import { scheduleDaily, startScheduler, stopScheduler, getSchedulerStatus } from './services/scheduler.js';
import { runSubscriptionSync } from './jobs/syncSubscriptions.js';
import { processWebhookQueue } from './jobs/processWebhookQueue.js';
import { prisma } from './lib/prisma.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

// Scheduler status endpoint (for monitoring)
app.get('/health/scheduler', (req, res) => {
  res.json(getSchedulerStatus());
});

// Start server
const server = app.listen(PORT, () => {
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

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error('Error closing server:', err);
      process.exit(1);
    }

    console.log('HTTP server closed');

    try {
      // Stop scheduled jobs
      stopScheduler();

      // Close database connection
      await prisma.$disconnect();
      console.log('Database connection closed');

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30000);
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit on unhandled rejection, just log it
});

export default app;
