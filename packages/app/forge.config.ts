import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Get version from package.json for naming
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const appVersion = packageJson.version;

// =============================================================================
// PLATFORM DETECTION
// =============================================================================
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';

if (!isLinux) {
  console.log('Skipping Linux-specific makers (deb/rpm) on non-Linux platform');
}

// =============================================================================
// CODE SIGNING CONFIGURATION (macOS only)
// =============================================================================
//
// For DEVELOPMENT (no certificate):
//   - macOS: Uses ad-hoc signing (identity: '-')
//   - Windows/Linux: No signing needed for portable ZIP
//
// For PRODUCTION (with certificates):
//   Set these environment variables before running npm run make:
//
//   macOS:
//     export APPLE_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
//     export APPLE_ID="your@email.com"
//     export APPLE_ID_PASSWORD="app-specific-password"
//     export APPLE_TEAM_ID="TEAM_ID"
//
// =============================================================================

// macOS signing identity: use environment variable or ad-hoc signing
const macSigningIdentity = process.env.APPLE_IDENTITY || '-';
const isProductionSign = macSigningIdentity !== '-';

// Build the makers array dynamically
const makers: ForgeConfig['makers'] = [];

// ==========================================================================
// macOS Makers
// ==========================================================================

// ZIP for macOS (portable)
makers.push(new MakerZIP({}, ['darwin']));

// DMG installer for macOS
makers.push(new MakerDMG({
  name: `PR-Manager-${appVersion}`,
  icon: './assets/icon.icns',
  format: 'ULFO',
}));

// ==========================================================================
// Windows Makers
// ==========================================================================

// Squirrel installer for Windows (produces Setup.exe)
makers.push(new MakerSquirrel({
  name: 'PRManager',
  setupExe: `PRManager-${appVersion}-Setup.exe`,
  setupIcon: './assets/icon.ico',
  loadingGif: undefined,
  noMsi: true,
}));

// ZIP for Windows (portable)
makers.push(new MakerZIP({}, ['win32']));

// ==========================================================================
// Linux Makers
// ==========================================================================

if (isLinux) {
  // Debian package
  makers.push(new MakerDeb({
    options: {
      name: 'pr-manager',
      productName: 'PR Manager',
      bin: 'pr-manager', // Must match executableName in packagerConfig
      icon: './assets/icon.png',
      categories: ['Development', 'Utility'],
      maintainer: 'Daniel Lopez Martinez <support@prmanager.app>',
      homepage: 'https://prmanager.app',
    },
  }));

  // RPM package
  makers.push(new MakerRpm({
    options: {
      name: 'pr-manager',
      productName: 'PR Manager',
      bin: 'pr-manager', // Must match executableName in packagerConfig
      icon: './assets/icon.png',
      categories: ['Development', 'Utility'],
      license: 'Proprietary',
    },
  }));
}

// ZIP for Linux (portable)
makers.push(new MakerZIP({}, ['linux']));

// =============================================================================
// FORGE CONFIGURATION
// =============================================================================
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    name: 'PR Manager',
    executableName: 'pr-manager',
    appBundleId: 'com.daniellopez.pr-manager',
    extraResource: ['./assets/icon.png'],

    // macOS-specific configuration
    ...(isMac && {
      ...(isProductionSign && {
        osxSign: {
          identity: macSigningIdentity,
          hardenedRuntime: true,
          entitlements: 'entitlements.mac.plist',
          'entitlements-inherit': 'entitlements.mac.plist',
          'gatekeeper-assess': false,
        },
        ...(process.env.APPLE_ID && {
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD!,
            teamId: process.env.APPLE_TEAM_ID!,
          },
        }),
      }),
      extendInfo: {
        LSUIElement: true,
        NSUserNotificationAlertStyle: 'alert',
        CFBundleDisplayName: 'PR Manager',
        CFBundleName: 'PR Manager',
        NSHumanReadableCopyright: 'Copyright © 2026',
      },
    }),
  },
  rebuildConfig: {},
  makers,
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    postPackage: async (_config, packageResult) => {
      if (process.platform === 'darwin' && macSigningIdentity === '-') {
        const outputDir = packageResult.outputPaths[0];
        const appName = 'PR Manager.app';
        const appPath = path.join(outputDir, appName);

        if (!fs.existsSync(appPath)) {
          console.warn(`Warning: App bundle not found at ${appPath}`);
          return;
        }

        console.log(`Re-signing ${appPath} with ad-hoc signature for development...`);
        try {
          execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
          console.log('App signed successfully with ad-hoc signature.');
        } catch {
          console.warn('Warning: Could not re-sign app. App may not run correctly.');
        }
      }
    },
  },
};

export default config;
