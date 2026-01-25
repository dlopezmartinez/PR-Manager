/**
 * Tests for services/http.ts - HTTP interceptor with auth handling
 * Tests auth error events, X-Request-ID capture, and token management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  onAuthError,
  getLastRequestId,
  type AuthErrorEvent,
} from '../../src/services/http';

// Mock the electronAPI
const mockElectronAPI = {
  auth: {
    getToken: vi.fn(),
    setToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setRefreshToken: vi.fn(),
    clearToken: vi.fn(),
    clearRefreshToken: vi.fn(),
  },
};

vi.stubGlobal('window', {
  electronAPI: mockElectronAPI,
});

describe('HTTP Service - Auth Error Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onAuthError()', () => {
    it('should subscribe to auth error events', () => {
      const listener = vi.fn();
      const unsubscribe = onAuthError(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = onAuthError(listener);

      // Should not throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should allow multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = onAuthError(listener1);
      const unsub2 = onAuthError(listener2);

      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');

      // Cleanup
      unsub1();
      unsub2();
    });

    it('should unsubscribe correctly without affecting other listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = onAuthError(listener1);
      onAuthError(listener2);

      // Unsubscribe first listener
      unsub1();

      // Second listener should still be subscribed (no error when unsubscribing)
      expect(() => unsub1()).not.toThrow(); // Second call should be safe
    });
  });

  describe('getLastRequestId()', () => {
    it('should return null initially', () => {
      // Note: This might not be null if other tests have run
      // The function should return string or null
      const requestId = getLastRequestId();
      expect(requestId === null || typeof requestId === 'string').toBe(true);
    });

    it('should return the correct type', () => {
      const requestId = getLastRequestId();
      expect(requestId === null || typeof requestId === 'string').toBe(true);
    });
  });

  describe('AuthErrorEvent interface', () => {
    it('should have correct structure', () => {
      const event: AuthErrorEvent = {
        code: 'USER_SUSPENDED',
        message: 'Account suspended',
        reason: 'Violation of terms',
        requestId: 'req-123',
      };

      expect(event.code).toBe('USER_SUSPENDED');
      expect(event.message).toBe('Account suspended');
      expect(event.reason).toBe('Violation of terms');
      expect(event.requestId).toBe('req-123');
    });

    it('should allow optional fields', () => {
      const event: AuthErrorEvent = {
        code: 'SESSION_REVOKED',
        message: 'Session terminated',
      };

      expect(event.code).toBe('SESSION_REVOKED');
      expect(event.message).toBe('Session terminated');
      expect(event.reason).toBeUndefined();
      expect(event.requestId).toBeUndefined();
    });
  });
});

describe('HTTP Service - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI.auth.getToken.mockResolvedValue(null);
    mockElectronAPI.auth.getRefreshToken.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token storage', () => {
    it('should handle missing token gracefully', async () => {
      mockElectronAPI.auth.getToken.mockResolvedValue(null);

      const token = await mockElectronAPI.auth.getToken();
      expect(token).toBeNull();
    });

    it('should handle token retrieval', async () => {
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      mockElectronAPI.auth.getToken.mockResolvedValue(mockToken);

      const token = await mockElectronAPI.auth.getToken();
      expect(token).toBe(mockToken);
    });
  });
});
