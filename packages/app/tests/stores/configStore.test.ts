/**
 * Tests for configStore.ts
 * Tests configuration management and secure storage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { electronAPIMock } from '../setup';

// We need to reset modules before importing to get fresh state
let configStore: typeof import('../../src/stores/configStore');

describe('configStore', () => {
  beforeEach(async () => {
    // Clear localStorage
    localStorage.clear();

    // Reset mocks
    vi.clearAllMocks();
    electronAPIMock.secureStorage.get.mockResolvedValue(null);
    electronAPIMock.secureStorage.set.mockResolvedValue(true);
    electronAPIMock.secureStorage.delete.mockResolvedValue(true);

    // Reset modules to get fresh store state
    vi.resetModules();

    // Re-import the store
    configStore = await import('../../src/stores/configStore');
  });

  describe('default config', () => {
    it('should have default provider type as github', () => {
      expect(configStore.configStore.providerType).toBe('github');
    });

    it('should have default theme as system', () => {
      expect(configStore.configStore.theme).toBe('system');
    });

    it('should have polling enabled by default', () => {
      expect(configStore.configStore.pollingEnabled).toBe(true);
    });

    it('should have default polling interval of 60 seconds', () => {
      expect(configStore.configStore.pollingInterval).toBe(60);
    });

    it('should have notifications enabled by default', () => {
      expect(configStore.configStore.notificationsEnabled).toBe(true);
    });

    it('should have showComments enabled by default', () => {
      expect(configStore.configStore.showComments).toBe(true);
    });

    it('should have showChecks enabled by default', () => {
      expect(configStore.configStore.showChecks).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should update config properties', () => {
      configStore.updateConfig({ theme: 'dark' });
      expect(configStore.configStore.theme).toBe('dark');
    });

    it('should update multiple properties at once', () => {
      configStore.updateConfig({
        theme: 'light',
        pollingInterval: 120,
        notificationsEnabled: false,
      });

      expect(configStore.configStore.theme).toBe('light');
      expect(configStore.configStore.pollingInterval).toBe(120);
      expect(configStore.configStore.notificationsEnabled).toBe(false);
    });

    it('should persist to localStorage', async () => {
      configStore.updateConfig({ username: 'testuser' });

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const stored = localStorage.getItem('pr-manager-config');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.username).toBe('testuser');
    });
  });

  describe('isConfigured', () => {
    it('should return false when API key is not set', () => {
      expect(configStore.isConfigured()).toBe(false);
    });

    it('should return true when API key is loaded', async () => {
      electronAPIMock.secureStorage.get.mockResolvedValue('test-api-key');
      await configStore.loadApiKey();
      expect(configStore.isConfigured()).toBe(true);
    });
  });

  describe('loadApiKey', () => {
    it('should load API key from secure storage', async () => {
      electronAPIMock.secureStorage.get.mockResolvedValue('my-secret-key');

      const result = await configStore.loadApiKey();

      expect(result).toBe('my-secret-key');
      expect(electronAPIMock.secureStorage.get).toHaveBeenCalledWith('api-key');
    });

    it('should return empty string if no key stored', async () => {
      electronAPIMock.secureStorage.get.mockResolvedValue(null);

      const result = await configStore.loadApiKey();

      expect(result).toBe('');
    });

    it('should handle errors gracefully', async () => {
      electronAPIMock.secureStorage.get.mockRejectedValue(new Error('Storage error'));

      const result = await configStore.loadApiKey();

      expect(result).toBe('');
    });

    it('should migrate API key from localStorage if exists', async () => {
      // Set up old-style config with apiKey in localStorage
      localStorage.setItem('pr-manager-config', JSON.stringify({
        apiKey: 'old-api-key',
        providerType: 'github',
      }));

      electronAPIMock.secureStorage.get.mockResolvedValue(null);

      await configStore.loadApiKey();

      // Should have migrated to secure storage
      expect(electronAPIMock.secureStorage.set).toHaveBeenCalledWith('api-key', 'old-api-key');

      // Should have removed from localStorage
      const stored = localStorage.getItem('pr-manager-config');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.apiKey).toBeUndefined();
      }
    });
  });

  describe('saveApiKey', () => {
    it('should save API key to secure storage', async () => {
      const result = await configStore.saveApiKey('new-api-key');

      expect(result).toBe(true);
      expect(electronAPIMock.secureStorage.set).toHaveBeenCalledWith('api-key', 'new-api-key');
    });

    it('should update cached value on success', async () => {
      await configStore.saveApiKey('cached-key');
      expect(configStore.getApiKey()).toBe('cached-key');
    });

    it('should return false on failure', async () => {
      electronAPIMock.secureStorage.set.mockResolvedValue(false);

      const result = await configStore.saveApiKey('fail-key');

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      electronAPIMock.secureStorage.set.mockRejectedValue(new Error('Storage error'));

      const result = await configStore.saveApiKey('error-key');

      expect(result).toBe(false);
    });
  });

  describe('clearApiKey', () => {
    it('should clear API key from secure storage', async () => {
      // First save a key
      await configStore.saveApiKey('to-clear');

      const result = await configStore.clearApiKey();

      expect(result).toBe(true);
      expect(electronAPIMock.secureStorage.delete).toHaveBeenCalledWith('api-key');
    });

    it('should clear cached value on success', async () => {
      await configStore.saveApiKey('to-clear');
      await configStore.clearApiKey();

      expect(configStore.getApiKey()).toBe('');
    });
  });

  describe('getApiKey', () => {
    it('should return cached API key', async () => {
      await configStore.saveApiKey('cached-value');
      expect(configStore.getApiKey()).toBe('cached-value');
    });

    it('should return empty string if not loaded', () => {
      expect(configStore.getApiKey()).toBe('');
    });
  });

  describe('isApiKeyReady', () => {
    it('should return false before loading', () => {
      expect(configStore.isApiKeyReady()).toBe(false);
    });

    it('should return true after loading', async () => {
      await configStore.loadApiKey();
      expect(configStore.isApiKeyReady()).toBe(true);
    });
  });

  describe('resetConfig', () => {
    it('should reset all config to defaults', async () => {
      // Change some values
      configStore.updateConfig({
        theme: 'dark',
        pollingInterval: 300,
        username: 'testuser',
      });
      await configStore.saveApiKey('to-reset');

      // Reset
      await configStore.resetConfig();

      expect(configStore.configStore.theme).toBe('system');
      expect(configStore.configStore.pollingInterval).toBe(60);
      expect(configStore.configStore.username).toBe('');
      expect(electronAPIMock.secureStorage.delete).toHaveBeenCalled();
    });

    it('should clear localStorage', async () => {
      configStore.updateConfig({ username: 'test' });
      await new Promise(resolve => setTimeout(resolve, 350));

      await configStore.resetConfig();

      const stored = localStorage.getItem('pr-manager-config');
      expect(stored).toBeNull();
    });
  });

  describe('initializeConfig', () => {
    it('should load API key on initialization', async () => {
      electronAPIMock.secureStorage.get.mockResolvedValue('init-key');

      await configStore.initializeConfig();

      expect(configStore.getApiKey()).toBe('init-key');
      expect(configStore.isApiKeyReady()).toBe(true);
    });
  });

  describe('provider configuration', () => {
    it('should support github provider', () => {
      configStore.updateConfig({ providerType: 'github' });
      expect(configStore.configStore.providerType).toBe('github');
    });

    it('should support gitlab provider', () => {
      configStore.updateConfig({ providerType: 'gitlab' });
      expect(configStore.configStore.providerType).toBe('gitlab');
    });

    it('should allow setting gitlab URL for self-hosted', () => {
      configStore.updateConfig({
        providerType: 'gitlab',
        gitlabUrl: 'https://gitlab.mycompany.com',
      });

      expect(configStore.configStore.gitlabUrl).toBe('https://gitlab.mycompany.com');
    });
  });

  describe('display preferences', () => {
    it('should toggle comments visibility', () => {
      configStore.updateConfig({ showComments: false });
      expect(configStore.configStore.showComments).toBe(false);

      configStore.updateConfig({ showComments: true });
      expect(configStore.configStore.showComments).toBe(true);
    });

    it('should toggle checks visibility', () => {
      configStore.updateConfig({ showChecks: false });
      expect(configStore.configStore.showChecks).toBe(false);
    });

    it('should toggle expansion settings', () => {
      configStore.updateConfig({ allowCommentsExpansion: false });
      expect(configStore.configStore.allowCommentsExpansion).toBe(false);

      configStore.updateConfig({ allowChecksExpansion: false });
      expect(configStore.configStore.allowChecksExpansion).toBe(false);
    });
  });

  describe('notification preferences', () => {
    it('should toggle notification settings', () => {
      configStore.updateConfig({ notificationsEnabled: false });
      expect(configStore.configStore.notificationsEnabled).toBe(false);

      configStore.updateConfig({ notifyOnNewPR: false });
      expect(configStore.configStore.notifyOnNewPR).toBe(false);

      configStore.updateConfig({ notifyOnNewComments: false });
      expect(configStore.configStore.notifyOnNewComments).toBe(false);
    });
  });

  describe('polling preferences', () => {
    it('should toggle polling', () => {
      configStore.updateConfig({ pollingEnabled: false });
      expect(configStore.configStore.pollingEnabled).toBe(false);
    });

    it('should update polling interval', () => {
      configStore.updateConfig({ pollingInterval: 180 });
      expect(configStore.configStore.pollingInterval).toBe(180);
    });

    it('should toggle background polling', () => {
      configStore.updateConfig({ backgroundPolling: false });
      expect(configStore.configStore.backgroundPolling).toBe(false);
    });
  });

  describe('write permissions', () => {
    it('should have write permissions enabled by default', () => {
      expect(configStore.configStore.hasWritePermissions).toBe(true);
    });

    it('should allow disabling write permissions', () => {
      configStore.updateConfig({ hasWritePermissions: false });
      expect(configStore.configStore.hasWritePermissions).toBe(false);
    });

    it('should persist write permissions to localStorage', async () => {
      configStore.updateConfig({ hasWritePermissions: false });

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const stored = localStorage.getItem('pr-manager-config');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.hasWritePermissions).toBe(false);
    });
  });

  describe('insecure storage mode', () => {
    it('should have insecure storage disabled by default', () => {
      expect(configStore.configStore.useInsecureStorage).toBe(false);
    });

    it('should allow enabling insecure storage', () => {
      configStore.updateConfig({ useInsecureStorage: true });
      expect(configStore.configStore.useInsecureStorage).toBe(true);
    });

    it('should persist insecure storage setting', async () => {
      configStore.updateConfig({ useInsecureStorage: true });

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const stored = localStorage.getItem('pr-manager-config');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.useInsecureStorage).toBe(true);
    });
  });
});
