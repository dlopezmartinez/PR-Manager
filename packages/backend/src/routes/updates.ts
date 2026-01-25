import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Readable } from 'stream';
import { prisma } from '../lib/prisma.js';
import { authenticate, JWTPayload } from '../middleware/auth.js';
import { hasActiveSubscriptionOrIsSuperuser } from '../lib/authorization.js';
import {
  getLatestRelease,
  getAssetDownloadStream,
  compareVersions,
  getAssetsForPlatform,
  extractVersionFromTag,
  Platform,
} from '../services/githubReleaseService.js';

const router = Router();

const platformSchema = z.enum(['darwin', 'win32', 'linux']);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/, 'Invalid version format');

/**
 * GET /updates/check/:platform/:version
 * Public endpoint to check if an update is available
 * No authentication required for lightweight check
 */
router.get('/check/:platform/:version', async (req: Request, res: Response) => {
  try {
    const paramsValidation = z.object({
      platform: platformSchema,
      version: versionSchema,
    }).safeParse(req.params);

    if (!paramsValidation.success) {
      res.status(400).json({
        error: 'Invalid parameters',
        details: paramsValidation.error.errors,
      });
      return;
    }

    const { platform, version } = paramsValidation.data;

    const latestRelease = await getLatestRelease(false);

    if (!latestRelease) {
      res.json({
        updateAvailable: false,
        currentVersion: version,
      });
      return;
    }

    const latestVersion = extractVersionFromTag(latestRelease.tag_name);
    const comparison = compareVersions(version, latestVersion);

    const assets = getAssetsForPlatform(latestRelease, platform as Platform);
    const hasAssetsForPlatform = Object.keys(assets).length > 0;

    res.json({
      updateAvailable: comparison > 0 && hasAssetsForPlatform,
      currentVersion: version,
      latestVersion,
      releaseDate: latestRelease.published_at,
    });
  } catch (error) {
    console.error('[Updates] Check error:', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

/**
 * GET /updates/feed/:platform
 * Returns update metadata in the format expected by Electron autoUpdater
 * Requires JWT authentication
 */
router.get('/feed/:platform', authenticate, async (req: Request, res: Response) => {
  try {
    const platformValidation = platformSchema.safeParse(req.params.platform);

    if (!platformValidation.success) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    const platform = platformValidation.data as Platform;
    const user = req.user as JWTPayload;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { subscription: true },
    });

    if (!dbUser) {
      res.status(403).json({ error: 'User not found' });
      return;
    }

    if (!hasActiveSubscriptionOrIsSuperuser(dbUser.role, dbUser.subscription)) {
      res.status(403).json({
        error: 'Active subscription required for updates',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return;
    }

    const release = await getLatestRelease(false);

    if (!release) {
      res.status(204).send();
      return;
    }

    const version = extractVersionFromTag(release.tag_name);
    const assets = getAssetsForPlatform(release, platform);

    const baseUrl = `${req.protocol}://${req.get('host')}/updates/download`;

    if (platform === 'darwin') {
      if (!assets.zip) {
        res.status(204).send();
        return;
      }

      res.json({
        url: `${baseUrl}/${platform}/${assets.zip.id}`,
        name: release.name || `v${version}`,
        notes: '',
        pub_date: release.published_at,
      });
      return;
    }

    if (platform === 'win32') {
      if (!assets.nupkg || !assets.releases) {
        res.status(204).send();
        return;
      }

      res.json({
        url: `${baseUrl}/${platform}/releases`,
        name: release.name || `v${version}`,
        notes: '',
        pub_date: release.published_at,
        releasesUrl: `${baseUrl}/${platform}/releases-file`,
        nupkgUrl: `${baseUrl}/${platform}/${assets.nupkg.id}`,
      });
      return;
    }

    res.status(400).json({ error: 'Platform not supported for auto-updates' });
  } catch (error) {
    console.error('[Updates] Feed error:', error);
    res.status(500).json({ error: 'Failed to generate update feed' });
  }
});

/**
 * GET /updates/download/:platform/:assetId
 * Proxies the download from GitHub with license verification
 * Requires JWT authentication
 */
router.get('/download/:platform/:assetId', authenticate, async (req: Request, res: Response) => {
  try {
    const platformValidation = platformSchema.safeParse(req.params.platform);
    const assetIdParam = req.params.assetId as string;

    if (!platformValidation.success) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    const user = req.user as JWTPayload;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      include: { subscription: true },
    });

    if (!dbUser) {
      res.status(403).json({ error: 'User not found' });
      return;
    }

    if (!hasActiveSubscriptionOrIsSuperuser(dbUser.role, dbUser.subscription)) {
      res.status(403).json({
        error: 'Active subscription required for updates',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return;
    }

    const platform = platformValidation.data as Platform;

    if (assetIdParam === 'releases-file' && platform === 'win32') {
      const release = await getLatestRelease(false);
      if (!release) {
        res.status(404).json({ error: 'No release found' });
        return;
      }

      const assets = getAssetsForPlatform(release, platform);
      if (!assets.releases) {
        res.status(404).json({ error: 'RELEASES file not found' });
        return;
      }

      const downloadResponse = await getAssetDownloadStream(assets.releases.id);
      if (!downloadResponse || !downloadResponse.body) {
        res.status(502).json({ error: 'Failed to download from GitHub' });
        return;
      }

      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-Disposition', 'attachment; filename="RELEASES"');

      const nodeReadable = Readable.fromWeb(downloadResponse.body as any);
      nodeReadable.pipe(res);
      return;
    }

    const assetId = parseInt(assetIdParam, 10);
    if (isNaN(assetId)) {
      res.status(400).json({ error: 'Invalid asset ID' });
      return;
    }

    console.log(`[Updates] Download: user=${user.userId}, platform=${platform}, asset=${assetId}`);

    const downloadResponse = await getAssetDownloadStream(assetId);

    if (!downloadResponse || !downloadResponse.body) {
      res.status(502).json({ error: 'Failed to download from GitHub' });
      return;
    }

    const contentType = downloadResponse.headers.get('content-type') || 'application/octet-stream';
    const contentLength = downloadResponse.headers.get('content-length');
    const contentDisposition = downloadResponse.headers.get('content-disposition');

    res.set('Content-Type', contentType);
    if (contentLength) {
      res.set('Content-Length', contentLength);
    }
    if (contentDisposition) {
      res.set('Content-Disposition', contentDisposition);
    }

    const nodeReadable = Readable.fromWeb(downloadResponse.body as any);
    nodeReadable.pipe(res);
  } catch (error) {
    console.error('[Updates] Download error:', error);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

export default router;
