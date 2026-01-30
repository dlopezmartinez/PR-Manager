import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractVersionFromTag,
  compareVersions,
  findAssetForDownloadPlatform,
  getAssetsForPlatform,
  getLatestRelease,
  getReleaseByTag,
  getAssetDownloadUrl,
  type GitHubRelease,
  type GitHubAsset,
} from '../../src/services/githubReleaseService.js';

// Mock environment variables for GitHub API
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'test-github-token';
  process.env.GITHUB_REPO_OWNER = 'test-owner';
  process.env.GITHUB_REPO_NAME = 'test-repo';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

// Mock release data
const createMockAsset = (overrides: Partial<GitHubAsset> = {}): GitHubAsset => ({
  id: 12345,
  name: 'test-asset.zip',
  size: 1024000,
  browser_download_url: 'https://github.com/test/releases/download/v1.0.0/test-asset.zip',
  content_type: 'application/zip',
  ...overrides,
});

const createMockRelease = (overrides: Partial<GitHubRelease> = {}): GitHubRelease => ({
  id: 1,
  tag_name: 'v1.0.0',
  name: 'Release 1.0.0',
  prerelease: false,
  draft: false,
  published_at: '2024-01-15T10:00:00Z',
  assets: [],
  ...overrides,
});

describe('GitHub Release Service', () => {
  describe('extractVersionFromTag()', () => {
    it('should remove v prefix from tag', () => {
      expect(extractVersionFromTag('v1.0.0')).toBe('1.0.0');
      expect(extractVersionFromTag('v0.4.1')).toBe('0.4.1');
      expect(extractVersionFromTag('v10.20.30')).toBe('10.20.30');
    });

    it('should handle tags without v prefix', () => {
      expect(extractVersionFromTag('1.0.0')).toBe('1.0.0');
      expect(extractVersionFromTag('0.4.1')).toBe('0.4.1');
    });

    it('should handle prerelease tags', () => {
      expect(extractVersionFromTag('v1.0.0-beta.1')).toBe('1.0.0-beta.1');
      expect(extractVersionFromTag('v2.0.0-alpha.3')).toBe('2.0.0-alpha.3');
      expect(extractVersionFromTag('v1.0.0-rc.2')).toBe('1.0.0-rc.2');
    });
  });

  describe('compareVersions()', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('0.4.1', 'v0.4.1')).toBe(0);
    });

    it('should return positive when latest is newer (major)', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBeGreaterThan(0);
      expect(compareVersions('0.9.9', '1.0.0')).toBeGreaterThan(0);
    });

    it('should return positive when latest is newer (minor)', () => {
      expect(compareVersions('1.0.0', '1.1.0')).toBeGreaterThan(0);
      expect(compareVersions('1.4.0', '1.5.0')).toBeGreaterThan(0);
    });

    it('should return positive when latest is newer (patch)', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBeGreaterThan(0);
      expect(compareVersions('0.4.1', '0.4.2')).toBeGreaterThan(0);
    });

    it('should return negative when current is newer', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeLessThan(0);
      expect(compareVersions('1.5.0', '1.4.0')).toBeLessThan(0);
      expect(compareVersions('1.0.2', '1.0.1')).toBeLessThan(0);
    });

    it('should handle prerelease versions', () => {
      // Release version is newer than prerelease
      expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0-alpha.1', '1.0.0')).toBeGreaterThan(0);

      // Prerelease is older than release
      expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBeLessThan(0);
    });

    it('should compare prerelease types correctly', () => {
      // alpha < beta < rc
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-beta.1')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0-beta.1', '1.0.0-rc.1')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-rc.1')).toBeGreaterThan(0);
    });

    it('should compare prerelease numbers correctly', () => {
      expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.2')).toBeGreaterThan(0);
      expect(compareVersions('1.0.0-alpha.5', '1.0.0-alpha.10')).toBeGreaterThan(0);
    });
  });

  describe('findAssetForDownloadPlatform()', () => {
    it('should find mac DMG asset', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'PR-Manager-1.0.0.dmg' }),
          createMockAsset({ id: 2, name: 'PRManager-1.0.0-Setup.exe' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'mac', '1.0.0');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(1);
      expect(asset?.name).toBe('PR-Manager-1.0.0.dmg');
    });

    it('should find windows EXE asset', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'PR-Manager-1.0.0.dmg' }),
          createMockAsset({ id: 2, name: 'PRManager-1.0.0-Setup.exe' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'windows', '1.0.0');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(2);
      expect(asset?.name).toBe('PRManager-1.0.0-Setup.exe');
    });

    it('should find linux-deb asset', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'pr-manager_1.0.0_amd64.deb' }),
          createMockAsset({ id: 2, name: 'pr-manager-1.0.0.x86_64.rpm' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'linux-deb', '1.0.0');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(1);
      expect(asset?.name).toBe('pr-manager_1.0.0_amd64.deb');
    });

    it('should find linux-rpm asset', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'pr-manager_1.0.0_amd64.deb' }),
          createMockAsset({ id: 2, name: 'pr-manager-1.0.0.x86_64.rpm' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'linux-rpm', '1.0.0');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(2);
      expect(asset?.name).toBe('pr-manager-1.0.0.x86_64.rpm');
    });

    it('should return null when asset not found', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'PR-Manager-1.0.0.dmg' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'windows', '1.0.0');

      expect(asset).toBeNull();
    });

    it('should find linux-deb asset with beta version (dots in version)', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'pr-manager_2.0.0.beta.6_amd64.deb' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'linux-deb', '2.0.0-beta.6');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(1);
    });

    it('should find linux-rpm asset with beta version (dots and release suffix)', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'pr-manager-2.0.0.beta.6-1.x86_64.rpm' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'linux-rpm', '2.0.0-beta.6');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(1);
    });

    it('should fallback to extension matching when exact name not found', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'some-other-naming-1.0.0.deb' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'linux-deb', '1.0.0');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(1);
    });

    it('should be case-insensitive', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'PR-MANAGER-1.0.0.DMG' }),
        ],
      });

      const asset = findAssetForDownloadPlatform(release, 'mac', '1.0.0');

      expect(asset).toBeDefined();
      expect(asset?.id).toBe(1);
    });
  });

  describe('getAssetsForPlatform()', () => {
    it('should return darwin assets', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'PR-Manager-darwin-x64-1.0.0.zip' }),
          createMockAsset({ id: 2, name: 'PR-Manager-1.0.0.dmg' }),
          createMockAsset({ id: 3, name: 'other-file.txt' }),
        ],
      });

      const assets = getAssetsForPlatform(release, 'darwin');

      expect(assets.zip).toBeDefined();
      expect(assets.zip?.id).toBe(1);
      expect(assets.dmg).toBeDefined();
      expect(assets.dmg?.id).toBe(2);
    });

    it('should return win32 assets', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'PRManager-1.0.0-Setup.exe' }),
          createMockAsset({ id: 2, name: 'PRManager-1.0.0-full.nupkg' }),
          createMockAsset({ id: 3, name: 'RELEASES' }),
        ],
      });

      const assets = getAssetsForPlatform(release, 'win32');

      expect(assets.exe).toBeDefined();
      expect(assets.exe?.id).toBe(1);
      expect(assets.nupkg).toBeDefined();
      expect(assets.nupkg?.id).toBe(2);
      expect(assets.releases).toBeDefined();
      expect(assets.releases?.id).toBe(3);
    });

    it('should return linux assets', () => {
      const release = createMockRelease({
        assets: [
          createMockAsset({ id: 1, name: 'pr-manager_1.0.0_amd64.deb' }),
          createMockAsset({ id: 2, name: 'pr-manager-1.0.0.x86_64.rpm' }),
        ],
      });

      const assets = getAssetsForPlatform(release, 'linux');

      expect(assets.deb).toBeDefined();
      expect(assets.deb?.id).toBe(1);
      expect(assets.rpm).toBeDefined();
      expect(assets.rpm?.id).toBe(2);
    });
  });

  describe('getLatestRelease()', () => {
    it('should fetch latest release from GitHub API', async () => {
      const mockRelease = createMockRelease({
        id: 123,
        tag_name: 'v1.2.3',
        name: 'Release 1.2.3',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRelease),
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getLatestRelease();

      expect(release).toBeDefined();
      expect(release?.tag_name).toBe('v1.2.3');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/latest',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-github-token',
          }),
        })
      );
    });

    it('should return null on 404', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getLatestRelease();

      expect(release).toBeNull();
    });

    it('should return null on API error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getLatestRelease();

      expect(release).toBeNull();
    });

    it('should return null on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const release = await getLatestRelease();

      expect(release).toBeNull();
    });

    it('should fetch all releases when includePrerelease is true', async () => {
      const mockReleases = [
        createMockRelease({ id: 1, tag_name: 'v1.1.0-beta.1', prerelease: true, draft: false }),
        createMockRelease({ id: 2, tag_name: 'v1.0.0', prerelease: false, draft: false }),
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockReleases),
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getLatestRelease(true);

      expect(release).toBeDefined();
      expect(release?.tag_name).toBe('v1.1.0-beta.1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases',
        expect.any(Object)
      );
    });

    it('should skip draft releases when includePrerelease is true', async () => {
      const mockReleases = [
        createMockRelease({ id: 1, tag_name: 'v1.2.0', draft: true }),
        createMockRelease({ id: 2, tag_name: 'v1.1.0', draft: false }),
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockReleases),
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getLatestRelease(true);

      expect(release?.tag_name).toBe('v1.1.0');
    });
  });

  describe('getReleaseByTag()', () => {
    it('should fetch release by tag', async () => {
      const mockRelease = createMockRelease({
        id: 456,
        tag_name: 'v0.4.1',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRelease),
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getReleaseByTag('0.4.1');

      expect(release).toBeDefined();
      expect(release?.tag_name).toBe('v0.4.1');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/tags/v0.4.1',
        expect.any(Object)
      );
    });

    it('should handle version with v prefix', async () => {
      const mockRelease = createMockRelease({ tag_name: 'v1.0.0' });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockRelease),
      });
      vi.stubGlobal('fetch', mockFetch);

      await getReleaseByTag('v1.0.0');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/tags/v1.0.0',
        expect.any(Object)
      );
    });

    it('should return null on 404', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal('fetch', mockFetch);

      const release = await getReleaseByTag('9.9.9');

      expect(release).toBeNull();
    });

    it('should return null on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const release = await getReleaseByTag('1.0.0');

      expect(release).toBeNull();
    });
  });

  describe('getAssetDownloadUrl()', () => {
    it('should return temporary S3 URL from redirect', async () => {
      const temporaryUrl = 'https://github-releases.s3.amazonaws.com/temp-url?token=abc123';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: new Map([['Location', temporaryUrl]]),
      });
      // Simulate Headers API
      mockFetch.mockResolvedValue({
        ok: false,
        status: 302,
        headers: {
          get: (name: string) => name === 'Location' ? temporaryUrl : null,
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const url = await getAssetDownloadUrl(12345);

      expect(url).toBe(temporaryUrl);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/releases/assets/12345',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/octet-stream',
            Authorization: 'Bearer test-github-token',
          }),
          redirect: 'manual',
        })
      );
    });

    it('should return null when no Location header', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 302,
        headers: {
          get: () => null,
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const url = await getAssetDownloadUrl(12345);

      expect(url).toBeNull();
    });

    it('should return null on non-302 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: {
          get: () => null,
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const url = await getAssetDownloadUrl(12345);

      expect(url).toBeNull();
    });

    it('should return null on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const url = await getAssetDownloadUrl(12345);

      expect(url).toBeNull();
    });

    it('should return null when response is 200 (unexpected)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => null,
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      const url = await getAssetDownloadUrl(12345);

      expect(url).toBeNull();
    });
  });

  describe('Error handling for missing GITHUB_TOKEN', () => {
    it('should throw error when GITHUB_TOKEN is not set', async () => {
      delete process.env.GITHUB_TOKEN;

      await expect(getLatestRelease()).rejects.toThrow('GITHUB_TOKEN not configured');
    });

    it('should throw error when calling getReleaseByTag without token', async () => {
      delete process.env.GITHUB_TOKEN;

      await expect(getReleaseByTag('1.0.0')).rejects.toThrow('GITHUB_TOKEN not configured');
    });

    it('should throw error when calling getAssetDownloadUrl without token', async () => {
      delete process.env.GITHUB_TOKEN;

      await expect(getAssetDownloadUrl(123)).rejects.toThrow('GITHUB_TOKEN not configured');
    });
  });
});
