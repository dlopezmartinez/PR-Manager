/**
 * Tests for authStore - Authentication state management
 * Tests suspension handling, session revocation, and auth error events
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock the modules before importing the store
vi.mock('../../src/services/authService', () => ({
  authService: {
    initialize: vi.fn().mockResolvedValue(false),
    verifyToken: vi.fn().mockResolvedValue({ valid: false }),
    logout: vi.fn().mockResolvedValue(undefined),
    getSubscriptionStatus: vi.fn().mockResolvedValue({ active: false, status: 'none' }),
    signup: vi.fn(),
    login: vi.fn(),
    createCheckoutSession: vi.fn(),
    openCustomerPortal: vi.fn(),
  },
}));

vi.mock('../../src/services/http', () => ({
  // Returns an unsubscribe function (noop for tests)
  onAuthError: vi.fn().mockReturnValue(vi.fn()),
}));

// Import after mocks are set up
import { authStore } from '../../src/stores/authStore';
import { authService } from '../../src/services/authService';
import { onAuthError } from '../../src/services/http';

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      expect(authStore.state.initialized).toBeDefined();
      expect(authStore.state.isAuthenticated).toBe(false);
      expect(authStore.state.user).toBeNull();
      expect(authStore.state.subscription).toBeNull();
      expect(authStore.state.isLoading).toBe(false);
      expect(authStore.state.error).toBeNull();
      expect(authStore.state.isSuspended).toBe(false);
      expect(authStore.state.suspensionReason).toBeNull();
      expect(authStore.state.sessionRevoked).toBe(false);
    });
  });

  describe('handleUserSuspended()', () => {
    it('should set suspension state', async () => {
      await authStore.handleUserSuspended('Violation of terms');

      expect(authStore.state.isSuspended).toBe(true);
      expect(authStore.state.suspensionReason).toBe('Violation of terms');
      expect(authStore.state.isAuthenticated).toBe(false);
      expect(authStore.state.user).toBeNull();
      expect(authStore.state.subscription).toBeNull();
    });

    it('should call logout to clear tokens', async () => {
      await authStore.handleUserSuspended('Test reason');

      expect(authService.logout).toHaveBeenCalled();
    });

    it('should send notification via IPC', async () => {
      const ipcSend = vi.fn();
      (window as any).electronAPI = {
        ...window.electronAPI,
        ipc: { send: ipcSend },
      };

      await authStore.handleUserSuspended('Your account was suspended');

      expect(ipcSend).toHaveBeenCalledWith('show-notification', {
        title: 'Account Suspended',
        body: 'Your account was suspended',
      });
    });
  });

  describe('handleSessionRevoked()', () => {
    it('should set session revoked state', async () => {
      await authStore.handleSessionRevoked();

      expect(authStore.state.sessionRevoked).toBe(true);
      expect(authStore.state.isAuthenticated).toBe(false);
      expect(authStore.state.user).toBeNull();
      expect(authStore.state.subscription).toBeNull();
    });

    it('should call logout to clear tokens', async () => {
      await authStore.handleSessionRevoked();

      expect(authService.logout).toHaveBeenCalled();
    });

    it('should send notification via IPC', async () => {
      const ipcSend = vi.fn();
      (window as any).electronAPI = {
        ...window.electronAPI,
        ipc: { send: ipcSend },
      };

      await authStore.handleSessionRevoked();

      expect(ipcSend).toHaveBeenCalledWith('show-notification', {
        title: 'Session Terminated',
        body: 'Your session has been terminated. Please sign in again.',
      });
    });
  });

  describe('clearSuspension()', () => {
    it('should clear suspension state', async () => {
      // First suspend the user
      await authStore.handleUserSuspended('Test suspension');
      expect(authStore.state.isSuspended).toBe(true);

      // Then clear it
      authStore.clearSuspension();

      expect(authStore.state.isSuspended).toBe(false);
      expect(authStore.state.suspensionReason).toBeNull();
    });
  });

  describe('clearSessionRevoked()', () => {
    it('should clear session revoked state', async () => {
      // First revoke the session
      await authStore.handleSessionRevoked();
      expect(authStore.state.sessionRevoked).toBe(true);

      // Then clear it
      authStore.clearSessionRevoked();

      expect(authStore.state.sessionRevoked).toBe(false);
    });
  });

  describe('handleExpiredToken()', () => {
    it('should clear all auth state', async () => {
      await authStore.handleExpiredToken();

      expect(authStore.state.isAuthenticated).toBe(false);
      expect(authStore.state.user).toBeNull();
      expect(authStore.state.subscription).toBeNull();
      expect(authStore.state.isSuspended).toBe(false);
      expect(authStore.state.suspensionReason).toBeNull();
      expect(authStore.state.sessionRevoked).toBe(false);
    });

    it('should call logout to clear tokens', async () => {
      await authStore.handleExpiredToken();

      expect(authService.logout).toHaveBeenCalled();
    });

    it('should send notification via IPC', async () => {
      const ipcSend = vi.fn();
      (window as any).electronAPI = {
        ...window.electronAPI,
        ipc: { send: ipcSend },
      };

      await authStore.handleExpiredToken();

      expect(ipcSend).toHaveBeenCalledWith('show-notification', {
        title: 'Session Expired',
        body: 'Your session has expired. Please sign in again.',
      });
    });
  });

  describe('logout()', () => {
    it('should clear all state including suspension', async () => {
      // First suspend the user
      await authStore.handleUserSuspended('Test');

      // Then logout
      await authStore.logout();

      expect(authStore.state.isAuthenticated).toBe(false);
      expect(authStore.state.user).toBeNull();
      expect(authStore.state.subscription).toBeNull();
      expect(authStore.state.isSuspended).toBe(false);
      expect(authStore.state.suspensionReason).toBeNull();
      expect(authStore.state.sessionRevoked).toBe(false);
    });
  });

  describe('initialize()', () => {
    it('should subscribe to auth error events', async () => {
      await authStore.initialize();

      expect(onAuthError).toHaveBeenCalled();
    });
  });

  describe('computed properties', () => {
    it('should have canUseApp computed', () => {
      expect(authStore.canUseApp).toBeDefined();
      expect(authStore.canUseApp.value).toBe(false);
    });

    it('should have needsSubscription computed', () => {
      expect(authStore.needsSubscription).toBeDefined();
    });

    it('should have isActive computed', () => {
      expect(authStore.isActive).toBeDefined();
      expect(authStore.isActive.value).toBe(false);
    });
  });
});
