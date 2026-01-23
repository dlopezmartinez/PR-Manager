# P0-5: Token Refresh System (JWT + Refresh Token)
## Renovación Segura de Tokens sin Re-Login

**Status:** ⏳ No Iniciado
**Prioridad:** 🔴 CRÍTICA
**Impacto:** Seguridad, experiencia de usuario
**Complejidad:** 🟡 Medio (6 horas)

---

## 📋 El Problema Actual

### Vulnerabilidad

**Ubicación:** `middleware/auth.ts`, `lib/signature.js`

**Problema:** JWT sin refresh tokens significa:
- Token válido solo 15 minutos
- Token fijo = si es compromised, válido hasta expirar
- Usuario debe re-login cada 15 minutos O token nunca expira

```typescript
// ❌ ACTUAL
const token = jwt.sign(payload, SECRET, { expiresIn: '7d' }); // 7 días!
// Problema: Si el token es robado, válido por 7 días completos
```

### Escenarios de Riesgo

```
Escenario 1: Token Robado (7 días de acceso)
1. Atacante obtiene token por XSS o network sniff
2. Token válido por 7 días
3. Acceso a descargas, cambio de password, etc
4. Usuario no lo nota

Escenario 2: Sin Refresh (re-login cada 15 min)
1. User tiene app abierta
2. Token expira
3. Siguiente acción falla con 401
4. User molesto, experiencia pobre

Escenario 3: Token Comprometido - Revocación
1. User's laptop robado
2. Token sigue siendo válido
3. No hay forma de revocar tokens individuales
4. User helpless until expiration
```

### Impacto en Usuario Real

```
Con Token Refresh System:
1. Access Token (15 min): Corta vida, riesgo limitado
2. Refresh Token (30 d): Almacenado seguro, solo para renovación
3. Si access token robado: Válido solo 15 min max
4. Si refresh token comprometido: User puede logout all devices
5. Automatic renewal: User no nota expiración

Usuario benefit:
- Seguridad: Corta vida para access tokens
- UX: Sin interrupciones por expiración
- Control: Puede logout todos los dispositivos
```

---

## 🎯 Solución: Dual Token System

### Arquitectura

```
Login Success
    │
    ▼
┌─────────────────────────────────┐
│ Generate Access Token           │
│ - JWT signed                    │
│ - 15 minutos expiry             │
│ - Contiene: userId, email, role │
│ - Usado en cada request         │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Generate Refresh Token          │
│ - Random 256-bit token          │
│ - 30 días expiry                │
│ - Guardado en DB (Session)      │
│ - Enviado al cliente            │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Responder a Cliente             │
│ {                               │
│   accessToken: "jwt...",        │
│   refreshToken: "xxx...",       │
│   expiresIn: 900                │
│ }                               │
└─────────────────────────────────┘

Uso:
1. Client almacena ambos tokens
2. Usa Access Token en cada request
3. Si 401 (expirado):
   - POST /auth/refresh
   - Envía Refresh Token
   - Recibe nuevo Access Token
   - Reintentar request original
4. Si Refresh también expirado:
   - Forzar re-login

DB (Session table):
  id: uuid
  userId: string
  token: refresh_token_hash
  expiresAt: datetime
```

---

## 🔧 Implementación

### PASO 1: Actualizar middleware/auth.ts

**Archivo:** `packages/backend/src/middleware/auth.ts`

```typescript
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Generate Access Token (JWT, short-lived)
 */
export function generateAccessToken(payload: {
  userId: string;
  email: string;
  role: string;
}): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || '15m', // 15 minutes
  });
}

/**
 * Generate Refresh Token (random string, long-lived)
 * Returns unhashed token to send to client
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');

  // Hash token before storing
  const tokenHash = require('crypto')
    .createHash('sha256')
    .update(token)
    .digest('hex');

  // Save to database
  await prisma.session.create({
    data: {
      userId,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return token; // Return unhashed for client
}

/**
 * Generate both tokens (convenience function)
 */
export async function generateTokens(payload: {
  userId: string;
  email: string;
  role: string;
}) {
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload.userId);

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // seconds
  };
}

/**
 * Verify Refresh Token and get user
 */
export async function verifyRefreshToken(token: string): Promise<string | null> {
  const tokenHash = require('crypto')
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const session = await prisma.session.findFirst({
    where: {
      token: tokenHash,
      expiresAt: { gt: new Date() }, // Not expired
    },
  });

  if (!session) return null;

  return session.userId;
}

/**
 * Authenticate middleware (unchanged)
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

### PASO 2: Agregar Endpoint de Refresh (auth.ts)

**Archivo:** `packages/backend/src/routes/auth.ts`

```typescript
/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      refreshToken: z.string().min(1, 'Refresh token is required'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
      return;
    }

    const { refreshToken } = validation.data;

    // Verify refresh token and get user ID
    const userId = await verifyRefreshToken(refreshToken);
    if (!userId) {
      res.status(401).json({
        error: 'Invalid or expired refresh token',
        code: 'REFRESH_TOKEN_INVALID',
      });
      return;
    }

    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Generate new access token and refresh token
    const tokens = await generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});
```

---

### PASO 3: Actualizar Login (auth.ts)

```typescript
/**
 * POST /auth/login (actualizado)
 */
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  // ... validation and password check ...

  // Generate both tokens (changed)
  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  res.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});
```

---

### PASO 4: Actualizar Signup (auth.ts)

```typescript
/**
 * POST /auth/signup (actualizado)
 */
router.post('/signup', signupLimiter, async (req: Request, res: Response) => {
  // ... create user ...

  // Generate both tokens (changed)
  const tokens = await generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  res.status(201).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});
```

---

### PASO 5: Agregar Logout (auth.ts)

```typescript
/**
 * POST /auth/logout
 * Invalidate refresh token (revoke session)
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      refreshToken: z.string().min(1, 'Refresh token is required'),
    });

    const validation = schema.safeParse(req.body);
    if (!validation.success) {
      // If no refresh token provided, still succeed (client cleanup)
      res.json({ message: 'Logged out' });
      return;
    }

    const { refreshToken } = validation.data;
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Delete the session
    await prisma.session.deleteMany({
      where: {
        token: tokenHash,
        userId: req.user!.userId,
      },
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

/**
 * POST /auth/logout-all
 * Invalidate ALL refresh tokens for this user
 * (logout from all devices)
 */
router.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.session.deleteMany({
      where: { userId: req.user!.userId },
    });

    res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({ error: 'Failed to logout from all devices' });
  }
});
```

---

### PASO 6: Export Functions

**Actualizar exports en middleware/auth.ts:**

```typescript
export {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyRefreshToken,
  JWTPayload,
};
```

---

## 📊 Token Flow

### Login Flow
```
POST /auth/login { email, password }
    ↓
Verify password
    ↓
Generate Access Token (15 min JWT)
Generate Refresh Token (30 d DB session)
    ↓
Response: { accessToken, refreshToken, expiresIn: 900 }
    ↓
Client stores both tokens (secure storage)
```

### Request Flow
```
GET /api/resource
Headers: Authorization: Bearer <accessToken>
    ↓
Middleware validates JWT
    ├─ Valid → Process request ✓
    └─ Expired → Return 401 TOKEN_EXPIRED

Client receives 401:
    ↓
POST /auth/refresh { refreshToken }
    ↓
Server validates refresh token in DB
    ├─ Valid → Generate new access token
    └─ Invalid → Force re-login

Client gets new access token
    ↓
Retry original request with new token ✓
```

### Logout Flow
```
POST /auth/logout { refreshToken }
    ↓
Server: DELETE session where token = hash(refreshToken)
    ↓
Client: Clear tokens from storage
    ↓
User logged out ✓
```

---

## 🧪 Testing

```typescript
describe('Token Refresh', () => {
  it('should refresh access token', async () => {
    // Login
    const res1 = await POST('/auth/login', { email, password });
    const { accessToken, refreshToken } = res1.body;

    // Refresh
    const res2 = await POST('/auth/refresh', { refreshToken });
    const { accessToken: newToken } = res2.body;

    // New token should be different
    expect(newToken).not.toBe(accessToken);

    // Both should work for authenticated requests
    const res3 = await GET('/auth/me', {
      headers: { Authorization: `Bearer ${newToken}` }
    });
    expect(res3.status).toBe(200);
  });

  it('should reject expired refresh token', async () => {
    const expiredToken = 'old-token-from-30days-ago';
    const res = await POST('/auth/refresh', { refreshToken: expiredToken });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('should logout and invalidate refresh token', async () => {
    // Login
    const res1 = await POST('/auth/login', { email, password });
    const { refreshToken } = res1.body;

    // Logout
    const res2 = await POST('/auth/logout', { refreshToken });
    expect(res2.status).toBe(200);

    // Try to refresh with same token
    const res3 = await POST('/auth/refresh', { refreshToken });
    expect(res3.status).toBe(401);
  });
});
```

---

## ✅ Checklist

- [ ] Actualizar auth middleware (generateAccessToken, generateRefreshToken)
- [ ] Agregar POST /auth/refresh endpoint
- [ ] Actualizar POST /auth/login para usar generateTokens
- [ ] Actualizar POST /auth/signup para usar generateTokens
- [ ] Agregar POST /auth/logout (single device)
- [ ] Agregar POST /auth/logout-all (all devices)
- [ ] Actualizar imports/exports
- [ ] Compilar y verificar TypeScript
- [ ] Prueba manual: Login obtiene 2 tokens
- [ ] Prueba manual: Refresh renew access token
- [ ] Prueba manual: Logout invalida refresh token
- [ ] Tests unitarios

---

## 🔐 Security Considerations

### Access Token (JWT)
✅ Corta vida (15 min)
✅ Firmado y verificable
✅ Sin necesidad de DB lookup
❌ Si robado: Válido 15 min (aceptable)

### Refresh Token
✅ Largo (30 días)
✅ Guardado en DB (verificable)
✅ No enviado en request normal
✅ Puede ser revocado inmediatamente
✅ Hashed en DB (no plaintext)
❌ Si robado: Válido 30 días (pero cliente puede logout-all)

### Revocation
✅ POST /auth/logout: Revoca un token (un device)
✅ POST /auth/logout-all: Revoca TODOS (todos los devices)
✅ Cambio de password: Podría invalidar todos (implementar futura)

---

## 📈 Client Implementation (for reference)

```typescript
// App.ts / Store
async function refreshToken() {
  const response = await fetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({
      refreshToken: localStorage.getItem('refreshToken'),
    }),
  });

  if (response.ok) {
    const { accessToken, refreshToken } = await response.json();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    return accessToken;
  }

  // Refresh failed, force login
  localStorage.clear();
  router.push('/login');
}

// HTTP Interceptor
export function setupHttpInterceptor() {
  // On 401 TOKEN_EXPIRED:
  // 1. Call refreshToken()
  // 2. Retry original request with new token
  // 3. If refresh fails, redirect to login
}
```

---

**Siguiente:** P1-1 Session Invalidation (P1 - High Priority)
