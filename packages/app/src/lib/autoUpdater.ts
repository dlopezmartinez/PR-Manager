import { app, autoUpdater, BrowserWindow } from 'electron';
import { API_URL } from '../config/api';
import { captureException } from './sentry';
import { mainLogger } from '../utils/logger';

const updaterLogger = mainLogger.child('AutoUpdater');

const BACKEND_URL = API_URL;
const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
const INITIAL_CHECK_DELAY = 60 * 1000; // 1 minute after app start

export type UpdateChannel = 'stable' | 'beta';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  progress?: number;
  error?: string;
}

let checkIntervalId: NodeJS.Timeout | null = null;
let userToken: string | null = null;
let updateChannel: UpdateChannel = 'stable';
let currentState: UpdateState = { status: 'idle' };
let pendingVersion: string | undefined;

function log(message: string, data?: Record<string, unknown>): void {
  updaterLogger.info(message, data);
}

function warn(message: string, data?: Record<string, unknown>): void {
  updaterLogger.warn(message, data);
}

function error(message: string, data?: Record<string, unknown>): void {
  updaterLogger.error(message, data);
}

function updateState(newState: Partial<UpdateState>): void {
  currentState = { ...currentState, ...newState };
  broadcastState();
}

function broadcastState(): void {
  // Send state to all renderer windows
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('auto-update-state', currentState);
    }
  });
}

export function getUpdateState(): UpdateState {
  return currentState;
}

function getPlatform(): 'darwin' | 'win32' | 'linux' {
  return process.platform as 'darwin' | 'win32' | 'linux';
}

/**
 * Check if auto-update (download + install) is supported on the current platform.
 * Currently only macOS is supported. Windows is disabled until code signing is implemented.
 */
function isAutoUpdateSupported(): boolean {
  return process.platform === 'darwin';
}

function getCurrentVersion(): string {
  return app.getVersion();
}

interface CheckResponse {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseDate?: string;
  channel?: string;
  isPrerelease?: boolean;
}

async function checkForUpdateAvailability(): Promise<CheckResponse | null> {
  const platform = getPlatform();
  const version = getCurrentVersion();

  try {
    // Use channel-specific endpoint
    const response = await fetch(`${BACKEND_URL}/updates/check/${platform}/${version}/${updateChannel}`);

    if (!response.ok) {
      warn('Check failed', { status: response.status });
      return null;
    }

    return (await response.json()) as CheckResponse;
  } catch (err) {
    error('Check request failed', { error: (err as Error).message });
    return null;
  }
}

function setupAutoUpdaterEvents(): void {
  autoUpdater.on('error', (err) => {
    error('Error', { message: err.message });
    captureException(err, { context: 'autoUpdater:error' });
    updateState({ status: 'error', error: err.message, progress: undefined });
  });

  autoUpdater.on('checking-for-update', () => {
    log('Checking for update...');
    updateState({ status: 'checking', error: undefined });
  });

  autoUpdater.on('update-available', () => {
    log('Update available, downloading...');
    updateState({ status: 'downloading', version: pendingVersion, progress: 0 });
  });

  autoUpdater.on('update-not-available', () => {
    log('No update available');
    updateState({ status: 'idle', version: undefined, progress: undefined });
  });

  autoUpdater.on('update-downloaded', (_event, _releaseNotes, releaseName) => {
    log('Update downloaded', { releaseName });
    // Just update state - UI will show "Restart to Update" button
    // No automatic dialog to avoid annoying the user
    updateState({ status: 'ready', version: pendingVersion, progress: 100 });
  });
}

function configureAndCheckUpdates(): void {
  if (!userToken) {
    log('No user token available, skipping update check');
    return;
  }

  const platform = getPlatform();
  // Use channel-specific feed URL
  const feedUrl = `${BACKEND_URL}/updates/feed/${platform}/${updateChannel}`;

  try {
    autoUpdater.setFeedURL({
      url: feedUrl,
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    log('Feed URL configured', { channel: updateChannel, feedUrl });
    autoUpdater.checkForUpdates();
  } catch (err) {
    error('Failed to configure feed URL', { error: (err as Error).message });
  }
}

async function performUpdateCheck(): Promise<void> {
  log('Performing update check...');
  updateState({ status: 'checking' });

  const checkResult = await checkForUpdateAvailability();

  if (!checkResult) {
    updateState({ status: 'idle' });
    return;
  }

  log('Check result', { checkResult });

  if (checkResult.updateAvailable) {
    log('Update available', { from: checkResult.currentVersion, to: checkResult.latestVersion });
    pendingVersion = checkResult.latestVersion;
    updateState({ status: 'available', version: checkResult.latestVersion });
    configureAndCheckUpdates();
  } else {
    log('Already on latest version');
    updateState({ status: 'idle' });
  }
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    log('Skipping in development mode');
    return;
  }

  if (!isAutoUpdateSupported()) {
    log('Auto-updates not supported', { platform: process.platform });
    return;
  }

  setupAutoUpdaterEvents();
  log('Initialized successfully');
}

export function setUpdateToken(token: string | null): void {
  userToken = token;

  if (token && app.isPackaged && isAutoUpdateSupported()) {
    log('Token set, scheduling update checks');
    scheduleUpdateChecks();
  } else if (!token && checkIntervalId) {
    log('Token cleared, stopping update checks');
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
}

function scheduleUpdateChecks(): void {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }

  // First check after a delay (don't check immediately on startup)
  setTimeout(() => {
    performUpdateCheck();
  }, INITIAL_CHECK_DELAY);

  // Then check periodically (every 4 hours)
  checkIntervalId = setInterval(() => {
    performUpdateCheck();
  }, CHECK_INTERVAL);
}

export async function checkForUpdatesManually(): Promise<{
  updateAvailable: boolean;
  version?: string;
  channel?: string;
  isPrerelease?: boolean;
  error?: string;
  canAutoUpdate?: boolean;
}> {
  if (!app.isPackaged) {
    return { updateAvailable: false, canAutoUpdate: false };
  }

  const result = await checkForUpdateAvailability();

  if (!result) {
    return { updateAvailable: false, error: 'Failed to check for updates', canAutoUpdate: isAutoUpdateSupported() };
  }

  // Only trigger auto-download on supported platforms (macOS)
  if (result.updateAvailable && userToken && isAutoUpdateSupported()) {
    configureAndCheckUpdates();
  }

  return {
    updateAvailable: result.updateAvailable,
    version: result.latestVersion,
    channel: result.channel,
    isPrerelease: result.isPrerelease,
    canAutoUpdate: isAutoUpdateSupported(),
  };
}

export function getUpdateChannel(): UpdateChannel {
  return updateChannel;
}

export function setUpdateChannel(channel: UpdateChannel): void {
  if (channel !== updateChannel) {
    log('Update channel changed', { from: updateChannel, to: channel });
    updateChannel = channel;

    // If we have a token and the app is packaged on a supported platform, re-check for updates
    if (userToken && app.isPackaged && isAutoUpdateSupported()) {
      log('Re-checking updates with new channel...');
      performUpdateCheck();
    }
  }
}

export function installUpdate(): void {
  if (currentState.status === 'ready') {
    log('Installing update...');

    // Use setImmediate to ensure all IPC messages are processed
    setImmediate(() => {
      // On macOS, quitAndInstall can be unreliable for restarting
      // Use app.relaunch() + autoUpdater.quitAndInstall() for more reliable restart
      app.relaunch();
      autoUpdater.quitAndInstall();
    });
  } else {
    warn('Cannot install update - not ready');
  }
}
