import { app, dialog, BrowserWindow } from 'electron';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';

const REPO_OWNER = 'dlopezmartinez';
const REPO_NAME = 'PR-Manager';

export function initAutoUpdater(mainWindow: BrowserWindow | null): void {
  if (!app.isPackaged) {
    console.log('[AutoUpdater] Skipping in development mode');
    return;
  }

  if (process.platform === 'linux') {
    console.log('[AutoUpdater] Auto-updates not supported on Linux');
    return;
  }

  try {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: `${REPO_OWNER}/${REPO_NAME}`,
      },
      updateInterval: '10 minutes',
      notifyUser: true,
      logger: {
        log: (...args) => console.log('[AutoUpdater]', ...args),
        warn: (...args) => console.warn('[AutoUpdater]', ...args),
        error: (...args) => console.error('[AutoUpdater]', ...args),
        info: (...args) => console.info('[AutoUpdater]', ...args),
        debug: (...args) => console.debug('[AutoUpdater]', ...args),
      },
    });

    console.log('[AutoUpdater] Initialized successfully');
  } catch (error) {
    console.error('[AutoUpdater] Failed to initialize:', error);
  }
}

export async function checkForUpdatesManually(): Promise<{ updateAvailable: boolean; version?: string }> {
  if (!app.isPackaged) {
    return { updateAvailable: false };
  }

  return { updateAvailable: false };
}
