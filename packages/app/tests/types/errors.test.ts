import { describe, it, expect } from 'vitest';
import {
  AUTH_ERROR_CODES,
  requiresLogout,
  canRefreshToken,
  isUserSuspended,
  createAppError,
} from '../../src/types/errors';

describe('Error Types', () => {
  describe('AUTH_ERROR_CODES', () => {
    it('should have all expected error codes', () => {
      expect(AUTH_ERROR_CODES.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(AUTH_ERROR_CODES.TOKEN_INVALID).toBe('TOKEN_INVALID');
      expect(AUTH_ERROR_CODES.USER_SUSPENDED).toBe('USER_SUSPENDED');
      expect(AUTH_ERROR_CODES.SESSION_REVOKED).toBe('SESSION_REVOKED');
      expect(AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID).toBe('REFRESH_TOKEN_INVALID');
    });
  });

  describe('requiresLogout()', () => {
    it('should return true for USER_SUSPENDED', () => {
      expect(requiresLogout(AUTH_ERROR_CODES.USER_SUSPENDED)).toBe(true);
    });

    it('should return true for SESSION_REVOKED', () => {
      expect(requiresLogout(AUTH_ERROR_CODES.SESSION_REVOKED)).toBe(true);
    });

    it('should return true for REFRESH_TOKEN_INVALID', () => {
      expect(requiresLogout(AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID)).toBe(true);
    });

    it('should return false for TOKEN_EXPIRED', () => {
      expect(requiresLogout(AUTH_ERROR_CODES.TOKEN_EXPIRED)).toBe(false);
    });

    it('should return false for TOKEN_INVALID', () => {
      expect(requiresLogout(AUTH_ERROR_CODES.TOKEN_INVALID)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(requiresLogout(undefined)).toBe(false);
    });
  });

  describe('canRefreshToken()', () => {
    it('should return true for TOKEN_EXPIRED', () => {
      expect(canRefreshToken(AUTH_ERROR_CODES.TOKEN_EXPIRED)).toBe(true);
    });

    it('should return false for TOKEN_INVALID', () => {
      expect(canRefreshToken(AUTH_ERROR_CODES.TOKEN_INVALID)).toBe(false);
    });

    it('should return false for USER_SUSPENDED', () => {
      expect(canRefreshToken(AUTH_ERROR_CODES.USER_SUSPENDED)).toBe(false);
    });

    it('should return false for SESSION_REVOKED', () => {
      expect(canRefreshToken(AUTH_ERROR_CODES.SESSION_REVOKED)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(canRefreshToken(undefined)).toBe(false);
    });
  });

  describe('isUserSuspended()', () => {
    it('should return true for USER_SUSPENDED', () => {
      expect(isUserSuspended(AUTH_ERROR_CODES.USER_SUSPENDED)).toBe(true);
    });

    it('should return false for other codes', () => {
      expect(isUserSuspended(AUTH_ERROR_CODES.TOKEN_EXPIRED)).toBe(false);
      expect(isUserSuspended(AUTH_ERROR_CODES.TOKEN_INVALID)).toBe(false);
      expect(isUserSuspended(AUTH_ERROR_CODES.SESSION_REVOKED)).toBe(false);
      expect(isUserSuspended(AUTH_ERROR_CODES.REFRESH_TOKEN_INVALID)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isUserSuspended(undefined)).toBe(false);
    });
  });

  describe('createAppError()', () => {
    it('should create an error with all properties', () => {
      const error = createAppError(
        'Test error message',
        401,
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
        'req-123',
        'Token has expired'
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('TOKEN_EXPIRED');
      expect(error.requestId).toBe('req-123');
      expect(error.reason).toBe('Token has expired');
    });

    it('should create an error with minimal properties', () => {
      const error = createAppError('Simple error', 500);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Simple error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBeUndefined();
      expect(error.requestId).toBeUndefined();
      expect(error.reason).toBeUndefined();
    });

    it('should create error for suspension', () => {
      const error = createAppError(
        'Account suspended',
        403,
        AUTH_ERROR_CODES.USER_SUSPENDED,
        'req-456',
        'Violation of terms'
      );

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('USER_SUSPENDED');
      expect(error.reason).toBe('Violation of terms');
    });
  });
});
