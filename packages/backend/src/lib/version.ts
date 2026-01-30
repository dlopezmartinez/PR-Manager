import { readFileSync } from 'fs';
import { join } from 'path';
import logger from './logger.js';

const GITHUB_REPO = 'dlopezmartinez/PR-Manager';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface VersionCache {
  version: string;
  timestamp: number;
}

let versionCache: VersionCache | null = null;

function getPackageVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return process.env.CURRENT_APP_VERSION || '1.0.0';
  }
}

async function fetchLatestReleaseVersion(): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const baseHeaders = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'PR-Manager-Backend',
  };

  try {
    const response = await fetch(url, { headers: baseHeaders });

    if (response.ok) {
      const data = await response.json() as { tag_name?: string };
      if (data.tag_name) {
        return data.tag_name.replace(/^v/, '');
      }
    }

    if (response.status !== 404) {
      logger.warn('GitHub API (no auth) returned error', { status: response.status });
    }
  } catch (error) {
    logger.warn('GitHub API (no auth) failed', { error: (error as Error).message });
  }

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    try {
      const response = await fetch(url, {
        headers: {
          ...baseHeaders,
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json() as { tag_name?: string };
        if (data.tag_name) {
          return data.tag_name.replace(/^v/, '');
        }
      }

      logger.warn('GitHub API (with auth) returned error', { status: response.status });
    } catch (error) {
      logger.warn('GitHub API (with auth) failed', { error: (error as Error).message });
    }
  }

  return null;
}

export async function getLatestVersion(): Promise<string> {
  const now = Date.now();

  if (versionCache && (now - versionCache.timestamp) < CACHE_TTL_MS) {
    return versionCache.version;
  }

  const githubVersion = await fetchLatestReleaseVersion();

  if (githubVersion) {
    versionCache = {
      version: githubVersion,
      timestamp: now,
    };
    logger.info('Version updated from GitHub', { version: githubVersion });
    return githubVersion;
  }

  const fallbackVersion = getPackageVersion();

  versionCache = {
    version: fallbackVersion,
    timestamp: now - (CACHE_TTL_MS / 2),
  };

  logger.info('Using fallback version', { version: fallbackVersion });
  return fallbackVersion;
}

export function getCurrentVersion(): string {
  if (versionCache) {
    return versionCache.version;
  }
  return getPackageVersion();
}

export const APP_VERSION = getPackageVersion();

export async function initializeVersionCache(): Promise<void> {
  await getLatestVersion();
}
