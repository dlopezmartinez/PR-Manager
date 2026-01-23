# P0-4: Database Transactions (ACID Compliance)
## Consistencia y Atomicidad en Operaciones Multi-Paso

**Status:** ⏳ No Iniciado
**Prioridad:** 🔴 CRÍTICA
**Impacto:** Consistencia de datos, recuperación de fallos
**Complejidad:** 🟢 Bajo (4 horas)

---

## 📋 El Problema Actual

### Vulnerabilidad

**Ubicación:** Múltiples - `auth.ts`, `webhook.ts`, `checkout.ts`

```typescript
// ❌ PROBLEMA: Sin transacción
const user = await prisma.user.create({ data: { ... } });
const token = generateToken(...);
// Si esto falla aquí, usuario creado pero token no generado
// Si client reconecta, crea otro usuario
```

### Escenarios de Fallo

```
Escenario 1: Crear Usuario + Suscripción (Webhook)
1. INSERT User ✓
2. INSERT Subscription ✗ (BD error)
3. Responder 200 al webhook (siempre)
→ Usuario existe pero sin suscripción
→ Usuario no puede acceder
→ Support debe investigar

Escenario 2: Cambiar Password + Invalidar Sesiones
1. UPDATE password_hash ✓
2. DELETE sessions ✗ (conexión perdida)
→ Password cambió pero sesiones viejas siguen válidas
→ Brecha de seguridad

Escenario 3: Crear Checkout + Generar URLs
1. INSERT Checkout ✓
2. Generar URLs firmadas ✗ (error)
→ Checkout creado pero cliente nunca recibe URLs
→ Usuario perdido
```

### Impacto en Usuario Real

```
Usuario paga por suscripción:
1. LemonSqueezy webhook: subscription_created
2. Nuestro backend inicia transacción
3. INSERT user (primer pago)
4. INSERT subscription
5. Si cualquier paso falla: ROLLBACK ambos
6. Error is logged, webhook reprocessed later
7. Usuario nunca ve estado inconsistente

SIN TRANSACCIONES:
- Usuario creado, suscripción falló
- Usuario ve "no tienes acceso"
- Support confundido
- Posible chargeback

CON TRANSACCIONES:
- Todo o nada
- Limpio, consistente
- Fácil de debuggear
```

---

## 🎯 Solución: Database Transactions (prisma.$transaction)

### Arquitectura

```
Operación Multi-Paso
    │
    ▼
┌─────────────────────────────────────┐
│ prisma.$transaction([             │
│   // Paso 1                         │
│   prisma.user.create({...}),       │
│   // Paso 2                         │
│   prisma.subscription.create({...}),│
│   // Si cualquier falla: ROLLBACK  │
│ ])                                  │
└─────────────────────────────────────┘
    │
    ├─ Todos los pasos exitosos → COMMIT ✓
    └─ Cualquier fallo → ROLLBACK (revert todo) ✗
```

### Syntaxis Prisma

```typescript
// Array syntax (recomendado)
const [user, subscription] = await prisma.$transaction([
  prisma.user.create({ data: { email, passwordHash } }),
  prisma.subscription.create({ data: { userId: tempId, ...} }),
]);

// Callback syntax (para lógica compleja)
const result = await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: {...} });
  const subscription = await tx.subscription.create({
    data: { userId: user.id, ... }
  });
  return { user, subscription };
});
```

---

## 🔧 Implementación

### PASO 1: Actualizar `auth.ts` - Signup Transaccional

**Archivo:** `packages/backend/src/routes/auth.ts` (línea ~31)

```typescript
/**
 * POST /auth/signup
 * Create a new user account (transactional)
 */
router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  try {
    const validation = signupSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { email, password, name } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      res.status(400).json({ error: 'An account with this email already exists' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Use transaction to ensure consistency
    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      // If any step fails below, entire transaction rolls back
      // For now, just return user (no immediate subscription)
      return newUser;
    });

    // Generate JWT token (outside transaction)
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});
```

---

### PASO 2: Actualizar `webhook.ts` - Subscription Handlers Transaccional

**Archivo:** `packages/backend/src/routes/webhook.ts` (línea ~511)

```typescript
/**
 * Handle subscription created (transactional)
 */
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

  // Use transaction to ensure subscription is created atomically
  await prisma.$transaction(async (tx) => {
    // Upsert subscription
    await tx.subscription.upsert({
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

    // If any other step fails here, entire transaction rolls back
    // This ensures subscription is never in partial state
  });

  console.log(`[Webhook] Subscription ${data.id} created for user ${userId}: ${attrs.status}`);
}

/**
 * Handle subscription updated (transactional)
 */
async function handleSubscriptionUpdated(event: LemonSqueezyWebhookEvent): Promise<void> {
  const { data } = event;
  const attrs = data.attributes;
  const renewsAt = attrs.renews_at ? new Date(attrs.renews_at) : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { lemonSqueezySubscriptionId: data.id },
      data: {
        status: attrs.status,
        lemonSqueezyVariantId: String(attrs.variant_id),
        currentPeriodEnd: renewsAt,
        cancelAtPeriodEnd: attrs.cancelled,
        trialEndsAt: attrs.trial_ends_at ? new Date(attrs.trial_ends_at) : null,
      },
    });
  });

  console.log(`[Webhook] Subscription ${data.id} updated: ${attrs.status}`);
}
```

---

### PASO 3: Actualizar `auth.ts` - Change Password Transaccional

**Archivo:** `packages/backend/src/routes/auth.ts` (línea ~275)

```typescript
/**
 * POST /auth/change-password
 * Change user password (transactional - invalidate sessions)
 */
router.post('/change-password', authenticate, passwordChangeLimiter, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { currentPassword, newPassword } = validation.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify current password
    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Use transaction to update password AND invalidate all sessions
    // This prevents the user from keeping old sessions after password change
    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      // Invalidate all sessions (force re-login)
      await tx.session.deleteMany({
        where: { userId: user.id },
      });

      // If either step fails: ROLLBACK both
      // Ensures password never changes without invalidating sessions
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});
```

---

### PASO 4: Crear Helper para Transacciones Complejas

**Archivo:** `packages/backend/src/lib/transaction.ts` (NUEVO)

```typescript
import { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

/**
 * Execute a database operation with automatic transaction handling
 * Useful for wrapping complex multi-step operations
 */
export async function executeTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(operation);
  } catch (error) {
    console.error('[Transaction] Error:', error);
    throw error;
  }
}

/**
 * Create subscription with user in a single transaction
 * Used by webhook when creating new user + subscription
 */
export async function createUserWithSubscription(
  prisma: PrismaClient,
  userData: {
    email: string;
    passwordHash: string;
    name?: string;
  },
  subscriptionData: {
    lemonSqueezyCustomerId: string;
    lemonSqueezySubscriptionId: string;
    lemonSqueezyVariantId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialEndsAt?: Date | null;
    cancelAtPeriodEnd: boolean;
  }
) {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: userData,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const subscription = await tx.subscription.create({
      data: {
        userId: user.id,
        ...subscriptionData,
      },
    });

    return { user, subscription };
  });
}
```

---

## 📊 Casos de Uso

### Caso 1: Crear Usuario Nuevo
```typescript
// Transactional: User created or nothing
await prisma.$transaction(async (tx) => {
  return await tx.user.create({...});
});
```

### Caso 2: Cambiar Password + Invalidar Sesiones
```typescript
// Transactional: Both succeed or both rollback
await prisma.$transaction(async (tx) => {
  await tx.user.update({...});      // Update password
  await tx.session.deleteMany({...}); // Kill sessions
});
```

### Caso 3: Webhook: Crear Suscripción
```typescript
// Transactional: Subscription fully created or rolled back
await prisma.$transaction(async (tx) => {
  await tx.subscription.upsert({...});
});
```

### Caso 4: Crear Usuario + Suscripción (primera compra)
```typescript
// Transactional: Both or nothing
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({...});
  const subscription = await tx.subscription.create({
    data: { userId: user.id, ... }
  });
  return { user, subscription };
});
```

---

## 🧪 Testing

```typescript
describe('Database Transactions', () => {
  it('should rollback on partial failure', async () => {
    // Start transaction
    // Create user successfully
    // Mock subscription failure
    // Verify user was rolled back (deleted)
  });

  it('should invalidate sessions on password change', async () => {
    // Create user and session
    // Change password
    // Verify session is deleted
    // Verify new login works
  });

  it('should create user+subscription atomically', async () => {
    // Mock first step succeeds
    // Mock second step fails
    // Verify user is rolled back
  });
});
```

---

## ✅ Checklist

- [ ] Actualizar signup en auth.ts
- [ ] Actualizar webhook handlers en webhook.ts
- [ ] Actualizar change-password en auth.ts
- [ ] Crear transaction helper (opcional)
- [ ] Compilar y verificar TypeScript
- [ ] Prueba manual: crear usuario
- [ ] Prueba manual: cambiar password
- [ ] Verificar que sesión se invalida
- [ ] Tests unitarios

---

## 📈 Métricas de Éxito

✅ **Atomicidad**: Multi-step operations succeed completely or not at all
✅ **Consistencia**: Database never left in partial state
✅ **Logging**: Errors logged to webhook audit trail
✅ **Resilience**: Automatic rollback on any failure
✅ **Debugging**: Clear transaction boundaries in code

---

**Siguiente:** P0-2 Enhanced Webhook Retry Logic
