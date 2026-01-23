# P2-2: HTTP Interceptor - Auto Token Renewal
## Transparent Token Refresh en Todos los Requests

**Status:** ⏳ No Iniciado
**Prioridad:** 🟡 MEDIA
**Impacto:** UX massively better, zero interruptions
**Complejidad:** 🟡 Medio (3 horas)
**Location:** `packages/app/src/services/http.ts` (FRONTEND)

---

## 📋 El Problema

### Vulnerabilidad/Fricción

**Ubicación:** App frontend, todas las llamadas HTTP

**Problema:** Con token refresh de 15 minutos:
```typescript
// ❌ SIN INTERCEPTOR
const response = await fetch('/api/...');
// Si token expiró:
// response.status === 401
// "Token expired"
// Usuario debe re-login
```

### Experiencia del Usuario

```
Escenario: User trabaja en la app
1. Login exitoso ✓ (token válido 15 min)
2. User edita PR por 20 minutos
3. Intenta hacer acción → 401 Token expired ✗
4. User confundido: "¿Por qué me deslogueó?"
5. Fuerza re-login
6. Molestia

CON INTERCEPTOR:
1. Login exitoso ✓
2. User edita por 20 minutos
3. En background: token renovado silenciosamente
4. Intenta acción → funciona transparente ✓
5. User nunca se da cuenta
6. Happy dev 😊
```

---

## 🎯 Solución: HTTP Interceptor

### Arquitectura

```
Fetch Request
    │
    ▼
┌─────────────────────────────┐
│ Interceptor (antes)         │
├─ Agregar Authorization      │
│  header con accessToken     │
│ ├─ accessToken válido?      │
│ │  ├─ SÍ → continuar        │
│ │  └─ NO → renewTokens()    │
│ └─ Si expiró en 5 min       │
│    └─ renewTokens() proact  │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Fetch Request Actual        │
│ GET /api/...                │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Response Handler            │
├─ 200 OK → return            │
├─ 401 TOKEN_EXPIRED:         │
│  ├─ renewTokens()           │
│  ├─ Retry original request  │
│  └─ return response         │
└─────────────────────────────┘
    │
    ▼
App Component
```

### Flujo de Renovación

```
1. Detect que token expirado (401 TOKEN_EXPIRED)
2. POST /auth/refresh { refreshToken }
3. Receive { newAccessToken, newRefreshToken }
4. Store ambos en secure storage
5. Retry original request con nuevo token
6. Return response al caller
7. User nunca se dio cuenta
```

---

## 🔧 Implementación (Frontend)

### PASO 1: Create HTTP Service with Interceptor

**Archivo:** `packages/app/src/services/http.ts`

```typescript
import { authStore } from '../stores/authStore';

// Track if refresh is in progress to avoid multiple refresh calls
let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

/**
 * Subscribe to token refresh completion
 * Used to retry queued requests after token is renewed
 */
function subscribeTokenRefresh(callback: () => void) {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers that token has been refreshed
 */
function notifyTokenRefreshed() {
  refreshSubscribers.forEach((callback) => callback());
  refreshSubscribers = [];
}

/**
 * Attempt to refresh access token
 * Returns true if successful, false if refresh failed
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const refreshToken = authStore.refreshToken;
    if (!refreshToken) {
      // No refresh token available, must re-login
      await authStore.logout();
      return false;
    }

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      // Store new tokens
      authStore.setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      return true;
    }

    // Refresh failed (refresh token expired)
    await authStore.logout();
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    await authStore.logout();
    return false;
  }
}

/**
 * Check if access token is expiring soon (within 5 minutes)
 * If so, proactively refresh to prevent mid-request expiration
 */
function shouldProactivelyRefresh(): boolean {
  if (!authStore.accessToken) return false;

  try {
    // Decode JWT to get expiry
    const parts = authStore.accessToken.split('.');
    if (parts.length !== 3) return false;

    const decoded = JSON.parse(atob(parts[1]));
    const expiresAt = decoded.exp * 1000; // Convert to ms
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    // Refresh if less than 5 minutes left
    return timeUntilExpiry < 5 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Main HTTP Fetch Wrapper with Token Management
 * Handles:
 * - Authorization header injection
 * - Proactive token refresh
 * - Automatic retry on 401 TOKEN_EXPIRED
 * - Queue requests during token refresh
 */
export async function httpFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Step 1: Check if token is expiring soon and refresh proactively
  if (shouldProactivelyRefresh()) {
    console.log('[HTTP] Token expiring soon, refreshing proactively...');
    if (!isRefreshing) {
      isRefreshing = true;
      await refreshAccessToken();
      isRefreshing = false;
      notifyTokenRefreshed();
    }
  }

  // Step 2: Add authorization header
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${authStore.accessToken}`,
  };

  // Step 3: Make the request
  let response = await fetch(url, { ...options, headers });

  // Step 4: Handle 401 TOKEN_EXPIRED
  if (response.status === 401) {
    const data = await response.json();
    if (data.code === 'TOKEN_EXPIRED') {
      console.log('[HTTP] Token expired, refreshing...');

      // If another request is already refreshing, wait for it
      if (isRefreshing) {
        // Queue this request to retry after refresh completes
        return new Promise((resolve) => {
          subscribeTokenRefresh(async () => {
            const retryHeaders = {
              ...options.headers,
              Authorization: `Bearer ${authStore.accessToken}`,
            };
            const retryResponse = await fetch(url, {
              ...options,
              headers: retryHeaders,
            });
            resolve(retryResponse);
          });
        });
      }

      // Try to refresh
      isRefreshing = true;
      const refreshed = await refreshAccessToken();
      isRefreshing = false;
      notifyTokenRefreshed();

      if (refreshed) {
        // Retry original request with new token
        const retryHeaders = {
          ...options.headers,
          Authorization: `Bearer ${authStore.accessToken}`,
        };
        response = await fetch(url, { ...options, headers: retryHeaders });
      } else {
        // Refresh failed, user must re-login
        return response; // Return 401 so component can handle logout
      }
    }
  }

  return response;
}

/**
 * Convenience wrappers
 */
export async function httpGet(url: string, options?: RequestInit) {
  return httpFetch(url, { ...options, method: 'GET' });
}

export async function httpPost(
  url: string,
  body: unknown,
  options?: RequestInit
) {
  return httpFetch(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(body),
  });
}

export async function httpPut(
  url: string,
  body: unknown,
  options?: RequestInit
) {
  return httpFetch(url, {
    ...options,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(body),
  });
}

export async function httpDelete(url: string, options?: RequestInit) {
  return httpFetch(url, { ...options, method: 'DELETE' });
}

export async function httpPatch(
  url: string,
  body: unknown,
  options?: RequestInit
) {
  return httpFetch(url, {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: JSON.stringify(body),
  });
}
```

---

### PASO 2: Update AuthStore to Support Token Management

**Archivo:** `packages/app/src/stores/authStore.ts`

```typescript
// Add to authStore:

export const authStore = {
  state: reactive({
    isAuthenticated: false,
    user: null as UserType | null,
    accessToken: null as string | null,
    refreshToken: null as string | null,
    subscription: null as SubscriptionType | null,
  }),

  // Getters
  get accessToken() {
    return this.state.accessToken;
  },

  get refreshToken() {
    return this.state.refreshToken;
  },

  // Set tokens from login/refresh
  setTokens(tokens: { accessToken: string; refreshToken: string }) {
    this.state.accessToken = tokens.accessToken;
    this.state.refreshToken = tokens.refreshToken;
    // Store in electronSafeStorage (secure storage)
    if (window.electronAPI?.safeStorage) {
      window.electronAPI.safeStorage.setTokens(tokens);
    }
  },

  // ... rest of authStore
};
```

---

### PASO 3: Replace All Fetch Calls

**Everywhere in the app:**

```typescript
// ❌ BEFORE
const response = await fetch(`${API_URL}/api/prs`, {
  headers: { Authorization: `Bearer ${token}` }
});

// ✅ AFTER
import { httpGet } from '@/services/http';
const response = await httpGet(`${API_URL}/api/prs`);
// Token management automatic!
```

---

## 🧪 Testing

### Manual Test

```typescript
// Test token expiration and auto-refresh:
1. Login
2. Go to /pr (which makes HTTP call)
3. Wait 15 minutes (or manually set token expiry)
4. Make another call
5. Should NOT show "token expired"
6. Should work transparently
7. Check console: "[HTTP] Token expired, refreshing..."
```

### Automated Test (Example)

```typescript
describe('HTTP Interceptor', () => {
  it('should refresh token automatically on 401', async () => {
    // Setup: User logged in with valid token
    authStore.setTokens({
      accessToken: expiredToken,
      refreshToken: validRefreshToken,
    });

    // Mock fetch to return 401 first time
    global.fetch = jest.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'TOKEN_EXPIRED' }), {
          status: 401,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'TOKEN_REFRESHED' }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
        })
      );

    // Make request
    const response = await httpFetch('/api/test');

    // Should have:
    // 1. Called refresh endpoint
    // 2. Updated tokens
    // 3. Retried original request
    // 4. Return success response

    expect(response.status).toBe(200);
    expect(authStore.accessToken).not.toBe(expiredToken);
  });

  it('should logout on failed refresh', async () => {
    // Setup: Expired refresh token
    authStore.setTokens({
      accessToken: expiredToken,
      refreshToken: expiredRefreshToken,
    });

    // Mock refresh to fail
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Invalid refresh token' }), {
        status: 401,
      }
    );

    // Make request
    const response = await httpFetch('/api/test');

    // Should logout
    expect(authStore.state.isAuthenticated).toBe(false);
    expect(response.status).toBe(401);
  });
});
```

---

## ✅ Checklist

- [ ] Create http.ts service with interceptor
- [ ] Implement token refresh logic
- [ ] Implement proactive refresh (5 min before expiry)
- [ ] Implement request queueing during refresh
- [ ] Add setTokens() to authStore
- [ ] Replace all fetch calls with httpGet/Post/etc
- [ ] Test manual token expiration
- [ ] Test concurrent requests during refresh
- [ ] Unit tests for interceptor
- [ ] Test logout behavior on refresh failure

---

## 📈 Métricas de Éxito

✅ **Transparent**: User never sees token expiration
✅ **Efficient**: Proactive refresh prevents 401s
✅ **Reliable**: Queues requests during refresh
✅ **Safe**: Logout on refresh failure
✅ **Testable**: Clear request flow for testing

---

## 🔄 How It Differs from Backend Token Refresh

| Aspect | Backend | App Interceptor |
|--------|---------|-----------------|
| **Where** | Server side | Client side (JavaScript) |
| **Triggering** | User makes request | Proactive + 401 response |
| **Transparency** | N/A | Completely transparent |
| **User Experience** | No interruptions (if impl) | Zero interruptions |
| **Token Rotation** | Refresh returns new tokens | Stored in secure storage |
| **Queue Handling** | N/A | Queue requests during refresh |

Both layers needed for complete security!

---

**Siguiente:** P2-3 XSS Protection (frontend)
