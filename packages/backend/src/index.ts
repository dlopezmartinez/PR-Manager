import { getEnv } from './lib/env.js';
const env = getEnv();

import { createApp } from './app.js';
import { scheduleDaily, startScheduler, stopScheduler, getSchedulerStatus } from './services/scheduler.js';
import { runSubscriptionSync } from './jobs/syncSubscriptions.js';
import { processWebhookQueue } from './jobs/processWebhookQueue.js';
import { prisma } from './lib/prisma.js';
import { initializeVersionCache } from './lib/version.js';
import logger from './lib/logger.js';

const app = createApp();
const PORT = env.PORT;

app.get('/health/scheduler', (req, res) => {
  res.json(getSchedulerStatus());
});

const server = app.listen(PORT, async () => {
  logger.info('PR Manager API server running', { port: PORT });
  logger.info('Environment', { nodeEnv: env.NODE_ENV });

  await initializeVersionCache();

  if (env.NODE_ENV !== 'production') {
    logger.info('Development endpoints available', {
      healthCheck: `http://localhost:${PORT}/health`,
      schedulerStatus: `http://localhost:${PORT}/health/scheduler`,
    });
  }

  scheduleDaily('syncSubscriptions', runSubscriptionSync, 2);
  scheduleDaily('processWebhookQueue', processWebhookQueue, 1);
  startScheduler();
});

async function gracefulShutdown(signal: string) {
  logger.info('Shutdown signal received, starting graceful shutdown', { signal });

  server.close(async (err) => {
    if (err) {
      logger.error('Error closing server', { error: err.message });
      process.exit(1);
    }

    logger.info('HTTP server closed');

    try {
      stopScheduler();
      await prisma.$disconnect();
      logger.info('Database connection closed');
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: (error as Error).message });
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

export default app;
