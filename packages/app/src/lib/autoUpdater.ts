import { app, autoUpdater, dialog } from 'electron';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'https://api.prmanager.app';
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

let checkIntervalId: NodeJS.Timeout | null = null;
let userToken: string | null = null;

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

function getCurrentVersion(): string {
  return app.getVersion();
}

interface CheckResponse {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseDate?: string;
}

async function checkForUpdateAvailability(): Promise<CheckResponse | null> {
  const platform = getPlatform();
  const version = getCurrentVersion();

  try {
    const response = await fetch(`${BACKEND_URL}/updates/check/${platform}/${version}`);

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
  const feedUrl = `${BACKEND_URL}/updates/feed/${platform}`;

  try {
    autoUpdater.setFeedURL({
      url: feedUrl,
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    });

    log('Feed URL configured:', feedUrl);
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

  if (process.platform === 'linux') {
    log('Auto-updates not supported on Linux');
    return;
  }

  setupAutoUpdaterEvents();
  log('Initialized successfully');
}

export function setUpdateToken(token: string | null): void {
  userToken = token;

  if (token && app.isPackaged && process.platform !== 'linux') {
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
  error?: string;
}> {
  if (!app.isPackaged) {
    return { updateAvailable: false };
  }

  const result = await checkForUpdateAvailability();

  if (!result) {
    return { updateAvailable: false, error: 'Failed to check for updates' };
  }

  if (result.updateAvailable && userToken) {
    configureAndCheckUpdates();
  }

  return {
    updateAvailable: result.updateAvailable,
    version: result.latestVersion,
  };
}
