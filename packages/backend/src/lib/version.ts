import { readFileSync } from 'fs';
import { join } from 'path';

function getPackageVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return process.env.CURRENT_APP_VERSION || '1.0.0';
  }
}

export const APP_VERSION = getPackageVersion();

export function getCurrentVersion(): string {
  return APP_VERSION;
}
