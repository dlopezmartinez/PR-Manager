import type { AuthUser } from '../preload';
import {
  AUTH_ERROR_CODES,
  type AuthErrorCode,
  requiresLogout,
  canRefreshToken,
} from '../types/errors';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';

let isRefreshing = false;
let refreshSubscribers: Array<() => void> = [];
let lastRequestId: string | null = null;

export function getLastRequestId(): string | null {
  return lastRequestId;
}

export interface AuthErrorEvent {
  code: AuthErrorCode;
  message: string;
  reason?: string;
  requestId?: string;
}

type AuthErrorListener = (event: AuthErrorEvent) => void;
const authErrorListeners: AuthErrorListener[] = [];

export function onAuthError(listener: AuthErrorListener): () => void {
  authErrorListeners.push(listener);
  return () => {
    const index = authErrorListeners.indexOf(listener);
    if (index > -1) {
      authErrorListeners.splice(index, 1);
    }
  };
}

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

function subscribeTokenRefresh(callback: () => void) {
  refreshSubscribers.push(callback);
}

function notifyTokenRefreshed() {
  refreshSubscribers.forEach((callback) => callback());
  refreshSubscribers = [];
}

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

async function shouldProactivelyRefresh(): Promise<boolean> {
  try {
    const { accessToken } = await getStoredTokens();
    if (!accessToken) return false;

    const decoded = decodeJWT(accessToken);
    if (!decoded?.exp) return false;

    const expiresAt = decoded.exp * 1000;
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;

    return timeUntilExpiry < 5 * 60 * 1000;
  } catch (error) {
    console.error('Error checking token expiry:', error);
    return false;
  }
}

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

    const requestId = response.headers.get('X-Request-ID');
    if (requestId) {
      lastRequestId = requestId;
    }

    if (response.ok) {
      const data: TokenResponse = await response.json();
      await storeTokens(data.accessToken, data.refreshToken);
      console.log('[HTTP] Token refreshed successfully');
      return true;
    }

    if (response.status === 401 || response.status === 403) {
      try {
        const data = await response.json() as { code?: AuthErrorCode; error?: string; reason?: string };

        if (requiresLogout(data.code)) {
          console.error('[HTTP] Fatal error during refresh:', data.code);
          emitAuthError({
            code: data.code!,
            message: data.error || 'Authentication error',
            reason: data.reason,
            requestId: lastRequestId || undefined,
          });
        } else {
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

export async function httpFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (await shouldProactivelyRefresh()) {
    console.log('[HTTP] Token expiring soon, refreshing proactively...');
    if (!isRefreshing) {
      isRefreshing = true;
      await refreshAccessToken();
      isRefreshing = false;
      notifyTokenRefreshed();
    }
  }

  const { accessToken } = await getStoredTokens();
  const headers: HeadersInit = {
    ...options.headers,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, { ...options, headers });

  const requestId = response.headers.get('X-Request-ID');
  if (requestId) {
    lastRequestId = requestId;
  }

  if (response.status === 401 || response.status === 403) {
    try {
      const clonedResponse = response.clone();
      const data = await clonedResponse.json() as { code?: AuthErrorCode; error?: string; reason?: string };

      if (requiresLogout(data.code)) {
        console.error('[HTTP] Fatal auth error:', data.code);
        emitAuthError({
          code: data.code!,
          message: data.error || 'Authentication error',
          reason: data.reason,
          requestId: lastRequestId || undefined,
        });
        await clearTokens();
        return response;
      }

      if (canRefreshToken(data.code)) {
        console.log('[HTTP] Token expired, attempting refresh...');

        if (isRefreshing) {
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
              const retryRequestId = retryResponse.headers.get('X-Request-ID');
              if (retryRequestId) {
                lastRequestId = retryRequestId;
              }
              resolve(retryResponse);
            });
          });
        }

        isRefreshing = true;
        const refreshed = await refreshAccessToken();
        isRefreshing = false;
        notifyTokenRefreshed();

        if (refreshed) {
          const { accessToken: newAccessToken } = await getStoredTokens();
          const retryHeaders: HeadersInit = {
            ...options.headers,
          };
          if (newAccessToken) {
            retryHeaders['Authorization'] = `Bearer ${newAccessToken}`;
          }
          response = await fetch(url, { ...options, headers: retryHeaders });
          const retryRequestId = response.headers.get('X-Request-ID');
          if (retryRequestId) {
            lastRequestId = retryRequestId;
          }
        } else {
          console.error('[HTTP] Token refresh failed');
          emitAuthError({
            code: AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID as AuthErrorCode,
            message: 'Session expired. Please log in again.',
            requestId: lastRequestId || undefined,
          });
        }
      }
    } catch (error) {
      console.error('[HTTP] Error parsing auth error response:', error);
    }
  }

  return response;
}

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
