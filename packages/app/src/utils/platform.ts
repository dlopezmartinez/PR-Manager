export type Platform = 'darwin' | 'win32' | 'linux';

export const currentPlatform: Platform = process.platform as Platform;

export const isMac = currentPlatform === 'darwin';
export const isWindows = currentPlatform === 'win32';
export const isLinux = currentPlatform === 'linux';

export interface WindowConfig {
  frame: boolean;
  titleBarStyle?: 'hidden' | 'hiddenInset' | 'default';
  resizable: boolean;
  skipTaskbar: boolean;
  alwaysOnTop: boolean;
  minWidth: number;
  minHeight: number;
  trafficLightPosition?: { x: number; y: number };
  useCustomControls: boolean;
}

export function getWindowConfig(): WindowConfig {
  if (isMac) {
    return {
      frame: false,
      titleBarStyle: 'hiddenInset',
      resizable: true,
      skipTaskbar: false, // Show in Dock like Windows
      alwaysOnTop: false,
      minWidth: 400,
      minHeight: 500,
      trafficLightPosition: { x: 13, y: 13 },
      useCustomControls: false,
    };
  }

  return {
    frame: false,
    resizable: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    minWidth: 400,
    minHeight: 500,
    useCustomControls: true,
  };
}

export interface TrayIconConfig {
  useTemplateImage: boolean;
  iconColor: 'black' | 'white';
}

export function getTrayIconConfig(): TrayIconConfig {
  if (isMac) {
    return {
      useTemplateImage: true,
      iconColor: 'black',
    };
  }

  return {
    useTemplateImage: false,
    iconColor: 'white',
  };
}

export interface NotificationConfig {
  supportsSubtitle: boolean;
  requiresIcon: boolean;
}

export function getNotificationConfig(): NotificationConfig {
  if (isMac) {
    return {
      supportsSubtitle: true,
      requiresIcon: false,
    };
  }

  return {
    supportsSubtitle: false,
    requiresIcon: true,
  };
}

export interface WindowPosition {
  x: number;
  y: number;
}

export function calculateWindowPosition(
  trayBounds: Electron.Rectangle,
  windowBounds: { width: number; height: number },
  displayBounds: Electron.Rectangle,
  gap = 4
): WindowPosition {
  let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (windowBounds.width / 2));

  let y: number;
  if (isWindows) {
    y = Math.round(trayBounds.y - windowBounds.height - gap);
  } else {
    y = Math.round(trayBounds.y + trayBounds.height + gap);
  }

  const screenRight = displayBounds.x + displayBounds.width;
  if (x + windowBounds.width > screenRight) {
    x = screenRight - windowBounds.width - 10;
  }
  if (x < displayBounds.x) {
    x = displayBounds.x + 10;
  }

  if (y < displayBounds.y) {
    y = displayBounds.y + 10;
  }
  const screenBottom = displayBounds.y + displayBounds.height;
  if (y + windowBounds.height > screenBottom) {
    y = screenBottom - windowBounds.height - 10;
  }

  return { x, y };
}

export function shouldQuitOnAllWindowsClosed(): boolean {
  return !isMac;
}

export function supportsTrayTitle(): boolean {
  return isMac;
}
