/**
 * Tests for usePolling composable
 * Tests polling mechanism interface and basic behavior
 *
 * Note: Full integration testing of watchers and lifecycle hooks
 * should be done in component integration tests where Vue's
 * reactivity system is properly initialized.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original window/document methods
const originalWindowAddEventListener = window.addEventListener;
const originalWindowRemoveEventListener = window.removeEventListener;
const originalDocumentAddEventListener = document.addEventListener;
const originalDocumentRemoveEventListener = document.removeEventListener;

// Mock the config store
vi.mock('../../src/stores/configStore', () => ({
  configStore: {
    pollingEnabled: true,
    pollingInterval: 60,
    backgroundPolling: true,
  },
}));

// Mock the logger
vi.mock('../../src/utils/logger', () => ({
  pollingLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the constants
vi.mock('../../src/utils/constants', () => ({
  COUNTDOWN_UPDATE_INTERVAL_MS: 1000,
}));

describe('usePolling', () => {
  let usePolling: typeof import('../../src/composables/usePolling').usePolling;
  let configStore: typeof import('../../src/stores/configStore').configStore;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();

    // Ensure window/document event listeners work
    window.addEventListener = originalWindowAddEventListener || vi.fn();
    window.removeEventListener = originalWindowRemoveEventListener || vi.fn();
    document.addEventListener = originalDocumentAddEventListener || vi.fn();
    document.removeEventListener = originalDocumentRemoveEventListener || vi.fn();

    // Re-import to get fresh state
    const pollingModule = await import('../../src/composables/usePolling');
    usePolling = pollingModule.usePolling;

    const configModule = await import('../../src/stores/configStore');
    configStore = configModule.configStore;

    // Reset config defaults
    configStore.pollingEnabled = true;
    configStore.pollingInterval = 60;
    configStore.backgroundPolling = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should return polling control functions', () => {
      const onPoll = vi.fn();
      const result = usePolling({ onPoll });

      expect(result.isPolling).toBeDefined();
      expect(result.lastPollTime).toBeDefined();
      expect(result.nextPollIn).toBeDefined();
      expect(result.startPolling).toBeInstanceOf(Function);
      expect(result.stopPolling).toBeInstanceOf(Function);
      expect(result.restartPolling).toBeInstanceOf(Function);
      expect(result.pollNow).toBeInstanceOf(Function);
    });

    it('should start with polling disabled', () => {
      const onPoll = vi.fn();
      const { isPolling } = usePolling({ onPoll });

      expect(isPolling.value).toBe(false);
    });

    it('should accept polling options', () => {
      const onPoll = vi.fn();
      // Should not throw when passing options
      expect(() => {
        usePolling({ onPoll, immediate: true, pollTimeout: 5000 });
      }).not.toThrow();
    });
  });

  describe('startPolling', () => {
    it('should set isPolling to true', () => {
      const onPoll = vi.fn();
      const { isPolling, startPolling } = usePolling({ onPoll });

      startPolling();

      expect(isPolling.value).toBe(true);
    });

    it('should not start if polling is disabled in config', () => {
      configStore.pollingEnabled = false;
      const onPoll = vi.fn();
      const { isPolling, startPolling } = usePolling({ onPoll });

      startPolling();

      expect(isPolling.value).toBe(false);
    });

    it('should not call onPoll immediately if immediate option is false', () => {
      const onPoll = vi.fn();
      const { startPolling } = usePolling({ onPoll, immediate: false });

      startPolling();

      expect(onPoll).not.toHaveBeenCalled();
    });
  });

  describe('stopPolling', () => {
    it('should set isPolling to false', () => {
      const onPoll = vi.fn();
      const { isPolling, startPolling, stopPolling } = usePolling({ onPoll });

      startPolling();
      expect(isPolling.value).toBe(true);

      stopPolling();
      expect(isPolling.value).toBe(false);
    });

    it('should reset countdown to 0', () => {
      const onPoll = vi.fn();
      const { nextPollIn, startPolling, stopPolling } = usePolling({ onPoll });

      startPolling();
      stopPolling();

      expect(nextPollIn.value).toBe(0);
    });
  });

  describe('restartPolling', () => {
    it('should restart polling when enabled', () => {
      const onPoll = vi.fn();
      const { isPolling, startPolling, restartPolling } = usePolling({ onPoll });

      startPolling();
      expect(isPolling.value).toBe(true);

      restartPolling();

      // Should still be polling after restart
      expect(isPolling.value).toBe(true);
    });
  });

  describe('pollNow', () => {
    it('should not poll if disabled', async () => {
      configStore.pollingEnabled = false;
      const onPoll = vi.fn();
      const { pollNow } = usePolling({ onPoll });

      await pollNow();

      expect(onPoll).not.toHaveBeenCalled();
    });

    it('should execute poll when enabled', async () => {
      const onPoll = vi.fn().mockResolvedValue(undefined);
      const { startPolling, pollNow } = usePolling({ onPoll });

      startPolling();
      await pollNow();

      expect(onPoll).toHaveBeenCalled();
    });
  });

  describe('lastPollTime', () => {
    it('should initialize lastPollTime when starting polling', () => {
      const onPoll = vi.fn();
      const { lastPollTime, startPolling } = usePolling({ onPoll });

      expect(lastPollTime.value).toBeNull();

      startPolling();
      // lastPollTime is set when starting to make countdown work
      expect(lastPollTime.value).not.toBeNull();
    });
  });

  describe('countdown', () => {
    it('should initialize countdown to interval', () => {
      const onPoll = vi.fn();
      const { nextPollIn, startPolling } = usePolling({ onPoll });

      startPolling();

      // Initial countdown should be the interval (60 seconds)
      expect(nextPollIn.value).toBe(60);
    });
  });

  describe('error handling', () => {
    it('should handle poll errors gracefully', async () => {
      const onPoll = vi.fn().mockRejectedValue(new Error('Poll failed'));
      const { startPolling, pollNow } = usePolling({ onPoll });

      startPolling();

      // Should not throw
      await expect(pollNow()).resolves.not.toThrow();
    });
  });
});
