import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifySignedDownload, getGitHubReleaseUrl } from '../lib/signature.js';
import { downloadLimiter } from '../middleware/rateLimit.js';
import { APP_VERSION } from '../lib/version.js';

const router = Router();

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

    const downloadUrl = getGitHubReleaseUrl(platform, version);

    console.log(`Download: user=${userId}, platform=${platform}, version=${version}`);

    res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('Download error:', error);
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

    const currentVersion = APP_VERSION;

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

    const downloadUrl = getGitHubReleaseUrl(platform, currentVersion);
    res.redirect(302, downloadUrl);
  } catch (error) {
    console.error('Latest download error:', error);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

export default router;
