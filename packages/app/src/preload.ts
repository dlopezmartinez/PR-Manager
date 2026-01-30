import { contextBridge, ipcRenderer, webFrame } from 'electron';

export interface TokenValidationResult {
  valid: boolean;
  scopes: string[];
  missingScopes: string[];
  username?: string;
  error?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  ipc: {
    send: (channel: string, ...args: unknown[]) => {
      const validChannels = [
        'hide-window',
        'update-pr-count',
        'show-notification',
        'set-syncing',
        'open-external',
        'relaunch-app',
      ];

      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      } else {
        console.error(`Invalid IPC channel: ${channel}`);
      }
    },

    on: (channel: string, callback: (...args: unknown[]) => void) => {
      const validChannels = [
        'notification-fallback',
      ];

      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
        ipcRenderer.on(channel, (_, ...args) => callback(...args));
      } else {
        console.error(`Invalid IPC listen channel: ${channel}`);
      }
    },

    removeListener: (channel: string) => {
      const validChannels = [
        'notification-fallback',
      ];

      if (validChannels.includes(channel)) {
        ipcRenderer.removeAllListeners(channel);
      }
    },
  },

  shell: {
    openExternal: (url: string): Promise<void> => {
      ipcRenderer.send('open-external', url);
      return Promise.resolve();
    },
  },

  secureStorage: {
    get: (key: string): Promise<string | null> => {
      return ipcRenderer.invoke('secure-storage:get', key);
    },
    set: (key: string, value: string): Promise<boolean> => {
      return ipcRenderer.invoke('secure-storage:set', key, value);
    },
    delete: (key: string): Promise<boolean> => {
      return ipcRenderer.invoke('secure-storage:delete', key);
    },
    isAvailable: (): Promise<boolean> => {
      return ipcRenderer.invoke('secure-storage:is-available');
    },
  },

  validateToken: (
    provider: 'github' | 'gitlab',
    token: string,
    baseUrl?: string
  ): Promise<TokenValidationResult> => {
    return ipcRenderer.invoke('validate-token', provider, token, baseUrl);
  },

  zoom: {
    setZoomLevel: (level: number) => webFrame.setZoomLevel(level),
    getZoomLevel: () => webFrame.getZoomLevel(),
    setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
    getZoomFactor: () => webFrame.getZoomFactor(),
  },

  platform: process.platform,
  isElectron: true,

  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke('get-app-version');
  },

  auth: {
    getToken: (): Promise<string | null> => {
      return ipcRenderer.invoke('auth:get-token');
    },
    setToken: (token: string): Promise<boolean> => {
      return ipcRenderer.invoke('auth:set-token', token);
    },
    clearToken: (): Promise<boolean> => {
      return ipcRenderer.invoke('auth:clear-token');
    },
    getRefreshToken: (): Promise<string | null> => {
      return ipcRenderer.invoke('auth:get-refresh-token');
    },
    setRefreshToken: (token: string): Promise<boolean> => {
      return ipcRenderer.invoke('auth:set-refresh-token', token);
    },
    clearRefreshToken: (): Promise<boolean> => {
      return ipcRenderer.invoke('auth:clear-refresh-token');
    },
    getUser: (): Promise<{ id: string; email: string; name?: string } | null> => {
      return ipcRenderer.invoke('auth:get-user');
    },
    setUser: (user: { id: string; email: string; name?: string }): Promise<boolean> => {
      return ipcRenderer.invoke('auth:set-user', user);
    },
    initUpdateToken: (): Promise<boolean> => {
      return ipcRenderer.invoke('auth:init-update-token');
    },
  },

  // Keychain-specific APIs for macOS
  keychain: {
    // Check if credentials file exists (without triggering Keychain prompt)
    hasStoredCredentials: (): Promise<boolean> => {
      return ipcRenderer.invoke('keychain:has-stored-credentials');
    },
    // Verify Keychain access works (WILL trigger prompt if needed)
    verifyAccess: (): Promise<{ success: boolean; error?: string }> => {
      return ipcRenderer.invoke('keychain:verify-access');
    },
    // Check if encryption is available
    isEncryptionAvailable: (): Promise<boolean> => {
      return ipcRenderer.invoke('keychain:is-encryption-available');
    },
  },

  // Session tracking for sync requirements
  session: {
    // Get unique device ID (generated once, persists forever)
    getDeviceId: (): Promise<string> => {
      return ipcRenderer.invoke('session:get-device-id');
    },
    // Get accumulated usage time in seconds
    getUsageTime: (): Promise<number> => {
      return ipcRenderer.invoke('session:get-usage-time');
    },
    // Set accumulated usage time in seconds
    setUsageTime: (seconds: number): Promise<void> => {
      return ipcRenderer.invoke('session:set-usage-time', seconds);
    },
    // Reset usage time to 0
    resetUsageTime: (): Promise<void> => {
      return ipcRenderer.invoke('session:reset-usage-time');
    },
    // Get last successful sync timestamp
    getLastSyncAt: (): Promise<number | null> => {
      return ipcRenderer.invoke('session:get-last-sync-at');
    },
    // Set last successful sync timestamp
    setLastSyncAt: (timestamp: number): Promise<void> => {
      return ipcRenderer.invoke('session:set-last-sync-at', timestamp);
    },
    // Get device name for display
    getDeviceName: (): Promise<string> => {
      return ipcRenderer.invoke('session:get-device-name');
    },
  },

  // Update channel management
  updates: {
    // Get current update channel ('stable' or 'beta')
    getChannel: (): Promise<'stable' | 'beta'> => {
      return ipcRenderer.invoke('update-channel:get');
    },
    // Set update channel ('stable' or 'beta')
    setChannel: (channel: 'stable' | 'beta'): Promise<boolean> => {
      return ipcRenderer.invoke('update-channel:set', channel);
    },
    // Manually check for updates
    checkForUpdates: (): Promise<{
      updateAvailable: boolean;
      version?: string;
      channel?: string;
      isPrerelease?: boolean;
      error?: string;
      canAutoUpdate?: boolean;
    }> => {
      return ipcRenderer.invoke('check-for-updates');
    },
    // Get current update state
    getState: (): Promise<{
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
      version?: string;
      progress?: number;
      error?: string;
    }> => {
      return ipcRenderer.invoke('update-state:get');
    },
    // Install downloaded update (quits and restarts app)
    install: (): void => {
      ipcRenderer.invoke('update:install');
    },
    // Listen for update state changes
    onStateChange: (callback: (state: {
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
      version?: string;
      progress?: number;
      error?: string;
    }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: unknown) => {
        callback(state as Parameters<typeof callback>[0]);
      };
      ipcRenderer.on('auto-update-state', handler);
      // Return cleanup function
      return () => {
        ipcRenderer.removeListener('auto-update-state', handler);
      };
    },
  },
});

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface KeychainVerifyResult {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  ipc: {
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
    removeListener: (channel: string) => void;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  secureStorage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<boolean>;
    delete: (key: string) => Promise<boolean>;
    isAvailable: () => Promise<boolean>;
  };
  validateToken: (
    provider: 'github' | 'gitlab',
    token: string,
    baseUrl?: string
  ) => Promise<TokenValidationResult>;
  zoom: {
    setZoomLevel: (level: number) => void;
    getZoomLevel: () => number;
    setZoomFactor: (factor: number) => void;
    getZoomFactor: () => number;
  };
  platform: string;
  isElectron: boolean;
  getAppVersion: () => Promise<string>;
  auth: {
    getToken: () => Promise<string | null>;
    setToken: (token: string) => Promise<boolean>;
    clearToken: () => Promise<boolean>;
    getRefreshToken: () => Promise<string | null>;
    setRefreshToken: (token: string) => Promise<boolean>;
    clearRefreshToken: () => Promise<boolean>;
    getUser: () => Promise<AuthUser | null>;
    setUser: (user: AuthUser) => Promise<boolean>;
    initUpdateToken: () => Promise<boolean>;
  };
  keychain: {
    hasStoredCredentials: () => Promise<boolean>;
    verifyAccess: () => Promise<KeychainVerifyResult>;
    isEncryptionAvailable: () => Promise<boolean>;
  };
  session: {
    getDeviceId: () => Promise<string>;
    getUsageTime: () => Promise<number>;
    setUsageTime: (seconds: number) => Promise<void>;
    resetUsageTime: () => Promise<void>;
    getLastSyncAt: () => Promise<number | null>;
    setLastSyncAt: (timestamp: number) => Promise<void>;
    getDeviceName: () => Promise<string>;
  };
  updates: {
    getChannel: () => Promise<'stable' | 'beta'>;
    setChannel: (channel: 'stable' | 'beta') => Promise<boolean>;
    checkForUpdates: () => Promise<{
      updateAvailable: boolean;
      version?: string;
      channel?: string;
      isPrerelease?: boolean;
      error?: string;
      canAutoUpdate?: boolean;
    }>;
    getState: () => Promise<{
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
      version?: string;
      progress?: number;
      error?: string;
    }>;
    install: () => void;
    onStateChange: (callback: (state: {
      status: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
      version?: string;
      progress?: number;
      error?: string;
    }) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
