import { readFileSync } from 'fs';
import { join } from 'path';

const GITHUB_REPO = 'dlopezmartinez/PR-Manager';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface VersionCache {
  version: string;
  timestamp: number;
}

let versionCache: VersionCache | null = null;

/**
 * Get version from package.json as fallback
 */
function getPackageVersion(): string {
  try {
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch {
    return process.env.CURRENT_APP_VERSION || '1.0.0';
  }
}

/**
 * Fetch latest release version from GitHub API
 * Strategy: 1) Try without auth (works for public repos, saves token quota)
 *           2) Try with auth (needed for private repos)
 *           3) Return null to trigger package.json fallback
 */
async function fetchLatestReleaseVersion(): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  const baseHeaders = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'PR-Manager-Backend',
  };

  // 1) Try without auth first (for public repos / future-proofing)
  try {
    const response = await fetch(url, { headers: baseHeaders });

    if (response.ok) {
      const data = await response.json() as { tag_name?: string };
      if (data.tag_name) {
        return data.tag_name.replace(/^v/, '');
      }
    }

    // If 404 or other error, try with auth
    if (response.status !== 404) {
      console.warn(`GitHub API (no auth) returned ${response.status}`);
    }
  } catch (error) {
    console.warn('GitHub API (no auth) failed:', error);
  }

  // 2) Try with auth (for private repos)
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

      console.warn(`GitHub API (with auth) returned ${response.status}`);
    } catch (error) {
      console.warn('GitHub API (with auth) failed:', error);
    }
  }

  // 3) Return null to trigger package.json fallback
  return null;
}

/**
 * Get the current app version (from GitHub or fallback to package.json)
 */
export async function getLatestVersion(): Promise<string> {
  const now = Date.now();

  // Return cached version if still valid
  if (versionCache && (now - versionCache.timestamp) < CACHE_TTL_MS) {
    return versionCache.version;
  }

  // Try to fetch from GitHub
  const githubVersion = await fetchLatestReleaseVersion();

  if (githubVersion) {
    versionCache = {
      version: githubVersion,
      timestamp: now,
    };
    console.log(`Version updated from GitHub: ${githubVersion}`);
    return githubVersion;
  }

  // Fallback to package.json
  const fallbackVersion = getPackageVersion();

  // Cache the fallback too, but for a shorter time
  versionCache = {
    version: fallbackVersion,
    timestamp: now - (CACHE_TTL_MS / 2), // Will retry sooner
  };

  console.log(`Using fallback version: ${fallbackVersion}`);
  return fallbackVersion;
}

/**
 * Synchronous version getter for backwards compatibility
 * Returns cached version or package.json version
 */
export function getCurrentVersion(): string {
  if (versionCache) {
    return versionCache.version;
  }
  return getPackageVersion();
}

/**
 * Legacy export for backwards compatibility
 * Will be updated async on first getLatestVersion() call
 */
export const APP_VERSION = getPackageVersion();

/**
 * Initialize version cache on startup
 */
export async function initializeVersionCache(): Promise<void> {
  await getLatestVersion();
}
