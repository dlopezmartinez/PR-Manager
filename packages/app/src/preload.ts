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
  },
});

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
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
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
