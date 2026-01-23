# P0-1: Rate Limiting Implementation
## Protección contra Brute Force y DoS

**Status:** ⏳ No Iniciado
**Prioridad:** 🔴 CRÍTICA
**Impacto:** Evita brute force, DDoS, spam
**Complejidad:** 🟢 Bajo (4 horas)

---

## 📋 El Problema

**Ubicación:** `/packages/backend/src/index.ts` - **sin rate limiting middleware**

### Vectores de Ataque Actuales:

1. **Brute Force en Login**
   ```
   for i in 1..10000:
     POST /auth/login {"email":"user@test.com","password":"intento$i"}
   ```
   - Sin límite → 10,000 intentos sin restricción
   - En máquina rápida: 100-1000 requests/segundo

2. **Spam de Signup**
   ```
   for i in 1..1000:
     POST /auth/signup {"email":"spam$i@attacker.com","password":"xxxxx"}
   ```
   - Crea 1000 cuentas
   - Llena BD

3. **Download DoS**
   ```
   GET /download/macos/latest?signature=valid_for_30min (en loop)
   ```
   - Si el atacante obtiene UNA URL válida
   - Puede descargar infinitas veces en 30 minutos

---

## 🎯 Solución

Implementar `express-rate-limit` con diferentes estrategias por endpoint.

### Instalación

```bash
cd packages/backend
npm install express-rate-limit
```

### Implementación

#### 1. Crear Middleware de Rate Limiting

**Archivo:** `packages/backend/src/middleware/rateLimit.ts`

```typescript
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Store en memoria (para dev) o Redis (para prod)
// Aquí usamos memoria, pero en prod usar: import RedisStore from 'rate-limit-redis';

/**
 * Rate limit para Login: máximo 5 intentos cada 5 minutos por IP
 * Protege contra brute force
 */
export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 5, // máximo 5 requests
  message: {
    error: 'Too many login attempts, please try again later',
    retryAfter: 300,
  },
  standardHeaders: false, // No incluir RateLimit-* headers
  skip: (req: Request) => {
    // Skip si es desarrollo
    return process.env.NODE_ENV === 'development';
  },
  keyGenerator: (req: Request) => {
    // Rate limit por email + IP (si alguien intenta múltiples usuarios)
    const email = req.body?.email || 'unknown';
    const ip = req.ip || 'unknown';
    return `login:${email}:${ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many login attempts',
      retryAfter: 300,
      nextRetryIn: '5 minutes',
    });
  },
});

/**
 * Rate limit para Signup: máximo 3 signups por hora por IP
 * Protege contra spam
 */
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  message: {
    error: 'Too many accounts created, please try again later',
  },
  skip: (req: Request) => process.env.NODE_ENV === 'development',
  keyGenerator: (req: Request) => {
    const ip = req.ip || 'unknown';
    return `signup:${ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many signup attempts from this IP',
      retryAfter: 3600,
    });
  },
});

/**
 * Rate limit para Password Change: máximo 3 intentos por hora
 * Evita abuse de email de confirmación
 */
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3,
  skip: (req: Request) => process.env.NODE_ENV === 'development',
  keyGenerator: (req: Request) => {
    // Rate limit por usuario
    return `password-change:${req.user?.userId || 'unknown'}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many password change attempts',
      retryAfter: 3600,
    });
  },
});

/**
 * Rate limit global: máximo 100 requests por 15 minutos
 * Captura abuso general
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req: Request) => process.env.NODE_ENV === 'development',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests from this IP',
      retryAfter: 900,
    });
  },
});

/**
 * Rate limit para Download: máximo 10 descargas por hora por usuario
 * Evita abuse de URLs de descarga
 */
export const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10,
  skip: (req: Request) => process.env.NODE_ENV === 'development',
  keyGenerator: (req: Request) => {
    // Rate limit por usuario (si autenticado) o IP
    return `download:${req.user?.userId || req.ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many downloads, please try again later',
      retryAfter: 3600,
    });
  },
});

/**
 * Rate limit para Checkout: máximo 5 checkouts por hora
 * Evita abuse del endpoint de pago
 */
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: (req: Request) => process.env.NODE_ENV === 'development',
  keyGenerator: (req: Request) => {
    return `checkout:${req.ip}`;
  },
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many checkout attempts',
      retryAfter: 3600,
    });
  },
});
```

#### 2. Integrar en index.ts

**Archivo:** `packages/backend/src/index.ts`

```typescript
import {
  loginLimiter,
  signupLimiter,
  passwordChangeLimiter,
  globalLimiter,
  downloadLimiter,
  checkoutLimiter,
} from './middleware/rateLimit.js';

// ... existing imports

const app = express();

// CORS configuration
const corsOptions = { /* ... */ };
app.use(cors(corsOptions));

// ✨ NUEVO: Aplicar global limiter (captura todo excepto excepciones)
app.use(globalLimiter);

// Webhook routes (sin rate limit - necesitan ser rápidas)
app.use('/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON body parser
app.use(express.json());

// Health check (sin rate limit)
app.get('/health', (req, res) => { /* ... */ });
app.get('/health/scheduler', (req, res) => { /* ... */ });

// ✨ NUEVO: Aplicar rate limiters específicos a rutas
// Auth routes
app.post('/auth/login', loginLimiter, async (req, res) => { /* ... */ });
app.post('/auth/signup', signupLimiter, async (req, res) => { /* ... */ });
app.post('/auth/change-password', passwordChangeLimiter, async (req, res) => { /* ... */ });

// Other routes sin limitadores específicos heredan global limiter
app.use('/auth', authRoutes);
app.use('/subscription', subscriptionRoutes);
app.use('/checkout', checkoutLimiter, checkoutRoutes);
app.use('/download', downloadLimiter, downloadRoutes);

// ... rest of code
```

#### 3. Alternativa: Proteger Rutas Específicas

Si prefieres aplicar limitadores dentro de rutas en lugar de middleware:

```typescript
// En packages/backend/src/routes/auth.ts

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  // ... existing login logic
});

router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  // ... existing signup logic
});

router.post('/change-password',
  authenticate,
  passwordChangeLimiter,
  async (req: Request, res: Response) => {
    // ... existing logic
  }
);
```

---

## 📊 Configuración por Entorno

### Development
```typescript
skip: (req) => process.env.NODE_ENV === 'development'
// Rate limiting deshabilitado para testing
```

### Production
```typescript
// Usar Redis en lugar de memoria
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export const loginLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rate-limit:',
  }),
  // ... rest of config
});
```

---

## 🧪 Testing

### Test Brute Force Blocker

```typescript
// tests/middleware/rateLimit.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/index';

describe('Login Rate Limiter', () => {
  it('should allow 5 login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: 'test@test.com',
          password: 'wrong' + i,
        });
      expect(res.status).not.toBe(429);
    }
  });

  it('should block 6th login attempt', async () => {
    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/auth/login')
        .send({
          email: 'test@test.com',
          password: 'wrong' + i,
        });
    }

    // 6th should be blocked
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: 'test@test.com',
        password: 'wrong6',
      });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many login attempts');
  });

  it('should reset after window expires', async () => {
    // Wait for window (5 minutes)
    // Then should allow 5 more attempts
  });
});
```

---

## 📈 Monitoreo

### Agregar Logging de Rate Limit Hits

```typescript
export const loginLimiter = rateLimit({
  // ... existing config

  skip: (req: Request) => {
    const skip = process.env.NODE_ENV === 'development';
    if (!skip && req.rateLimit && req.rateLimit.current >= req.rateLimit.limit * 0.8) {
      console.warn(`[RateLimit] Login attempts approaching limit: ${req.ip}`);
    }
    return skip;
  },
});
```

### Alertas Sugeridas

- Si un IP hace 10 requests bloqueados en 1 hora → log como suspicious
- Si múltiples IPs intentan brute force simultáneamente → posible botnet

---

## 🚀 Deployment

### Pasos

1. **Install dependency:**
   ```bash
   npm install express-rate-limit
   ```

2. **Add files:**
   - Create `packages/backend/src/middleware/rateLimit.ts`

3. **Update index.ts:**
   - Import limiters
   - Apply middleware

4. **Deploy:**
   - No migration needed
   - No config requerida (fallbacks en desarrollo)

5. **Test:**
   ```bash
   # En production
   curl -X POST http://api/auth/login \
     -d '{"email":"test@test.com","password":"wrong"}' \
     -w "\nStatus: %{http_code}\n"

   # Hacer 6 veces - 6ta debería ser 429
   ```

---

## ✅ Checklist Implementación

- [ ] Instalar `express-rate-limit`
- [ ] Crear `packages/backend/src/middleware/rateLimit.ts`
- [ ] Actualizar `packages/backend/src/index.ts`
- [ ] Agregar tests en `packages/backend/tests/`
- [ ] Verificar que funciona en development (skip=true)
- [ ] Verificar que funciona en production
- [ ] Documentar límites en README
- [ ] Deploy a staging
- [ ] Monitoreo activado
- [ ] Deploy a producción

---

## 📚 Referencias

- [express-rate-limit docs](https://github.com/nfriedly/express-rate-limit)
- [OWASP: Brute Force Protection](https://owasp.org/www-community/attacks/Brute_force_attack)
- [rate-limit-redis para distributed systems](https://github.com/wyattjoh/rate-limit-redis)

---

**Siguiente:** P0-3 Webhook Audit Trail
