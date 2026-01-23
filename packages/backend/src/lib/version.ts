import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Get the current app version from package.json
 * This ensures the version is always in sync with the package.json
 * which is updated automatically by the release workflow
 */
function getPackageVersion(): string {
  try {
    // Navigate from dist/lib to package.json (two levels up from compiled output)
    // In development (src/lib), this also works (two levels up)
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    // Fallback for development or if file read fails
    return process.env.CURRENT_APP_VERSION || '1.0.0';
  }
}

/**
 * Current application version
 * Read once at startup for performance
 */
export const APP_VERSION = getPackageVersion();

/**
 * Get current version (useful for dynamic access)
 */
export function getCurrentVersion(): string {
  return APP_VERSION;
}
