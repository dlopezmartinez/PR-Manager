# PR Manager - Plan de Remediación de Vulnerabilidades
## Master Plan Ejecutivo

**Fecha:** Enero 23, 2026
**Estado:** En Ejecución
**Objetivo:** Asegurar aplicación lista para usuarios en producción

---

## 📊 Resumen Ejecutivo

Se identificaron **13 vulnerabilidades críticas** durante auditoría exhaustiva. Todas afectan a usuarios reales con riesgo potencial de pérdida de datos, seguridad comprometida, y mala experiencia.

**Clasificación:**
- 🔴 **5 Críticas** - Implementar de inmediato
- 🟠 **5 Altas** - Próxima iteración
- 🟡 **3 Medias** - Roadmap a corto plazo

---

## 🎯 Objetivos del Plan

1. ✅ Cero vulnerabilidades críticas antes de salir a producción
2. ✅ Aplicación resiliente a fallos de terceros (LemonSqueezy)
3. ✅ Auditoría completa de todas las acciones críticas
4. ✅ Token management robusto
5. ✅ Protección contra ataques comunes (brute force, DoS)

---

## 📋 Lista de Vulnerabilidades a Remediar

### FASE 1: CRÍTICAS (Semana 1-2)

| ID | Problema | Archivo | Solución | Prioridad |
|----|----------|---------|----------|-----------|
| P0-1 | No rate limiting | index.ts | Agregar middleware express-rate-limit | 🔴 |
| P0-2 | Webhook failures ignorados | webhook.ts | Implementar webhook queue + retry logic | 🔴 |
| P0-3 | Sin audit trail | webhook.ts | Crear tabla WebhookEvent con persistencia | 🔴 |
| P0-4 | Sin transacciones DB | auth.ts, webhook.ts | Usar prisma.$transaction | 🔴 |
| P0-5 | No token refresh | middleware/auth.ts | Implementar refresh tokens (15min + 30d) | 🔴 |

### FASE 2: ALTAS (Semana 3-4)

| ID | Problema | Archivo | Solución | Prioridad |
|----|----------|---------|----------|-----------|
| P1-1 | No session invalidation | auth.ts | Usar modelo Session, invalidar al cambiar password | 🟠 |
| P1-2 | Sin idempotencia webhooks | webhook.ts | Track webhook event IDs | 🟠 |
| P1-3 | Default secret fallback | signature.ts | Fallar si no está DOWNLOAD_SECRET | 🟠 |
| P1-4 | Sin límites input | auth.ts, routes/*.ts | Agregar .max() a Zod schemas | 🟠 |
| P1-5 | Sin logging estructurado | index.ts | Implementar Winston/Pino logger | 🟠 |

### FASE 3: MEDIAS (Semana 5-6)

| ID | Problema | Archivo | Solución | Prioridad |
|----|----------|---------|----------|-----------|
| P2-1 | Multi-device unmanaged | No existe | Dashboard de sesiones activas + logout all | 🟡 |
| P2-2 | Token expiry mid-request | authService.ts | Interceptor HTTP con retry automático | 🟡 |
| P2-3 | XSS en comments | components/*.vue | Sanitización con DOMPurify | 🟡 |

---

## 📅 Cronograma de Implementación

```
SEMANA 1 (23-29 Enero):
├── P0-1: Rate limiting ✓
├── P0-3: Webhook audit trail ✓
└── P0-2: Webhook retry logic ✓

SEMANA 2 (30 Enero - 5 Febrero):
├── P0-4: Database transactions ✓
└── P0-5: Token refresh ✓

SEMANA 3 (6-12 Febrero):
├── P1-1: Session invalidation ✓
├── P1-2: Webhook idempotency ✓
└── P1-3: Secure default fallback ✓

SEMANA 4 (13-19 Febrero):
├── P1-4: Input size limits ✓
└── P1-5: Structured logging ✓

SEMANA 5-6 (20 Feb - 5 Mar):
├── P2-1: Multi-device management ✓
├── P2-2: HTTP interceptor ✓
└── P2-3: XSS sanitization ✓

TESTING & QA: 6-12 Marzo
PRODUCCIÓN: 13+ Marzo
```

---

## 🔑 Decisiones de Arquitectura

### Token Management
```
JWT Token (15 minutos):
├── Access token (signed JWT)
├── Claims: userId, email, role, iat, exp
└── Usado para todas las requests autenticadas

Refresh Token (30 días):
├── Almacenado en BD (tabla RefreshToken)
├── Único por usuario + device
├── Rotación en cada uso
└── Invalidable inmediatamente

Session Tracking:
├── Tabla Session para cada login
├── Rastrear device, IP, timestamp
├── Logout all devices → invalida todos
└── Password change → invalida todos
```

### Webhook Reliability
```
Webhook Event Flow:
1. Recibir webhook
2. Verificar signature (HMAC-SHA256)
3. Persistir en WebhookEvent (audit trail)
4. Procesar evento
5. Si OK → marcar processed=true
6. Si FAIL → encolar en WebhookQueue para retry

Retry Strategy:
├── Intento 1: 5 minutos
├── Intento 2: 30 minutos
├── Intento 3: 2 horas
├── Intento 4: 24 horas
└── Max 5 intentos
```

### Rate Limiting Strategy
```
Endpoints Desprotegidos:
├── POST /auth/login: 5 intentos/5 minutos por IP
├── POST /auth/signup: 3 por hora por IP
└── POST /checkout/create: 10 por hora por IP

Endpoints Protegidos:
├── POST /subscription/*: 20 por minuto por usuario
└── GET /checkout/downloads: 50 por día por usuario
```

---

## 💾 Cambios en Base de Datos

### Nuevas Tablas

```prisma
model RefreshToken {
  id           String   @id @default(cuid())
  userId       String   @map("user_id")
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  token        String   @unique
  deviceId     String   @map("device_id")  // Para multi-device
  revokedAt    DateTime? @map("revoked_at")

  createdAt    DateTime @default(now()) @map("created_at")
  expiresAt    DateTime @map("expires_at")

  @@index([userId])
  @@index([expiresAt])
}

model WebhookEvent {
  id              String   @id @default(cuid())
  eventId         String   @unique @map("event_id")  // LemonSqueezy event ID
  eventName       String   @map("event_name")

  data            Json  // Webhook payload completo
  processed       Boolean @default(false)
  processedAt     DateTime? @map("processed_at")

  error           String?
  errorCount      Int     @default(0) @map("error_count")

  createdAt       DateTime @default(now()) @map("created_at")

  @@index([eventName])
  @@index([processed])
  @@index([createdAt])
}

model WebhookQueue {
  id           String   @id @default(cuid())
  webhookId    String   @map("webhook_id")

  retryCount   Int     @default(0) @map("retry_count")
  nextRetry    DateTime @map("next_retry")

  lastError    String?

  createdAt    DateTime @default(now()) @map("created_at")

  @@index([nextRetry])
}

model AuditLog {
  id           String   @id @default(cuid())
  userId       String? @map("user_id")

  action       String  // "login", "password_change", "subscription_created", etc.
  resource     String  // "user", "subscription", "download", etc.
  resourceId   String? @map("resource_id")

  details      Json    // Detalles de la acción
  ipAddress    String  @map("ip_address")
  userAgent    String? @map("user_agent")

  status       String  // "success", "failure"
  error        String?

  createdAt    DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}
```

### Schema Modifications

```prisma
// Agregar a User:
model User {
  // ... existing fields
  sessions        Session[]
  refreshTokens   RefreshToken[]
  auditLogs       AuditLog[]
}

// Actualizar Session:
model Session {
  // ... existing fields
  deviceId    String?  @map("device_id")
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")
  revokedAt   DateTime? @map("revoked_at")
}
```

---

## 🛠️ Cambios en Código

### Backend Structure
```
packages/backend/src/
├── lib/
│   ├── authorization.ts (MEJORADO: date checks)
│   ├── lemonsqueezy.ts (MEJORADO)
│   ├── signature.ts (MEJORADO: require secret)
│   ├── logger.ts (NUEVO: structured logging)
│   └── webhook-queue.ts (NUEVO: retry logic)
│
├── middleware/
│   ├── auth.ts (MEJORADO: refresh token support)
│   ├── rateLimit.ts (NUEVO: express-rate-limit)
│   └── audit.ts (NUEVO: log audit trail)
│
├── routes/
│   ├── auth.ts (MEJORADO: refresh endpoint, session invalidation)
│   ├── webhook.ts (MEJORADO: audit trail, queue, idempotency)
│   └── session.ts (NUEVO: manage sessions)
│
├── services/
│   ├── scheduler.ts (EXISTENTE)
│   └── webhookProcessor.ts (NUEVO: procesar webhook queue)
│
└── jobs/
    ├── syncSubscriptions.ts (EXISTENTE)
    └── processWebhookQueue.ts (NUEVO: procesar retries)
```

### Frontend Structure
```
packages/app/src/
├── services/
│   ├── authService.ts (MEJORADO: refresh token flow)
│   └── http.ts (MEJORADO: interceptor 401 + retry)
│
├── stores/
│   └── authStore.ts (MEJORADO: session management)
│
└── utils/
    ├── sanitization.ts (NUEVO: DOMPurify wrapper)
    └── deviceId.ts (NUEVO: generar device ID único)
```

---

## 📊 Metrics a Monitorear Post-Implementación

1. **Webhook Success Rate**: Target > 99.9%
2. **Token Refresh Success**: Target > 99.5%
3. **Brute Force Attempts Blocked**: Log mensual
4. **Subscription Inconsistencies**: Target = 0
5. **Audit Log Completeness**: 100% de acciones críticas
6. **Average Response Time**: < 200ms (baseline)

---

## ✅ Checklist Pre-Producción

- [ ] Todas vulnerabilidades P0 implementadas
- [ ] Tests unitarios para cada remediation
- [ ] Tests de integración para webhook flow
- [ ] Load testing (1000 req/sec)
- [ ] Security audit segunda opinión
- [ ] Documentación de cambios DB
- [ ] Plan de rollback para cada cambio
- [ ] Capacitación del equipo de support
- [ ] Monitoring/alerting configurado
- [ ] Logs centralizados (logging service)

---

## 👥 Responsabilidades

- **Frontend**: Auth flow, HTTP interceptor, session UI
- **Backend**: Rate limit, webhook queue, transactions, logging
- **DevOps**: Migrations, monitoring, logging service
- **QA**: Tests, security review

---

## 📞 Escalation Points

- Si webhook queue falla más de 1 hora → alert inmediato
- Si brute force detectado → rate limit aumenta automáticamente
- Si DB transaction falla → retry automático + alert

---

## 📚 Documentación Relacionada

- `01_RATE_LIMITING.md` - Detalles de implementación
- `02_WEBHOOK_RELIABILITY.md` - Queue y retry logic
- `03_TOKEN_REFRESH.md` - JWT + Refresh tokens
- `04_SESSION_MANAGEMENT.md` - Multi-device logout
- `05_AUDIT_LOGGING.md` - Structured logging
- `06_INPUT_VALIDATION.md` - Size limits + validation
- `07_DATABASE_TRANSACTIONS.md` - Atomic operations
- `08_WEBHOOK_IDEMPOTENCY.md` - Deduplication
- `09_SECURE_DEFAULTS.md` - Remove fallbacks
- `10_XSS_PROTECTION.md` - Content sanitization

---

## 🚀 Estado Actual

```
INICIADO: 23 Enero 2026
ÚLTIMA ACTUALIZACIÓN: [fecha actual]

Completados: [ ] / 13
En Progreso: [ ] / 13
Pendientes: [13] / 13
```

---

**Próximo Paso:** Comenzar P0-1 (Rate Limiting)
