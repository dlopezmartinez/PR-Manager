/**
 * JWT Decode Utility
 * Decodes JWT tokens without verification (signature verification happens server-side)
 */

export interface SubscriptionClaims {
  active: boolean;
  status: 'active' | 'on_trial' | 'past_due' | 'cancelled' | 'expired' | 'none' | 'unknown';
  plan: 'monthly' | 'yearly' | 'lifetime' | 'beta' | null;
  expiresAt: number | null; // Unix timestamp
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  subscription?: SubscriptionClaims;
  iat?: number; // Issued at (Unix timestamp)
  exp?: number; // Expiration (Unix timestamp)
}

/**
 * Decodes a JWT token without verifying the signature.
 * Only use this for reading claims - never trust the data without server verification.
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn('[JWT] Invalid token format - expected 3 parts');
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];
    // Handle base64url encoding
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload) as JWTPayload;
  } catch (error) {
    console.error('[JWT] Failed to decode token:', error);
    return null;
  }
}

/**
 * Checks if a JWT token has expired based on its exp claim.
 */
export function isTokenExpired(payload: JWTPayload | null): boolean {
  if (!payload || !payload.exp) {
    return true;
  }

  // Add 60 second buffer for clock skew
  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now - 60;
}

/**
 * Extracts subscription claims from a JWT token.
 * Returns null if token is invalid or has no subscription data.
 */
export function getSubscriptionFromToken(token: string): SubscriptionClaims | null {
  const payload = decodeJWT(token);
  if (!payload) {
    return null;
  }

  return payload.subscription || null;
}

/**
 * Gets the token expiration time in milliseconds.
 * Returns null if token is invalid or has no expiration.
 */
export function getTokenExpirationMs(token: string): number | null {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return null;
  }

  return payload.exp * 1000;
}

/**
 * Gets time until token expires in milliseconds.
 * Returns negative value if already expired, null if no expiration.
 */
export function getTimeUntilExpiration(token: string): number | null {
  const expirationMs = getTokenExpirationMs(token);
  if (expirationMs === null) {
    return null;
  }

  return expirationMs - Date.now();
}
