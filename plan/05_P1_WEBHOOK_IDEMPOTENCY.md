# P1-2: Webhook Idempotency
## Evitar Efectos Duplicados en Webhook Reprocessing

**Status:** ⏳ No Iniciado
**Prioridad:** 🟠 ALTA
**Impacto:** Data consistency, prevenir duplicados
**Complejidad:** 🟢 Bajo (2 horas)

---

## 📋 El Problema

### Vulnerabilidad

**Ubicación:** `routes/webhook.ts`, `services/webhookAudit.ts`

**Problema:** Si un webhook se procesa dos veces (duplicado):
- El primero crea una suscripción
- El segundo crea OTRA suscripción igual

```typescript
// ❌ ACTUAL: Sin idempotency
async function handleSubscriptionCreated(event) {
  await prisma.subscription.upsert({
    where: { lemonSqueezySubscriptionId: data.id },
    create: { ... }  // Si ejecuta dos veces, intenta crear dos
  });
}
```

### Escenarios de Duplicación

```
Escenario 1: Network Retry
1. LemonSqueezy envía webhook A
2. Nuestro servidor procesa pero conexión se cae
3. LemonSqueezy no recibe 200, reintenta
4. Envía webhook A (duplicado)
5. Procesamos de nuevo

Resultado: Dos suscripciones con mismo lemonSqueezySubscriptionId
         Pero upsert debería prevenir esto...
         (Lo previene, pero no es idempotent a nivel de aplicación)

Escenario 2: Manual Replay
1. Admin hace POST /webhooks/audit/events/:id/replay
2. Webhook procesado de nuevo
3. Mismos efectos secundarios ocurren de nuevo
4. Datos duplicados

Escenario 3: Multiple Workers
1. Dos instancias del backend reciben webhook
2. Ambas procesan al mismo tiempo
3. Race condition en la BD
4. Posible inconsistencia
```

### Impacto en Usuario

```
Usuario paga por suscripción A:
- Webhook: subscription_created
- Se procesa dos veces
- BD: 2 subscription records con same ID... wait, upsert previene esto
- Pero: payment_success webhook procesa dos veces
  → Acredita 2x el dinero? (si no hay idempotency)
  → User ve duplicados en dashboard?
  → Support confused

Con Idempotency:
- Webhook procesado 1x incluso si llega 2 veces
- payment_success procesa 1x siempre
- Datos clean y consistentes
```

---

## 🎯 Solución: Idempotency Key Tracking

### Arquitectura

```
Webhook Recibido
    │
    ▼
┌──────────────────────────────┐
│ Check Event_ID               │
│ ├─ Buscar en WebhookEvent    │
│ ├─ Ya procesado? → return 200│
│ └─ No procesado? → Continue  │
└──────────────────────────────┘
    │
    ▼
┌──────────────────────────────┐
│ Procesar Webhook             │
├─ UPDATE suscripción          │
├─ Log transacción             │
└─ Mark processed=true         │
    │
    ▼
┌──────────────────────────────┐
│ Response 200 OK              │
│ (LemonSqueezy satisfied)     │
└──────────────────────────────┘
```

### Garantía de Idempotency

```typescript
// Ya implementado en webhookAudit.ts logWebhookEvent():
try {
  const event = await prisma.webhookEvent.create({
    data: {
      eventId,      // ← UNIQUE constraint
      eventName,
      data,
      processed: false,
    },
  });
  return event.id;
} catch (error) {
  // Duplicate event_id → Already exists
  if (error.message.includes('unique constraint')) {
    const existing = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });
    return existing.id;  // Return existing, don't process again
  }
}
```

---

## 🔧 Implementación

### PASO 1: Verificar Webhook.ts Maneja Duplicados

**Archivo:** `packages/backend/src/routes/webhook.ts`

**Current Flow:**
```typescript
router.post('/lemonsqueezy', verifyLemonSqueezyWebhook, async (req, res) => {
  const eventId = event.data.id;  // LemonSqueezy event ID

  try {
    // PASO 1: Log webhook (or get existing if duplicate)
    webhookEventId = await logWebhookEvent(eventId, eventName, event.data);

    // PASO 2: Process
    switch(eventName) { ... }

    // PASO 3: Mark processed
    await markWebhookProcessed(webhookEventId);

    res.json({ received: true, eventId: webhookEventId });
  } catch (error) {
    // Log error and retry later
    await logWebhookError(webhookEventId, error, true);
    res.json({ received: true, ...}); // Still 200
  }
});
```

**Problem:** Si webhook duplicado llega:
1. `logWebhookEvent()` retorna existing ID (no error)
2. Procesamos el switch nuevamente
3. `handleSubscriptionCreated` ejecuta de nuevo
4. upsert previene inserción duplicate, pero...
5. payload se procesa 2x (effects not idempotent)

### PASO 2: Add Idempotency Check

**Actualizar webhook.ts:**

```typescript
/**
 * Check if webhook already processed
 */
function isAlreadyProcessed(webhookEvent: WebhookEvent): boolean {
  return webhookEvent.processed === true;
}

/**
 * POST /webhooks/lemonsqueezy (UPDATED)
 */
router.post('/lemonsqueezy', verifyLemonSqueezyWebhook, async (req, res) => {
  const event = req.lemonSqueezyEvent!;
  const eventName = event.meta.event_name;
  const eventId = event.data.id;

  console.log(`[Webhook] Received: ${eventName} (${eventId})`);

  let webhookEventId: string = '';

  try {
    // PASO 1: Log webhook (or get existing if duplicate)
    webhookEventId = await logWebhookEvent(eventId, eventName, event.data);

    // PASO 2: Check idempotency - if already processed, skip and return
    const existingEvent = await getWebhookEvent(webhookEventId);
    if (existingEvent?.processed === true) {
      console.log(`[Webhook] Event already processed, skipping: ${eventId}`);
      res.json({ received: true, eventId: webhookEventId, cached: true });
      return;
    }

    // PASO 3: Procesar (only if not already processed)
    switch (eventName) {
      case 'subscription_created':
        await handleSubscriptionCreated(event);
        break;
      // ... rest of handlers
    }

    // PASO 4: Mark as processed
    await markWebhookProcessed(webhookEventId);

    res.json({ received: true, eventId: webhookEventId });
  } catch (error) {
    console.error(`[Webhook] Error handling ${eventName}:`, error);

    if (webhookEventId) {
      await logWebhookError(webhookEventId, error as Error, true);
    }

    res.json({
      received: true,
      eventId: webhookEventId,
      warning: 'Processing failed but logged for retry',
    });
  }
});
```

**Key Changes:**
1. After `logWebhookEvent()`, check if already processed
2. If `processed === true`, return 200 immediately (skip processing)
3. This makes webhook truly idempotent

### PASO 3: Update webhookAudit.ts

**Add export:**
```typescript
export async function getWebhookEvent(webhookEventId: string) {
  return prisma.webhookEvent.findUnique({
    where: { id: webhookEventId },
    include: { queueItem: true },
  });
}
```

(Already implemented, just needs to be used)

---

## 🧪 Testing Idempotency

### Test Manual

```bash
# 1. Get event ID from audit trail
curl http://localhost:3001/webhooks/audit/events?processed=true | jq '.[] | .eventId' | head -1

# 2. Replay webhook manually
curl -X POST http://localhost:3001/webhooks/audit/events/<EVENT_ID>/replay

# 3. Verify response includes cached: true on second call
# Should not reprocess, just return 200

# 4. Check audit trail
curl http://localhost:3001/webhooks/audit/events/<EVENT_ID>
# Should see only one processedAt timestamp, not multiple
```

### Automated Test

```typescript
describe('Webhook Idempotency', () => {
  it('should process webhook only once even if called twice', async () => {
    // Create webhook event
    const event = {
      data: { id: 'sub_123', attributes: {...} },
      meta: { event_name: 'subscription_created', custom_data: {...} }
    };

    // Send webhook first time
    const res1 = await POST('/webhooks/lemonsqueezy', event);
    expect(res1.status).toBe(200);
    const eventId1 = res1.body.eventId;

    // Send same webhook again
    const res2 = await POST('/webhooks/lemonsqueezy', event);
    expect(res2.status).toBe(200);
    const eventId2 = res2.body.eventId;

    // Should be same event ID
    expect(eventId1).toBe(eventId2);

    // Query audit trail
    const audit1 = await GET(`/webhooks/audit/events/${eventId1}`);

    // Should only have ONE processedAt timestamp
    expect(audit1.body.processedAt).toBeTruthy();
    expect(audit1.body.errorCount).toBe(0);

    // Check database - only one subscription created
    const subs = await db.subscription.findMany({
      where: { lemonSqueezySubscriptionId: 'sub_123' }
    });
    expect(subs).toHaveLength(1);  // Not 2!
  });
});
```

---

## ✅ Checklist

- [ ] Implementar idempotency check en webhook.ts
- [ ] Verificar getWebhookEvent está exportado
- [ ] Compilar y verificar TypeScript
- [ ] Manual test: webhook duplicado
- [ ] Verificar processed timestamp único
- [ ] Unit test implementado
- [ ] Edge case: Webhook en progreso + llegue duplicado

---

## 📈 Métricas de Éxito

✅ **Idempotent**: Mismo webhook procesado múltiples veces = mismo resultado
✅ **Efficient**: No re-procesa si ya fue procesado
✅ **Safe**: Duplicados no causan efectos secundarios múltiples
✅ **Auditable**: Puedo ver en audit trail que fue cached

---

**Siguiente:** P1-4 Input Size Limits
