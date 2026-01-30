// PR Manager Desktop App - Main Process

// =============================================================================
// SQUIRREL WINDOWS EVENT HANDLING
// This MUST be at the very top, before any other code runs.
// Squirrel passes special command-line arguments during install/update/uninstall.
// =============================================================================
if (process.platform === 'win32') {
  const squirrelEvent = process.argv[1];

  if (squirrelEvent?.startsWith('--squirrel-')) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');

    const appFolder = path.resolve(process.execPath, '..');
    const rootFolder = path.resolve(appFolder, '..');
    const updateExe = path.join(rootFolder, 'Update.exe');
    const exeName = path.basename(process.execPath);

    const runUpdateExe = (args: string[]): Promise<void> => {
      return new Promise((resolve) => {
        const child = spawn(updateExe, args, { detached: true });
        child.on('close', () => resolve());
      });
    };

    const handleSquirrelEvent = async (): Promise<boolean> => {
      switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
          // Create desktop and start menu shortcuts
          await runUpdateExe([
            '--createShortcut',
            exeName,
            '--shortcut-locations',
            'Desktop,StartMenu'
          ]);
          return true;

        case '--squirrel-uninstall':
          // Remove shortcuts
          await runUpdateExe([
            '--removeShortcut',
            exeName,
            '--shortcut-locations',
            'Desktop,StartMenu'
          ]);
          return true;

        case '--squirrel-obsolete':
          // Called on the old version when updating to a new version
          return true;

        default:
          return false;
      }
    };

    handleSquirrelEvent().then((shouldQuit) => {
      if (shouldQuit) {
        process.exit(0);
      }
    });

    // Exit immediately for squirrel events - don't continue loading the app
    if (squirrelEvent !== '--squirrel-firstrun') {
      // For install/update/uninstall, we need to exit
      // The promise above will handle the actual exit after shortcuts are created
      // But we need to prevent the rest of the app from loading
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('electron').app.quit();
    }
  }
}

import { initSentryMain, captureException, captureMessage } from './lib/sentry';
initSentryMain();

import { mainLogger } from './utils/logger';

// =============================================================================
// GLOBAL ERROR HANDLERS - Capture all uncaught errors and send to Sentry
// =============================================================================
process.on('uncaughtException', (error: Error) => {
  mainLogger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  captureException(error, { context: 'uncaughtException', fatal: true });
});

process.on('unhandledRejection', (reason: unknown) => {
  mainLogger.error('Unhandled Rejection', { reason: String(reason) });
  const error = reason instanceof Error ? reason : new Error(String(reason));
  captureException(error, { context: 'unhandledRejection' });
});

import {
  initAutoUpdater,
  setUpdateToken,
  getUpdateChannel,
  setUpdateChannel,
  checkForUpdatesManually,
  getUpdateState,
  installUpdate,
  type UpdateChannel,
} from './lib/autoUpdater';

import { app, BrowserWindow, Tray, screen, Menu, ipcMain, shell, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
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
  isMac,
} from './utils/platform';
import {
  getSecureValue,
  setSecureValue,
  deleteSecureValue,
  isEncryptionAvailable,
  hasStoredCredentials,
  verifyKeychainAccess,
} from './utils/secureStorage';
import { validateToken, TokenValidationResult } from './utils/tokenValidation';

const AUTH_TOKEN_KEY = 'pr-manager-auth-token';
const AUTH_REFRESH_TOKEN_KEY = 'pr-manager-auth-refresh-token';
const AUTH_USER_KEY = 'pr-manager-auth-user';

// Session tracking keys
const SESSION_DEVICE_ID_KEY = 'pr-manager-device-id';
const SESSION_USAGE_TIME_KEY = 'pr-manager-usage-time';
const SESSION_LAST_SYNC_KEY = 'pr-manager-last-sync';

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

function isNativeImageValid(image: Electron.NativeImage | null): boolean {
  return image !== null && !image.isEmpty();
}

function safeSetTrayImage(image: Electron.NativeImage | null): void {
  if (!isTrayAvailable() || !isNativeImageValid(image)) return;
  try {
    tray!.setImage(image!);
  } catch (error) {
    mainLogger.error('Failed to set tray image', { error: (error as Error).message });
    captureException(error as Error, { context: 'safeSetTrayImage' });
    // Try to recreate the icon
    try {
      normalIcon = createTrayIcon();
      syncingFrames = createSyncingIconFrames(12);
      if (isNativeImageValid(normalIcon)) {
        tray!.setImage(normalIcon!);
      }
    } catch (recreateError) {
      mainLogger.error('Failed to recreate tray icon', { error: (recreateError as Error).message });
      captureException(recreateError as Error, { context: 'safeSetTrayImage:recreate' });
    }
  }
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
      // On macOS, hide from Dock when window is closed (but keep process alive in menu bar)
      if (isMac) {
        app.dock?.hide();
      }
    }
  });

  mainWindow.once('ready-to-show', () => {
    showWindowCentered();
  });

  // Critical: log renderer crashes to Sentry
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    mainLogger.error('Renderer process gone', { reason: details.reason, exitCode: details.exitCode });
    captureMessage(`Renderer process gone: ${details.reason}`, 'error');
    captureException(new Error(`Renderer crashed: ${details.reason}`), {
      context: 'render-process-gone',
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });

  mainWindow.webContents.on('unresponsive', () => {
    mainLogger.error('Renderer became unresponsive');
    captureMessage('Renderer became unresponsive', 'warning');
  });

  mainWindow.webContents.on('responsive', () => {
    mainLogger.info('Renderer became responsive again');
  });
}

function toggleWindow(): void {
  if (!isWindowAvailable()) return;

  if (mainWindow!.isVisible()) {
    mainWindow!.hide();
    // On macOS, hide from Dock when window is hidden via toggle
    if (isMac) {
      app.dock?.hide();
    }
  } else {
    showWindowCentered();
  }
}

function showWindowCentered(): void {
  if (!isWindowAvailable()) return;

  // On macOS, show in Dock when window is shown
  if (isMac) {
    app.dock?.show();
  }

  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const windowBounds = mainWindow!.getBounds();

    // Validate that we have valid dimensions before calculating position
    if (
      typeof screenWidth === 'number' && !isNaN(screenWidth) &&
      typeof screenHeight === 'number' && !isNaN(screenHeight) &&
      typeof windowBounds.width === 'number' && !isNaN(windowBounds.width) &&
      typeof windowBounds.height === 'number' && !isNaN(windowBounds.height)
    ) {
      const x = Math.round((screenWidth - windowBounds.width) / 2);
      const y = Math.round((screenHeight - windowBounds.height) / 2);

      // Additional validation to ensure x and y are valid integers
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        mainWindow!.setPosition(x, y, false);
      } else {
        mainLogger.warn('Invalid position calculated, showing without centering');
      }
    } else {
      mainLogger.warn('Invalid screen or window bounds, showing without centering');
    }
  } catch (error) {
    mainLogger.error('Error calculating window position', { error: (error as Error).message });
    // Continue to show the window even if centering fails
  }

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
    try {
      toggleWindow();
    } catch (error) {
      mainLogger.error('Error in tray click handler', { error: (error as Error).message });
      captureException(error as Error, { context: 'tray:click' });
    }
  });

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => showWindowCentered() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.on('right-click', () => {
    try {
      if (isTrayAvailable()) tray!.popUpContextMenu(contextMenu);
    } catch (error) {
      mainLogger.error('Error in tray right-click handler', { error: (error as Error).message });
      captureException(error as Error, { context: 'tray:right-click' });
    }
  });
}

function setupIpcHandlers(): void {
  ipcMain.on('update-pr-count', (_, count: number) => {
    if (isTrayAvailable()) {
      try {
        if (supportsTrayTitle()) {
          tray!.setTitle(count > 0 ? ` ${count}` : '');
        }
        const tooltip = count > 0 ? `${APP_NAME} - ${count} PRs` : APP_NAME;
        tray!.setToolTip(tooltip);
      } catch (error) {
        mainLogger.error('Error updating tray count', { error: (error as Error).message });
        captureException(error as Error, { context: 'tray:update-pr-count' });
      }
    }
  });

  ipcMain.handle('secure-storage:get', async (_, key: string) => {
    try {
      return await getSecureValue(key);
    } catch (error) {
      mainLogger.error('secure-storage:get error', { key, error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:secure-storage:get', key });
      throw error;
    }
  });

  ipcMain.handle('secure-storage:set', async (_, key: string, value: string) => {
    try {
      return await setSecureValue(key, value);
    } catch (error) {
      mainLogger.error('secure-storage:set error', { key, error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:secure-storage:set', key });
      throw error;
    }
  });

  ipcMain.handle('secure-storage:delete', async (_, key: string) => {
    try {
      return await deleteSecureValue(key);
    } catch (error) {
      mainLogger.error('secure-storage:delete error', { key, error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:secure-storage:delete', key });
      throw error;
    }
  });

  ipcMain.handle('secure-storage:is-available', () => {
    try {
      return isEncryptionAvailable();
    } catch (error) {
      mainLogger.error('secure-storage:is-available error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:secure-storage:is-available' });
      return false;
    }
  });

  ipcMain.handle('validate-token', async (
    _,
    provider: 'github' | 'gitlab',
    token: string,
    baseUrl?: string
  ): Promise<TokenValidationResult> => {
    try {
      return await validateToken(provider, token, baseUrl);
    } catch (error) {
      mainLogger.error('validate-token error', { provider, error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:validate-token', provider });
      return { valid: false, scopes: [], missingScopes: [], error: 'Validation failed' };
    }
  });

  ipcMain.handle('auth:get-token', async () => {
    try {
      return await getSecureValue(AUTH_TOKEN_KEY);
    } catch (error) {
      mainLogger.error('auth:get-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:get-token' });
      return null;
    }
  });

  ipcMain.handle('auth:init-update-token', async () => {
    try {
      // Called by renderer on macOS after showing the Keychain hint
      const storedToken = await getSecureValue(AUTH_TOKEN_KEY);
      if (storedToken) {
        setUpdateToken(storedToken);
      }
      return true;
    } catch (error) {
      mainLogger.error('auth:init-update-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:init-update-token' });
      return false;
    }
  });

  ipcMain.handle('auth:set-token', async (_, token: string) => {
    try {
      setUpdateToken(token);
      return await setSecureValue(AUTH_TOKEN_KEY, token);
    } catch (error) {
      mainLogger.error('auth:set-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:set-token' });
      throw error;
    }
  });

  ipcMain.handle('auth:clear-token', async () => {
    try {
      setUpdateToken(null);
      await deleteSecureValue(AUTH_TOKEN_KEY);
      await deleteSecureValue(AUTH_REFRESH_TOKEN_KEY);
      await deleteSecureValue(AUTH_USER_KEY);
      return true;
    } catch (error) {
      mainLogger.error('auth:clear-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:clear-token' });
      return false;
    }
  });

  ipcMain.handle('auth:get-refresh-token', async () => {
    try {
      return await getSecureValue(AUTH_REFRESH_TOKEN_KEY);
    } catch (error) {
      mainLogger.error('auth:get-refresh-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:get-refresh-token' });
      return null;
    }
  });

  ipcMain.handle('auth:set-refresh-token', async (_, token: string) => {
    try {
      return await setSecureValue(AUTH_REFRESH_TOKEN_KEY, token);
    } catch (error) {
      mainLogger.error('auth:set-refresh-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:set-refresh-token' });
      throw error;
    }
  });

  ipcMain.handle('auth:clear-refresh-token', async () => {
    try {
      await deleteSecureValue(AUTH_REFRESH_TOKEN_KEY);
      return true;
    } catch (error) {
      mainLogger.error('auth:clear-refresh-token error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:clear-refresh-token' });
      return false;
    }
  });

  ipcMain.handle('auth:get-user', async () => {
    try {
      const userJson = await getSecureValue(AUTH_USER_KEY);
      if (userJson) {
        try {
          return JSON.parse(userJson);
        } catch {
          return null;
        }
      }
      return null;
    } catch (error) {
      mainLogger.error('auth:get-user error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:get-user' });
      return null;
    }
  });

  ipcMain.handle('auth:set-user', async (_, user: { id: string; email: string; name?: string }) => {
    try {
      return await setSecureValue(AUTH_USER_KEY, JSON.stringify(user));
    } catch (error) {
      mainLogger.error('auth:set-user error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:auth:set-user' });
      throw error;
    }
  });

  // Keychain-specific handlers (primarily for macOS)
  ipcMain.handle('keychain:has-stored-credentials', () => {
    // Check if credentials file exists WITHOUT triggering Keychain prompt
    return hasStoredCredentials();
  });

  ipcMain.handle('keychain:verify-access', () => {
    // Verify Keychain access works - WILL trigger prompt if needed
    try {
      return verifyKeychainAccess();
    } catch (error) {
      mainLogger.error('keychain:verify-access error', { error: (error as Error).message });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('keychain:is-encryption-available', () => {
    try {
      return isEncryptionAvailable();
    } catch (error) {
      mainLogger.error('keychain:is-encryption-available error', { error: (error as Error).message });
      return false;
    }
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // =============================================================================
  // Session tracking handlers
  // =============================================================================

  ipcMain.handle('session:get-device-id', () => {
    // Get existing device ID or generate a new one
    let deviceId = getSecureValue(SESSION_DEVICE_ID_KEY);
    if (!deviceId) {
      // Generate a new UUID for this device
      deviceId = crypto.randomUUID();
      setSecureValue(SESSION_DEVICE_ID_KEY, deviceId);
      mainLogger.info('Generated new device ID', { deviceId });
    }
    return deviceId;
  });

  ipcMain.handle('session:get-usage-time', () => {
    const value = getSecureValue(SESSION_USAGE_TIME_KEY);
    return value ? parseInt(value, 10) : 0;
  });

  ipcMain.handle('session:set-usage-time', (_, seconds: number) => {
    setSecureValue(SESSION_USAGE_TIME_KEY, seconds.toString());
  });

  ipcMain.handle('session:reset-usage-time', () => {
    setSecureValue(SESSION_USAGE_TIME_KEY, '0');
  });

  ipcMain.handle('session:get-last-sync-at', () => {
    const value = getSecureValue(SESSION_LAST_SYNC_KEY);
    return value ? parseInt(value, 10) : null;
  });

  ipcMain.handle('session:set-last-sync-at', (_, timestamp: number) => {
    setSecureValue(SESSION_LAST_SYNC_KEY, timestamp.toString());
  });

  ipcMain.handle('session:get-device-name', () => {
    // Return a human-readable device name
    const hostname = os.hostname();
    const platform = process.platform === 'darwin' ? 'macOS' :
                     process.platform === 'win32' ? 'Windows' :
                     process.platform === 'linux' ? 'Linux' : 'Unknown';
    return `${platform} - ${hostname}`;
  });

  ipcMain.on('hide-window', () => {
    if (isWindowAvailable()) {
      mainWindow!.hide();
      // On macOS, hide from Dock when window is hidden
      if (isMac) {
        app.dock?.hide();
      }
    }
  });

  ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
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
    silent?: boolean;
  }) => {
    const notifConfig = getNotificationConfig();

    if (!Notification.isSupported()) {
      mainLogger.warn('Native notifications not supported on this platform');
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
        silent: options.silent ?? false,
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
          mainLogger.warn('Notification icon not found', { iconPath });
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
        mainLogger.error('Notification failed', { error });
        if (isWindowAvailable()) {
          mainWindow!.webContents.send('notification-fallback', options);
        }
      });

      notification.show();
    } catch (error) {
      mainLogger.error('Error showing notification', { error: (error as Error).message });
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
        safeSetTrayImage(syncingFrames[0]);

        syncingAnimationInterval = setInterval(() => {
          currentSyncingFrame = (currentSyncingFrame + 1) % syncingFrames.length;
          if (isTrayAvailable() && syncingFrames[currentSyncingFrame]) {
            safeSetTrayImage(syncingFrames[currentSyncingFrame]);
          }
        }, 80);
      }
    } else {
      if (syncingAnimationInterval) {
        clearInterval(syncingAnimationInterval);
        syncingAnimationInterval = null;
      }
      safeSetTrayImage(normalIcon);
    }
  });

  // =============================================================================
  // Update channel handlers
  // =============================================================================

  ipcMain.handle('update-channel:get', () => {
    return getUpdateChannel();
  });

  ipcMain.handle('update-channel:set', (_, channel: UpdateChannel) => {
    if (channel !== 'stable' && channel !== 'beta') {
      mainLogger.error('Invalid update channel', { channel });
      return false;
    }
    setUpdateChannel(channel);
    return true;
  });

  ipcMain.handle('check-for-updates', async () => {
    try {
      return await checkForUpdatesManually();
    } catch (error) {
      mainLogger.error('check-for-updates error', { error: (error as Error).message });
      captureException(error as Error, { context: 'ipc:check-for-updates' });
      return { updateAvailable: false, error: 'Failed to check for updates' };
    }
  });

  ipcMain.handle('update-state:get', () => {
    return getUpdateState();
  });

  ipcMain.handle('update:install', () => {
    installUpdate();
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
  try {
    createWindow();
  } catch (error) {
    mainLogger.error('Failed to create window', { error: (error as Error).message });
    captureException(error as Error, { context: 'app:ready:createWindow', fatal: true });
  }

  try {
    createTray();
  } catch (error) {
    mainLogger.error('Failed to create tray', { error: (error as Error).message });
    captureException(error as Error, { context: 'app:ready:createTray' });
  }

  try {
    setupIpcHandlers();
  } catch (error) {
    mainLogger.error('Failed to setup IPC handlers', { error: (error as Error).message });
    captureException(error as Error, { context: 'app:ready:setupIpcHandlers', fatal: true });
  }

  try {
    initAutoUpdater();
  } catch (error) {
    mainLogger.error('Failed to init auto updater', { error: (error as Error).message });
    captureException(error as Error, { context: 'app:ready:initAutoUpdater' });
  }

  // On macOS, defer Keychain access to let UI show first with a hint
  // The renderer will trigger this via IPC after showing the loading screen
  if (process.platform !== 'darwin') {
    try {
      const storedToken = await getSecureValue(AUTH_TOKEN_KEY);
      if (storedToken) {
        setUpdateToken(storedToken);
      }
    } catch (error) {
      mainLogger.error('Failed to get stored token', { error: (error as Error).message });
      captureException(error as Error, { context: 'app:ready:getStoredToken' });
    }
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
