/**
 * HTTP Interceptor Service
 *
 * Handles:
 * - Automatic Authorization header injection
 * - Proactive token refresh (5 min before expiry)
 * - Automatic retry on 401 TOKEN_EXPIRED
 * - Request queuing during token refresh
 * - Transparent token management
 * - X-Request-ID capture for debugging
 * - User suspension and session revocation detection
 */

import type { AuthUser } from '../preload';
import {
  AUTH_ERROR_CODES,
  type AuthErrorCode,
  requiresLogout,
  canRefreshToken,
} from '../types/errors';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';

// Track if refresh is in progress to avoid multiple concurrent refresh calls
let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];

// Store the last request ID for debugging
let lastRequestId: string | null = null;

/**
 * Get the last X-Request-ID from the backend
 * Useful for error reporting and debugging
 */
export function getLastRequestId(): string | null {
  return lastRequestId;
}

/**
 * Auth error event for app-wide handling
 */
export interface AuthErrorEvent {
  code: AuthErrorCode;
  message: string;
  reason?: string;
  requestId?: string;
}

// Event listeners for auth errors
type AuthErrorListener = (event: AuthErrorEvent) => void;
const authErrorListeners: AuthErrorListener[] = [];

/**
 * Subscribe to auth error events (suspension, revocation, etc.)
 */
export function onAuthError(listener: AuthErrorListener): () => void {
  authErrorListeners.push(listener);
  // Return unsubscribe function
  return () => {
    const index = authErrorListeners.indexOf(listener);
    if (index > -1) {
      authErrorListeners.splice(index, 1);
    }
  };
}

/**
 * Emit an auth error event to all listeners
 */
function emitAuthError(event: AuthErrorEvent) {
  console.error('[HTTP] Auth error:', event.code, event.message);
  authErrorListeners.forEach((listener) => listener(event));
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user?: AuthUser;
}

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
 * Get stored tokens from electron safe storage
 */
async function getStoredTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  try {
    const accessToken = await window.electronAPI?.auth.getToken() || null;
    const refreshToken = await window.electronAPI?.auth.getRefreshToken?.() || null;
    return { accessToken, refreshToken };
  } catch (error) {
    console.error('Failed to get stored tokens:', error);
    return { accessToken: null, refreshToken: null };
  }
}

/**
 * Store tokens in electron safe storage
 */
async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await window.electronAPI?.auth.setToken?.(accessToken);
    if (window.electronAPI?.auth.setRefreshToken) {
      await window.electronAPI.auth.setRefreshToken(refreshToken);
    }
  } catch (error) {
    console.error('Failed to store tokens:', error);
  }
}

/**
 * Clear all stored tokens
 */
async function clearTokens(): Promise<void> {
  try {
    await window.electronAPI?.auth.clearToken?.();
    if (window.electronAPI?.auth.clearRefreshToken) {
      await window.electronAPI.auth.clearRefreshToken();
    }
  } catch (error) {
    console.error('Failed to clear tokens:', error);
  }
}

/**
 * Decode JWT to extract payload and expiry
 */
function decodeJWT(token: string): { exp?: number; [key: string]: any } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = JSON.parse(atob(parts[1]));
    return decoded;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Check if access token is expiring soon (within 5 minutes)
 * If so, proactively refresh to prevent mid-request expiration
 */
async function shouldProactivelyRefresh(): Promise<boolean> {
  try {
    const { accessToken } = await getStoredTokens();
    if (!accessToken) return false;

    const decoded = decodeJWT(accessToken);
    if (!decoded?.exp) return false;

    const expiresAt = decoded.exp * 1000; // Convert to ms
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    // Refresh if less than 5 minutes left
    return timeUntilExpiry < 5 * 60 * 1000;
  } catch (error) {
    console.error('Error checking token expiry:', error);
    return false;
  }
}

/**
 * Attempt to refresh access token using refresh token
 * Returns true if successful, false if refresh failed
 * Emits auth error events for suspension/revocation
 */
async function refreshAccessToken(): Promise<boolean> {
  try {
    const { refreshToken } = await getStoredTokens();
    if (!refreshToken) {
      console.error('[HTTP] No refresh token available');
      await clearTokens();
      return false;
    }

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    // Capture X-Request-ID from refresh response
    const requestId = response.headers.get('X-Request-ID');
    if (requestId) {
      lastRequestId = requestId;
    }

    if (response.ok) {
      const data: TokenResponse = await response.json();
      // Store new tokens
      await storeTokens(data.accessToken, data.refreshToken);
      console.log('[HTTP] Token refreshed successfully');
      return true;
    }

    // Handle auth errors during refresh
    if (response.status === 401 || response.status === 403) {
      try {
        const data = await response.json() as { code?: AuthErrorCode; error?: string; reason?: string };

        // Check for suspension or revocation
        if (requiresLogout(data.code)) {
          console.error('[HTTP] Fatal error during refresh:', data.code);
          emitAuthError({
            code: data.code!,
            message: data.error || 'Authentication error',
            reason: data.reason,
            requestId: lastRequestId || undefined,
          });
        } else {
          // Generic refresh failure
          console.error('[HTTP] Refresh token invalid/expired');
        }
      } catch {
        console.error('[HTTP] Refresh token invalid/expired (no details)');
      }

      await clearTokens();
      return false;
    }

    console.error('[HTTP] Refresh failed with status:', response.status);
    return false;
  } catch (error) {
    console.error('[HTTP] Token refresh error:', error);
    await clearTokens();
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
 * - X-Request-ID capture for debugging
 * - User suspension and session revocation detection
 */
export async function httpFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Step 1: Check if token is expiring soon and refresh proactively
  if (await shouldProactivelyRefresh()) {
    console.log('[HTTP] Token expiring soon, refreshing proactively...');
    if (!isRefreshing) {
      isRefreshing = true;
      await refreshAccessToken();
      isRefreshing = false;
      notifyTokenRefreshed();
    }
  }

  // Step 2: Add authorization header
  const { accessToken } = await getStoredTokens();
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // Step 3: Make the request
  let response = await fetch(url, { ...options, headers });

  // Step 4: Capture X-Request-ID for debugging
  const requestId = response.headers.get('X-Request-ID');
  if (requestId) {
    lastRequestId = requestId;
  }

  // Step 5: Handle auth errors (401/403)
  if (response.status === 401 || response.status === 403) {
    try {
      // Clone response so we can read the body and still return it
      const clonedResponse = response.clone();
      const data = await clonedResponse.json() as { code?: AuthErrorCode; error?: string; reason?: string };

      // Check if this is a fatal auth error (suspension/revocation)
      if (requiresLogout(data.code)) {
        console.error('[HTTP] Fatal auth error:', data.code);
        emitAuthError({
          code: data.code!,
          message: data.error || 'Authentication error',
          reason: data.reason,
          requestId: lastRequestId || undefined,
        });
        // Clear tokens - user must re-authenticate
        await clearTokens();
        return response;
      }

      // Handle TOKEN_EXPIRED - attempt refresh
      if (canRefreshToken(data.code)) {
        console.log('[HTTP] Token expired, attempting refresh...');

        // If another request is already refreshing, wait for it
        if (isRefreshing) {
          // Queue this request to retry after refresh completes
          return new Promise((resolve) => {
            subscribeTokenRefresh(async () => {
              const { accessToken: newAccessToken } = await getStoredTokens();
              const retryHeaders: HeadersInit = {
                ...options.headers,
              };
              if (newAccessToken) {
                retryHeaders['Authorization'] = `Bearer ${newAccessToken}`;
              }
              const retryResponse = await fetch(url, {
                ...options,
                headers: retryHeaders,
              });
              // Capture X-Request-ID from retry response
              const retryRequestId = retryResponse.headers.get('X-Request-ID');
              if (retryRequestId) {
                lastRequestId = retryRequestId;
              }
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
          const { accessToken: newAccessToken } = await getStoredTokens();
          const retryHeaders: HeadersInit = {
            ...options.headers,
          };
          if (newAccessToken) {
            retryHeaders['Authorization'] = `Bearer ${newAccessToken}`;
          }
          response = await fetch(url, { ...options, headers: retryHeaders });
          // Capture X-Request-ID from retry response
          const retryRequestId = response.headers.get('X-Request-ID');
          if (retryRequestId) {
            lastRequestId = retryRequestId;
          }
        } else {
          // Refresh failed - emit error event
          console.error('[HTTP] Token refresh failed');
          emitAuthError({
            code: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID as AuthErrorCode,
            message: 'Session expired. Please log in again.',
            requestId: lastRequestId || undefined,
          });
        }
      }
    } catch (error) {
      // Could not parse response as JSON, just return the response
      console.error('[HTTP] Error parsing auth error response:', error);
    }
  }

  return response;
}

/**
 * Convenience wrappers for common HTTP methods
 */

export async function httpGet(url: string, options?: RequestInit): Promise<Response> {
  return httpFetch(url, { ...options, method: 'GET' });
}

export async function httpPost(
  url: string,
  body?: unknown,
  options?: RequestInit
): Promise<Response> {
  return httpFetch(url, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function httpPut(
  url: string,
  body?: unknown,
  options?: RequestInit
): Promise<Response> {
  return httpFetch(url, {
    ...options,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function httpDelete(url: string, options?: RequestInit): Promise<Response> {
  return httpFetch(url, { ...options, method: 'DELETE' });
}

export async function httpPatch(
  url: string,
  body?: unknown,
  options?: RequestInit
): Promise<Response> {
  return httpFetch(url, {
    ...options,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
