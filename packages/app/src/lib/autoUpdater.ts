import { app, autoUpdater, dialog } from 'electron';
import { API_URL } from '../config/api';
import { captureException } from './sentry';

const BACKEND_URL = API_URL;
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

export type UpdateChannel = 'stable' | 'beta';

let checkIntervalId: NodeJS.Timeout | null = null;
let userToken: string | null = null;
let updateChannel: UpdateChannel = 'stable';

function log(...args: unknown[]): void {
  console.log('[AutoUpdater]', ...args);
}

function warn(...args: unknown[]): void {
  console.warn('[AutoUpdater]', ...args);
}

function error(...args: unknown[]): void {
  console.error('[AutoUpdater]', ...args);
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
      warn(`Check failed: ${response.status}`);
      return null;
    }

    return (await response.json()) as CheckResponse;
  } catch (err) {
    error('Check request failed:', err);
    return null;
  }
}

function setupAutoUpdaterEvents(): void {
  autoUpdater.on('error', (err) => {
    error('Error:', err.message);
    captureException(err, { context: 'autoUpdater:error' });
  });

  autoUpdater.on('checking-for-update', () => {
    log('Checking for update...');
  });

  autoUpdater.on('update-available', () => {
    log('Update available, downloading...');
  });

  autoUpdater.on('update-not-available', () => {
    log('No update available');
  });

  autoUpdater.on('update-downloaded', (_event, releaseNotes, releaseName) => {
    log('Update downloaded:', releaseName);

    const dialogOpts = {
      type: 'info' as const,
      buttons: ['Restart', 'Later'],
      title: 'Application Update',
      message: releaseName || 'A new version has been downloaded',
      detail: 'A new version has been downloaded. Restart the application to apply the updates.',
    };

    dialog.showMessageBox(dialogOpts).then((returnValue) => {
      if (returnValue.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
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

    log(`Feed URL configured for ${updateChannel} channel:`, feedUrl);
    autoUpdater.checkForUpdates();
  } catch (err) {
    error('Failed to configure feed URL:', err);
  }
}

async function performUpdateCheck(): Promise<void> {
  log('Performing update check...');

  const checkResult = await checkForUpdateAvailability();

  if (!checkResult) {
    return;
  }

  log('Check result:', checkResult);

  if (checkResult.updateAvailable) {
    log(`Update available: ${checkResult.currentVersion} → ${checkResult.latestVersion}`);
    configureAndCheckUpdates();
  } else {
    log('Already on latest version');
  }
}

export function initAutoUpdater(): void {
  if (!app.isPackaged) {
    log('Skipping in development mode');
    return;
  }

  if (!isAutoUpdateSupported()) {
    log(`Auto-updates not supported on ${process.platform} (only macOS currently)`);
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

  setTimeout(() => {
    performUpdateCheck();
  }, 5000);

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
    log(`Update channel changed from ${updateChannel} to ${channel}`);
    updateChannel = channel;

    // If we have a token and the app is packaged on a supported platform, re-check for updates
    if (userToken && app.isPackaged && isAutoUpdateSupported()) {
      log('Re-checking updates with new channel...');
      performUpdateCheck();
    }
  }
}
