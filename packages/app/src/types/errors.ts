/**
 * Backend Error Codes
 * These codes match the backend AUTH_ERROR_CODES
 * Used to determine appropriate app behavior on auth failures
 */
export const AUTH_ERROR_CODES = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  USER_SUSPENDED: 'USER_SUSPENDED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/**
 * Structured error response from backend
 */
export interface BackendErrorResponse {
  error: string;
  code?: AuthErrorCode;
  reason?: string; // Used for suspension reason
  details?: unknown;
}

/**
 * Extended error with request context for debugging
 */
export interface AppError extends Error {
  code?: AuthErrorCode;
  statusCode?: number;
  requestId?: string;
  reason?: string;
}

/**
 * Create an AppError from a backend response
 */
export function createAppError(
  message: string,
  statusCode: number,
  code?: AuthErrorCode,
  requestId?: string,
  reason?: string
): AppError {
  const error = new Error(message) as AppError;
  error.code = code;
  error.statusCode = statusCode;
  error.requestId = requestId;
  error.reason = reason;
  return error;
}

/**
 * Check if an error code requires immediate logout
 */
export function requiresLogout(code?: AuthErrorCode): boolean {
  return code === AUTH_ERROR_CODES.USER_SUSPENDED ||
         code === AUTH_ERROR_CODES.SESSION_REVOKED ||
         code === AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID;
}

/**
 * Check if an error code indicates the token can be refreshed
 */
export function canRefreshToken(code?: AuthErrorCode): boolean {
  return code === AUTH_ERROR_CODES.TOKEN_EXPIRED;
}

/**
 * Check if user is suspended
 */
export function isUserSuspended(code?: AuthErrorCode): boolean {
  return code === AUTH_ERROR_CODES.USER_SUSPENDED;
}
