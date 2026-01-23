# P0-3: Webhook Audit Trail Implementation
## Persistencia y Trazabilidad de Eventos de Pago

**Status:** ⏳ No Iniciado
**Prioridad:** 🔴 CRÍTICA
**Impacto:** Auditoría de pagos, debugging, compliance
**Complejidad:** 🟡 Medio (6 horas)

---

## 📋 El Problema Actual

### Vulnerabilidad

**Ubicación:** `/packages/backend/src/routes/webhook.ts` líneas 61-65

```typescript
try {
  switch (eventName) {
    // ... process webhook
  }
  res.json({ received: true });
} catch (error) {
  console.error(`Error handling webhook ${eventName}:`, error);
  // ❌ SIEMPRE devuelve 200
  res.json({ received: true, error: 'Handler error' });
}
```

### Impacto en Usuario Real

```
Escenario: Usuario paga por suscripción

1. LemonSqueezy procesa pago ✓
2. LemonSqueezy envía webhook: subscription_created
3. Nuestra BD está en mantenimiento (error temporal)
4. Webhook falla pero devuelve 200 OK
5. LemonSqueezy piensa: "OK, no necesito reintentar"
6. Usuario: "Pagué pero no tengo acceso"
7. Sin audit trail: ¿Qué pasó? ¿Recibimos el webhook?

DAÑO:
- Usuario reclama
- Support sin herramientas para investigar
- Posible chargeback
- Mala reputación
```

---

## 🎯 Solución: Audit Trail Completo

### Arquitectura

```
┌─────────────────────────────────────────────────┐
│ POST /webhooks/lemonsqueezy                     │
│ Webhook Request (signed)                        │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 1. Verify Signature (HMAC-SHA256)               │
│    ├─ Valid → Continue                          │
│    └─ Invalid → 401, log malicious attempt      │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 2. Persist WebhookEvent (INMEDIATO)             │
│    ├─ id: webhook event ID de LS                │
│    ├─ eventName: subscription_created, etc.     │
│    ├─ data: full webhook payload JSON           │
│    ├─ status: pending                           │
│    └─ Garantiza que nunca perdamos datos        │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 3. Process Event (try-catch)                    │
│    ├─ IF OK → mark processed=true               │
│    └─ IF FAIL → mark error, enqueue retry       │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ 4. Response                                     │
│    ├─ Always return 200 (LemonSqueezy wants)    │
│    └─ But logged in audit trail                 │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Implementación

### Paso 1: Database Migration

**Crear archivo:** `packages/backend/prisma/migrations/[timestamp]_add_webhook_audit/migration.sql`

```sql
-- Create WebhookEvent table for audit trail
CREATE TABLE "webhook_events" (
  id TEXT NOT NULL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,

  data JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMP,

  error TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT webhook_event_valid_status
    CHECK (processed = true OR error IS NULL)
);

CREATE INDEX idx_webhook_events_event_name
  ON "webhook_events"(event_name);
CREATE INDEX idx_webhook_events_processed
  ON "webhook_events"(processed);
CREATE INDEX idx_webhook_events_created_at
  ON "webhook_events"(created_at);
CREATE UNIQUE INDEX idx_webhook_events_event_id
  ON "webhook_events"(event_id);

-- Create WebhookQueue table for retry logic
CREATE TABLE "webhook_queue" (
  id TEXT NOT NULL PRIMARY KEY,
  webhook_event_id TEXT NOT NULL,

  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry TIMESTAMP NOT NULL,
  last_error TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (webhook_event_id)
    REFERENCES "webhook_events"(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhook_queue_next_retry
  ON "webhook_queue"(next_retry);
CREATE INDEX idx_webhook_queue_retry_count
  ON "webhook_queue"(retry_count);
```

### Paso 2: Actualizar Prisma Schema

**Archivo:** `packages/backend/prisma/schema.prisma`

```prisma
model WebhookEvent {
  id              String   @id @default(cuid())
  eventId         String   @unique @map("event_id")
  eventName       String   @map("event_name")

  // Guardar payload completo para audit/replay
  data            Json

  // Estado del procesamiento
  processed       Boolean  @default(false)
  processedAt     DateTime? @map("processed_at")

  // Error tracking
  error           String?
  errorCount      Int      @default(0) @map("error_count")

  // Relación con retry queue
  queueItem       WebhookQueue?

  createdAt       DateTime @default(now()) @map("created_at")

  @@index([eventName])
  @@index([processed])
  @@index([createdAt])
  @@index([eventId])
  @@map("webhook_events")
}

model WebhookQueue {
  id              String   @id @default(cuid())
  webhookEventId  String   @unique @map("webhook_event_id")
  webhookEvent    WebhookEvent @relation(fields: [webhookEventId], references: [id], onDelete: Cascade)

  retryCount      Int      @default(0) @map("retry_count")
  nextRetry       DateTime @map("next_retry")
  lastError       String?  @map("last_error")

  createdAt       DateTime @default(now()) @map("created_at")

  @@index([nextRetry])
  @@index([retryCount])
  @@map("webhook_queue")
}
```

### Paso 3: Crear Servicio de Webhook Audit

**Archivo:** `packages/backend/src/services/webhookAudit.ts`

```typescript
import { prisma } from '../lib/prisma.js';

export interface WebhookAuditLog {
  eventId: string;
  eventName: string;
  data: Record<string, unknown>;
}

/**
 * Log webhook event to audit trail (INMEDIATO, antes de procesamiento)
 * Garantiza que nunca perdamos datos aunque el procesamiento falle
 */
export async function logWebhookEvent(
  eventId: string,
  eventName: string,
  data: Record<string, unknown>
): Promise<string> {
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        eventId,
        eventName,
        data,
        processed: false,
      },
    });

    console.log(`[WebhookAudit] Event logged: ${eventName} (${eventId})`);
    return event.id;
  } catch (error) {
    console.error('[WebhookAudit] Failed to log webhook event:', error);
    throw error;
  }
}

/**
 * Mark webhook as successfully processed
 */
export async function markWebhookProcessed(
  webhookEventId: string
): Promise<void> {
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processed: true,
      processedAt: new Date(),
    },
  });

  console.log(`[WebhookAudit] Event marked processed: ${webhookEventId}`);
}

/**
 * Log webhook processing error and enqueue for retry
 */
export async function logWebhookError(
  webhookEventId: string,
  error: Error | string,
  shouldRetry = true
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  const updated = await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      error: errorMessage,
      errorCount: { increment: 1 },
    },
  });

  console.error(
    `[WebhookAudit] Event error (attempt ${updated.errorCount}): ${webhookEventId}`,
    errorMessage
  );

  if (shouldRetry && updated.errorCount < 5) {
    // Enqueue for retry
    const delayMs = getRetryDelay(updated.errorCount);
    await enqueueForRetry(webhookEventId, delayMs);
  }
}

/**
 * Calculate exponential backoff delay
 * Attempt 1: 5 min
 * Attempt 2: 30 min
 * Attempt 3: 2 hours
 * Attempt 4: 24 hours
 */
function getRetryDelay(attemptNumber: number): number {
  const delays = [
    5 * 60 * 1000,        // 5 minutes
    30 * 60 * 1000,       // 30 minutes
    2 * 60 * 60 * 1000,   // 2 hours
    24 * 60 * 60 * 1000,  // 24 hours
  ];

  return delays[Math.min(attemptNumber - 1, delays.length - 1)];
}

/**
 * Enqueue webhook for retry
 */
export async function enqueueForRetry(
  webhookEventId: string,
  delayMs: number
): Promise<void> {
  const nextRetry = new Date(Date.now() + delayMs);

  // Check if already in queue
  const existing = await prisma.webhookQueue.findUnique({
    where: { webhookEventId },
  });

  if (existing) {
    // Update existing queue item
    await prisma.webhookQueue.update({
      where: { webhookEventId },
      data: {
        nextRetry,
        retryCount: { increment: 1 },
      },
    });
  } else {
    // Create new queue item
    await prisma.webhookQueue.create({
      data: {
        webhookEventId,
        nextRetry,
        retryCount: 1,
      },
    });
  }

  console.log(
    `[WebhookAudit] Event enqueued for retry: ${webhookEventId} at ${nextRetry.toISOString()}`
  );
}

/**
 * Get webhook event details (para debugging)
 */
export async function getWebhookEvent(webhookEventId: string) {
  return prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    include: {
      queueItem: true,
    },
  });
}

/**
 * Get pending webhooks for replay/investigation
 */
export async function getPendingWebhooks(limit = 100) {
  return prisma.webhookEvent.findMany({
    where: {
      processed: false,
      errorCount: { lt: 5 },
    },
    include: {
      queueItem: true,
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/**
 * Get failed webhooks (error_count >= 5)
 */
export async function getFailedWebhooks(limit = 100) {
  return prisma.webhookEvent.findMany({
    where: {
      errorCount: { gte: 5 },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Replay a specific webhook (para testing/debugging)
 */
export async function replayWebhook(webhookEventId: string) {
  const event = await getWebhookEvent(webhookEventId);

  if (!event) {
    throw new Error(`Webhook event not found: ${webhookEventId}`);
  }

  // Re-process the event
  console.log(`[WebhookAudit] Replaying webhook: ${webhookEventId}`);

  // El webhook será procesado por el scheduler
  await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: {
      processed: false,
      error: null,
    },
  });
}
```

### Paso 4: Actualizar webhook.ts

**Archivo:** `packages/backend/src/routes/webhook.ts`

```typescript
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { verifyLemonSqueezyWebhook, LemonSqueezyWebhookEvent } from '../middleware/lemonsqueezy.js';
import {
  logWebhookEvent,
  markWebhookProcessed,
  logWebhookError,
} from '../services/webhookAudit.js';

const router = Router();

/**
 * POST /webhooks/lemonsqueezy
 * Handle LemonSqueezy webhook events with audit trail
 */
router.post('/lemonsqueezy', verifyLemonSqueezyWebhook, async (req: Request, res: Response) => {
  const event = req.lemonSqueezyEvent!;
  const eventName = event.meta.event_name;
  const eventId = event.data.id; // LemonSqueezy event ID for deduplication

  console.log(`[Webhook] Received: ${eventName} (${eventId})`);

  let webhookEventId: string;

  try {
    // PASO 1: LOG INMEDIATAMENTE (antes de procesar)
    webhookEventId = await logWebhookEvent(eventId, eventName, event.data);

    // PASO 2: Procesamiento (con try-catch)
    switch (eventName) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(event);
        break;

      case 'subscription_resumed':
        await handleSubscriptionResumed(event);
        break;

      case 'subscription_expired':
        await handleSubscriptionExpired(event);
        break;

      case 'subscription_paused':
        await handleSubscriptionPaused(event);
        break;

      case 'subscription_unpaused':
        await handleSubscriptionUnpaused(event);
        break;

      case 'subscription_payment_success':
        await handlePaymentSuccess(event);
        break;

      case 'subscription_payment_failed':
        await handlePaymentFailed(event);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${eventName}`);
    }

    // PASO 3: Mark as processed successfully
    await markWebhookProcessed(webhookEventId);

    // PASO 4: SIEMPRE respond 200 (LemonSqueezy requirement)
    res.json({ received: true, eventId: webhookEventId });
  } catch (error) {
    console.error(`[Webhook] Error handling ${eventName}:`, error);

    // Log error to audit trail (pero no re-throw)
    if (webhookEventId) {
      await logWebhookError(webhookEventId, error as Error, true);
    }

    // IMPORTANTE: Still return 200 to LemonSqueezy
    // Error is logged in audit trail and will be retried
    res.json({
      received: true,
      eventId: webhookEventId,
      warning: 'Processing failed but logged for retry',
    });
  }
});

// Handler functions remain the same...
async function handleSubscriptionCreated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data, meta } = event;
  const userId = meta.custom_data?.user_id;

  if (!userId) {
    console.error('[Webhook] No user_id in subscription custom_data:', data.id);
    throw new Error('Missing user_id in webhook data');
  }

  const attrs = data.attributes;
  const now = new Date();
  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await prisma.subscription.upsert({
    where: { lemonSqueezySubscriptionId: data.id },
    update: {
      status: attrs.status,
      lemonSqueezyVariantId: String(attrs.variant_id),
      currentPeriodStart: now,
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
    create: {
      userId,
      lemonSqueezyCustomerId: String(attrs.customer_id),
      lemonSqueezySubscriptionId: data.id,
      lemonSqueezyVariantId: String(attrs.variant_id),
      status: attrs.status,
      currentPeriodStart: now,
      currentPeriodEnd: renewsAt,
      cancelAtPeriodEnd: attrs.cancelled,
      trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
    },
  });

  console.log(`[Webhook] Subscription ${data.id} created for user ${userId}: ${attrs.status}`);
}

// ... (rest of handlers remain the same)

export default router;
```

### Paso 5: Crear Job para Procesar Retry Queue

**Archivo:** `packages/backend/src/jobs/processWebhookQueue.ts`

```typescript
import { prisma } from '../lib/prisma.js';
import { logWebhookError } from '../services/webhookAudit.js';

/**
 * Process webhook retry queue
 * Run periodically (job scheduler)
 */
export async function processWebhookQueue(): Promise<void> {
  const now = new Date();

  try {
    console.log('[WebhookQueue] Starting processing...');

    // Find webhooks ready for retry
    const readyForRetry = await prisma.webhookQueue.findMany({
      where: {
        nextRetry: { lte: now },
      },
      include: {
        webhookEvent: true,
      },
    });

    if (readyForRetry.length === 0) {
      console.log('[WebhookQueue] No webhooks to retry');
      return;
    }

    console.log(`[WebhookQueue] Processing ${readyForRetry.length} webhook retries`);

    for (const queueItem of readyForRetry) {
      try {
        const event = queueItem.webhookEvent;

        console.log(
          `[WebhookQueue] Retrying: ${event.eventName} (attempt ${queueItem.retryCount})`
        );

        // Re-process the webhook
        // This is simplified - in production, would call actual handler
        // For now, just mark as processed or log error if it fails

        // TODO: Implement actual webhook reprocessing
        // For now, manually reset and let scheduler handle
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: {
            processed: false,
          },
        });

        // Update queue item
        await prisma.webhookQueue.update({
          where: { id: queueItem.id },
          data: {
            nextRetry: new Date(Date.now() + 30 * 60 * 1000), // Retry in 30min
          },
        });
      } catch (error) {
        console.error('[WebhookQueue] Error retrying webhook:', error);
        await logWebhookError(queueItem.webhookEventId, error as Error, true);
      }
    }

    console.log('[WebhookQueue] Processing complete');
  } catch (error) {
    console.error('[WebhookQueue] Fatal error:', error);
  }
}
```

### Paso 6: Registrar Job en Scheduler

**Archivo:** `packages/backend/src/index.ts`

```typescript
import { processWebhookQueue } from './jobs/processWebhookQueue.js';

// ... in startServer section

// Register jobs
scheduleDaily('syncSubscriptions', runSubscriptionSync, 2);
scheduleDaily('processWebhookQueue', processWebhookQueue, 1); // ← NUEVO: 1 AM UTC

startScheduler();
```

### Paso 7: Endpoints de Auditoría (Admin)

**Archivo:** `packages/backend/src/routes/webhook.ts` - agregar al final:

```typescript
/**
 * GET /webhooks/audit/events
 * List all webhook events (with pagination)
 * Admin only
 */
router.get('/audit/events', authenticate, async (req: Request, res: Response) => {
  // TODO: Add requireAdmin middleware
  const { skip = '0', take = '100', processed = 'all' } = req.query;

  const where: any = {};
  if (processed === 'true') where.processed = true;
  if (processed === 'false') where.processed = false;

  const events = await prisma.webhookEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: parseInt(skip as string),
    take: Math.min(parseInt(take as string), 100),
  });

  res.json(events);
});

/**
 * GET /webhooks/audit/events/:id
 * Get specific webhook event details
 */
router.get('/audit/events/:id', authenticate, async (req: Request, res: Response) => {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: req.params.id },
    include: { queueItem: true },
  });

  if (!event) {
    res.status(404).json({ error: 'Webhook event not found' });
    return;
  }

  res.json(event);
});

/**
 * POST /webhooks/audit/events/:id/replay
 * Replay a failed webhook
 */
router.post('/audit/events/:id/replay', authenticate, async (req: Request, res: Response) => {
  // TODO: requireAdmin

  const event = await prisma.webhookEvent.findUnique({
    where: { id: req.params.id },
  });

  if (!event) {
    res.status(404).json({ error: 'Webhook event not found' });
    return;
  }

  // Reset for reprocessing
  await prisma.webhookEvent.update({
    where: { id: req.params.id },
    data: {
      processed: false,
      error: null,
      errorCount: 0,
    },
  });

  res.json({ message: 'Webhook queued for replay', eventId: req.params.id });
});
```

---

## 📊 Database Migration

```bash
cd packages/backend

# Create migration file
npx prisma migrate dev --name add_webhook_audit

# Verify schema
npx prisma db push
```

---

## 🧪 Testing

```typescript
// tests/routes/webhook.test.ts

describe('Webhook Audit Trail', () => {
  it('should log webhook even if processing fails', async () => {
    // Mock BD error during subscription creation
    // Send webhook
    // Verify:
    // - WebhookEvent created with data
    // - Status is "processed": false
    // - Error is logged
    // - Response is 200 OK
  });

  it('should mark webhook processed on success', async () => {
    // Send valid webhook
    // Verify:
    // - WebhookEvent.processed = true
    // - WebhookEvent.processedAt is set
    // - No error
  });

  it('should handle duplicate webhook IDs (idempotency)', async () => {
    // Send webhook twice (same event ID)
    // Verify: Only one WebhookEvent created
  });
});
```

---

## ✅ Checklist

- [ ] Crear migration SQL
- [ ] Actualizar prisma schema
- [ ] Crear `webhookAudit.ts` service
- [ ] Crear `processWebhookQueue.ts` job
- [ ] Actualizar `webhook.ts` routes
- [ ] Registrar job en scheduler
- [ ] Agregar endpoints de auditoría
- [ ] Tests de audit trail
- [ ] Deploy migration
- [ ] Verificar logs en producción

---

**Siguiente:** P0-2 Webhook Retry Logic
