import { prisma } from '../lib/prisma.js';
import { markWebhookProcessed, logWebhookError } from '../services/webhookAudit.js';
import { processWebhookByName } from '../routes/webhook.js';
import logger from '../lib/logger.js';

const MAX_RETRIES = 5;

/**
 * Process webhook retry queue
 * Actually retries failed webhooks instead of just resetting them
 */
export async function processWebhookQueue(): Promise<void> {
  const now = new Date();

  try {
    logger.info('[WebhookQueue] Starting retry processing...');

    // Find webhooks ready for retry
    const readyForRetry = await prisma.webhookQueue.findMany({
      where: {
        nextRetry: { lte: now },
      },
      include: {
        webhookEvent: true,
      },
      take: 10, // Process 10 at a time to avoid long-running jobs
    });

    if (readyForRetry.length === 0) {
      logger.info('[WebhookQueue] No webhooks to retry');
      return;
    }

    logger.info(`[WebhookQueue] Processing ${readyForRetry.length} webhook retries`);

    for (const queueItem of readyForRetry) {
      const event = queueItem.webhookEvent;

      try {
        logger.info(
          `[WebhookQueue] Retrying: ${event.eventName} (attempt ${queueItem.retryCount + 1})`
        );

        // Actually process the webhook
        await processWebhookByName(
          event.eventName,
          event.data as Record<string, unknown>
        );

        // Success! Mark as processed and remove from queue
        await markWebhookProcessed(event.id);
        await prisma.webhookQueue.delete({
          where: { id: queueItem.id },
        });

        logger.info(`[WebhookQueue] Successfully processed: ${event.id}`);
      } catch (error) {
        logger.error(`[WebhookQueue] Retry failed: ${event.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Check if we've exhausted retries
        if (queueItem.retryCount >= MAX_RETRIES - 1) {
          // Mark as permanently failed, remove from queue
          await prisma.webhookEvent.update({
            where: { id: event.id },
            data: {
              error: `Max retries exceeded: ${(error as Error).message}`,
              errorCount: MAX_RETRIES,
            },
          });
          await prisma.webhookQueue.delete({
            where: { id: queueItem.id },
          });
          logger.error(`[WebhookQueue] Permanently failed: ${event.id}`);
        } else {
          // Log error for next retry (this will update queue with new nextRetry time)
          await logWebhookError(event.id, error as Error, true);
        }
      }
    }

    logger.info('[WebhookQueue] Retry processing complete');
  } catch (error) {
    logger.error('[WebhookQueue] Fatal error:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
