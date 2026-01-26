export function isElectron(): boolean {
  return typeof window !== 'undefined' &&
         'electronAPI' in window &&
         window.electronAPI?.isElectron === true;
}

function getElectronAPI() {
  if (!isElectron()) {
    throw new Error('Not running in Electron environment');
  }
  return window.electronAPI;
}

export function sendIpc(channel: string, ...args: unknown[]): void {
  getElectronAPI().ipc.send(channel, ...args);
}

export function onIpcEvent(channel: string, callback: (...args: unknown[]) => void): void {
  if (!isElectron()) {
    return;
  }
  getElectronAPI().ipc.on(channel, callback);
}

export function removeIpcListener(channel: string): void {
  if (!isElectron()) {
    return;
  }
  getElectronAPI().ipc.removeListener(channel);
}

export function openExternal(url: string): Promise<void> {
  return getElectronAPI().shell.openExternal(url);
}

export function hideWindow(): void {
  sendIpc('hide-window');
}

export function updatePrCount(count: number): void {
  sendIpc('update-pr-count', count);
}

export function showNotification(options: {
  title: string;
  body: string;
  subtitle?: string;
  url?: string;
}): void {
  sendIpc('show-notification', options);
}

export function setSyncing(isSyncing: boolean): void {
  sendIpc('set-syncing', isSyncing);
}

export function getPlatform(): string {
  if (!isElectron()) {
    return 'web';
  }
  return getElectronAPI().platform;
}

export function setZoomLevel(level: number): void {
  getElectronAPI().zoom.setZoomLevel(level);
}

export function getZoomLevel(): number {
  return getElectronAPI().zoom.getZoomLevel();
}

export function setZoomFactor(factor: number): void {
  getElectronAPI().zoom.setZoomFactor(factor);
}

export function getZoomFactor(): number {
  return getElectronAPI().zoom.getZoomFactor();
}

export async function getSecureValue(key: string): Promise<string | null> {
  if (!isElectron()) {
    return localStorage.getItem(`secure_${key}`);
  }
  return getElectronAPI().secureStorage.get(key);
}

export async function setSecureValue(key: string, value: string): Promise<boolean> {
  if (!isElectron()) {
    localStorage.setItem(`secure_${key}`, value);
    return true;
  }
  return getElectronAPI().secureStorage.set(key, value);
}

export async function deleteSecureValue(key: string): Promise<boolean> {
  if (!isElectron()) {
    localStorage.removeItem(`secure_${key}`);
    return true;
  }
  return getElectronAPI().secureStorage.delete(key);
}

export async function isSecureStorageAvailable(): Promise<boolean> {
  if (!isElectron()) {
    return false;
  }
  return getElectronAPI().secureStorage.isAvailable();
}

export interface TokenValidationResult {
  valid: boolean;
  scopes: string[];
  missingScopes: string[];
  username?: string;
  error?: string;
}

export async function validateToken(
  provider: 'github' | 'gitlab',
  token: string,
  baseUrl?: string
): Promise<TokenValidationResult> {
  if (!isElectron()) {
    return validateTokenFallback(provider, token, baseUrl);
  }
  return getElectronAPI().validateToken(provider, token, baseUrl);
}

async function validateTokenFallback(
  provider: 'github' | 'gitlab',
  token: string,
  baseUrl?: string
): Promise<TokenValidationResult> {
  try {
    if (provider === 'github') {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        return {
          valid: false,
          scopes: [],
          missingScopes: ['repo'],
          error: response.status === 401 ? 'Invalid token' : 'Token validation failed',
        };
      }

      const data = await response.json();
      const scopes = response.headers.get('X-OAuth-Scopes')?.split(',').map(s => s.trim()) || [];

      return {
        valid: scopes.includes('repo') || scopes.length === 0,
        scopes,
        missingScopes: scopes.includes('repo') || scopes.length === 0 ? [] : ['repo'],
        username: data.login,
      };
    } else {
      const endpoint = baseUrl ? `${baseUrl}/api/v4/user` : 'https://gitlab.com/api/v4/user';
      const response = await fetch(endpoint, {
        headers: { 'PRIVATE-TOKEN': token },
      });

      if (!response.ok) {
        return {
          valid: false,
          scopes: [],
          missingScopes: ['api'],
          error: response.status === 401 ? 'Invalid token' : 'Token validation failed',
        };
      }

      const data = await response.json();
      return {
        valid: true,
        scopes: ['unknown'],
        missingScopes: [],
        username: data.username,
      };
    }
  } catch (error) {
    return {
      valid: false,
      scopes: [],
      missingScopes: provider === 'github' ? ['repo'] : ['api'],
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

export async function getAppVersion(): Promise<string> {
  if (!isElectron()) {
    return 'dev';
  }
  return getElectronAPI().getAppVersion();
}

export async function initUpdateToken(): Promise<boolean> {
  if (!isElectron()) {
    return true;
  }
  return getElectronAPI().auth.initUpdateToken();
}
