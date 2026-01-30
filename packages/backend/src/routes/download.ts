import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifySignedDownload } from '../lib/signature.js';
import { downloadLimiter, publicInfoLimiter } from '../middleware/rateLimit.js';
import {
  getReleaseByTag,
  getLatestRelease,
  getLatestReleaseByChannel,
  findAssetForDownloadPlatform,
  getAssetDownloadUrl,
  type DownloadPlatform,
  type ReleaseChannel,
} from '../services/githubReleaseService.js';
import logger from '../lib/logger.js';

const router = Router();

router.get('/public', publicInfoLimiter, async (_req: Request, res: Response) => {
  try {
    const release = await getLatestRelease();

    if (!release) {
      res.status(404).json({ error: 'No release available' });
      return;
    }

    const version = release.tag_name.replace(/^v/, '');
    const platforms: DownloadPlatform[] = ['mac', 'windows', 'linux-deb', 'linux-rpm'];

    const downloads: Record<string, string | null> = {};

    for (const platform of platforms) {
      const asset = findAssetForDownloadPlatform(release, platform, version);
      if (asset) {
        const url = await getAssetDownloadUrl(asset.id);
        downloads[platform] = url;
      } else {
        downloads[platform] = null;
      }
    }

    res.json({
      channel: 'stable',
      version,
      releaseDate: release.published_at,
      downloads: {
        mac: downloads['mac'],
        windows: downloads['windows'],
        linuxDeb: downloads['linux-deb'],
        linuxRpm: downloads['linux-rpm'],
      },
    });
  } catch (error) {
    logger.error('Public download info error', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to get download information' });
  }
});

router.get('/public/:channel', publicInfoLimiter, async (req: Request, res: Response) => {
  try {
    const channelSchema = z.object({
      channel: z.enum(['stable', 'beta']),
    });

    const channelValidation = channelSchema.safeParse(req.params);
    if (!channelValidation.success) {
      res.status(400).json({
        error: 'Invalid channel. Must be "stable" or "beta"',
      });
      return;
    }

    const { channel } = channelValidation.data;
    const release = await getLatestReleaseByChannel(channel as ReleaseChannel);

    if (!release) {
      res.status(404).json({ error: `No ${channel} release available` });
      return;
    }

    const version = release.tag_name.replace(/^v/, '');
    const platforms: DownloadPlatform[] = ['mac', 'windows', 'linux-deb', 'linux-rpm'];

    const downloads: Record<string, string | null> = {};

    for (const platform of platforms) {
      const asset = findAssetForDownloadPlatform(release, platform, version);
      if (asset) {
        const url = await getAssetDownloadUrl(asset.id);
        downloads[platform] = url;
      } else {
        downloads[platform] = null;
      }
    }

    res.json({
      channel,
      version,
      releaseDate: release.published_at,
      isPrerelease: release.prerelease,
      downloads: {
        mac: downloads['mac'],
        windows: downloads['windows'],
        linuxDeb: downloads['linux-deb'],
        linuxRpm: downloads['linux-rpm'],
      },
    });
  } catch (error) {
    logger.error('Public download info error', { error: (error as Error).message, channel: req.params.channel });
    res.status(500).json({ error: 'Failed to get download information' });
  }
});

router.get('/:platform/:version', downloadLimiter, async (req: Request, res: Response) => {
  try {
    const paramsSchema = z.object({
      platform: z.enum(['mac', 'windows', 'linux-deb', 'linux-rpm']),
      version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/).max(50, 'Version too long'),
    });

    const querySchema = z.object({
      signature: z.string().min(1).max(512, 'Signature too long'),
      expires: z.string().min(1).max(20, 'Expires too long'),
      user: z.string().min(1).max(255, 'User ID too long'),
    });

    const paramsValidation = paramsSchema.safeParse(req.params);
    if (!paramsValidation.success) {
      res.status(400).json({
        error: 'Invalid platform or version',
        details: paramsValidation.error.errors,
      });
      return;
    }

    const queryValidation = querySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({
        error: 'Missing or invalid download parameters',
        details: queryValidation.error.errors,
      });
      return;
    }

    const { platform, version } = paramsValidation.data;
    const { signature, expires, user: userId } = queryValidation.data;

    const verification = verifySignedDownload(userId, platform, version, signature, expires);
    if (!verification.valid) {
      res.status(403).json({
        error: verification.error || 'Invalid download link',
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(403).json({
        error: 'User not found',
      });
      return;
    }

    const release = await getReleaseByTag(version);
    if (!release) {
      res.status(404).json({
        error: `Release v${version} not found`,
      });
      return;
    }

    const asset = findAssetForDownloadPlatform(release, platform as DownloadPlatform, version);
    if (!asset) {
      res.status(404).json({
        error: `No download available for ${platform} in version ${version}`,
      });
      return;
    }

    const downloadUrl = await getAssetDownloadUrl(asset.id);
    if (!downloadUrl) {
      res.status(500).json({
        error: 'Failed to generate download URL',
      });
      return;
    }

    logger.info('Download', { userId, platform, version, asset: asset.name });

    res.redirect(302, downloadUrl);
  } catch (error) {
    logger.error('Download error', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to process download' });
  }
});

router.get('/latest/:platform', async (req: Request, res: Response) => {
  try {
    const paramsSchema = z.object({
      platform: z.enum(['mac', 'windows', 'linux-deb', 'linux-rpm']),
    });

    const querySchema = z.object({
      signature: z.string().min(1).max(512, 'Signature too long'),
      expires: z.string().min(1).max(20, 'Expires too long'),
      user: z.string().min(1).max(255, 'User ID too long'),
    });

    const paramsValidation = paramsSchema.safeParse(req.params);
    if (!paramsValidation.success) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    const queryValidation = querySchema.safeParse(req.query);
    if (!queryValidation.success) {
      res.status(400).json({ error: 'Missing download parameters' });
      return;
    }

    const { platform } = paramsValidation.data;
    const { signature, expires, user: userId } = queryValidation.data;

    const verification = verifySignedDownload(userId, platform, 'latest', signature, expires);
    if (!verification.valid) {
      res.status(403).json({ error: verification.error || 'Invalid download link' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      res.status(403).json({
        error: 'User not found',
      });
      return;
    }

    const release = await getLatestRelease();
    if (!release) {
      res.status(404).json({
        error: 'No release available',
      });
      return;
    }

    const currentVersion = release.tag_name.replace(/^v/, '');

    const asset = findAssetForDownloadPlatform(release, platform as DownloadPlatform, currentVersion);
    if (!asset) {
      res.status(404).json({
        error: `No download available for ${platform} in latest version`,
      });
      return;
    }

    const downloadUrl = await getAssetDownloadUrl(asset.id);
    if (!downloadUrl) {
      res.status(500).json({
        error: 'Failed to generate download URL',
      });
      return;
    }

    logger.info('Latest download', { userId, platform, version: currentVersion, asset: asset.name });

    res.redirect(302, downloadUrl);
  } catch (error) {
    logger.error('Latest download error', { error: (error as Error).message });
    res.status(500).json({ error: 'Failed to process download' });
  }
});

export default router;
