import { UserRole } from '@prisma/client';

export interface SubscriptionClaims {
  active: boolean;
  status: 'active' | 'on_trial' | 'past_due' | 'cancelled' | 'expired' | 'none';
  plan: 'monthly' | 'yearly' | 'lifetime' | 'beta' | null;
  expiresAt: number | null;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  subscription?: SubscriptionClaims;
}

export interface RefreshTokenResult {
  valid: boolean;
  userId?: string;
  deviceId?: string | null;
  deviceName?: string | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface VerifyDeviceSessionResult {
  valid: boolean;
  sessionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export const AUTH_ERROR_CODES = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  USER_SUSPENDED: 'USER_SUSPENDED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_REPLACED: 'SESSION_REPLACED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  DEVICE_ID_REQUIRED: 'DEVICE_ID_REQUIRED',
} as const;

export type AuthErrorCode = typeof AUTH_ERROR_CODES[keyof typeof AUTH_ERROR_CODES];

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}
