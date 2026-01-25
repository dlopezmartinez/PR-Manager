// PR Manager Desktop App - Main Process

// Handle Squirrel events on Windows (install, update, uninstall)
// This must be at the very top before any other code runs
if (process.platform === 'win32') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  if (require('electron-squirrel-startup')) process.exit(0);
}

import { initSentryMain } from './lib/sentry';
initSentryMain();

import { initAutoUpdater, setUpdateToken } from './lib/autoUpdater';

import { app, BrowserWindow, Tray, screen, Menu, ipcMain, shell, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createTrayIcon, createSyncingIconFrames } from './utils/trayIcon';
import {
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  APP_BUNDLE_ID,
  APP_NAME,
} from './utils/constants';
import {
  getWindowConfig,
  getNotificationConfig,
  shouldQuitOnAllWindowsClosed,
  supportsTrayTitle,
} from './utils/platform';
import {
  getSecureValue,
  setSecureValue,
  deleteSecureValue,
  isEncryptionAvailable,
} from './utils/secureStorage';
import { validateToken, TokenValidationResult } from './utils/tokenValidation';

const AUTH_TOKEN_KEY = 'pr-manager-auth-token';
const AUTH_REFRESH_TOKEN_KEY = 'pr-manager-auth-refresh-token';
const AUTH_USER_KEY = 'pr-manager-auth-user';

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_BUNDLE_ID);
}

let tray: Tray | null = null;
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let normalIcon: Electron.NativeImage | null = null;
let syncingFrames: Electron.NativeImage[] = [];
let syncingAnimationInterval: ReturnType<typeof setInterval> | null = null;
let currentSyncingFrame = 0;

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

function getWindowBoundsPath(): string {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

function loadWindowBounds(): WindowBounds | null {
  try {
    const boundsPath = getWindowBoundsPath();
    if (fs.existsSync(boundsPath)) {
      const data = fs.readFileSync(boundsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Ignore errors, use defaults
  }
  return null;
}

function saveWindowBounds(bounds: WindowBounds): void {
  try {
    const boundsPath = getWindowBoundsPath();
    fs.writeFileSync(boundsPath, JSON.stringify(bounds));
  } catch {
    // Ignore errors
  }
}

function isWindowAvailable(): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed();
}

function isTrayAvailable(): boolean {
  return tray !== null && !tray.isDestroyed();
}

function createWindow(): void {
  const windowConfig = getWindowConfig();
  const savedBounds = loadWindowBounds();

  const width = savedBounds?.width || WINDOW_WIDTH;
  const height = savedBounds?.height || WINDOW_HEIGHT;

  mainWindow = new BrowserWindow({
    width,
    height,
    show: false,
    frame: windowConfig.frame,
    ...(windowConfig.titleBarStyle && { titleBarStyle: windowConfig.titleBarStyle }),
    ...(windowConfig.trafficLightPosition && { trafficLightPosition: windowConfig.trafficLightPosition }),
    fullscreenable: true,
    resizable: windowConfig.resizable,
    transparent: false,
    skipTaskbar: windowConfig.skipTaskbar,
    alwaysOnTop: windowConfig.alwaysOnTop,
    minWidth: windowConfig.minWidth,
    minHeight: windowConfig.minHeight,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.on('resized', () => {
    if (isWindowAvailable()) {
      const bounds = mainWindow!.getBounds();
      saveWindowBounds(bounds);
    }
  });

  mainWindow.on('moved', () => {
    if (isWindowAvailable()) {
      const bounds = mainWindow!.getBounds();
      saveWindowBounds(bounds);
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    showWindowCentered();
  });
}

function toggleWindow(): void {
  if (!isWindowAvailable()) return;

  if (mainWindow!.isVisible()) {
    mainWindow!.hide();
  } else {
    showWindowCentered();
  }
}

function showWindowCentered(): void {
  if (!isWindowAvailable()) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const windowBounds = mainWindow!.getBounds();

  const x = Math.round((screenWidth - windowBounds.width) / 2);
  const y = Math.round((screenHeight - windowBounds.height) / 2);

  mainWindow!.setPosition(x, y, false);
  mainWindow!.show();
  mainWindow!.focus();

  mainWindow!.setAlwaysOnTop(true);
  mainWindow!.setAlwaysOnTop(false);
}

function createTray(): void {
  normalIcon = createTrayIcon();
  syncingFrames = createSyncingIconFrames(12);

  tray = new Tray(normalIcon);
  tray.setToolTip(APP_NAME);

  tray.on('click', () => {
    toggleWindow();
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => showWindowCentered() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.on('right-click', () => {
    if (isTrayAvailable()) tray!.popUpContextMenu(contextMenu);
  });
}

function setupIpcHandlers(): void {
  ipcMain.on('update-pr-count', (_, count: number) => {
    if (isTrayAvailable()) {
      if (supportsTrayTitle()) {
        tray!.setTitle(count > 0 ? ` ${count}` : '');
      }
      const tooltip = count > 0 ? `${APP_NAME} - ${count} PRs` : APP_NAME;
      tray!.setToolTip(tooltip);
    }
  });

  ipcMain.handle('secure-storage:get', (_, key: string) => {
    return getSecureValue(key);
  });

  ipcMain.handle('secure-storage:set', (_, key: string, value: string) => {
    return setSecureValue(key, value);
  });

  ipcMain.handle('secure-storage:delete', (_, key: string) => {
    return deleteSecureValue(key);
  });

  ipcMain.handle('secure-storage:is-available', () => {
    return isEncryptionAvailable();
  });

  ipcMain.handle('validate-token', async (
    _,
    provider: 'github' | 'gitlab',
    token: string,
    baseUrl?: string
  ): Promise<TokenValidationResult> => {
    return validateToken(provider, token, baseUrl);
  });

  ipcMain.handle('auth:get-token', async () => {
    return getSecureValue(AUTH_TOKEN_KEY);
  });

  ipcMain.handle('auth:set-token', async (_, token: string) => {
    setUpdateToken(token);
    return setSecureValue(AUTH_TOKEN_KEY, token);
  });

  ipcMain.handle('auth:clear-token', async () => {
    setUpdateToken(null);
    await deleteSecureValue(AUTH_TOKEN_KEY);
    await deleteSecureValue(AUTH_REFRESH_TOKEN_KEY);
    await deleteSecureValue(AUTH_USER_KEY);
    return true;
  });

  ipcMain.handle('auth:get-refresh-token', async () => {
    return getSecureValue(AUTH_REFRESH_TOKEN_KEY);
  });

  ipcMain.handle('auth:set-refresh-token', async (_, token: string) => {
    return setSecureValue(AUTH_REFRESH_TOKEN_KEY, token);
  });

  ipcMain.handle('auth:clear-refresh-token', async () => {
    await deleteSecureValue(AUTH_REFRESH_TOKEN_KEY);
    return true;
  });

  ipcMain.handle('auth:get-user', async () => {
    const userJson = await getSecureValue(AUTH_USER_KEY);
    if (userJson) {
      try {
        return JSON.parse(userJson);
      } catch {
        return null;
      }
    }
    return null;
  });

  ipcMain.handle('auth:set-user', async (_, user: { id: string; email: string; name?: string }) => {
    return setSecureValue(AUTH_USER_KEY, JSON.stringify(user));
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.on('hide-window', () => {
    if (isWindowAvailable()) mainWindow!.hide();
  });

  ipcMain.on('window-minimize', () => {
    if (isWindowAvailable()) mainWindow!.minimize();
  });

  ipcMain.on('window-toggle-maximize', () => {
    if (isWindowAvailable()) {
      if (mainWindow!.isMaximized()) {
        mainWindow!.unmaximize();
      } else {
        mainWindow!.maximize();
      }
    }
  });

  ipcMain.on('open-external', (_, url: string) => {
    if (url && typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
  });

  ipcMain.on('show-notification', (event, options: {
    title: string;
    body: string;
    subtitle?: string;
    url?: string;
  }) => {
    const notifConfig = getNotificationConfig();

    if (!Notification.isSupported()) {
      console.warn('Native notifications not supported on this platform');
      if (isWindowAvailable()) {
        mainWindow!.webContents.send('notification-fallback', options);
      }
      return;
    }

    try {
      const notificationOptions: Electron.NotificationConstructorOptions = {
        title: options.title,
        body: notifConfig.supportsSubtitle
          ? options.body
          : (options.subtitle ? `${options.subtitle}\n${options.body}` : options.body),
        silent: false,
      };

      if (notifConfig.supportsSubtitle && options.subtitle) {
        notificationOptions.subtitle = options.subtitle;
      }

      if (notifConfig.requiresIcon) {
        const iconPath = app.isPackaged
          ? path.join(process.resourcesPath, 'icon.png')
          : path.join(__dirname, '../../assets/icon.png');

        if (fs.existsSync(iconPath)) {
          notificationOptions.icon = iconPath;
        } else {
          console.warn('Notification icon not found at:', iconPath);
        }
      }

      const notification = new Notification(notificationOptions);

      notification.on('click', () => {
        if (options.url) {
          shell.openExternal(options.url);
        }
        showWindowCentered();
      });

      notification.on('failed', (_, error) => {
        console.error('Notification failed:', error);
        if (isWindowAvailable()) {
          mainWindow!.webContents.send('notification-fallback', options);
        }
      });

      notification.show();
    } catch (error) {
      console.error('Error showing notification:', error);
      if (isWindowAvailable()) {
        mainWindow!.webContents.send('notification-fallback', options);
      }
    }
  });

  ipcMain.on('set-syncing', (_, isSyncing: boolean) => {
    if (!isTrayAvailable()) return;

    if (isSyncing) {
      if (!syncingAnimationInterval && syncingFrames.length > 0) {
        currentSyncingFrame = 0;
        tray!.setImage(syncingFrames[0]);

        syncingAnimationInterval = setInterval(() => {
          currentSyncingFrame = (currentSyncingFrame + 1) % syncingFrames.length;
          if (isTrayAvailable()) tray!.setImage(syncingFrames[currentSyncingFrame]);
        }, 80);
      }
    } else {
      if (syncingAnimationInterval) {
        clearInterval(syncingAnimationInterval);
        syncingAnimationInterval = null;
      }
      if (normalIcon && isTrayAvailable()) {
        tray!.setImage(normalIcon);
      }
    }
  });
}

function cleanup(): void {
  if (syncingAnimationInterval) {
    clearInterval(syncingAnimationInterval);
    syncingAnimationInterval = null;
  }

  if (isTrayAvailable()) {
    tray!.destroy();
  }
  tray = null;

  if (isWindowAvailable()) {
    try {
      if (mainWindow!.webContents && !mainWindow!.webContents.isDestroyed()) {
        if (mainWindow!.webContents.isDevToolsOpened()) {
          mainWindow!.webContents.closeDevTools();
        }
      }
      mainWindow!.destroy();
    } catch {
      // Window may already be destroyed, ignore errors
    }
  }
  mainWindow = null;

  normalIcon = null;
  syncingFrames = [];
}

app.on('ready', async () => {
  createWindow();
  createTray();
  setupIpcHandlers();

  initAutoUpdater(mainWindow);

  const storedToken = await getSecureValue(AUTH_TOKEN_KEY);
  if (storedToken) {
    setUpdateToken(storedToken);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  cleanup();
});

app.on('will-quit', () => {
  cleanup();
});

app.on('window-all-closed', () => {
  if (shouldQuitOnAllWindowsClosed()) {
    app.quit();
  }
});

app.on('activate', () => {
  if (process.platform === 'darwin') {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (isWindowAvailable()) {
      showWindowCentered();
    }
  }
});
